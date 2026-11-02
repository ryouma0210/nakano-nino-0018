import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as web from "../../database/client.web";
import { collectionSeenRepository as repository } from "./seenRepository";
import { COLLECTION_SEEN_SETTING_KEY, type CollectionEntry } from "./model";

const database = vi.hoisted(() => ({ execute: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }));
vi.mock("@/database/client", () => database);
vi.mock("@/utils/date", () => import("../../utils/date"));

const values = new Map<string, string>();
const local = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
const originalEntries: CollectionEntry[] = [
  { key: "old-reward", category: "voice" }, { key: "old-title", category: "title" },
  { key: "point-event", category: "message" },
];
const raw = () => database.queryOne("SELECT setting_value FROM app_settings WHERE setting_key=?", [COLLECTION_SEEN_SETTING_KEY])?.setting_value ?? null;

describe.each(["SQLite", "Web"] as const)("collection read state on %s", (backend) => {
  let sqlite: DatabaseSync | null;
  beforeEach(() => {
    vi.clearAllMocks();
    sqlite = null;
    if (backend === "SQLite") {
      sqlite = new DatabaseSync(":memory:");
      sqlite.exec("CREATE TABLE app_settings (setting_key TEXT UNIQUE, setting_value TEXT NOT NULL, updated_at TEXT)");
      database.execute.mockImplementation((sql: string, params: SQLInputValue[] = []) => sqlite!.prepare(sql).run(...params));
      database.queryOne.mockImplementation((sql: string, params: SQLInputValue[] = []) => sqlite!.prepare(sql).get(...params) ?? null);
      database.transaction.mockImplementation((work: () => void) => {
        sqlite!.exec("BEGIN");
        try { work(); sqlite!.exec("COMMIT"); } catch (error) { sqlite!.exec("ROLLBACK"); throw error; }
      });
    } else {
      vi.stubGlobal("localStorage", local);
      web.execute("DELETE FROM app_settings");
      database.execute.mockImplementation(web.execute);
      database.queryOne.mockImplementation(web.queryOne);
      database.transaction.mockImplementation(web.transaction);
    }
  });
  afterEach(() => { sqlite?.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("never marks old or new acquisitions read just by opening or refreshing the collection", () => {
    expect(repository.sync().seen).toEqual([]);
    const saved = raw();
    expect(repository.sync().seen).toEqual([]);
    expect(raw()).toBe(saved);
    expect(repository.sync().seen).not.toContain("point-event");
    expect(repository.sync().seen).not.toContain("new-video");
  });

  it("saves an empty baseline so the first future acquisition is new", () => {
    expect(repository.sync()).toEqual({ version: 1, seen: [] });
    expect(raw()).not.toBeNull();
    expect(repository.sync().seen).toEqual([]);
  });

  it("marks only explicitly selected items, survives reload, and leaves hidden items new", () => {
    repository.sync();
    expect(repository.markSeen(originalEntries, ["old-reward"]).seen).toEqual(["old-reward"]);
    const persisted = raw();
    expect(repository.sync().seen).toEqual(["old-reward"]);
    expect(repository.markSeen(originalEntries, ["old-reward", "old-reward"]).seen).toEqual(["old-reward"]);
    expect(raw()).toBe(persisted);
    expect(repository.markSeen(originalEntries, ["point-event"]).seen).toEqual(["old-reward", "point-event"]);
  });

  it("retains original state and unread items after persistence failure", () => {
    repository.sync();
    const saved = raw();
    const original = database.execute.getMockImplementation()!;
    database.execute.mockImplementation(() => { throw new Error("storage full"); });
    expect(() => repository.markSeen(originalEntries, ["point-event"])).toThrow("storage full");
    expect(raw()).toBe(saved);
    database.execute.mockImplementation(original);
    expect(repository.sync().seen).toEqual([]);
    expect(repository.markSeen(originalEntries, ["point-event"]).seen).toEqual(["point-event"]);
  });

  it("does not overwrite corrupt state or acknowledge absent IDs", () => {
    repository.sync();
    expect(() => repository.markSeen(originalEntries, ["not-acquired"])).toThrow("コレクション");
    database.execute("UPDATE app_settings SET setting_value=? WHERE setting_key=?", ["broken", COLLECTION_SEEN_SETTING_KEY]);
    expect(() => repository.sync()).toThrow("コレクション");
    expect(raw()).toBe("broken");
  });

  it("reads the reset generation and restores viewed-state records from backup", () => {
    expect(repository.pointsResetAt()).toBe("");
    database.execute("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", ["points_reset_at", "2026-11-02 12:00:00"]);
    expect(repository.pointsResetAt()).toBe("2026-11-02 12:00:00");
    repository.sync();
    repository.markSeen(originalEntries, ["point-event"]);
    const backup = raw();
    database.execute("DELETE FROM app_settings WHERE setting_key=?", [COLLECTION_SEEN_SETTING_KEY]);
    database.execute("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", [COLLECTION_SEEN_SETTING_KEY, backup]);
    expect(repository.sync().seen).toEqual(["point-event"]);
  });

  if (backend === "Web") it("rolls back both durable storage and cached read state when acknowledgement commit fails", () => {
    repository.sync();
    const previous = raw();
    const original = local.setItem;
    const storageWrite = vi.spyOn(local, "setItem").mockImplementation((key, value) => {
      if (key.endsWith("app_settings") && value.includes("point-event")) {
        storageWrite.mockImplementation(original);
        throw new Error("quota");
      }
      original(key, value);
    });
    const silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => repository.markSeen(originalEntries, ["point-event"])).toThrow("quota");
    expect(raw()).toBe(previous);
    expect(repository.sync().seen).toEqual([]);
    expect(repository.markSeen(originalEntries, ["point-event"]).seen).toEqual(["point-event"]);
    silence.mockRestore();
  });
});

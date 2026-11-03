import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as web from "../database/client.web";
import { pointMilestoneRepository as repository } from "./pointMilestoneRepository";
import { POINT_MILESTONE_SETTING_KEY, POINT_MILESTONES } from "../features/points/milestones";

const database = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }));
vi.mock("@/database/client", () => database);
vi.mock("@/utils/date", () => import("../utils/date"));
vi.mock("@/constants/messages", () => ({
  rewardBrutalOrderMessages: [], rewardInsultMessages: [], rewardPraiseMessages: [], rewardSecretMessages: [],
}));

const values = new Map<string, string>();
const local = {
  get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  removeItem: (key: string) => { values.delete(key); },
};

const ids = POINT_MILESTONES.map((milestone) => milestone.id);
const stored = () => database.queryOne("SELECT setting_value FROM app_settings WHERE setting_key=?", [POINT_MILESTONE_SETTING_KEY])?.setting_value ?? null;
const milestoneWrites = () => database.execute.mock.calls.filter(([sql, params]) => sql.startsWith("INSERT INTO app_settings") && params[0] === POINT_MILESTONE_SETTING_KEY);
function earn(key: string, points: number, at = "2026-11-02 12:00:00") {
  database.execute("INSERT INTO point_transactions(source_key, points, description, created_at) VALUES(?, ?, ?, ?)", [key, points, "Activity", at]);
}
function resetPoints() {
  database.transaction(() => {
    database.execute("DELETE FROM reward_redemptions");
    database.execute("DELETE FROM point_transactions");
    repository.clear();
    database.execute("INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)", ["points_reset_at", "2026-11-02 12:00:00", "2026-11-02 12:00:00"]);
  });
}

describe.each(["SQLite", "Web"] as const)("point milestones on %s", (backend) => {
  let sqlite: DatabaseSync | null;
  beforeEach(() => {
    vi.clearAllMocks();
    sqlite = null;
    if (backend === "SQLite") {
      sqlite = new DatabaseSync(":memory:");
      sqlite.exec(`
        CREATE TABLE journals (id INTEGER PRIMARY KEY, record_date TEXT, title TEXT, created_at TEXT);
        CREATE TABLE management_daily_tasks (id INTEGER PRIMARY KEY, record_date TEXT, completed_at TEXT);
        CREATE TABLE app_settings (setting_key TEXT UNIQUE, setting_value TEXT NOT NULL, updated_at TEXT);
        CREATE TABLE point_transactions (
          id INTEGER PRIMARY KEY, source_key TEXT NOT NULL UNIQUE, points INTEGER NOT NULL,
          description TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE reward_redemptions (points_spent INTEGER);
      `);
      database.execute.mockImplementation((sql: string, params: SQLInputValue[] = []) => sqlite!.prepare(sql).run(...params));
      database.query.mockImplementation((sql: string, params: SQLInputValue[] = []) => sqlite!.prepare(sql).all(...params));
      database.queryOne.mockImplementation((sql: string, params: SQLInputValue[] = []) => sqlite!.prepare(sql).get(...params) ?? null);
      database.transaction.mockImplementation((work: () => void) => {
        sqlite!.exec("BEGIN");
        try { work(); sqlite!.exec("COMMIT"); }
        catch (error) { sqlite!.exec("ROLLBACK"); throw error; }
      });
    } else {
      vi.stubGlobal("localStorage", local);
      for (const table of ["app_settings", "point_transactions", "journals", "management_daily_tasks", "reward_redemptions"]) web.execute(`DELETE FROM ${table}`);
      database.execute.mockImplementation(web.execute);
      database.query.mockImplementation(web.query);
      database.queryOne.mockImplementation(web.queryOne);
      database.transaction.mockImplementation(web.transaction);
    }
  });

  afterEach(() => { sqlite?.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("keeps an empty or below-threshold library read-only and unlocks exactly at the boundary", () => {
    expect(repository.sync()).toEqual({ earned: 0, unlocked: [], pending: [], next: POINT_MILESTONES[0] });
    earn("first", 99);
    expect(repository.sync().pending).toEqual([]);
    expect(milestoneWrites()).toHaveLength(0);
    earn("last", 1);
    expect(repository.sync()).toEqual({ earned: 100, unlocked: [POINT_MILESTONES[0]], pending: [POINT_MILESTONES[0]], next: POINT_MILESTONES[1] });
    expect(milestoneWrites()).toHaveLength(1);
    repository.sync();
    expect(milestoneWrites()).toHaveLength(1);
  });

  it("catches up every reached threshold in one write and acknowledges them once", () => {
    earn("legacy-activity", 10500);
    expect(repository.sync()).toEqual({ earned: 10500, unlocked: POINT_MILESTONES, pending: POINT_MILESTONES, next: null });
    expect(milestoneWrites()).toHaveLength(1);
    expect(repository.acknowledge(ids).pending).toEqual([]);
    const saved = stored();
    repository.acknowledge(ids);
    repository.sync();
    expect(stored()).toBe(saved);
    expect(milestoneWrites()).toHaveLength(2);
  });

  it("counts positive earnings while ignoring zero, penalties, redemptions and the virtual STG balance", () => {
    earn("earned-a", 80);
    earn("earned-b", 30);
    earn("loss", -10000);
    earn("zero", 0);
    database.execute("INSERT INTO reward_redemptions(points_spent) VALUES(?)", [100]);
    expect(repository.sync().earned).toBe(110);
    expect(repository.sync().unlocked.map((milestone) => milestone.id)).toEqual([ids[0]]);
  });

  it.runIf(backend === "SQLite")("includes reconciled old completions before calculating thresholds, without nested transactions", () => {
    earn("other", 70);
    database.execute("INSERT INTO journals(record_date, title, created_at) VALUES(?, ?, ?)", ["2026-11-02", "本日の命令記録", "2026-11-02 10:00:00"]);
    database.execute("INSERT INTO journals(record_date, title, created_at) VALUES(?, ?, ?)", ["2026-11-02", "調教完了記録", "2026-11-02 11:00:00"]);
    expect(repository.sync().earned).toBe(100);
    expect(repository.sync().pending.map((milestone) => milestone.id)).toEqual([ids[0]]);
  });

  it("does not mark newly arrived milestones read when dismissing an earlier popup", () => {
    earn("first", 100);
    const displayedIds = repository.sync().pending.map((milestone) => milestone.id);
    earn("second", 900);
    const after = repository.acknowledge(displayedIds);
    expect(after.unlocked.map((milestone) => milestone.id)).toEqual(ids.slice(0, 3));
    expect(after.pending.map((milestone) => milestone.id)).toEqual(ids.slice(1, 3));
  });

  it("preserves unlocked messages when old activity rows are removed", () => {
    earn("old", 500);
    repository.sync();
    repository.acknowledge([ids[0]]);
    database.execute("DELETE FROM point_transactions");
    const after = repository.sync();
    expect(after.earned).toBe(0);
    expect(after.unlocked.map((milestone) => milestone.id)).toEqual(ids.slice(0, 2));
    expect(after.pending.map((milestone) => milestone.id)).toEqual([ids[1]]);
    expect(after.next).toEqual(POINT_MILESTONES[2]);
  });

  it("restores both unlocked and unread milestones directly from saved app_settings", () => {
    earn("old", 1000);
    repository.sync();
    const expected = repository.acknowledge([ids[0]]);
    const backedUp = stored();
    repository.clear();
    database.execute("INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)", [POINT_MILESTONE_SETTING_KEY, backedUp, "2026-11-02 12:00:00"]);
    expect(repository.sync()).toEqual(expected);
  });

  it("leaves no partial unlock when persistence fails and retries every pending milestone", () => {
    earn("first", 1000);
    const original = database.execute.getMockImplementation()!;
    database.execute.mockImplementation((sql: string, params: unknown[]) => {
      if (sql.startsWith("INSERT INTO app_settings")) throw new Error("storage full");
      return original(sql, params);
    });
    expect(() => repository.sync()).toThrow("storage full");
    expect(stored()).toBeNull();
    database.execute.mockImplementation(original);
    expect(repository.sync().pending.map((milestone) => milestone.id)).toEqual(ids.slice(0, 3));
  });

  it("keeps all previously pending notices when acknowledging fails", () => {
    earn("first", 500);
    repository.sync();
    const before = stored();
    const original = database.execute.getMockImplementation()!;
    database.execute.mockImplementation((sql: string, params: unknown[]) => {
      if (sql.startsWith("INSERT INTO app_settings")) throw new Error("storage full");
      return original(sql, params);
    });
    expect(() => repository.acknowledge(ids.slice(0, 2))).toThrow("storage full");
    expect(stored()).toBe(before);
    database.execute.mockImplementation(original);
    expect(repository.sync().pending.map((milestone) => milestone.id)).toEqual(ids.slice(0, 2));
  });

  it("rejects invalid/future acknowledgements without marking existing notices read", () => {
    earn("first", 100);
    repository.sync();
    const before = stored();
    for (const invalid of [[ids[1]], ["unknown"], [ids[0], ids[0]]]) {
      expect(() => repository.acknowledge(invalid)).toThrow("ポイントイベント");
      expect(stored()).toBe(before);
    }
  });

  it("does not overwrite invalid stored data", () => {
    database.execute("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", [POINT_MILESTONE_SETTING_KEY, "broken-json"]);
    earn("first", 10000);
    expect(() => repository.sync()).toThrow("ポイントイベント");
    expect(stored()).toBe("broken-json");
  });

  it("resets milestone and ledger state together and does not replay pre-reset completions", () => {
    earn("first", 1000);
    database.execute("INSERT INTO journals(record_date, title, created_at) VALUES(?, ?, ?)", ["2026-11-02", "調教完了記録", "2026-11-02 11:00:00"]);
    repository.sync();
    repository.acknowledge(ids.slice(0, 3));
    resetPoints();
    expect(stored()).toBeNull();
    expect(repository.sync()).toEqual({ earned: 0, unlocked: [], pending: [], next: POINT_MILESTONES[0] });
    earn("after-reset", 100, "2026-11-02 13:00:00");
    expect(repository.sync().pending.map((milestone) => milestone.id)).toEqual([ids[0]]);
  });

  it("rolls back ledger and milestone deletion if the reset cutoff write fails", () => {
    earn("first", 1000);
    const before = repository.sync();
    const original = database.execute.getMockImplementation()!;
    database.execute.mockImplementation((sql: string, params: unknown[]) => {
      if (sql.startsWith("INSERT INTO app_settings") && params[0] === "points_reset_at") throw new Error("reset failed");
      return original(sql, params);
    });
    expect(resetPoints).toThrow("reset failed");
    database.execute.mockImplementation(original);
    expect(repository.sync()).toEqual(before);
  });

  if (backend === "Web") {
    it("rolls back an acknowledgement when the durable localStorage commit fails", () => {
      earn("first", 100);
      repository.sync();
      const before = stored();
      const original = local.setItem.getMockImplementation()!;
      // Completion reconciliation performs a no-op transaction first; reject the
      // actual milestone JSON write, not the read/reconciliation operation.
      local.setItem.mockImplementation((key: string, value: string) => {
        if (key.endsWith("app_settings") && value.includes('\\"acknowledged\\":[\\"points-100\\"]')) {
          local.setItem.mockImplementation(original);
          throw new Error("quota");
        }
        original(key, value);
      });
      const silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
      expect(() => repository.acknowledge([ids[0]])).toThrow("quota");
      expect(stored()).toBe(before);
      expect(repository.sync().pending.map((milestone) => milestone.id)).toEqual([ids[0]]);
      expect(repository.acknowledge([ids[0]]).pending).toEqual([]);
      silence.mockRestore();
    });
  }
});

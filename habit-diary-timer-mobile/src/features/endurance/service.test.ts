import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../database/client.web";
import { createEnduranceGame, failEnduranceSlide, finishEndurance } from "./game";
import { clearEndurance, clearEnduranceCurrent, loadEndurance, saveEnduranceCurrent, saveEnduranceResult, unlockEndurance } from "./service";
import { createEnduranceSession, ENDURANCE_CURRENT_KEY, ENDURANCE_HISTORY_KEY } from "./storage";
import { createCountdown, startCountdown } from "../sugoroku/countdown";

vi.mock("@/database/client", () => import("../../database/client.web"));
vi.mock("@/services/dailyGameRewardService", () => import("../../services/dailyGameRewardService"));
vi.mock("@/utils/date", () => import("../../utils/date"));
vi.mock("@/repositories/rewardRepository", () => ({ pointRepository: {
  award: (key: string, points: number, description: string, createdAt: string) => client.execute(
    "INSERT OR IGNORE INTO point_transactions(source_key, points, description, created_at) VALUES(?, ?, ?, ?)",
    [key, points, description, createdAt],
  ).changes > 0,
  notifyChanged: vi.fn(),
} }));
const localValues = new Map<string, string>();
const local = {
  get length() { return localValues.size; }, key: (index: number) => [...localValues.keys()][index] ?? null,
  getItem: (key: string) => localValues.get(key) ?? null,
  setItem: vi.fn((key: string, value: string) => { localValues.set(key, value); }),
  removeItem: (key: string) => { localValues.delete(key); },
};
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("localStorage", local);
  client.execute("DELETE FROM app_settings");
  client.execute("DELETE FROM point_transactions");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("endurance durable results and unlock", () => {
  it("unlocks both presets once and retains the unlock when only records reset", () => {
    expect(loadEndurance().unlocked).toBe(false);
    expect(unlockEndurance("wrong")).toBe(false);
    expect(loadEndurance().unlocked).toBe(false);
    expect(unlockEndurance("NinoLave20260505")).toBe(true);
    expect(loadEndurance().unlocked).toBe(true);
    clearEndurance();
    expect(loadEndurance().unlocked).toBe(true);
    clearEndurance(true);
    expect(loadEndurance().unlocked).toBe(false);
  });
  it("requires the exact password and never persists attempts", () => {
    for (const password of [" NinoLave20260505", "NinoLave20260505 ", "ninolave20260505", ""]) expect(unlockEndurance(password)).toBe(false);
    expect(client.query("SELECT * FROM app_settings")).toEqual([]);
  });
  it("persists a finished snapshot, retains it after retry and clears history", () => {
    const game = createEnduranceGame("custom", 2, "2026-10-06T00:00:00.000Z");
    const result = finishEndurance(game, true, "2026-10-06T00:01:00.000Z");
    expect(saveEnduranceResult(result).history).toEqual([result]);
    expect(saveEnduranceResult(result).history).toEqual([result]);
    expect(loadEndurance().history).toEqual([result]);
    clearEndurance();
    expect(loadEndurance().history).toEqual([]);
  });
  it("refuses to overwrite corrupt existing history", () => {
    client.execute("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", [ENDURANCE_HISTORY_KEY, "broken"]);
    const result = finishEndurance(createEnduranceGame("custom", 1), true);
    expect(() => saveEnduranceResult(result)).toThrow();
    expect(client.queryOne<{ setting_value: string }>("SELECT setting_value FROM app_settings WHERE setting_key=?", [ENDURANCE_HISTORY_KEY])?.setting_value).toBe("broken");
  });
  it("does not mark a failed write as saved or unlock an unavailable store", () => {
    const result = finishEndurance(createEnduranceGame("custom", 1), true);
    const failure = vi.spyOn(client, "execute").mockImplementation(() => { throw new Error("disk full"); });
    expect(() => saveEnduranceResult(result)).toThrow("disk full");
    expect(() => unlockEndurance("NinoLave20260505")).toThrow("disk full");
    failure.mockRestore();
    expect(loadEndurance()).toEqual({ version: 1, history: [], unlocked: false, current: null });
  });
  it("preserves the first saved failure position when a video result is retried", () => {
    const game = failEnduranceSlide(createEnduranceGame("game-6", 1, "2026-10-06T00:00:00.000Z"));
    const result = finishEndurance(game, false, "2026-10-06T00:01:00.000Z", { positionMs: 12_345, durationMs: 60_000 });
    saveEnduranceResult(result);
    const retry = finishEndurance(game, false, "2026-10-06T00:02:00.000Z", { positionMs: 22_345, durationMs: 60_000 });
    expect(saveEnduranceResult(retry).history).toEqual([result]);
    expect(loadEndurance().history).toEqual([result]);
  });
  it("rejects invalid progress without modifying previously saved history", () => {
    const video = createEnduranceGame("game-6", 1, "2026-10-06T00:00:00.000Z");
    const legacy = finishEndurance(video, true, "2026-10-06T00:01:00.000Z");
    saveEnduranceResult(legacy);
    const invalid = { ...legacy, id: "endurance-invalid", videoProgress: { positionMs: -1, durationMs: null } };
    expect(() => saveEnduranceResult(invalid)).toThrow();
    expect(loadEndurance().history).toEqual([legacy]);
  });
  it("awards 50 once per day across presets and retains the original result on a retry", () => {
    const clear = (id: string, at: string, preset: "game-1" | "game-6") => finishEndurance({
      ...createEnduranceGame(preset, preset === "game-6" ? 1 : 4, "2026-10-06T00:00:00.000Z"), id,
      index: preset === "game-6" ? 0 : 3,
    }, false, at);
    const first = clear("endurance-first", "2026-10-06T01:00:00.000Z", "game-1");
    saveEnduranceResult(first);
    saveEnduranceResult(clear("endurance-second", "2026-10-06T02:00:00.000Z", "game-6"));
    saveEnduranceResult({ ...first, finishedAt: "2026-10-07T01:00:00.000Z" });
    expect(client.query<{ points: number }>("SELECT points FROM point_transactions").map((row) => row.points)).toEqual([50]);
    saveEnduranceResult(clear("endurance-tomorrow", "2026-10-07T01:00:00.000Z", "game-6"));
    expect(client.query("SELECT * FROM point_transactions")).toHaveLength(2);
  });
  it("rolls back both the completed history and reward if claiming fails", () => {
    const result = finishEndurance({ ...createEnduranceGame("custom", 1), id: "endurance-rollback" }, false);
    const original = client.execute;
    const failure = vi.spyOn(client, "execute").mockImplementation((sql, params) => {
      if (sql.startsWith("INSERT OR IGNORE INTO point_transactions")) throw new Error("award failed");
      return original(sql, params);
    });
    expect(() => saveEnduranceResult(result)).toThrow("award failed");
    failure.mockRestore();
    expect(loadEndurance().history).toEqual([]);
    expect(client.query("SELECT * FROM point_transactions")).toEqual([]);
    saveEnduranceResult(result);
    expect(loadEndurance().history).toHaveLength(1);
    expect(client.query("SELECT * FROM point_transactions")).toHaveLength(1);
  });
});

function session(id = "endurance-current") {
  return createEnduranceSession({
    game: { ...createEnduranceGame("custom", 2, "2026-10-06T00:00:00.000Z"), id },
    mediaIds: ["training:second.jpg", "endurance:first.jpg"],
    slideTimer: startCountdown(60_000, 0), extraTimer: createCountdown(180_000),
    videoProgress: { positionMs: 0, durationMs: null }, videoComplete: false,
  }, 15_000);
}

describe("endurance durable active sessions", () => {
  it("restores exact slide order and paused time through repeated read-only loads", () => {
    const saved = session();
    expect(saveEnduranceCurrent(saved)).toBe(true);
    local.setItem.mockClear();
    const before = [...localValues.entries()];
    expect(loadEndurance().current).toEqual(saved);
    expect(loadEndurance().current).toEqual(saved);
    expect([...localValues.entries()]).toEqual(before);
    expect(local.setItem).not.toHaveBeenCalled();
    expect(client.query("SELECT * FROM point_transactions")).toEqual([]);
    expect(loadEndurance().history).toEqual([]);
  });

  it("persists the next slide before navigation and retains it if a later checkpoint write fails", () => {
    const first = session();
    saveEnduranceCurrent(first);
    const next = createEnduranceSession({ ...first, game: { ...first.game, index: 1 }, slideTimer: createCountdown(60_000) });
    saveEnduranceCurrent(next);
    const original = client.execute;
    const failure = vi.spyOn(client, "execute").mockImplementation((sql, params) => {
      if (Array.isArray(params) && params[0] === ENDURANCE_CURRENT_KEY && sql.startsWith("INSERT INTO")) throw new Error("checkpoint failed");
      return original(sql, params);
    });
    expect(() => saveEnduranceCurrent(session("endurance-new"))).toThrow("checkpoint failed");
    failure.mockRestore();
    expect(loadEndurance().current).toEqual(next);
  });

  it("clears only the completed session atomically and prevents late checkpoints from reviving it", () => {
    const current = session();
    saveEnduranceCurrent(current);
    const result = finishEndurance({ ...current.game, index: 1 }, false, "2026-10-06T00:02:00.000Z");
    saveEnduranceResult(result);
    expect(loadEndurance().current).toBeNull();
    expect(saveEnduranceCurrent(current)).toBe(false);
    expect(loadEndurance().current).toBeNull();
    const next = session("endurance-next");
    saveEnduranceCurrent(next);
    saveEnduranceResult(result);
    clearEnduranceCurrent(current.game.id);
    expect(loadEndurance().current).toEqual(next);
    expect(loadEndurance().history).toEqual([result]);
    expect(client.query("SELECT * FROM point_transactions")).toHaveLength(1);
    clearEnduranceCurrent(next.game.id);
    expect(loadEndurance().current).toBeNull();
  });

  it("clears a stale matching checkpoint even when a result was already saved without rewarding it again", () => {
    const current = session();
    const result = finishEndurance({ ...current.game, index: 1 }, false, "2026-10-06T00:02:00.000Z");
    saveEnduranceResult(result);
    client.execute("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", [ENDURANCE_CURRENT_KEY, JSON.stringify(current)]);
    local.setItem.mockClear();
    expect(loadEndurance().current).toBeNull();
    expect(local.setItem).not.toHaveBeenCalled();
    saveEnduranceResult(result);
    expect(client.queryOne("SELECT * FROM app_settings WHERE setting_key=?", [ENDURANCE_CURRENT_KEY])).toBeNull();
    expect(client.query("SELECT * FROM point_transactions")).toHaveLength(1);
  });

  it("retains the active checkpoint if clearing it fails after history and reward writes", () => {
    const current = session();
    saveEnduranceCurrent(current);
    const result = finishEndurance({ ...current.game, index: 1 }, false, "2026-10-06T00:02:00.000Z");
    const original = client.execute;
    const failure = vi.spyOn(client, "execute").mockImplementation((sql, params) => {
      if (sql.startsWith("DELETE FROM app_settings") && Array.isArray(params) && params[0] === ENDURANCE_CURRENT_KEY) throw new Error("clear failed");
      return original(sql, params);
    });
    expect(() => saveEnduranceResult(result)).toThrow("clear failed");
    failure.mockRestore();
    expect(loadEndurance().current).toEqual(current);
    expect(loadEndurance().history).toEqual([]);
    expect(client.query("SELECT * FROM point_transactions")).toEqual([]);
    saveEnduranceResult(result);
    expect(loadEndurance().current).toBeNull();
    expect(loadEndurance().history).toEqual([result]);
  });

  it("clears failed or retired sessions without rewards and retains unlocks on a record reset", () => {
    unlockEndurance("NinoLave20260505");
    const first = session();
    saveEnduranceCurrent(first);
    saveEnduranceResult(finishEndurance(first.game, true, "2026-10-06T00:02:00.000Z"));
    expect(loadEndurance().current).toBeNull();
    const second = session("endurance-failed");
    saveEnduranceCurrent(second);
    saveEnduranceResult(finishEndurance(failEnduranceSlide({ ...second.game, index: 1 }), false, "2026-10-06T00:02:00.000Z"));
    expect(loadEndurance().current).toBeNull();
    expect(client.query("SELECT * FROM point_transactions")).toEqual([]);
    saveEnduranceCurrent(session("endurance-reset"));
    clearEndurance();
    expect(loadEndurance()).toEqual({ version: 1, history: [], current: null, unlocked: true });
    saveEnduranceCurrent(session("endurance-full-reset"));
    clearEndurance(true);
    expect(loadEndurance()).toEqual({ version: 1, history: [], current: null, unlocked: false });
  });

  it("rejects corrupt active data without silently clearing it or changing records", () => {
    client.execute("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", [ENDURANCE_CURRENT_KEY, "broken"]);
    const before = [...localValues.entries()];
    expect(() => loadEndurance()).toThrow("勃起我慢");
    expect([...localValues.entries()]).toEqual(before);
    const current = session();
    expect(() => saveEnduranceCurrent({ ...current, mediaIds: ["blob:one"] })).toThrow("勃起我慢");
    expect([...localValues.entries()]).toEqual(before);
    clearEnduranceCurrent();
    expect(loadEndurance().current).toBeNull();
  });

  it("commits the current-session lifecycle on SQLite without nesting reward transactions", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`
      CREATE TABLE app_settings (id INTEGER PRIMARY KEY, setting_key TEXT UNIQUE, setting_value TEXT, updated_at TEXT);
      CREATE TABLE point_transactions (id INTEGER PRIMARY KEY, source_key TEXT UNIQUE, points INTEGER, description TEXT, created_at TEXT);
    `);
    const execute = vi.spyOn(client, "execute").mockImplementation((sql, params = []) => {
      const bound = Array.isArray(params) ? params : Object.values(params);
      const result = sqlite.prepare(sql).run(...bound as (string | number | null)[]);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    });
    const queryOne = vi.spyOn(client, "queryOne").mockImplementation((sql, params = []) => {
      const bound = Array.isArray(params) ? params : Object.values(params);
      return sqlite.prepare(sql).get(...bound as (string | number | null)[]) ?? null;
    });
    let inTransaction = false;
    const transaction = vi.spyOn(client, "transaction").mockImplementation((work) => {
      expect(inTransaction).toBe(false);
      inTransaction = true;
      sqlite.exec("BEGIN");
      try { work(); sqlite.exec("COMMIT"); } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
      finally { inTransaction = false; }
    });
    try {
      const current = session();
      saveEnduranceCurrent(current);
      expect(loadEndurance().current).toEqual(current);
      const result = finishEndurance({ ...current.game, index: 1 }, false, "2026-10-06T00:02:00.000Z");
      saveEnduranceResult(result);
      saveEnduranceResult(result);
      expect(saveEnduranceCurrent(current)).toBe(false);
      expect(loadEndurance()).toEqual({ version: 1, history: [result], unlocked: false, current: null });
      expect(sqlite.prepare("SELECT points FROM point_transactions").all()).toEqual([{ points: 50 }]);
    } finally {
      execute.mockRestore(); queryOne.mockRestore(); transaction.mockRestore(); sqlite.close();
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as web from "../database/client.web";
import { pointRepository } from "../repositories/rewardRepository";
import { dailyGameRewardService as service, DAILY_GAME_POINTS, type DailyRewardGame } from "./dailyGameRewardService";
import { gameRewardOwnerKey, gameRewardReceiptKey, gameRewardSourceKey, validateDailyGameRewardSettings } from "./dailyGameRewardStorage";
import { toDateKey, toDateTimeKey } from "../utils/date";

const database = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }));
vi.mock("@/database/client", () => database);
vi.mock("@/repositories/rewardRepository", () => import("../repositories/rewardRepository"));
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
const finish = (day: number, hour = 12) => new Date(2026, 9, day, hour).toISOString();
const day = "2026-10-07";
const rows = () => web.query<Record<string, unknown>>("SELECT * FROM point_transactions");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", local);
  for (const table of ["app_settings", "point_transactions"]) web.execute(`DELETE FROM ${table}`);
  database.execute.mockImplementation(web.execute);
  database.query.mockImplementation(web.query);
  database.queryOne.mockImplementation(web.queryOne);
  database.transaction.mockImplementation(web.transaction);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("daily first-clear rewards", () => {
  it.each(Object.keys(DAILY_GAME_POINTS) as DailyRewardGame[])("grants %s once per day across all result IDs and difficulties", (game) => {
    expect(service.award(game, "easy", finish(7))).toEqual({ awarded: true, points: DAILY_GAME_POINTS[game], date: day });
    expect(service.award(game, "hard", finish(7, 13))).toEqual({ awarded: false, points: 0, date: day });
    expect(service.pointsForResult(game, "easy")).toBe(DAILY_GAME_POINTS[game]);
    expect(service.pointsForResult(game, "hard")).toBe(0);
    expect(service.award(game, "next-day", finish(8)).awarded).toBe(true);
    expect(rows()).toHaveLength(2);
  });

  it("retains each result's original day and award on later retries, including a changed finish date", () => {
    service.award("othello", "first", finish(7));
    service.award("othello", "second", finish(7, 13));
    database.transaction.mockClear(); database.execute.mockClear();
    expect(service.award("othello", "first", finish(8))).toEqual({ awarded: false, points: 50, date: day });
    expect(service.award("othello", "second", finish(8))).toEqual({ awarded: false, points: 0, date: day });
    expect(service.completedGames("2026-10-08")).toEqual([]);
    expect(rows()).toHaveLength(1);
    expect(database.transaction).not.toHaveBeenCalled();
    expect(database.execute).not.toHaveBeenCalled();
  });

  it("uses the actual completion's local calendar date and timestamp when claiming after midnight", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 8, 3));
    const completed = new Date(2026, 9, 7, 23, 59, 59);
    service.award("sugoroku", "late-save", completed.toISOString());
    expect(rows()[0]).toMatchObject({ source_key: `game-clear:sugoroku:${toDateKey(completed)}`, created_at: toDateTimeKey(completed) });
    expect(service.completedGames(day)).toEqual(["sugoroku"]);
    expect(service.completedGames("2026-10-08")).toEqual([]);
  });

  it("keeps four independent games and the existing outside slime budget separate", () => {
    pointRepository.award("outside:slime:1", 100, "Outside", toDateTimeKey(new Date(finish(7))));
    for (const game of Object.keys(DAILY_GAME_POINTS) as DailyRewardGame[]) service.award(game, "same-result-id", finish(7));
    expect(service.completedGames(day)).toEqual(["sugoroku", "endurance", "othello", "succubus"]);
    expect(rows().reduce((total, row) => total + Number(row.points), 0)).toBe(350);
  });

  it("reads missing and legacy results without adding receipts or points", () => {
    database.execute.mockClear(); local.setItem.mockClear();
    expect(service.pointsForResult("sugoroku", "legacy-win")).toBe(0);
    expect(service.completedGames(day)).toEqual([]);
    expect(database.execute).not.toHaveBeenCalled();
    expect(local.setItem).not.toHaveBeenCalled();
  });

  it("publishes point changes only after receipts and the outer transaction have committed", () => {
    let inTransaction = false;
    database.transaction.mockImplementation((work: () => void) => {
      expect(inTransaction).toBe(false);
      inTransaction = true;
      try { web.transaction(work); } finally { inTransaction = false; }
    });
    const listener = vi.fn(() => {
      expect(inTransaction).toBe(false);
      expect(service.pointsForResult("endurance", "first")).toBe(50);
      database.transaction(() => undefined);
    });
    const unsubscribe = pointRepository.subscribe(listener);
    try {
      service.award("endurance", "first", finish(7));
      service.award("endurance", "first", finish(7));
      expect(listener).toHaveBeenCalledTimes(1);
    } finally { unsubscribe(); }
  });

  it("rolls back both points and receipts on a failed receipt write, then safely retries", () => {
    const listener = vi.fn(); const unsubscribe = pointRepository.subscribe(listener);
    database.execute.mockImplementation((sql: string, params: never[]) => {
      if (sql.startsWith("INSERT INTO app_settings")) throw new Error("disk full");
      return web.execute(sql, params);
    });
    try {
      expect(() => service.award("endurance", "retry", finish(7))).toThrow("disk full");
      expect(rows()).toEqual([]);
      expect(web.query("SELECT * FROM app_settings")).toEqual([]);
      expect(listener).not.toHaveBeenCalled();
      database.execute.mockImplementation(web.execute);
      expect(service.award("endurance", "retry", finish(7)).points).toBe(50);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally { unsubscribe(); }
  });

  it("rolls back a failed durable commit, so reopening cannot see a phantom award", () => {
    local.setItem.mockImplementationOnce(() => { throw new Error("quota"); });
    const silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => service.award("sugoroku", "retry", finish(7))).toThrow("quota");
    expect(rows()).toEqual([]);
    expect(service.pointsForResult("sugoroku", "retry")).toBe(0);
    expect(service.award("sugoroku", "retry", finish(7)).awarded).toBe(true);
    silence.mockRestore();
  });

  it("allows an enclosing result transaction to roll back the entire claim without nested transactions or events", () => {
    const listener = vi.fn(); const unsubscribe = pointRepository.subscribe(listener);
    try {
      expect(() => web.transaction(() => {
        service.award("endurance", "atomic", finish(7), { withinTransaction: true });
        throw new Error("result write failed");
      })).toThrow("result write failed");
      expect(rows()).toEqual([]);
      expect(web.query("SELECT * FROM app_settings")).toEqual([]);
      expect(database.transaction).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
    } finally { unsubscribe(); }
  });

  it("preserves receipts through points reset without resurrecting old points or old history badges", () => {
    service.award("othello", "old", finish(7, 10));
    web.execute("DELETE FROM point_transactions");
    web.execute("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", ["points_reset_at", "2026-10-07 11:00:00"]);
    expect(service.pointsForResult("othello", "old")).toBe(0);
    expect(service.award("othello", "old", finish(8)).points).toBe(0);
    expect(service.award("othello", "unclaimed-before-reset", finish(7, 10)).points).toBe(0);
    expect(service.award("othello", "new", finish(7, 12)).points).toBe(50);
    expect(service.pointsForResult("othello", "old")).toBe(0);
    expect(service.pointsForResult("othello", "new")).toBe(50);
    expect(rows()).toHaveLength(1);
  });

  it("keeps restored ledger and result ownership idempotent without an in-memory claim cache", () => {
    service.award("succubus", "restore:/%:victory", finish(7));
    const snapshots = ["app_settings", "point_transactions"].map((table) => ({ table, rows: structuredClone(web.query<Record<string, string | number>>(`SELECT * FROM ${table}`)) }));
    for (const snapshot of snapshots) {
      web.execute(`DELETE FROM ${snapshot.table}`);
      for (const row of snapshot.rows) web.execute(`INSERT INTO ${snapshot.table}(${Object.keys(row).join(", ")}) VALUES(${Object.keys(row).map(() => "?").join(", ")})`, Object.values(row));
    }
    expect(service.award("succubus", "restore:/%:victory", finish(8))).toEqual({ awarded: false, points: 100, date: day });
    expect(service.pointsForResult("succubus", "restore:/%:victory")).toBe(100);
    expect(rows()).toHaveLength(1);
  });

  it("rejects malformed receipts and input without mutating valid records", () => {
    web.execute("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", [gameRewardReceiptKey("othello", "broken"), "broken"]);
    database.execute.mockClear();
    expect(() => service.award("othello", "broken", finish(7))).toThrow("日次ポイント");
    expect(() => service.pointsForResult("othello", "broken")).toThrow("日次ポイント");
    expect(() => service.award("othello", "valid", "not a date")).toThrow("完了記録");
    expect(() => service.award("othello", "", finish(7))).toThrow("完了記録");
    expect(() => service.completedGames("2026-02-30")).toThrow("日付");
    expect(database.execute).not.toHaveBeenCalled();
  });

  it("validates backed-up receipt and owner keys without trusting mismatched ownership", () => {
    service.award("sugoroku", "first", finish(7));
    const settings = web.query<Record<string, unknown>>("SELECT * FROM app_settings");
    expect(() => validateDailyGameRewardSettings(settings)).not.toThrow();
    const receipt = settings.find((row) => row.setting_key === gameRewardReceiptKey("sugoroku", "first"))!;
    expect(() => validateDailyGameRewardSettings([{ ...receipt, setting_key: gameRewardReceiptKey("sugoroku", "other") }])).toThrow("日次ポイント");
    expect(() => validateDailyGameRewardSettings([receipt, receipt])).toThrow("日次ポイント");
    const owner = { ...receipt, setting_key: gameRewardOwnerKey("sugoroku", day), setting_value: JSON.stringify({ ...JSON.parse(receipt.setting_value as string), awarded: false }) };
    expect(() => validateDailyGameRewardSettings([owner])).toThrow("日次ポイント");
    expect(() => validateDailyGameRewardSettings([{ setting_key: "unrelated", setting_value: "broken" }])).not.toThrow();
  });

  it("matches SQLite's unique daily award and atomic receipt behavior", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE app_settings (setting_key TEXT UNIQUE, setting_value TEXT, updated_at TEXT);
      CREATE TABLE point_transactions (source_key TEXT UNIQUE, points INTEGER, description TEXT, created_at TEXT);`);
    database.execute.mockImplementation((sql: string, params: never[] = []) => sqlite.prepare(sql).run(...params));
    database.queryOne.mockImplementation((sql: string, params: never[] = []) => sqlite.prepare(sql).get(...params));
    database.transaction.mockImplementation((work: () => void) => {
      sqlite.exec("BEGIN");
      try { work(); sqlite.exec("COMMIT"); } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    });
    try {
      expect(service.award("othello", "first", finish(7)).points).toBe(50);
      expect(service.award("othello", "second", finish(7)).points).toBe(0);
      expect(service.award("othello", "first", finish(8)).points).toBe(50);
      expect(service.pointsForResult("othello", "second")).toBe(0);
      expect(service.completedGames(day)).toEqual(["othello"]);
      expect(sqlite.prepare("SELECT source_key, points FROM point_transactions").all()).toEqual([{ source_key: gameRewardSourceKey("othello", day), points: 50 }]);
    } finally { sqlite.close(); }
  });
});

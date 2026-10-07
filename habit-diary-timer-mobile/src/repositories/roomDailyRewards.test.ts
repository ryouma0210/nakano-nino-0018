import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import * as web from "../database/client.web";
import { preparationRepository, defeatRepository } from "./roomRepository";
import { brainwashRepository } from "./brainwashRepository";
import { achievementRepository } from "./achievementRepository";
import { pointRepository } from "./rewardRepository";
import { journalRepository } from "./journalRepository";

const database = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }));
vi.mock("@/database/client", () => database);
vi.mock("@/repositories/journalRepository", () => import("./journalRepository"));
vi.mock("@/repositories/rewardRepository", () => import("./rewardRepository"));
vi.mock("@/utils/date", () => import("../utils/date"));
vi.mock("@/services/customCommandService", () => ({ customCommandService: {} }));
vi.mock("../services/managementTaskService", () => ({ createMissingManagementTasks: vi.fn() }));
vi.mock("../services/managementRouletteService", () => ({
  hasManagementRoulette: vi.fn(), isCompletedManagementRouletteDay: vi.fn(), managementRouletteService: {}, removeManagementRouletteCycle: vi.fn(),
}));
vi.mock("@/constants/messages", () => ({
  rewardBrutalOrderMessages: [], rewardInsultMessages: [], rewardPraiseMessages: [], rewardSecretMessages: [],
}));

type LedgerRow = { source_key: string; points: number; created_at: string };
const today = "2026-10-07";
const rooms = [
  { id: "preparation", points: 5, complete: () => preparationRepository.save(["Ready"]) },
  { id: "defeat", points: 5, complete: () => defeatRepository.save(["Ready"]) },
  { id: "brainwash", points: 5, complete: () => brainwashRepository.complete() },
  { id: "punishment", points: 1, complete: () => achievementRepository.recordPunishment(60, "completed") },
];
const tables = ["journals", "preparation_records", "timer_histories", "point_transactions", "reward_redemptions", "habit_records", "tags", "journal_tags"];

describe.each(["web", "sqlite"] as const)("new daily room rewards using %s", (adapter) => {
  let sqlite: DatabaseSync | undefined;
  let inTransaction = false;
  const ledger = () => database.query("SELECT * FROM point_transactions") as LedgerRow[];
  const rowCount = (table: string) => database.query(`SELECT * FROM ${table}`).length as number;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 7, 12));
    inTransaction = false;
    if (adapter === "sqlite") {
      const { DatabaseSync: SQLite } = await import("node:sqlite");
      sqlite = new SQLite(":memory:");
      sqlite.exec(`
        CREATE TABLE journals (id INTEGER PRIMARY KEY, record_date TEXT, record_time TEXT, title TEXT, body TEXT,
          record_type TEXT, mood TEXT, rating INTEGER, is_favorite INTEGER, duration_seconds INTEGER, tags TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE preparation_records (record_date TEXT PRIMARY KEY, checks_json TEXT, completed_at TEXT, updated_at TEXT);
        CREATE TABLE timer_histories (id INTEGER PRIMARY KEY, timer_name TEXT, started_at TEXT, ended_at TEXT,
          actual_duration_seconds INTEGER, completion_status TEXT, pause_count INTEGER, created_at TEXT);
        CREATE TABLE point_transactions (id INTEGER PRIMARY KEY, source_key TEXT UNIQUE, points INTEGER, description TEXT, created_at TEXT);
        CREATE TABLE reward_redemptions (id INTEGER PRIMARY KEY, redeemed_at TEXT);
        CREATE TABLE habit_records (id INTEGER PRIMARY KEY, record_date TEXT);
        CREATE TABLE tags (id INTEGER PRIMARY KEY);
        CREATE TABLE journal_tags (journal_id INTEGER, tag_id INTEGER);
      `);
      database.execute.mockImplementation((sql: string, params: (string | number | null)[] = []) => sqlite!.prepare(sql).run(...params));
      database.query.mockImplementation((sql: string, params: (string | number | null)[] = []) => sqlite!.prepare(sql).all(...params));
      database.queryOne.mockImplementation((sql: string, params: (string | number | null)[] = []) => sqlite!.prepare(sql).get(...params));
    } else {
      const saved = new Map<string, string>();
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => { saved.set(key, value); },
        removeItem: (key: string) => { saved.delete(key); },
      });
      for (const table of tables) web.execute(`DELETE FROM ${table}`);
      database.execute.mockImplementation(web.execute);
      database.query.mockImplementation(web.query);
      database.queryOne.mockImplementation(web.queryOne);
    }
    database.transaction.mockImplementation((work: () => void) => {
      expect(inTransaction).toBe(false);
      inTransaction = true;
      try {
        if (sqlite) {
          sqlite.exec("BEGIN");
          try { work(); sqlite.exec("COMMIT"); } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
        } else web.transaction(work);
      } finally { inTransaction = false; }
    });
  });

  afterEach(() => {
    sqlite?.close();
    sqlite = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps the protected defeat reward with its journal when deleting the day's removable records", () => {
    rooms.forEach((room) => room.complete());
    expect(ledger()).toHaveLength(4);
    journalRepository.removeDate(today);
    expect(ledger()).toEqual([expect.objectContaining({ source_key: `defeat:${today}`, points: 5 })]);
    expect(defeatRepository.find()).toEqual(["Ready"]);
    expect(brainwashRepository.hasCompleted()).toBe(false);
    expect(preparationRepository.find()).toBeUndefined();
    expect(rowCount("timer_histories")).toBe(0);
  });

  it.each(rooms)("awards $id once per day and publishes only after records and points commit", ({ id, points, complete }) => {
    const listener = vi.fn(() => {
      expect(inTransaction).toBe(false);
      expect(rowCount("journals")).toBeGreaterThan(0);
      expect(ledger().at(-1)?.points).toBe(points);
      // Subscribers may use another transaction, which must not be nested in the completion.
      database.transaction(() => undefined);
    });
    const unsubscribe = pointRepository.subscribe(listener);
    try {
      complete();
      complete();
      expect(ledger()).toEqual([expect.objectContaining({ source_key: `${id}:${today}`, points, created_at: `${today} 12:00:00` })]);
      expect(listener).toHaveBeenCalledTimes(1);
      vi.setSystemTime(new Date(2026, 9, 8, 1));
      complete();
      complete();
      expect(ledger().map((row) => ({ key: row.source_key, points: row.points }))).toEqual([
        { key: `${id}:${today}`, points }, { key: `${id}:2026-10-08`, points },
      ]);
      expect(listener).toHaveBeenCalledTimes(2);
    } finally { unsubscribe(); }
  });

  it.each(rooms)("rolls back $id records and emits no notification when its reward cannot be saved", ({ complete }) => {
    const execute = database.execute.getMockImplementation()!;
    database.execute.mockImplementation((sql: string, params = []) => {
      if (sql.includes("INSERT OR IGNORE INTO point_transactions")) throw new Error("point write failed");
      return execute(sql, params);
    });
    const listener = vi.fn();
    const unsubscribe = pointRepository.subscribe(listener);
    try {
      expect(complete).toThrow("point write failed");
      for (const table of tables) expect(rowCount(table)).toBe(0);
      expect(listener).not.toHaveBeenCalled();
      database.execute.mockImplementation(execute);
      complete();
      expect(ledger()).toHaveLength(1);
      expect(listener).toHaveBeenCalledTimes(1);
    } finally { unsubscribe(); }
  });

  it.each(rooms)("keeps $id unrecorded and unawarded when writing its journal fails", ({ complete }) => {
    const execute = database.execute.getMockImplementation()!;
    database.execute.mockImplementation((sql: string, params = []) => {
      if (sql.includes("INSERT INTO journals")) throw new Error("journal write failed");
      return execute(sql, params);
    });
    const listener = vi.fn();
    const unsubscribe = pointRepository.subscribe(listener);
    try {
      expect(complete).toThrow("journal write failed");
      for (const table of tables) expect(rowCount(table)).toBe(0);
      expect(listener).not.toHaveBeenCalled();
    } finally { unsubscribe(); }
  });

  it.each(rooms)("does not publish a $id reward before its transaction successfully returns", ({ complete }) => {
    const transaction = database.transaction.getMockImplementation()!;
    database.transaction.mockImplementation((work: () => void) => transaction(() => {
      work();
      throw new Error("transaction failed");
    }));
    const listener = vi.fn();
    const unsubscribe = pointRepository.subscribe(listener);
    try {
      expect(complete).toThrow("transaction failed");
      for (const table of tables) expect(rowCount(table)).toBe(0);
      expect(listener).not.toHaveBeenCalled();
    } finally { unsubscribe(); }
  });

  it("keeps all four daily room rewards independent", () => {
    for (const room of rooms) { room.complete(); room.complete(); }
    expect(ledger().map((row) => [row.source_key, row.points])).toEqual([
      [`preparation:${today}`, 5], [`defeat:${today}`, 5], [`brainwash:${today}`, 5], [`punishment:${today}`, 1],
    ]);
  });

  it("does not award a stopped or skipped punishment session, or a zero or invalid duration", () => {
    for (const seconds of [0, -1, 0.9, NaN, Infinity, -Infinity]) achievementRepository.recordPunishment(seconds, "completed");
    expect(rowCount("journals")).toBe(0);
    expect(rowCount("timer_histories")).toBe(0);
    achievementRepository.recordPunishment(30.9, "stopped");
    achievementRepository.recordPunishment(20, "skipped");
    expect(rowCount("journals")).toBe(2);
    expect(rowCount("timer_histories")).toBe(2);
    expect(ledger()).toEqual([]);
    achievementRepository.recordPunishment(60, "completed");
    achievementRepository.recordPunishment(90, "completed");
    expect(ledger()).toEqual([expect.objectContaining({ source_key: `punishment:${today}`, points: 1 })]);
    expect(rowCount("timer_histories")).toBe(4);
  });

  it("does not turn viewing or editing existing legacy completions into new rewards", () => {
    for (const date of ["2026-10-06", today]) {
      for (const tags of ["準備部屋,チェック", "敗北部屋,チェック", `洗脳部屋,洗脳部屋${date}`]) {
        journalRepository.create({ recordDate: date, title: "Saved record", body: "Saved", recordType: "diary", tags });
      }
      database.execute("INSERT INTO preparation_records(record_date, checks_json, completed_at, updated_at) VALUES(?, ?, ?, ?)",
        [date, "[]", `${date} 10:00:00`, `${date} 10:00:00`]);
      expect(preparationRepository.find(date)).toBeDefined();
      expect(defeatRepository.find(date)).toBeDefined();
      expect(brainwashRepository.hasCompleted(date)).toBe(true);
      preparationRepository.save(["Updated"], date);
      defeatRepository.save(["Updated"], date);
    }
    brainwashRepository.complete();
    expect(ledger()).toEqual([]);
  });

  it("keeps a received daily reward after an individual journal is deleted and completed again", () => {
    preparationRepository.save(["Ready"]);
    brainwashRepository.complete();
    for (const row of database.query("SELECT id FROM journals") as { id: number }[]) journalRepository.remove(row.id);
    preparationRepository.save(["Ready again"]);
    brainwashRepository.complete();
    expect(ledger().map((row) => [row.source_key, row.points])).toEqual([
      [`preparation:${today}`, 5], [`brainwash:${today}`, 5],
    ]);
  });
});

import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pointRepository, rewardRepository } from "./rewardRepository";

const database = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }));
vi.mock("@/database/client", () => database);
vi.mock("@/utils/date", () => import("../utils/date"));
vi.mock("@/constants/messages", () => ({
  rewardBrutalOrderMessages: [], rewardInsultMessages: [], rewardPraiseMessages: [], rewardSecretMessages: [],
}));

let sqlite: DatabaseSync;
const ledger = () => sqlite.prepare("SELECT source_key, points, description, created_at FROM point_transactions ORDER BY source_key").all();

function journal(date: string, title: string, createdAt: string | null) {
  sqlite.prepare("INSERT INTO journals(record_date, title, created_at) VALUES(?, ?, ?)").run(date, title, createdAt);
}

function completions(date: string, completedAt: string | null) {
  journal(date, "本日の命令記録", completedAt);
  journal(date, "調教完了記録", completedAt);
  return Number(sqlite.prepare("INSERT INTO management_daily_tasks(record_date, completed_at) VALUES(?, ?)")
    .run(date, completedAt).lastInsertRowid);
}

beforeEach(() => {
  vi.clearAllMocks();
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE journals (id INTEGER PRIMARY KEY, record_date TEXT, title TEXT, created_at TEXT);
    CREATE TABLE management_daily_tasks (id INTEGER PRIMARY KEY, record_date TEXT, completed_at TEXT);
    CREATE TABLE app_settings (setting_key TEXT UNIQUE, setting_value TEXT);
    CREATE TABLE point_transactions (
      id INTEGER PRIMARY KEY, source_key TEXT NOT NULL UNIQUE, points INTEGER NOT NULL,
      description TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE reward_redemptions (points_spent INTEGER);
  `);
  database.execute.mockImplementation((sql: string, params: SQLInputValue[] = []) => sqlite.prepare(sql).run(...params));
  database.query.mockImplementation((sql: string, params: SQLInputValue[] = []) => sqlite.prepare(sql).all(...params));
  database.queryOne.mockImplementation((sql: string, params: SQLInputValue[] = []) => sqlite.prepare(sql).get(...params) ?? null);
  database.transaction.mockImplementation((work: () => void) => {
    sqlite.exec("BEGIN");
    try { work(); sqlite.exec("COMMIT"); }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  });
});

afterEach(() => { sqlite.close(); vi.restoreAllMocks(); });

describe("native completion award reconciliation", () => {
  it("repairs missing awards at 5/25/25, groups training by its earliest completion, and excludes newly eligible historical rooms", () => {
    const date = "2026-10-07";
    const completedAt = `${date} 11:00:00`;
    const taskId = completions(date, completedAt);
    journal(date, "調教完了記録", `${date} 08:00:00`);
    journal(date, "調教完了記録", `${date} 09:00:00`);
    for (const title of ["敗北部屋記録", "洗脳部屋記録", "準備部屋チェック", "お仕置き記録"]) {
      journal("2026-10-06", title, "2026-10-06 12:00:00");
    }

    pointRepository.reconcileCompletionAwards();
    expect(ledger()).toEqual([
      expect.objectContaining({ source_key: `daily-order:${date}`, points: 5, created_at: completedAt }),
      expect.objectContaining({ source_key: `management-task:${taskId}`, points: 25, created_at: completedAt }),
      expect.objectContaining({ source_key: `training:${date}`, points: 25, created_at: `${date} 08:00:00` }),
    ]);
    const repaired = ledger();
    rewardRepository.balance();
    expect(ledger()).toEqual(repaired);
  });

  it("preserves already credited legacy 1/5/10 rows exactly without topping them up", () => {
    const date = "2026-10-06";
    const taskId = completions(date, `${date} 11:00:00`);
    const previous = [
      [`daily-order:${date}`, 1], [`training:${date}`, 5], [`management-task:${taskId}`, 10],
    ] as const;
    for (const [key, points] of previous) {
      sqlite.prepare("INSERT INTO point_transactions(source_key, points, description, created_at) VALUES(?, ?, ?, ?)")
        .run(key, points, "Previously credited", `${date} 12:00:00`);
    }
    const credited = ledger();

    pointRepository.reconcileCompletionAwards();
    rewardRepository.balance();
    expect(ledger()).toEqual(credited);
  });

  it("does not resurrect cleared points at or before the reset cutoff, including after repeated balance reads", () => {
    completions("2026-10-06", "2026-10-06 12:00:00");
    completions("2026-10-07", "2026-10-07 12:00:00");
    completions("2026-10-05", null);
    pointRepository.reconcileCompletionAwards();
    expect(ledger()).toHaveLength(6);
    sqlite.exec("DELETE FROM point_transactions");
    sqlite.prepare("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)")
      .run("points_reset_at", "2026-10-07 12:00:00");

    rewardRepository.balance();
    rewardRepository.balance();
    expect(ledger()).toEqual([]);
    const nextDate = "2026-10-08";
    const taskId = completions(nextDate, `${nextDate} 09:00:00`);
    pointRepository.reconcileCompletionAwards();
    expect(ledger()).toEqual([
      expect.objectContaining({ source_key: `daily-order:${nextDate}`, points: 5 }),
      expect.objectContaining({ source_key: `management-task:${taskId}`, points: 25 }),
      expect.objectContaining({ source_key: `training:${nextDate}`, points: 25 }),
    ]);
    const afterReset = ledger();
    rewardRepository.balance();
    expect(ledger()).toEqual(afterReset);
  });

  it("rolls every repair back on a late SQL failure and retries without notifying balance subscribers", () => {
    completions("2026-10-07", "2026-10-07 12:00:00");
    sqlite.exec(`CREATE TRIGGER reject_management_award BEFORE INSERT ON point_transactions
      WHEN NEW.source_key LIKE 'management-task:%'
      BEGIN SELECT RAISE(ABORT, 'ledger unavailable'); END;`);
    const listener = vi.fn(() => rewardRepository.balance());
    const unsubscribe = pointRepository.subscribe(listener);
    try {
      expect(() => rewardRepository.balance()).toThrow("ledger unavailable");
      expect(ledger()).toEqual([]);
      expect(listener).not.toHaveBeenCalled();

      sqlite.exec("DROP TRIGGER reject_management_award");
      const balance = rewardRepository.balance();
      expect(balance).toEqual({ earned: 55 + balance.stgBonus, spent: 0, available: 55 + balance.stgBonus, stgBonus: balance.stgBonus });
      const repaired = ledger();
      expect(repaired).toHaveLength(3);
      rewardRepository.balance();
      expect(ledger()).toEqual(repaired);
      expect(listener).not.toHaveBeenCalled();
    } finally { unsubscribe(); }
  });
});

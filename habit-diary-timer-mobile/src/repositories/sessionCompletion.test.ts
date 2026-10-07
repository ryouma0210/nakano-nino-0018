import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import * as web from "../database/client.web";
import { achievementRepository, type TrainingCompletionRecord } from "./achievementRepository";
import { pointRepository } from "./rewardRepository";
import type { SessionCompletion } from "../features/sessions/completion";

const database = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }));
vi.mock("@/database/client", () => database);
vi.mock("@/repositories/journalRepository", () => import("./journalRepository"));
vi.mock("@/repositories/rewardRepository", () => import("./rewardRepository"));
vi.mock("@/utils/date", () => import("../utils/date"));
vi.mock("@/constants/messages", () => ({ rewardBrutalOrderMessages: [], rewardInsultMessages: [], rewardPraiseMessages: [], rewardSecretMessages: [] }));

const session: SessionCompletion = { id: "session-original", recordDate: "2026-10-07", startedAt: "2026-10-07 23:50:00", completedAt: "2026-10-07 23:59:58" };
const training: TrainingCompletionRecord = { ...session, elapsedSeconds: 598, difficulty: "通常", targetSeconds: 600, judgement: "fixed judgement" };
const rooms = [
  { kind: "training", complete: (id = session.id) => achievementRepository.recordTraining({ ...training, id }), histories: 0 },
  { kind: "punishment", complete: (id = session.id) => achievementRepository.recordPunishment(598, "completed", { ...session, id }), histories: 1 },
];
const tables = ["journals", "timer_histories", "point_transactions", "app_settings"];

describe.each(["web", "sqlite"] as const)("session result recovery using %s", (adapter) => {
  let sqlite: DatabaseSync | undefined;
  const rows = (table: string) => database.query(`SELECT * FROM ${table}`) as Record<string, unknown>[];
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 8, 1));
    if (adapter === "sqlite") {
      const { DatabaseSync: SQLite } = await import("node:sqlite");
      sqlite = new SQLite(":memory:");
      sqlite.exec(`
        CREATE TABLE journals (id INTEGER PRIMARY KEY, record_date TEXT, record_time TEXT, title TEXT, body TEXT,
          record_type TEXT, mood TEXT, rating INTEGER, is_favorite INTEGER, duration_seconds INTEGER, tags TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE timer_histories (id INTEGER PRIMARY KEY, timer_name TEXT, started_at TEXT, ended_at TEXT,
          actual_duration_seconds INTEGER, completion_status TEXT, pause_count INTEGER, created_at TEXT);
        CREATE TABLE point_transactions (id INTEGER PRIMARY KEY, source_key TEXT UNIQUE, points INTEGER, description TEXT, created_at TEXT);
        CREATE TABLE app_settings (id INTEGER PRIMARY KEY, setting_key TEXT UNIQUE, setting_value TEXT, updated_at TEXT);
      `);
      database.execute.mockImplementation((sql: string, params: (string | number | null)[] = []) => sqlite!.prepare(sql).run(...params));
      database.query.mockImplementation((sql: string, params: (string | number | null)[] = []) => sqlite!.prepare(sql).all(...params));
      database.queryOne.mockImplementation((sql: string, params: (string | number | null)[] = []) => sqlite!.prepare(sql).get(...params));
    } else {
      const stored = new Map<string, string>();
      vi.stubGlobal("localStorage", {
        get length() { return stored.size; }, key: (index: number) => [...stored.keys()][index] ?? null,
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => { stored.set(key, value); }, removeItem: (key: string) => { stored.delete(key); },
      });
      tables.forEach((table) => web.execute(`DELETE FROM ${table}`));
      database.execute.mockImplementation(web.execute);
      database.query.mockImplementation(web.query);
      database.queryOne.mockImplementation(web.queryOne);
    }
    database.transaction.mockImplementation((work: () => void) => {
      if (!sqlite) return web.transaction(work);
      sqlite.exec("BEGIN");
      try { work(); sqlite.exec("COMMIT"); } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    });
  });
  afterEach(() => { sqlite?.close(); sqlite = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });

  it.each(rooms)("writes $kind once and preserves dates when retried on the following day", ({ kind, complete, histories }) => {
    complete(); complete();
    expect(rows("journals")).toHaveLength(1);
    expect(rows("journals")[0]).toMatchObject({ record_date: "2026-10-07", record_time: "23:59", created_at: session.completedAt, duration_seconds: 598 });
    expect(rows("point_transactions")).toEqual([expect.objectContaining({ source_key: `${kind}:2026-10-07`, created_at: session.completedAt })]);
    expect(rows("timer_histories")).toHaveLength(histories);
    if (histories) expect(rows("timer_histories")[0]).toMatchObject({ started_at: session.startedAt, ended_at: session.completedAt });
    complete("another-session");
    expect(rows("journals")).toHaveLength(2);
    expect(rows("point_transactions")).toHaveLength(1);
  });

  for (const failingTable of ["journals", "point_transactions", "app_settings"]) {
    it.each(rooms)(`rolls back $kind on ${failingTable} failure, then safely retries the original result`, ({ complete }) => {
      const execute = database.execute.getMockImplementation()!;
      database.execute.mockImplementation((sql: string, params = []) => {
        if (sql.includes(`INTO ${failingTable}`)) throw new Error("write failed");
        return execute(sql, params);
      });
      const listener = vi.fn();
      const unsubscribe = pointRepository.subscribe(listener);
      try {
        expect(() => complete()).toThrow("write failed");
        tables.forEach((table) => expect(rows(table)).toHaveLength(0));
        expect(listener).not.toHaveBeenCalled();
        database.execute.mockImplementation(execute);
        complete(); complete();
        expect(rows("journals")).toHaveLength(1);
        expect(rows("point_transactions")).toHaveLength(1);
        expect(listener).toHaveBeenCalledTimes(1);
      } finally { unsubscribe(); }
    });
  }

  it("retains stopped timer results without awarding completion points on retry", () => {
    achievementRepository.recordPunishment(12, "stopped", session);
    achievementRepository.recordPunishment(12, "stopped", session);
    expect(rows("journals")).toHaveLength(1);
    expect(rows("timer_histories")).toEqual([expect.objectContaining({ completion_status: "stopped", actual_duration_seconds: 12 })]);
    expect(rows("point_transactions")).toHaveLength(0);
  });

  it("does not duplicate a committed result if a post-commit observer throws", () => {
    const unsubscribe = pointRepository.subscribe(() => { throw new Error("observer failed"); });
    expect(() => achievementRepository.recordTraining(training)).toThrow("observer failed");
    unsubscribe();
    achievementRepository.recordTraining(training);
    expect(rows("journals")).toHaveLength(1);
    expect(rows("point_transactions")).toHaveLength(1);
  });
});

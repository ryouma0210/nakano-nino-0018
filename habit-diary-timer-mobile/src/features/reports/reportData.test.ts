import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import * as web from "../../database/client.web";
import { reportRepository } from "../../repositories/reportRepository";
import { dailyComparison, monthlyComparison } from "./periods";
import { reportMetrics } from "./metrics";

const database = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn() }));
vi.mock("@/database/client", () => database);
vi.mock("@/utils/date", () => import("../../utils/date"));
vi.mock("@/features/reports/periods", () => import("./periods"));

const tables = ["journals", "management_daily_tasks", "point_transactions", "timer_histories"];

describe.each(["sqlite", "web"] as const)("report details and totals using %s", (adapter) => {
  let sqlite: DatabaseSync | undefined;
  let insert: (sql: string, values: (string | number | null)[]) => unknown;

  beforeEach(async () => {
    vi.clearAllMocks();
    if (adapter === "sqlite") {
      const { DatabaseSync: SQLite } = await import("node:sqlite");
      sqlite = new SQLite(":memory:");
      sqlite.exec(`
        CREATE TABLE journals (id INTEGER PRIMARY KEY, record_date TEXT, record_time TEXT, title TEXT, body TEXT, tags TEXT);
        CREATE TABLE management_daily_tasks (id INTEGER PRIMARY KEY, record_date TEXT, instruction TEXT, completed_at TEXT);
        CREATE TABLE point_transactions (id INTEGER PRIMARY KEY, source_key TEXT, points INTEGER, description TEXT, created_at TEXT);
        CREATE TABLE timer_histories (id INTEGER PRIMARY KEY, timer_name TEXT, started_at TEXT, actual_duration_seconds INTEGER, completion_status TEXT, comment TEXT);
      `);
      insert = (sql, values) => sqlite!.prepare(sql).run(...values);
      database.query.mockImplementation((sql: string, values: (string | number | null)[] = []) => sqlite!.prepare(sql).all(...values));
      database.queryOne.mockImplementation((sql: string, values: (string | number | null)[] = []) => sqlite!.prepare(sql).get(...values));
    } else {
      const saved = new Map<string, string>();
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => { saved.set(key, value); },
        removeItem: (key: string) => { saved.delete(key); },
      });
      for (const table of tables) web.execute(`DELETE FROM ${table}`);
      insert = web.execute;
      database.query.mockImplementation(web.query);
      database.queryOne.mockImplementation(web.queryOne);
    }
    const journal = (id: number, date: string, tags: string) => insert("INSERT INTO journals (id, record_date, record_time, title, body, tags) VALUES (?, ?, ?, ?, ?, ?)", [id, date, "12:00", `Record ${id}`, "Original body", tags]);
    journal(1, "2026-10-01", "調教,射精記録");
    journal(2, "2026-10-07", "射精記録");
    journal(3, "2026-10-07", "unrelated");
    journal(4, "2026-09-30", "射精記録");
    journal(5, "2026-10-08", "射精記録");
    const management = (id: number, date: string, done: string | null) => insert("INSERT INTO management_daily_tasks (id, record_date, instruction, completed_at) VALUES (?, ?, ?, ?)", [id, date, `Task ${id}`, done]);
    management(1, "2026-10-01", "2026-10-01T12:00:00");
    management(2, "2026-10-01", "2026-10-01T13:00:00");
    management(3, "2026-10-07", "2026-10-07T12:00:00");
    management(4, "2026-10-07", null);
    management(5, "2026-09-30", "2026-09-30T12:00:00");
    const points = (id: number, key: string, amount: number, date: string) => insert("INSERT INTO point_transactions (id, source_key, points, description, created_at) VALUES (?, ?, ?, ?, ?)", [id, key, amount, `Points ${id}`, date]);
    points(1, "training:2026-10-01", 25, "2026-10-01T00:00:00");
    points(2, "daily-order:2026-10-07", 5, "2026-10-07T23:59:59");
    points(3, "spending", -100, "2026-10-07T12:00:00");
    points(4, "nothing", 0, "2026-10-07T12:00:00");
    points(5, "daily-order:2026-09-30", 5, "2026-09-30T23:59:59");
    points(6, "next-day", 500, "2026-10-08T00:00:00");
    const timer = (id: number, name: string, seconds: number, status: string, date = "2026-10-07T12:00:00") => insert("INSERT INTO timer_histories (id, timer_name, started_at, actual_duration_seconds, completion_status, comment) VALUES (?, ?, ?, ?, ?, ?)", [id, name, date, seconds, status, "Saved comment"]);
    timer(1, "お仕置き", 35, "completed");
    timer(2, "お仕置き", 40, "completed");
    timer(3, "お仕置き", 600, "stopped");
    timer(4, "Other timer", 600, "completed");
    timer(5, "お仕置き", 600, "completed", "2026-10-08T00:00:00");
  });

  afterEach(() => { sqlite?.close(); sqlite = undefined; vi.unstubAllGlobals(); });

  it("matches detail totals to their exact aggregate sources and inclusive boundaries", () => {
    const period = { startDate: "2026-10-01", endDate: "2026-10-07" };
    const report = reportRepository.summarize(period.startDate, period.endDate);
    expect(report).toEqual({ trainingCount: 2, managementDays: 2, earnedPoints: 30, orderCount: 1, punishmentMinutes: 1 });
    for (const { key } of reportMetrics) {
      const total = reportRepository.details(key, period).reduce((value, row) => value + row.amount, 0);
      expect(key === "punishmentMinutes" ? Math.floor(total / 60) : total).toBe(report[key]);
    }
  });

  it("retains source content and shows each counted management date only once", () => {
    const period = { startDate: "2026-10-01", endDate: "2026-10-07" };
    const details = reportRepository.details("managementDays", period);
    expect(details.map((row) => row.date)).toEqual(["2026-10-07", "2026-10-01"]);
    expect(details[1].body).toContain("Task 1");
    expect(details[1].body).toContain("Task 2");
    expect(details[0].body).not.toContain("Task 4");
    expect(reportRepository.details("trainingCount", period)[0]).toMatchObject({ id: "journal:2", journalDate: "2026-10-07", body: "Original body" });
    expect(reportRepository.details("earnedPoints", period).map((row) => row.id)).toEqual(["points:2", "points:1"]);
  });

  it("keeps periods disjoint and excludes future rows from month-to-date", () => {
    const month = reportRepository.compare(monthlyComparison("2026-10", "2026-10-07"));
    expect(month.current.earnedPoints).toBe(30);
    expect(month.previous.earnedPoints).toBe(0);
    const day = reportRepository.compare(dailyComparison("2026-10-01"));
    expect(day.current.earnedPoints).toBe(25);
    expect(day.previous.earnedPoints).toBe(5);
  });

  it("returns a truthful empty report and rejects invalid ranges", () => {
    const period = { startDate: "2026-08-01", endDate: "2026-08-02" };
    expect(reportRepository.details("earnedPoints", period)).toEqual([]);
    expect(reportRepository.summarize(period.startDate, period.endDate)).toEqual({ trainingCount: 0, managementDays: 0, earnedPoints: 0, orderCount: 0, punishmentMinutes: 0 });
    expect(() => reportRepository.summarize("2026-10-07", "2026-10-01")).toThrow();
    expect(() => reportRepository.details("earnedPoints", { startDate: "2026-02-30", endDate: "2026-03-01" })).toThrow();
  });
});

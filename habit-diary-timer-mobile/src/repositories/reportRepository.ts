import { query, queryOne } from "@/database/client";
import { toDateKey } from "@/utils/date";
import { monthlyComparison, weeklyComparison, validReportPeriod, type ReportPeriod, type ReportComparisonPeriod } from "@/features/reports/periods";
import type { ReportMetric } from "@/features/reports/metrics";
import type { Journal, TimerHistory } from "@/types/models";

export type ActivityReport = {
  trainingCount: number;
  managementDays: number;
  earnedPoints: number;
  punishmentMinutes: number;
  orderCount: number;
};

export type ComparedActivityReport = {
  periods: ReportComparisonPeriod;
  current: ActivityReport;
  previous: ActivityReport;
};

export type ReportDetail = {
  id: string;
  date: string;
  title: string;
  body: string;
  amount: number;
  unit: string;
  journalDate?: string;
};

const reportSources = {
  trainingCount: "SELECT * FROM journals WHERE record_date BETWEEN ? AND ? AND tags LIKE '%射精記録%'",
  managementDays: "SELECT * FROM management_daily_tasks WHERE record_date BETWEEN ? AND ? AND completed_at IS NOT NULL",
  earnedPoints: "SELECT * FROM point_transactions WHERE substr(created_at, 1, 10) BETWEEN ? AND ? AND points > 0",
  punishmentMinutes: "SELECT * FROM timer_histories WHERE substr(started_at, 1, 10) BETWEEN ? AND ? AND timer_name='お仕置き' AND completion_status='completed'",
  orderCount: "SELECT * FROM point_transactions WHERE substr(created_at, 1, 10) BETWEEN ? AND ? AND source_key LIKE 'daily-order:%'",
} as const;

function aggregateSource(metric: ReportMetric, expression: string) {
  return reportSources[metric].replace("SELECT *", `SELECT ${expression}`);
}

function summarize(startDate: string, endDate: string): ActivityReport {
  if (!validReportPeriod({ startDate, endDate })) throw new Error("集計期間を確認してください。");
  const trainingCount = queryOne<{ count: number }>(
    aggregateSource("trainingCount", "COUNT(*) AS count"),
    [startDate, endDate],
  )?.count ?? 0;
  const managementDays = queryOne<{ count: number }>(
    aggregateSource("managementDays", "COUNT(DISTINCT record_date) AS count"),
    [startDate, endDate],
  )?.count ?? 0;
  const earnedPoints = queryOne<{ total: number }>(
    aggregateSource("earnedPoints", "COALESCE(SUM(points), 0) AS total"),
    [startDate, endDate],
  )?.total ?? 0;
  const punishmentSeconds = queryOne<{ total: number }>(
    aggregateSource("punishmentMinutes", "COALESCE(SUM(actual_duration_seconds), 0) AS total"),
    [startDate, endDate],
  )?.total ?? 0;
  const orderCount = queryOne<{ count: number }>(
    aggregateSource("orderCount", "COUNT(*) AS count"),
    [startDate, endDate],
  )?.count ?? 0;

  return {
    trainingCount,
    managementDays,
    earnedPoints,
    punishmentMinutes: Math.floor(punishmentSeconds / 60),
    orderCount,
  };
}

export const reportRepository = {
  summarize,

  compare(periods: ReportComparisonPeriod): ComparedActivityReport {
    return {
      periods,
      current: summarize(periods.current.startDate, periods.current.endDate),
      previous: summarize(periods.previous.startDate, periods.previous.endDate),
    };
  },

  details(metric: ReportMetric, period: ReportPeriod): ReportDetail[] {
    if (!validReportPeriod(period)) throw new Error("集計期間を確認してください。");
    const params = [period.startDate, period.endDate];
    const sql = reportSources[metric];
    let details: ReportDetail[];
    if (metric === "trainingCount") {
      details = query<Journal>(sql, params).map((row) => ({
        id: `journal:${row.id}`, date: `${row.record_date} ${row.record_time ?? ""}`.trim(), title: row.title,
        body: row.body, amount: 1, unit: "回", journalDate: row.record_date,
      }));
    } else if (metric === "managementDays") {
      const rows = query<{ id: number; record_date: string; instruction: string; completed_at: string }>(sql, params);
      const days = new Map<string, typeof rows>();
      rows.forEach((row) => days.set(row.record_date, [...(days.get(row.record_date) ?? []), row]));
      details = Array.from(days, ([date, tasks]) => ({
        id: `management:${date}`, date, title: "管理指示の完了", amount: 1, unit: "日",
        body: tasks.sort((a, b) => a.id - b.id).map((task) => `${task.instruction}\n${task.completed_at}`).join("\n\n"),
      }));
    } else if (metric === "punishmentMinutes") {
      details = query<TimerHistory>(sql, params).map((row) => ({
        id: `timer:${row.id}`, date: row.started_at, title: row.timer_name, body: row.comment ?? "",
        amount: row.actual_duration_seconds, unit: "秒",
      }));
    } else {
      details = query<{ id: number; created_at: string; description: string; points: number }>(sql, params).map((row) => ({
        id: `points:${row.id}`, date: row.created_at, title: row.description, body: "",
        amount: metric === "orderCount" ? 1 : row.points, unit: metric === "orderCount" ? "回" : "pt",
      }));
    }
    return details.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  },

  today() {
    const today = toDateKey();
    return summarize(today, today);
  },

  recentSevenDays() {
    const { current } = weeklyComparison();
    return summarize(current.startDate, current.endDate);
  },

  currentMonth() {
    const { current } = monthlyComparison(toDateKey().slice(0, 7));
    return summarize(current.startDate, current.endDate);
  },
};

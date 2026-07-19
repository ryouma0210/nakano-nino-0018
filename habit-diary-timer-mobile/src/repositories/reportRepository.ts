import { queryOne } from "@/database/client";
import { toDateKey } from "@/utils/date";

export type ActivityReport = {
  trainingCount: number;
  managementDays: number;
  earnedPoints: number;
  punishmentMinutes: number;
  orderCount: number;
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function summarize(startDate: string, endDate: string): ActivityReport {
  const trainingCount = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM journals
     WHERE record_date BETWEEN ? AND ? AND tags LIKE '%射精記録%'`,
    [startDate, endDate],
  )?.count ?? 0;
  const managementDays = queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT record_date) AS count FROM management_daily_tasks
     WHERE completed_at IS NOT NULL AND record_date BETWEEN ? AND ?`,
    [startDate, endDate],
  )?.count ?? 0;
  const earnedPoints = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(points), 0) AS total FROM point_transactions
     WHERE substr(created_at, 1, 10) BETWEEN ? AND ?`,
    [startDate, endDate],
  )?.total ?? 0;
  const punishmentSeconds = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(actual_duration_seconds), 0) AS total FROM timer_histories
     WHERE timer_name='お仕置き' AND completion_status='completed'
       AND substr(started_at, 1, 10) BETWEEN ? AND ?`,
    [startDate, endDate],
  )?.total ?? 0;
  const orderCount = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM point_transactions
     WHERE source_key LIKE 'daily-order:%' AND substr(created_at, 1, 10) BETWEEN ? AND ?`,
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
  today() {
    const today = toDateKey();
    return summarize(today, today);
  },

  recentSevenDays() {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return summarize(dateKey(start), dateKey(end));
  },

  currentMonth() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return summarize(dateKey(start), dateKey(end));
  },
};

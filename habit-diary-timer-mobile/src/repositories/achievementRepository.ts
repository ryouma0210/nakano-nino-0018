import { execute, query, queryOne } from "@/database/client";
import { toDateKey, toDateTimeKey } from "@/utils/date";

type CycleDates = { start_date: string; end_date: string };
type TrainingJournal = { duration_seconds: number | null; body: string };

function daysBetweenInclusive(start: string, end: string) {
  const startTime = new Date(`${start}T12:00:00`).getTime();
  const endTime = new Date(`${end}T12:00:00`).getTime();
  return Math.max(0, Math.floor((endTime - startTime) / 86400000) + 1);
}

export const achievementRepository = {
  recordPunishment(actualSeconds: number) {
    if (actualSeconds <= 0) return;
    const now = toDateTimeKey();
    execute(
      `INSERT INTO timer_histories(timer_name, started_at, ended_at, actual_duration_seconds, completion_status, pause_count, created_at)
       VALUES('お仕置き', ?, ?, ?, 'completed', 0, ?)`,
      [now, now, Math.floor(actualSeconds), now],
    );
  },

  summary() {
    const punishmentSeconds = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(actual_duration_seconds), 0) AS total FROM timer_histories WHERE timer_name='お仕置き'",
    )?.total ?? 0;

    const training = query<TrainingJournal>("SELECT duration_seconds, body FROM journals WHERE tags LIKE '%射精記録%'");
    const trainingSeconds = training
      .map((record) => record.duration_seconds ?? Number(record.body.match(/秒数:\s*(\d+)秒/)?.[1] ?? 0))
      .filter((seconds) => seconds > 0);

    const today = toDateKey();
    const managementDays = query<CycleDates>("SELECT start_date, end_date FROM management_cycles")
      .reduce((total, cycle) => {
        if (cycle.start_date > today) return total;
        const effectiveEnd = cycle.end_date < today ? cycle.end_date : today;
        return total + daysBetweenInclusive(cycle.start_date, effectiveEnd);
      }, 0);

    return {
      punishmentMinutes: Math.floor(punishmentSeconds / 60),
      punishmentSeconds,
      bestTrainingSeconds: trainingSeconds.length ? Math.min(...trainingSeconds) : null,
      managementDays,
    };
  },
};

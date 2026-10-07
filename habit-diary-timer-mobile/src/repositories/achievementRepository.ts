import { execute, query, queryOne, transaction } from "@/database/client";
import { toDateKey, toDateTimeKey } from "@/utils/date";
import { journalRepository } from "@/repositories/journalRepository";
import type { TimerCompletionStatus } from "@/types/models";
import { pointRepository } from "@/repositories/rewardRepository";
import { DAILY_ROOM_POINTS } from "../constants/roomPoints";
import type { SessionCompletion } from "../features/sessions/completion";
import { trainingOutcomeTag } from "../features/training/trainingOutcome";

export type TrainingCompletionRecord = SessionCompletion & {
  elapsedSeconds: number;
  difficulty: string;
  targetSeconds: number;
  judgement: string;
};

function completionKey(session: SessionCompletion) { return `session-completion:${session.id}`; }
function isRecorded(session: SessionCompletion) {
  return queryOne<{ setting_value: string }>("SELECT setting_value FROM app_settings WHERE setting_key=?", [completionKey(session)])?.setting_value === "1";
}
function markRecorded(session: SessionCompletion) {
  execute("INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)", [completionKey(session), "1", session.completedAt]);
}

type CycleDates = { start_date: string; end_date: string };
type TrainingJournal = { duration_seconds: number | null; body: string };

function daysBetweenInclusive(start: string, end: string) {
  const startTime = new Date(`${start}T12:00:00`).getTime();
  const endTime = new Date(`${end}T12:00:00`).getTime();
  return Math.max(0, Math.floor((endTime - startTime) / 86400000) + 1);
}

export const achievementRepository = {
  recordPunishment(actualSeconds: number, status: TimerCompletionStatus = "completed", session?: SessionCompletion) {
    const seconds = Math.floor(actualSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const date = session?.recordDate ?? toDateKey();
    const now = session?.completedAt ?? toDateTimeKey();
    let awarded = false;
    transaction(() => {
      if (session && isRecorded(session)) return;
      execute(
        `INSERT INTO timer_histories(timer_name, started_at, ended_at, actual_duration_seconds, completion_status, pause_count, created_at)
         VALUES('お仕置き', ?, ?, ?, ?, 0, ?)`,
        [session?.startedAt ?? now, now, seconds, status, now],
      );
      journalRepository.create({
        recordDate: date,
        title: "お仕置き記録",
        body: `お仕置き部屋で${seconds}秒受けました。`,
        recordType: "diary",
        tags: "お仕置き,実施記録",
        durationSeconds: seconds,
        ...(session ? { occurredAt: now } : {}),
      });
      if (status === "completed") {
        awarded = pointRepository.award(`punishment:${date}`, DAILY_ROOM_POINTS.punishment, "本日初回のお仕置きを完了", now, { notify: false });
      }
      if (session) markRecorded(session);
    });
    if (awarded) pointRepository.notifyChanged();
  },

  recordTraining(result: TrainingCompletionRecord) {
    let awarded = false;
    transaction(() => {
      if (isRecorded(result)) return;
      journalRepository.create({
        recordDate: result.recordDate,
        title: "調教完了記録",
        body: `タイトル: 調教完了記録\n実施日: ${result.recordDate}\n難易度: ${result.difficulty}\n秒数: ${result.elapsedSeconds}秒\n判定: ${result.judgement}`,
        recordType: "diary",
        tags: `調教,完了,射精記録,${result.difficulty},${trainingOutcomeTag(result.elapsedSeconds, result.targetSeconds)}`,
        durationSeconds: result.elapsedSeconds,
        occurredAt: result.completedAt,
      });
      awarded = pointRepository.award(`training:${result.recordDate}`, DAILY_ROOM_POINTS.training, "本日初回の調教を完了", result.completedAt, { notify: false });
      markRecorded(result);
    });
    if (awarded) pointRepository.notifyChanged();
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
      trainingCount: training.length,
      bestTrainingSeconds: trainingSeconds.length ? Math.min(...trainingSeconds) : null,
      longestTrainingSeconds: trainingSeconds.length ? Math.max(...trainingSeconds) : null,
      managementDays,
    };
  },
};

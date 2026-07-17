import { execute, query } from "@/database/client";
import type { TimerCompletionStatus, TimerHistory, TimerPreset } from "@/types/models";
import { toDateTimeKey } from "@/utils/date";

export const timerRepository = {
  presets() {
    return query<TimerPreset>("SELECT * FROM timer_presets ORDER BY is_favorite DESC, id");
  },

  histories(limit = 20) {
    return query<TimerHistory>("SELECT * FROM timer_histories ORDER BY started_at DESC LIMIT ?", [limit]);
  },

  saveHistory(input: {
    presetId?: number;
    timerName: string;
    startedAt: string;
    endedAt?: string;
    actualDurationSeconds: number;
    completionStatus: TimerCompletionStatus;
    pauseCount: number;
    relatedHabitId?: number | null;
    comment?: string;
  }) {
    execute(
      `INSERT INTO timer_histories(timer_preset_id, timer_name, started_at, ended_at, actual_duration_seconds, completion_status, pause_count, related_habit_id, comment, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.presetId ?? null,
        input.timerName,
        input.startedAt,
        input.endedAt ?? toDateTimeKey(),
        input.actualDurationSeconds,
        input.completionStatus,
        input.pauseCount,
        input.relatedHabitId ?? null,
        input.comment ?? null,
        toDateTimeKey(),
      ],
    );
  },
};

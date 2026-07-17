import { execute, query, queryOne } from "@/database/client";
import type { Habit, HabitRecordStatus, HabitWithToday } from "@/types/models";
import { toDateKey, toDateTimeKey, toTimeKey } from "@/utils/date";

type HabitInput = {
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  frequencyType?: string;
  targetCount?: number;
  reminderEnabled?: boolean;
  reminderTime?: string;
  memo?: string;
};

export const habitRepository = {
  listWithToday(dateKey = toDateKey()) {
    return query<HabitWithToday>(
      `SELECT h.*,
              r.id AS today_record_id,
              r.status AS today_status,
              r.completed_count AS today_completed_count,
              COALESCE(total.completed, 0) AS total_completed
       FROM habits h
       LEFT JOIN habit_records r ON r.habit_id = h.id AND r.record_date = ?
       LEFT JOIN (
         SELECT habit_id, SUM(CASE WHEN status IN ('completed','partial') THEN completed_count ELSE 0 END) AS completed
         FROM habit_records
         GROUP BY habit_id
       ) total ON total.habit_id = h.id
       WHERE h.is_active = 1
       ORDER BY h.display_order, h.id`,
      [dateKey],
    );
  },

  find(id: number) {
    return queryOne<Habit>("SELECT * FROM habits WHERE id = ?", [id]);
  },

  create(input: HabitInput) {
    const now = toDateTimeKey();
    const result = execute(
      `INSERT INTO habits(name, description, category, icon, color, frequency_type, target_count, start_date, reminder_enabled, reminder_time, display_order, is_active, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(display_order) + 1 FROM habits), 1), 1, ?, ?)`,
      [
        input.name,
        input.description ?? null,
        input.category ?? "未分類",
        input.icon ?? "star",
        input.color ?? "#2f8b72",
        input.frequencyType ?? "daily",
        input.targetCount ?? 1,
        toDateKey(),
        input.reminderEnabled ? 1 : 0,
        input.reminderTime ?? null,
        now,
        now,
      ],
    );
    return Number(result.lastInsertRowId);
  },

  upsertRecord(habitId: number, status: HabitRecordStatus, completedCount = 1, comment?: string) {
    const now = toDateTimeKey();
    execute(
      `INSERT INTO habit_records(habit_id, record_date, record_time, status, completed_count, comment, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(habit_id, record_date)
       DO UPDATE SET record_time=excluded.record_time,
                     status=excluded.status,
                     completed_count=excluded.completed_count,
                     comment=excluded.comment,
                     updated_at=excluded.updated_at`,
      [habitId, toDateKey(), toTimeKey(), status, completedCount, comment ?? null, now, now],
    );
  },

  remove(id: number) {
    execute("DELETE FROM habits WHERE id = ?", [id]);
  },

  streak(habitId: number) {
    const rows = query<{ record_date: string; status: HabitRecordStatus }>(
      `SELECT record_date, status
       FROM habit_records
       WHERE habit_id = ?
       ORDER BY record_date DESC`,
      [habitId],
    );
    let current = 0;
    let longest = 0;
    let previous: Date | null = null;
    for (const row of rows) {
      if (!["completed", "partial"].includes(row.status)) break;
      const date = new Date(`${row.record_date}T00:00:00`);
      if (previous) {
        const diff = Math.round((previous.getTime() - date.getTime()) / 86400000);
        if (diff !== 1) break;
      }
      current += 1;
      previous = date;
    }
    let run = 0;
    rows
      .slice()
      .reverse()
      .forEach((row) => {
        if (["completed", "partial"].includes(row.status)) {
          run += 1;
          longest = Math.max(longest, run);
        } else {
          run = 0;
        }
      });
    return { current, longest };
  },
};

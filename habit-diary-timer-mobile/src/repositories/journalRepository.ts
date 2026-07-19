import { execute, query, queryOne, transaction } from "@/database/client";
import type { Journal, JournalRecordType } from "@/types/models";
import { toDateKey, toDateTimeKey, toTimeKey } from "@/utils/date";

type JournalInput = {
  recordDate: string;
  title: string;
  body: string;
  recordType: JournalRecordType;
  mood?: string;
  rating?: number;
  isFavorite?: boolean;
  tags?: string;
  durationSeconds?: number;
};

export const journalRepository = {
  list(keyword = "") {
    const like = `%${keyword.trim()}%`;
    if (!keyword.trim()) {
      return query<Journal>("SELECT * FROM journals ORDER BY record_date DESC, record_time DESC, id DESC");
    }
    return query<Journal>(
      `SELECT * FROM journals
       WHERE title LIKE ? OR body LIKE ? OR tags LIKE ?
       ORDER BY record_date DESC, record_time DESC, id DESC`,
      [like, like, like],
    );
  },

  latest() {
    return queryOne<Journal>("SELECT * FROM journals ORDER BY record_date DESC, record_time DESC, id DESC LIMIT 1");
  },

  find(id: number) {
    return queryOne<Journal>("SELECT * FROM journals WHERE id = ?", [id]);
  },

  create(input: JournalInput) {
    const now = toDateTimeKey();
    const result = execute(
      `INSERT INTO journals(record_date, record_time, title, body, record_type, mood, rating, is_favorite, duration_seconds, tags, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.recordDate || toDateKey(),
        toTimeKey(),
        input.title,
        input.body,
        input.recordType,
        input.mood ?? null,
        input.rating ?? null,
        input.isFavorite ? 1 : 0,
        input.durationSeconds ?? null,
        input.tags ?? null,
        now,
        now,
      ],
    );
    return Number(result.lastInsertRowId);
  },

  update(id: number, input: JournalInput) {
    execute(
      `UPDATE journals
       SET title=?, body=?, record_type=?, mood=?, rating=?, is_favorite=?, tags=?, updated_at=?
       , record_date=?
       WHERE id=?`,
      [
        input.title,
        input.body,
        input.recordType,
        input.mood ?? null,
        input.rating ?? null,
        input.isFavorite ? 1 : 0,
        input.tags ?? null,
        toDateTimeKey(),
        input.recordDate || toDateKey(),
        id,
      ],
    );
  },

  remove(id: number) {
    const journal = queryOne<{ record_date: string; title: string; tags: string | null }>(
      "SELECT record_date, title, tags FROM journals WHERE id = ?",
      [id],
    );
    transaction(() => {
      if (journal && (journal.title === "準備部屋チェック" || journal.tags?.includes("準備部屋"))) {
        execute("DELETE FROM preparation_records WHERE record_date = ?", [journal.record_date]);
      }
      execute("DELETE FROM journals WHERE id = ?", [id]);
    });
  },

  removeDate(recordDate: string) {
    const likeDate = `${recordDate}%`;
    const managementTasks = query<{ id: number }>(
      "SELECT id FROM management_daily_tasks WHERE record_date = ?",
      [recordDate],
    );
    transaction(() => {
      managementTasks.forEach((task) => {
        execute("DELETE FROM point_transactions WHERE source_key = ?", [
          `management-task:${task.id}`,
        ]);
      });
      execute("DELETE FROM point_transactions WHERE source_key = ?", [
        `training:${recordDate}`,
      ]);
      execute("DELETE FROM point_transactions WHERE source_key = ?", [
        `daily-order:${recordDate}`,
      ]);
      execute("DELETE FROM point_transactions WHERE created_at LIKE ?", [
        likeDate,
      ]);
      execute("DELETE FROM reward_redemptions WHERE redeemed_at LIKE ?", [
        likeDate,
      ]);
      execute("DELETE FROM management_daily_tasks WHERE record_date = ?", [
        recordDate,
      ]);
      execute("DELETE FROM preparation_records WHERE record_date = ?", [
        recordDate,
      ]);
      execute("DELETE FROM habit_records WHERE record_date = ?", [recordDate]);
      execute("DELETE FROM timer_histories WHERE started_at LIKE ?", [likeDate]);
      execute("DELETE FROM journals WHERE record_date = ?", [recordDate]);
      execute(
        "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM journal_tags)",
      );
    });
  },

  countToday() {
    return queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM journals WHERE record_date = ?", [toDateKey()])?.count ?? 0;
  },
};

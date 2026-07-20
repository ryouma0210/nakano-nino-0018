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
  upsertSystemRecord(input: JournalInput, uniqueTag: string) {
    const now = toDateTimeKey();
    const existing = queryOne<{ id: number }>(
      "SELECT id FROM journals WHERE record_date=? AND tags LIKE ? LIMIT 1",
      [input.recordDate, `%${uniqueTag}%`],
    );
    const tags = [input.tags, uniqueTag].filter(Boolean).join(",");
    if (existing) {
      execute(
        "UPDATE journals SET title=?, body=?, duration_seconds=?, tags=?, updated_at=? WHERE id=?",
        [input.title, input.body, input.durationSeconds ?? null, tags, now, existing.id],
      );
      return existing.id;
    }
    return this.create({ ...input, tags });
  },

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
      if (
        journal?.tags?.includes("敗北部屋")
        || journal?.tags?.includes("本日の命令")
        || journal?.tags?.includes("射精管理")
      ) return;
      if (journal && (journal.title === "準備部屋チェック" || journal.tags?.includes("準備部屋"))) {
        execute("DELETE FROM preparation_records WHERE record_date = ?", [journal.record_date]);
      }
      execute("DELETE FROM journals WHERE id = ?", [id]);
    });
  },

  removeDate(recordDate: string) {
    const likeDate = `${recordDate}%`;
    transaction(() => {
      execute("DELETE FROM point_transactions WHERE source_key = ?", [
        `training:${recordDate}`,
      ]);
      execute(
        `DELETE FROM point_transactions
         WHERE created_at LIKE ?
           AND source_key NOT LIKE 'daily-order:%'
           AND source_key NOT LIKE 'management-task:%'`,
        [likeDate],
      );
      execute("DELETE FROM reward_redemptions WHERE redeemed_at LIKE ?", [
        likeDate,
      ]);
      execute("DELETE FROM preparation_records WHERE record_date = ?", [
        recordDate,
      ]);
      execute("DELETE FROM habit_records WHERE record_date = ?", [recordDate]);
      execute("DELETE FROM timer_histories WHERE started_at LIKE ?", [likeDate]);
      execute(
        `DELETE FROM journals
         WHERE record_date = ?
           AND COALESCE(tags, '') NOT LIKE '%敗北部屋%'
           AND COALESCE(tags, '') NOT LIKE '%本日の命令%'
           AND COALESCE(tags, '') NOT LIKE '%射精管理%'`,
        [recordDate],
      );
      execute(
        "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM journal_tags)",
      );
    });
  },

  countToday() {
    return queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM journals WHERE record_date = ?", [toDateKey()])?.count ?? 0;
  },
};

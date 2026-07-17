import { execute, query, queryOne } from "@/database/client";
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
      `INSERT INTO journals(record_date, record_time, title, body, record_type, mood, rating, is_favorite, tags, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.recordDate || toDateKey(),
        toTimeKey(),
        input.title,
        input.body,
        input.recordType,
        input.mood ?? null,
        input.rating ?? null,
        input.isFavorite ? 1 : 0,
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
    execute("DELETE FROM journals WHERE id = ?", [id]);
  },

  countToday() {
    return queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM journals WHERE record_date = ?", [toDateKey()])?.count ?? 0;
  },
};

import { execute, query, queryOne, transaction } from "@/database/client";
import { toDateKey, toDateTimeKey } from "@/utils/date";

const monthlyIncomeKey = "tribute_monthly_income";

function monthlyIncomeSettingKey(month: string) {
  return `${monthlyIncomeKey}_${month}`;
}

export type TributeRecord = {
  id: number;
  record_date: string;
  amount: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type TributeIncomeRecord = TributeRecord;

function monthPrefix(dateKey = toDateKey()) {
  return dateKey.slice(0, 7);
}

export const tributeRepository = {
  monthlyIncome(month = monthPrefix()) {
    const row = queryOne<{ setting_value: string }>(
      "SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1",
      [monthlyIncomeSettingKey(month)],
    );
    const fallback =
      month === monthPrefix()
        ? queryOne<{ setting_value: string }>(
            "SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1",
            [monthlyIncomeKey],
          )
        : null;
    const value = Number(row?.setting_value ?? fallback?.setting_value ?? 0);
    return Number.isFinite(value) ? value : 0;
  },

  saveMonthlyIncome(amount: number, month = monthPrefix()) {
    const now = toDateTimeKey();
    const key = monthlyIncomeSettingKey(month);
    const existing = queryOne<{ id: number }>(
      "SELECT id FROM app_settings WHERE setting_key=? LIMIT 1",
      [key],
    );
    if (existing) {
      execute(
        "UPDATE app_settings SET setting_value=?, updated_at=? WHERE id=?",
        [String(amount), now, existing.id],
      );
      return;
    }
    execute(
      "INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)",
      [key, String(amount), now],
    );
  },

  list(month = monthPrefix()) {
    return query<TributeRecord>(
      "SELECT * FROM tribute_records WHERE record_date LIKE ? ORDER BY record_date DESC, id DESC",
      [`${month}%`],
    );
  },

  incomeList(month = monthPrefix()) {
    return query<TributeIncomeRecord>(
      "SELECT * FROM tribute_income_records WHERE record_date LIKE ? ORDER BY record_date DESC, id DESC",
      [`${month}%`],
    );
  },

  monthTotal(month = monthPrefix()) {
    const row = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM tribute_records WHERE record_date LIKE ?",
      [`${month}%`],
    );
    return Number(row?.total ?? 0);
  },

  incomeMonthTotal(month = monthPrefix()) {
    const row = queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM tribute_income_records WHERE record_date LIKE ?",
      [`${month}%`],
    );
    return Number(row?.total ?? 0);
  },

  add(input: { recordDate: string; amount: number; comment: string }) {
    const now = toDateTimeKey();
    transaction(() => {
      execute(
        "INSERT INTO tribute_records(record_date, amount, comment, created_at, updated_at) VALUES(?, ?, ?, ?, ?)",
        [input.recordDate, input.amount, input.comment.trim() || null, now, now],
      );
    });
  },

  addIncome(input: { recordDate: string; amount: number; comment: string }) {
    const now = toDateTimeKey();
    transaction(() => {
      execute(
        "INSERT INTO tribute_income_records(record_date, amount, comment, created_at, updated_at) VALUES(?, ?, ?, ?, ?)",
        [input.recordDate, input.amount, input.comment.trim() || null, now, now],
      );
    });
  },

  remove(id: number) {
    execute("DELETE FROM tribute_records WHERE id=?", [id]);
  },

  removeIncome(id: number) {
    execute("DELETE FROM tribute_income_records WHERE id=?", [id]);
  },
};

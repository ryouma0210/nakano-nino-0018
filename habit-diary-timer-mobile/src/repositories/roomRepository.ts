import { execute, query, queryOne, transaction } from "@/database/client";
import { toDateKey, toDateTimeKey, toTimeKey } from "@/utils/date";
import {
  managementFinalDayMessages,
  managementInstructionMessages,
} from "@/constants/messages";
import { journalRepository } from "@/repositories/journalRepository";

export type PreparationRecord = {
  record_date: string;
  checks_json: string;
  completed_at: string;
  updated_at: string;
};

export type ManagementMode = "release" | "chastity";
export type ManagementCycle = {
  id: number;
  mode: ManagementMode;
  dice: number;
  start_date: string;
  end_date: string;
  is_active: number;
  created_at: string;
};
export type ManagementDailyTask = {
  id: number;
  cycle_id: number;
  record_date: string;
  instruction: string;
  completed_at: string | null;
};

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function deleteManagementCycleData(cycleId: number) {
  const tasks = query<{ id: number }>(
    "SELECT id FROM management_daily_tasks WHERE cycle_id=?",
    [cycleId],
  );
  tasks.forEach((task) => {
    execute("DELETE FROM point_transactions WHERE source_key=?", [
      `management-task:${task.id}`,
    ]);
  });
  execute("DELETE FROM management_daily_tasks WHERE cycle_id=?", [cycleId]);
  execute("DELETE FROM management_cycles WHERE id=?", [cycleId]);
}

export const preparationRepository = {
  find(date = toDateKey()) {
    const record = queryOne<PreparationRecord>("SELECT * FROM preparation_records WHERE record_date = ?", [date]);
    if (!record) return undefined;
    const journal = queryOne<{ id: number }>(
      "SELECT id FROM journals WHERE record_date = ? AND tags LIKE '%準備部屋%' LIMIT 1",
      [date],
    );
    if (!journal) {
      execute("DELETE FROM preparation_records WHERE record_date = ?", [date]);
      return undefined;
    }
    return record;
  },

  save(checks: string[], date = toDateKey()) {
    const now = toDateTimeKey();
    const body = `準備部屋でのチェック項目\n${checks.map((item) => `✅ ${item}`).join("\n")}\n\n本日も調教よろしくお願いいたします。`;
    transaction(() => {
      execute(
        `INSERT INTO preparation_records(record_date, checks_json, completed_at, updated_at)
         VALUES(?, ?, ?, ?)
         ON CONFLICT(record_date) DO UPDATE SET checks_json=excluded.checks_json, completed_at=excluded.completed_at, updated_at=excluded.updated_at`,
        [date, JSON.stringify(checks), now, now],
      );
      const existing = queryOne<{ id: number }>("SELECT id FROM journals WHERE record_date = ? AND tags LIKE '%準備部屋%' LIMIT 1", [date]);
      if (existing) {
        execute("UPDATE journals SET body=?, updated_at=? WHERE id=?", [body, now, existing.id]);
      } else {
        execute(
          `INSERT INTO journals(record_date, record_time, title, body, record_type, is_favorite, tags, created_at, updated_at)
           VALUES(?, ?, '準備部屋チェック', ?, 'diary', 0, '準備部屋,チェック', ?, ?)`,
          [date, toTimeKey(), body, now, now],
        );
      }
    });
  },
};

export const defeatRepository = {
  find(date = toDateKey()) {
    const journal = queryOne<{ body: string }>(
      "SELECT body FROM journals WHERE record_date = ? AND tags LIKE '%敗北部屋%' LIMIT 1",
      [date],
    );
    if (!journal) return undefined;
    return journal.body
      .split("\n")
      .filter((line) => line.startsWith("✅ "))
      .map((line) => line.slice(2));
  },

  save(checks: string[], date = toDateKey()) {
    const now = toDateTimeKey();
    const body = `敗北部屋での強制チェック項目\n${checks.map((item) => `✅ ${item}`).join("\n")}\n\n本日の完全敗北を認めました♡`;
    transaction(() => {
      const existing = queryOne<{ id: number }>(
        "SELECT id FROM journals WHERE record_date = ? AND tags LIKE '%敗北部屋%' LIMIT 1",
        [date],
      );
      if (existing) {
        execute("UPDATE journals SET body=?, updated_at=? WHERE id=?", [body, now, existing.id]);
      } else {
        execute(
          `INSERT INTO journals(record_date, record_time, title, body, record_type, is_favorite, tags, created_at, updated_at)
           VALUES(?, ?, '敗北部屋記録', ?, 'diary', 0, '敗北部屋,チェック,調教記録', ?, ?)`,
          [date, toTimeKey(), body, now, now],
        );
      }
    });
  },
};

const instructions: Record<ManagementMode, string[]> = {
  release: managementInstructionMessages.release.map((message) => message.text),
  chastity: managementInstructionMessages.chastity.map((message) => message.text),
};

const finalDayInstructions: Record<ManagementMode, string[]> = {
  release: managementFinalDayMessages.release.map((message) => message.text),
  chastity: managementFinalDayMessages.chastity.map((message) => message.text),
};

function saveManagementTaskJournal(task: ManagementDailyTask) {
  journalRepository.upsertSystemRecord(
    {
      recordDate: task.record_date,
      title: "射精管理記録",
      body: `射精管理の本日の指示\n${task.instruction}\n\n実施完了`,
      recordType: "diary",
      tags: "射精管理,本日の指示,完了,削除不可",
    },
    `射精管理タスク${task.id}`,
  );
}

export const managementRepository = {
  syncCompletedJournals() {
    query<ManagementDailyTask>(
      "SELECT * FROM management_daily_tasks WHERE completed_at IS NOT NULL ORDER BY record_date, id",
    ).forEach(saveManagementTaskJournal);
  },

  active(mode: ManagementMode) {
    return queryOne<ManagementCycle>("SELECT * FROM management_cycles WHERE mode=? AND is_active=1 ORDER BY id DESC LIMIT 1", [mode]);
  },

  roll(mode: ManagementMode, dice: number) {
    const startDate = toDateKey();
    const endDate = addDays(startDate, dice * 3 - 1);
    const now = toDateTimeKey();
    let id = 0;
    transaction(() => {
      execute("UPDATE management_cycles SET is_active=0 WHERE mode=?", [mode]);
      const result = execute(
        "INSERT INTO management_cycles(mode, dice, start_date, end_date, is_active, created_at) VALUES(?, ?, ?, ?, 1, ?)",
        [mode, dice, startDate, endDate, now],
      );
      id = Number(result.lastInsertRowId);
    });
    return queryOne<ManagementCycle>("SELECT * FROM management_cycles WHERE id=?", [id])!;
  },

  reroll(cycleId: number, mode: ManagementMode, dice: number) {
    const startDate = toDateKey();
    const endDate = addDays(startDate, dice * 3 - 1);
    const now = toDateTimeKey();
    let id = 0;
    transaction(() => {
      // Deleting the cycle also deletes every daily task and removes this period from achievements.
      deleteManagementCycleData(cycleId);
      execute("UPDATE management_cycles SET is_active=0 WHERE mode=?", [mode]);
      const result = execute(
        "INSERT INTO management_cycles(mode, dice, start_date, end_date, is_active, created_at) VALUES(?, ?, ?, ?, 1, ?)",
        [mode, dice, startDate, endDate, now],
      );
      id = Number(result.lastInsertRowId);
    });
    return queryOne<ManagementCycle>("SELECT * FROM management_cycles WHERE id=?", [id])!;
  },

  removeCycle(cycleId: number) {
    transaction(() => deleteManagementCycleData(cycleId));
  },

  todayTask(cycle: ManagementCycle) {
    const today = toDateKey();
    const isFinalDay = today >= cycle.end_date;
    const seed = Number(today.replaceAll("-", "")) + cycle.id * 17;
    const finalChoices = finalDayInstructions[cycle.mode];
    const existing = queryOne<ManagementDailyTask>("SELECT * FROM management_daily_tasks WHERE cycle_id=? AND record_date=?", [cycle.id, today]);
    if (existing) {
      if (isFinalDay && existing.instruction === "本日は射精日") {
        const instruction = finalChoices[seed % finalChoices.length];
        execute("UPDATE management_daily_tasks SET instruction=? WHERE id=?", [
          instruction,
          existing.id,
        ]);
        const updated = { ...existing, instruction };
        if (updated.completed_at) saveManagementTaskJournal(updated);
        return updated;
      }
      if (existing.completed_at) saveManagementTaskJournal(existing);
      return existing;
    }
    const choices = instructions[cycle.mode];
    const instruction = isFinalDay
      ? finalChoices[seed % finalChoices.length]
      : choices[seed % choices.length];
    const result = execute(
      "INSERT INTO management_daily_tasks(cycle_id, record_date, instruction) VALUES(?, ?, ?)",
      [cycle.id, today, instruction],
    );
    return queryOne<ManagementDailyTask>("SELECT * FROM management_daily_tasks WHERE id=?", [Number(result.lastInsertRowId)])!;
  },

  complete(taskId: number) {
    const completedAt = toDateTimeKey();
    execute("UPDATE management_daily_tasks SET completed_at=? WHERE id=?", [completedAt, taskId]);
    const task = queryOne<ManagementDailyTask>(
      "SELECT * FROM management_daily_tasks WHERE id=?",
      [taskId],
    );
    if (task) {
      saveManagementTaskJournal(task);
    }
  },

  finish(cycleId: number) {
    execute("UPDATE management_cycles SET is_active=0 WHERE id=?", [cycleId]);
  },
};

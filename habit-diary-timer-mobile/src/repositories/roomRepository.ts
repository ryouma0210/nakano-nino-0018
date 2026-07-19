import { execute, query, queryOne, transaction } from "@/database/client";
import { toDateKey, toDateTimeKey, toTimeKey } from "@/utils/date";

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

const instructions: Record<ManagementMode, string[]> = {
  release: [
    "足ピンしながら寸止め3回",
    "四つん這いの状態で寸止め3回",
    "ゴミ箱に向けて寸止め3回",
    "土下座の状態で寸止め5回",
    "ヨダレを大量に付けた状態で寸止め10回",
  ],
  chastity: [
    "アナル責め30分",
    "乳首責めカリカリ60分",
    "貞操帯越しにシコシコ10分",
    "乳首責めしながらチンピク30分",
    "金玉叩き10分＆金玉潰し10分",
  ],
};

export const managementRepository = {
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
    const existing = queryOne<ManagementDailyTask>("SELECT * FROM management_daily_tasks WHERE cycle_id=? AND record_date=?", [cycle.id, today]);
    if (existing) return existing;
    const isFinalDay = today >= cycle.end_date;
    const choices = instructions[cycle.mode];
    const seed = Number(today.replaceAll("-", "")) + cycle.id * 17;
    const instruction = isFinalDay ? "本日は射精日" : choices[seed % choices.length];
    const result = execute(
      "INSERT INTO management_daily_tasks(cycle_id, record_date, instruction) VALUES(?, ?, ?)",
      [cycle.id, today, instruction],
    );
    return queryOne<ManagementDailyTask>("SELECT * FROM management_daily_tasks WHERE id=?", [Number(result.lastInsertRowId)])!;
  },

  complete(taskId: number) {
    execute("UPDATE management_daily_tasks SET completed_at=? WHERE id=?", [toDateTimeKey(), taskId]);
  },

  finish(cycleId: number) {
    execute("UPDATE management_cycles SET is_active=0 WHERE id=?", [cycleId]);
  },
};

import { execute, query, queryOne, transaction } from "@/database/client";
import { toDateKey, toDateTimeKey, toTimeKey } from "@/utils/date";
import { journalRepository } from "@/repositories/journalRepository";
import { customCommandService } from "@/services/customCommandService";
import { createMissingManagementTasks } from "../services/managementTaskService";
import { hasManagementRoulette, isCompletedManagementRouletteDay, managementRouletteService, removeManagementRouletteCycle } from "../services/managementRouletteService";

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
  customCommandId?: string;
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
  const journalTags = new Set([...tasks.map((task) => `射精管理タスク${task.id}`), `射精管理期間${cycleId}`]);
  const journals = query<{ id: number; tags: string | null }>("SELECT id, tags FROM journals WHERE tags LIKE '%射精管理%'");
  for (const journal of journals) {
    // Tags are comma-separated tokens: task 1 must never match task 10.
    if (journal.tags?.split(",").some((tag) => journalTags.has(tag))) execute("DELETE FROM journals WHERE id=?", [journal.id]);
  }
  tasks.forEach((task) => {
    execute("DELETE FROM point_transactions WHERE source_key=?", [
      `management-task:${task.id}`,
    ]);
  });
  execute("DELETE FROM management_daily_tasks WHERE cycle_id=?", [cycleId]);
  execute("DELETE FROM management_cycles WHERE id=?", [cycleId]);
  customCommandService.removeManagementSources(cycleId, true);
  removeManagementRouletteCycle(cycleId);
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
    const savedRecord = queryOne<PreparationRecord>(
      "SELECT * FROM preparation_records WHERE record_date = ?",
      [date],
    );
    const savedJournal = queryOne<{ id: number }>(
      "SELECT id FROM journals WHERE record_date = ? AND tags LIKE '%準備部屋%' LIMIT 1",
      [date],
    );
    if (!savedRecord || !savedJournal) {
      throw new Error("準備部屋の保存結果を取得できませんでした。");
    }
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
    const savedJournal = queryOne<{ id: number }>(
      "SELECT id FROM journals WHERE record_date = ? AND tags LIKE '%敗北部屋%' LIMIT 1",
      [date],
    );
    if (!savedJournal) {
      throw new Error("敗北部屋の保存結果を取得できませんでした。");
    }
  },
};

function withCommandSource(task: ManagementDailyTask): ManagementDailyTask {
  const customCommandId = customCommandService.managementSource(task.cycle_id, task.record_date);
  return customCommandId ? { ...task, customCommandId } : { ...task };
}

function saveManagementTaskJournal(task: ManagementDailyTask) {
  const sourceTask = withCommandSource(task);
  const heading = isCompletedManagementRouletteDay(task.cycle_id, task.record_date) ? "本日のルーレット" : "射精管理の本日の指示";
  journalRepository.upsertSystemRecord(
    {
      recordDate: task.record_date,
      title: "射精管理記録",
      body: `${heading}\n${task.instruction}\n\n実施完了`,
      recordType: "diary",
      tags: sourceTask.customCommandId ? "射精管理,本日の指示,完了,削除不可,自分で追加した命令" : "射精管理,本日の指示,完了,削除不可",
    },
    `射精管理タスク${task.id}`,
  );
}

function findActiveManagementCycle(mode: ManagementMode) {
  return queryOne<ManagementCycle>(
    "SELECT * FROM management_cycles WHERE mode=? AND is_active=1 ORDER BY id DESC LIMIT 1",
    [mode],
  );
}

function findCreatedManagementCycle({
  mode,
  dice,
  startDate,
  endDate,
  createdAt,
}: {
  mode: ManagementMode;
  dice: number;
  startDate: string;
  endDate: string;
  createdAt: string;
}) {
  return query<ManagementCycle>("SELECT * FROM management_cycles")
    .filter(
      (cycle) =>
        cycle.mode === mode &&
        Number(cycle.dice) === dice &&
        cycle.start_date === startDate &&
        cycle.end_date === endDate &&
        cycle.created_at === createdAt &&
        Number(cycle.is_active) === 1,
    )
    .sort((a, b) => Number(b.id) - Number(a.id))[0] ?? null;
}

export const managementRepository = {
  syncCompletedJournals() {
    query<ManagementDailyTask>(
      "SELECT * FROM management_daily_tasks WHERE completed_at IS NOT NULL ORDER BY record_date, id",
    ).forEach(saveManagementTaskJournal);
  },

  active(mode: ManagementMode) {
    const cycle = findActiveManagementCycle(mode);
    if (cycle) createMissingManagementTasks(cycle);
    return cycle;
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
    const cycle =
      (Number.isFinite(id) && id > 0
        ? queryOne<ManagementCycle>("SELECT * FROM management_cycles WHERE id=?", [id])
        : null) ??
      findCreatedManagementCycle({
        mode,
        dice,
        startDate,
        endDate,
        createdAt: now,
      }) ??
      findActiveManagementCycle(mode);
    if (!cycle) throw new Error("射精管理期間の作成結果を取得できませんでした。");
    createMissingManagementTasks(cycle);
    return cycle;
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
    const cycle =
      (Number.isFinite(id) && id > 0
        ? queryOne<ManagementCycle>("SELECT * FROM management_cycles WHERE id=?", [id])
        : null) ??
      findCreatedManagementCycle({
        mode,
        dice,
        startDate,
        endDate,
        createdAt: now,
      }) ??
      findActiveManagementCycle(mode);
    if (!cycle) throw new Error("射精管理期間の振り直し結果を取得できませんでした。");
    createMissingManagementTasks(cycle);
    return cycle;
  },

  removeCycle(cycleId: number) {
    transaction(() => deleteManagementCycleData(cycleId));
  },

  todayTask(cycle: ManagementCycle) {
    cycle = queryOne<ManagementCycle>("SELECT * FROM management_cycles WHERE id=?", [cycle.id]) ?? cycle;
    const today = toDateKey();
    createMissingManagementTasks(cycle);
    const existing = queryOne<ManagementDailyTask>("SELECT * FROM management_daily_tasks WHERE cycle_id=? AND record_date=?", [cycle.id, today]);
    if (existing) {
      if (existing.completed_at) saveManagementTaskJournal(existing);
      return withCommandSource(existing);
    }
    return null;
  },

  tasks(cycle: ManagementCycle) {
    cycle = queryOne<ManagementCycle>("SELECT * FROM management_cycles WHERE id=?", [cycle.id]) ?? cycle;
    createMissingManagementTasks(cycle);
    return query<ManagementDailyTask>(
      "SELECT * FROM management_daily_tasks WHERE cycle_id=? ORDER BY record_date, id",
      [cycle.id],
    ).map(withCommandSource);
  },

  complete(taskId: number) {
    const existing = queryOne<ManagementDailyTask>("SELECT * FROM management_daily_tasks WHERE id=?", [taskId]);
    if (existing && hasManagementRoulette(existing.cycle_id)) throw new Error("ルーレットの課題を完了してから、本日を終了してください。");
    const completedAt = toDateTimeKey();
    execute("UPDATE management_daily_tasks SET completed_at=? WHERE id=?", [completedAt, taskId]);
    const task = queryOne<ManagementDailyTask>(
      "SELECT * FROM management_daily_tasks WHERE id=?",
      [taskId],
    );
    if (task) {
      saveManagementTaskJournal(task);
      return withCommandSource(task);
    }
    throw new Error("射精管理の本日の命令を完了状態に更新できませんでした。");
  },

  finish(cycleId: number) {
    if (hasManagementRoulette(cycleId)) { managementRouletteService.finishManagement(cycleId); return; }
    execute("UPDATE management_cycles SET is_active=0 WHERE id=?", [cycleId]);
  },
};

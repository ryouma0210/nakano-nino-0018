import { execute, queryOne, transaction } from "@/database/client";
import { managementFinalDayMessages } from "@/constants/messages";
import { journalRepository } from "@/repositories/journalRepository";
import { pointRepository } from "@/repositories/rewardRepository";
import type { ManagementCycle, ManagementDailyTask } from "@/repositories/roomRepository";
import { toDateKey, toDateTimeKey } from "@/utils/date";
import { customCommandService } from "./customCommandService";
import { createMissingManagementTasks, replaceManagementInstruction } from "./managementTaskService";
import {
  MANAGEMENT_EXTENSION_MINUTES, MANAGEMENT_MINIMUM_DAILY_SPINS, MANAGEMENT_ROULETTE_KEY, parseManagementRoulette,
  type ManagementRouletteCycle, type ManagementRouletteDay, type ManagementRouletteDraw, type ManagementRouletteSave,
} from "./managementRouletteStorage";

export type { ManagementRouletteDay, ManagementRouletteDraw } from "./managementRouletteStorage";
export type ManagementRouletteTaskDraw = Extract<ManagementRouletteDraw, { kind: "task" }>;
export type ManagementRouletteState = {
  cycle: ManagementCycle;
  deadlineAt: string;
  day: ManagementRouletteDay;
  days: ManagementRouletteDay[];
  spinCount: number;
  remainingSpins: number;
  pendingTasks: ManagementRouletteTaskDraw[];
  canFinishDay: boolean;
  canRelease: boolean;
  finalInstruction: string;
  taskChoices: ManagementRouletteCycle["taskChoices"];
  todayTaskId: number | null;
};

function readSaved() {
  return parseManagementRoulette(queryOne<{ setting_value: string }>("SELECT setting_value FROM app_settings WHERE setting_key=?", [MANAGEMENT_ROULETTE_KEY])?.setting_value ?? null);
}
function writeSaved(saved: ManagementRouletteSave) {
  const raw = JSON.stringify(saved);
  parseManagementRoulette(raw);
  execute(
    `INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at`,
    [MANAGEMENT_ROULETTE_KEY, raw, new Date().toISOString()],
  );
}
function findCycle(cycleOrId: ManagementCycle | number) {
  const cycle = queryOne<ManagementCycle>("SELECT * FROM management_cycles WHERE id=?", [typeof cycleOrId === "number" ? cycleOrId : cycleOrId.id]);
  if (!cycle) throw new Error("管理期間が見つかりません。");
  return { ...cycle };
}
function assertActive(cycle: ManagementCycle, now: Date) {
  if (!Number.isFinite(now.getTime()) || cycle.is_active !== 1 || toDateKey(now) < cycle.start_date) throw new Error("管理期間中のみ操作できます。");
}
function todayTask(cycleId: number, date: string) {
  return queryOne<ManagementDailyTask>("SELECT * FROM management_daily_tasks WHERE cycle_id=? AND record_date=?", [cycleId, date]);
}
function initialize(saved: ManagementRouletteSave, cycle: ManagementCycle, now: Date) {
  let meta = saved.cycles.find((item) => item.cycleId === cycle.id);
  if (!meta) {
    const pool = [...customCommandService.pool(cycle.mode)];
    if (pool.length === 0) throw new Error("ルーレットの課題が見つかりません。");
    const choices = [];
    while (choices.length < 5) {
      if (pool.length === 0) pool.push(...customCommandService.pool(cycle.mode));
      choices.push(pool.splice(Math.min(pool.length - 1, Math.floor(Math.random() * pool.length)), 1)[0]);
    }
    const finalChoices = managementFinalDayMessages[cycle.mode];
    const originalFinal = todayTask(cycle.id, cycle.end_date);
    meta = {
      cycleId: cycle.id,
      deadlineAt: new Date(`${cycle.end_date}T00:00:00`).toISOString(),
      finalInstruction: originalFinal?.instruction ?? finalChoices[Math.floor(Math.random() * finalChoices.length)].text,
      taskChoices: choices,
      days: [],
    };
    saved.cycles.push(meta);
  }
  const date = toDateKey(now);
  let day = meta.days.find((entry) => entry.date === date);
  if (!day) {
    day = { date, draws: [], endedAt: null };
    meta.days.push(day);
    meta.days.sort((a, b) => a.date.localeCompare(b.date));
  }
  return { meta, day };
}
function ensureTodayTask(cycle: ManagementCycle, meta: ManagementRouletteCycle, date: string) {
  if (todayTask(cycle.id, date) || date < cycle.start_date) return;
  // An overdue active period still needs a record for today's roulette.
  execute("INSERT INTO management_daily_tasks(cycle_id, record_date, instruction) VALUES(?, ?, ?)", [cycle.id, date, meta.finalInstruction]);
}
function snapshot(cycle: ManagementCycle, meta: ManagementRouletteCycle, day: ManagementRouletteDay, now: Date): ManagementRouletteState {
  const pendingTasks = meta.days.flatMap((entry) => entry.draws).filter((draw): draw is ManagementRouletteTaskDraw => draw.kind === "task" && draw.completedAt === null);
  const active = cycle.is_active === 1 && day.date >= cycle.start_date;
  return {
    cycle, deadlineAt: meta.deadlineAt, day, days: meta.days,
    spinCount: day.draws.length, remainingSpins: Math.max(0, MANAGEMENT_MINIMUM_DAILY_SPINS - day.draws.length), pendingTasks,
    canFinishDay: active && day.endedAt === null && day.draws.length >= MANAGEMENT_MINIMUM_DAILY_SPINS && pendingTasks.length === 0,
    canRelease: active && day.endedAt !== null && day.draws.length >= MANAGEMENT_MINIMUM_DAILY_SPINS && pendingTasks.length === 0 && now.getTime() >= Date.parse(meta.deadlineAt),
    finalInstruction: meta.finalInstruction, taskChoices: meta.taskChoices,
    todayTaskId: todayTask(cycle.id, day.date)?.id ?? null,
  };
}
function extend(cycle: ManagementCycle, meta: ManagementRouletteCycle, minutes: number, now: Date) {
  const deadline = new Date(Math.max(Date.parse(meta.deadlineAt), now.getTime()) + minutes * 60000);
  const next = { ...cycle, end_date: toDateKey(deadline) };
  meta.deadlineAt = deadline.toISOString();
  if (next.end_date !== cycle.end_date) {
    execute("UPDATE management_cycles SET end_date=? WHERE id=?", [next.end_date, cycle.id]);
    const formerFinal = todayTask(cycle.id, cycle.end_date);
    if (formerFinal && !formerFinal.completed_at) {
      const pool = customCommandService.pool(cycle.mode);
      replaceManagementInstruction(cycle.id, cycle.end_date, pool[Math.floor(Math.random() * pool.length)]);
    }
    createMissingManagementTasks(next, true);
    const newFinal = todayTask(cycle.id, next.end_date);
    if (newFinal && !newFinal.completed_at) replaceManagementInstruction(cycle.id, next.end_date, { text: meta.finalInstruction });
  }
  return next;
}

export function hasManagementRoulette(cycleId: number) { return readSaved().cycles.some((cycle) => cycle.cycleId === cycleId); }
export function isCompletedManagementRouletteDay(cycleId: number, date: string) {
  return readSaved().cycles.some((cycle) => cycle.cycleId === cycleId && cycle.days.some((day) => day.date === date && day.endedAt !== null));
}
export function removeManagementRouletteCycle(cycleId: number) {
  const saved = readSaved();
  if (!saved.cycles.some((cycle) => cycle.cycleId === cycleId)) return;
  saved.cycles = saved.cycles.filter((cycle) => cycle.cycleId !== cycleId);
  writeSaved(saved);
}

export const managementRouletteService = {
  state(cycleOrId: ManagementCycle | number, now = new Date()): ManagementRouletteState {
    const cycle = findCycle(cycleOrId);
    const saved = readSaved();
    const before = JSON.stringify(saved);
    let result!: ManagementRouletteState;
    transaction(() => {
      createMissingManagementTasks(cycle, true);
      const { meta, day } = initialize(saved, cycle, now);
      if (cycle.is_active === 1) ensureTodayTask(cycle, meta, day.date);
      if (JSON.stringify(saved) !== before) writeSaved(saved);
      result = snapshot(cycle, meta, day, now);
    });
    return result;
  },

  spin(cycleId: number, now = new Date()): { draw: ManagementRouletteDraw; state: ManagementRouletteState } {
    let result!: { draw: ManagementRouletteDraw; state: ManagementRouletteState };
    transaction(() => {
      const cycle = findCycle(cycleId);
      assertActive(cycle, now);
      const saved = readSaved();
      createMissingManagementTasks(cycle, true);
      const { meta, day } = initialize(saved, cycle, now);
      if (day.endedAt) throw new Error("本日は終了しています。翌日また開始してください。");
      ensureTodayTask(cycle, meta, day.date);
      const candidateIndex = Math.min(10, Math.floor(Math.random() * 11));
      const common = { id: `${day.date}:${day.draws.length + 1}`, drawnAt: now.toISOString(), candidateIndex };
      const choice = meta.taskChoices[candidateIndex - 6];
      const draw: ManagementRouletteDraw = candidateIndex < 6
        ? { ...common, kind: "extension", minutes: MANAGEMENT_EXTENSION_MINUTES[candidateIndex] }
        : { ...common, kind: "task", instruction: choice.text, ...(choice.customCommandId ? { customCommandId: choice.customCommandId } : {}), completedAt: null };
      day.draws.push(draw);
      const next = draw.kind === "extension" ? extend(cycle, meta, draw.minutes, now) : cycle;
      writeSaved(saved);
      result = { draw, state: snapshot(next, meta, day, now) };
    });
    return result;
  },

  completeDrawTask(cycleId: number, drawId: string, now = new Date()): ManagementRouletteState {
    let result!: ManagementRouletteState;
    transaction(() => {
      const cycle = findCycle(cycleId);
      assertActive(cycle, now);
      const saved = readSaved();
      const { meta, day } = initialize(saved, cycle, now);
      const draw = meta.days.flatMap((entry) => entry.draws).find((entry) => entry.id === drawId);
      if (!draw || draw.kind !== "task") throw new Error("ルーレットの課題が見つかりません。");
      if (draw.completedAt === null) draw.completedAt = now.toISOString();
      customCommandService.markSeen(cycle.mode, [{ text: draw.instruction, customCommandId: draw.customCommandId }], true);
      writeSaved(saved);
      result = snapshot(cycle, meta, day, now);
    });
    return result;
  },

  finishDay(cycleId: number, now = new Date()): ManagementRouletteState {
    let result!: ManagementRouletteState;
    transaction(() => {
      const cycle = findCycle(cycleId);
      assertActive(cycle, now);
      const saved = readSaved();
      const { meta, day } = initialize(saved, cycle, now);
      if (day.endedAt !== null) { result = snapshot(cycle, meta, day, now); return; }
      if (!snapshot(cycle, meta, day, now).canFinishDay) throw new Error("ルーレットを2回以上回し、すべての課題を完了してください。");
      ensureTodayTask(cycle, meta, day.date);
      const task = todayTask(cycle.id, day.date)!;
      const instruction = day.draws.map((draw, index) => `${index + 1}. ${draw.kind === "extension" ? `管理時間を${draw.minutes}分延長` : draw.instruction}`).join("\n");
      const custom = day.draws.find((draw) => draw.kind === "task" && draw.customCommandId) as ManagementRouletteTaskDraw | undefined;
      replaceManagementInstruction(cycle.id, day.date, { text: instruction, customCommandId: custom?.customCommandId });
      execute("UPDATE management_daily_tasks SET completed_at=? WHERE id=?", [toDateTimeKey(now), task.id]);
      day.endedAt = now.toISOString();
      writeSaved(saved);
      journalRepository.upsertSystemRecord({
        recordDate: day.date, title: "射精管理記録", body: `本日のルーレット\n${instruction}\n\n実施完了`, recordType: "diary",
        tags: custom ? "射精管理,本日の指示,完了,削除不可,自分で追加した命令" : "射精管理,本日の指示,完了,削除不可",
      }, `射精管理タスク${task.id}`);
      pointRepository.award(`management-task:${task.id}`, 10, "射精管理の本日の命令を完了");
      result = snapshot(cycle, meta, day, now);
    });
    return result;
  },

  finishManagement(cycleId: number, now = new Date()) {
    transaction(() => {
      const cycle = findCycle(cycleId);
      assertActive(cycle, now);
      const saved = readSaved();
      const { meta, day } = initialize(saved, cycle, now);
      if (!snapshot(cycle, meta, day, now).canRelease) throw new Error("解除予定日時を過ぎ、本日のルーレットを終了してから完了してください。");
      customCommandService.markSeen(cycle.mode, [{ text: meta.finalInstruction, finalDay: true }], true);
      journalRepository.upsertSystemRecord({ recordDate: day.date, title: "射精管理記録", body: `管理期間を完了\n${meta.finalInstruction}`, recordType: "diary", tags: "射精管理,管理完了,削除不可" }, `射精管理期間${cycle.id}`);
      execute("UPDATE management_cycles SET is_active=0 WHERE id=?", [cycleId]);
    });
  },

  clearRecords() { execute("DELETE FROM app_settings WHERE setting_key=?", [MANAGEMENT_ROULETTE_KEY]); },
};

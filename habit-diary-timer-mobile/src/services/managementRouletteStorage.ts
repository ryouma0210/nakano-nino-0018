export const MANAGEMENT_ROULETTE_KEY = "management_roulette_v1";
export const MANAGEMENT_EXTENSION_MINUTES = [3, 5, 30, 60, 300, 1440] as const;
export const MANAGEMENT_MINIMUM_DAILY_SPINS = 2;

export type ManagementRouletteChoice = { text: string; customCommandId?: string };
export type ManagementRouletteDraw = {
  id: string;
  drawnAt: string;
  candidateIndex: number;
} & (
  | { kind: "extension"; minutes: number }
  | { kind: "task"; instruction: string; customCommandId?: string; completedAt: string | null }
);
export type ManagementRouletteDay = { date: string; draws: ManagementRouletteDraw[]; endedAt: string | null };
export type ManagementRouletteCycle = {
  cycleId: number;
  deadlineAt: string;
  finalInstruction: string;
  taskChoices: ManagementRouletteChoice[];
  days: ManagementRouletteDay[];
};
export type ManagementRouletteSave = { version: 1; cycles: ManagementRouletteCycle[] };

const invalidMessage = "ルーレットの保存データが正しくありません。";
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === "string" && !!value.trim() && value.length <= 4000; }
function timestamp(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)); }
function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function source(value: Record<string, unknown>) {
  return value.customCommandId === undefined || (typeof value.customCommandId === "string" && value.customCommandId.length > 0 && value.customCommandId.length <= 200);
}

export function parseManagementRoulette(raw: string | null): ManagementRouletteSave {
  if (raw === null) return { version: 1, cycles: [] };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(invalidMessage); }
  if (!object(value) || value.version !== 1 || !Array.isArray(value.cycles)) throw new Error(invalidMessage);
  const cycleIds = new Set<number>();
  for (const cycle of value.cycles) {
    if (!object(cycle) || !Number.isSafeInteger(cycle.cycleId) || Number(cycle.cycleId) <= 0 || cycleIds.has(Number(cycle.cycleId))
      || !timestamp(cycle.deadlineAt) || !text(cycle.finalInstruction) || !Array.isArray(cycle.taskChoices)
      || cycle.taskChoices.length !== 5
      || cycle.taskChoices.some((choice) => !object(choice) || !text(choice.text) || !source(choice)) || !Array.isArray(cycle.days)) throw new Error(invalidMessage);
    cycleIds.add(Number(cycle.cycleId));
    const dates = new Set<string>();
    const drawIds = new Set<string>();
    for (const day of cycle.days) {
      if (!object(day) || !date(day.date) || dates.has(day.date) || !Array.isArray(day.draws)
        || (day.endedAt !== null && !timestamp(day.endedAt))) throw new Error(invalidMessage);
      dates.add(day.date);
      for (const draw of day.draws) {
        if (!object(draw) || typeof draw.id !== "string" || !draw.id || draw.id.length > 100 || drawIds.has(draw.id)
          || !timestamp(draw.drawnAt) || !Number.isInteger(draw.candidateIndex) || Number(draw.candidateIndex) < 0 || Number(draw.candidateIndex) > 10) throw new Error(invalidMessage);
        drawIds.add(draw.id);
        if (draw.kind === "extension") {
          if (MANAGEMENT_EXTENSION_MINUTES[Number(draw.candidateIndex)] !== draw.minutes) throw new Error(invalidMessage);
        } else if (draw.kind === "task") {
          const choice = cycle.taskChoices[Number(draw.candidateIndex) - 6];
          if (!text(draw.instruction) || !source(draw) || (draw.completedAt !== null && (!timestamp(draw.completedAt)
            || Date.parse(draw.completedAt) < Date.parse(draw.drawnAt))) || !object(choice) || choice.text !== draw.instruction || choice.customCommandId !== draw.customCommandId) throw new Error(invalidMessage);
        } else throw new Error(invalidMessage);
        if (typeof day.endedAt === "string" && (Date.parse(day.endedAt) < Date.parse(draw.drawnAt)
          || (draw.kind === "task" && (draw.completedAt === null || Date.parse(day.endedAt) < Date.parse(String(draw.completedAt)))))) throw new Error(invalidMessage);
      }
      if (day.endedAt !== null && day.draws.length < MANAGEMENT_MINIMUM_DAILY_SPINS) throw new Error(invalidMessage);
    }
  }
  return value as ManagementRouletteSave;
}

/** Pure validation before a backup can replace the current database. */
export function validateManagementRouletteSettings(rows: readonly Record<string, unknown>[]) {
  let found = false;
  for (const row of rows) {
    if (row.setting_key !== MANAGEMENT_ROULETTE_KEY) continue;
    if (found || typeof row.setting_value !== "string") throw new Error(invalidMessage);
    found = true;
    parseManagementRoulette(row.setting_value);
  }
}

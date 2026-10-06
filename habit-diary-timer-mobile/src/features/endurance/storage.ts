import { isEnduranceResult, type EnduranceResult } from "./game";

export const ENDURANCE_HISTORY_KEY = "endurance_game_v1";
export const ENDURANCE_UNLOCK_KEY = "endurance_unlock_v1";
export const ENDURANCE_HISTORY_LIMIT = 100;
export type EndurancePayload = { version: 1; history: EnduranceResult[] };
const invalid = "勃起我慢の保存データを読み込めませんでした。";

export function isValidEndurancePayload(value: unknown): value is EndurancePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return item.version === 1 && Array.isArray(item.history) && item.history.length <= ENDURANCE_HISTORY_LIMIT
    && item.history.every(isEnduranceResult) && new Set(item.history.map((entry) => entry.id)).size === item.history.length;
}
export function isValidEnduranceUnlock(value: unknown): value is true { return value === true; }

export function parseEnduranceHistory(raw: string | null): EndurancePayload {
  if (raw === null) return { version: 1, history: [] };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(invalid); }
  if (!isValidEndurancePayload(value)) throw new Error(invalid);
  return value;
}
export function parseEnduranceUnlock(raw: string | null): boolean {
  if (raw === null) return false;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(invalid); }
  if (!isValidEnduranceUnlock(value)) throw new Error(invalid);
  return true;
}

export function validateEnduranceSettings(rows: readonly Record<string, unknown>[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.setting_key;
    if (key !== ENDURANCE_HISTORY_KEY && key !== ENDURANCE_UNLOCK_KEY) continue;
    if (seen.has(key) || typeof row.setting_value !== "string") throw new Error(invalid);
    seen.add(key);
    if (key === ENDURANCE_HISTORY_KEY) parseEnduranceHistory(row.setting_value);
    else parseEnduranceUnlock(row.setting_value);
  }
}

export function addEnduranceResult(saved: EndurancePayload, result: EnduranceResult): EndurancePayload {
  if (!isValidEndurancePayload(saved) || !isEnduranceResult(result)) throw new Error(invalid);
  // Keep an existing result on retries, including its original finishedAt and list position.
  if (saved.history.some((entry) => entry.id === result.id)) return saved;
  return { version: 1, history: [result, ...saved.history].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)).slice(0, ENDURANCE_HISTORY_LIMIT) };
}

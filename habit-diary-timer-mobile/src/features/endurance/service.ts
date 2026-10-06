import { execute, queryOne, transaction } from "@/database/client";
import type { EnduranceResult } from "./game";
import { addEnduranceResult, ENDURANCE_HISTORY_KEY, ENDURANCE_UNLOCK_KEY, parseEnduranceHistory, parseEnduranceUnlock } from "./storage";

const read = (key: string) => queryOne<{ setting_value: string }>("SELECT setting_value FROM app_settings WHERE setting_key=?", [key])?.setting_value ?? null;
function write(key: string, value: unknown) {
  execute(`INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at`,
  [key, JSON.stringify(value), new Date().toISOString()]);
}

export function loadEndurance() {
  return { ...parseEnduranceHistory(read(ENDURANCE_HISTORY_KEY)), unlocked: parseEnduranceUnlock(read(ENDURANCE_UNLOCK_KEY)) };
}
export function saveEnduranceResult(result: EnduranceResult) {
  let next = parseEnduranceHistory(null);
  transaction(() => {
    const saved = parseEnduranceHistory(read(ENDURANCE_HISTORY_KEY));
    next = addEnduranceResult(saved, result);
    if (saved !== next) write(ENDURANCE_HISTORY_KEY, next);
  });
  return next;
}
export function unlockEndurance(password: string): boolean {
  if (password !== "NinoLave20260505") return false;
  transaction(() => write(ENDURANCE_UNLOCK_KEY, true));
  return true;
}
/** Record reset retains the permanent unlock; full reset removes both. */
export function clearEndurance(includeUnlock = false): void {
  transaction(() => {
    execute("DELETE FROM app_settings WHERE setting_key=?", [ENDURANCE_HISTORY_KEY]);
    if (includeUnlock) execute("DELETE FROM app_settings WHERE setting_key=?", [ENDURANCE_UNLOCK_KEY]);
  });
}

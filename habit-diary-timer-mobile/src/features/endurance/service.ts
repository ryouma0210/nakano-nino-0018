import { execute, queryOne, transaction } from "@/database/client";
import { dailyGameRewardService } from "@/services/dailyGameRewardService";
import { pointRepository } from "@/repositories/rewardRepository";
import type { EnduranceResult } from "./game";
import { addEnduranceResult, ENDURANCE_CURRENT_KEY, ENDURANCE_HISTORY_KEY, ENDURANCE_UNLOCK_KEY, parseEnduranceCurrent, parseEnduranceHistory, parseEnduranceUnlock, type EnduranceSession } from "./storage";

const read = (key: string) => queryOne<{ setting_value: string }>("SELECT setting_value FROM app_settings WHERE setting_key=?", [key])?.setting_value ?? null;
function write(key: string, value: unknown) {
  execute(`INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at`,
  [key, JSON.stringify(value), new Date().toISOString()]);
}

export function loadEndurance() {
  const saved = parseEnduranceHistory(read(ENDURANCE_HISTORY_KEY));
  const current = parseEnduranceCurrent(read(ENDURANCE_CURRENT_KEY));
  return { ...saved, unlocked: parseEnduranceUnlock(read(ENDURANCE_UNLOCK_KEY)),
    current: current && !saved.history.some((result) => result.id === current.game.id) ? current : null };
}
export function saveEnduranceCurrent(session: EnduranceSession): boolean {
  // Reparse the serialized form so only the validated, portable snapshot is written.
  const snapshot = parseEnduranceCurrent(JSON.stringify(session))!;
  let saved = false;
  transaction(() => {
    const history = parseEnduranceHistory(read(ENDURANCE_HISTORY_KEY));
    // Late blur/unmount callbacks must never resurrect an already finished game.
    if (history.history.some((result) => result.id === snapshot.game.id)) return;
    write(ENDURANCE_CURRENT_KEY, snapshot);
    saved = true;
  });
  return saved;
}
export function clearEnduranceCurrent(gameId?: string): void {
  transaction(() => {
    if (gameId !== undefined && parseEnduranceCurrent(read(ENDURANCE_CURRENT_KEY))?.game.id !== gameId) return;
    execute("DELETE FROM app_settings WHERE setting_key=?", [ENDURANCE_CURRENT_KEY]);
  });
}
export function saveEnduranceResult(result: EnduranceResult) {
  let next = parseEnduranceHistory(null);
  let awarded = false;
  transaction(() => {
    const saved = parseEnduranceHistory(read(ENDURANCE_HISTORY_KEY));
    next = addEnduranceResult(saved, result);
    if (saved !== next) {
      write(ENDURANCE_HISTORY_KEY, next);
      if (result.outcome === "cleared") {
        awarded = dailyGameRewardService.award("endurance", result.id, result.finishedAt, { withinTransaction: true }).awarded;
      }
    }
    if (parseEnduranceCurrent(read(ENDURANCE_CURRENT_KEY))?.game.id === result.id) {
      execute("DELETE FROM app_settings WHERE setting_key=?", [ENDURANCE_CURRENT_KEY]);
    }
  });
  if (awarded) pointRepository.notifyChanged();
  return next;
}
export function unlockEndurance(password: string): boolean {
  if (password !== "NinoLave20260505") return false;
  transaction(() => write(ENDURANCE_UNLOCK_KEY, true));
  return true;
}
/** Record reset clears history and the active session while retaining the permanent unlock. */
export function clearEndurance(includeUnlock = false): void {
  transaction(() => {
    execute("DELETE FROM app_settings WHERE setting_key=?", [ENDURANCE_HISTORY_KEY]);
    execute("DELETE FROM app_settings WHERE setting_key=?", [ENDURANCE_CURRENT_KEY]);
    if (includeUnlock) execute("DELETE FROM app_settings WHERE setting_key=?", [ENDURANCE_UNLOCK_KEY]);
  });
}

import { execute, queryOne } from "@/database/client";
import { toDateKey, toDateTimeKey } from "@/utils/date";

export const levelKey = "outside_game_level";
export const hpKey = "outside_game_hp";
export const mpKey = "outside_game_mp";
export const levelDateKey = "outside_game_level_date";
export const dailyPointDateKey = "outside_game_point_date";
export const dailyPointKey = "outside_game_point_today";
export const succubusAbsorbDateKey = "outside_game_succubus_absorb_date";
export const succubusAbsorbKey = "outside_game_succubus_absorb_today";

export function readSetting(key: string) {
  return queryOne<{ setting_value: string }>("SELECT setting_value FROM app_settings WHERE setting_key=?", [key])?.setting_value;
}
export function saveSetting(key: string, value: string) {
  execute(`INSERT INTO app_settings(setting_key, setting_value, updated_at)
    VALUES(?, ?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at`,
    [key, value, toDateTimeKey()]);
}
export function initializeLevel() {
  const today = toDateKey();
  const savedLevel = Number(readSetting(levelKey) ?? 0);
  const savedDate = readSetting(levelDateKey);
  const level = savedDate === today ? savedLevel : Math.min(100, Math.max(0, savedLevel) + 10);
  if (savedDate !== today) { saveSetting(levelKey, String(level)); saveSetting(levelDateKey, today); }
  return level;
}
function initializeDailyValue(dateKey: string, valueKey: string) {
  const today = toDateKey();
  if (readSetting(dateKey) !== today) { saveSetting(dateKey, today); saveSetting(valueKey, "0"); return 0; }
  const value = Number(readSetting(valueKey) ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}
export const initializeDailyOutsidePoints = () => initializeDailyValue(dailyPointDateKey, dailyPointKey);
export const initializeSuccubusAbsorbBonus = () => initializeDailyValue(succubusAbsorbDateKey, succubusAbsorbKey);
export function initializePlayerStat(key: string, fallback: number) {
  const value = Number(readSetting(key) ?? fallback);
  if (!Number.isFinite(value) || value <= 0) { saveSetting(key, String(fallback)); return fallback; }
  return Math.max(1, Math.min(100, value));
}

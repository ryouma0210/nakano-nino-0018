import { isEnduranceResult, MAX_CUSTOM_MEDIA, RECOVERY_DURATION_MS, SLIDE_DURATION_MS, type EnduranceGame, type EnduranceResult, type EnduranceVideoProgress } from "./game";
import { pauseCountdown, type CountdownState } from "../sugoroku/countdown";

export const ENDURANCE_HISTORY_KEY = "endurance_game_v1";
export const ENDURANCE_UNLOCK_KEY = "endurance_unlock_v1";
export const ENDURANCE_CURRENT_KEY = "endurance_current_v1";
export const ENDURANCE_HISTORY_LIMIT = 100;
export type EndurancePayload = { version: 1; history: EnduranceResult[] };
export type EnduranceSession = {
  version: 1;
  game: EnduranceGame;
  mediaIds: string[];
  slideTimer: CountdownState;
  extraTimer: CountdownState;
  videoProgress: EnduranceVideoProgress;
  videoComplete: boolean;
};
const invalid = "勃起我慢の保存データを読み込めませんでした。";

function exactFields(value: unknown, keys: string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
}

function isSavedCountdown(value: unknown, durationMs: number, allowRunning = false): value is CountdownState {
  if (!exactFields(value, ["status", "durationMs", "remainingMs", "deadline"]) || value.durationMs !== durationMs
    || !Number.isSafeInteger(value.remainingMs) || Number(value.remainingMs) < 0 || Number(value.remainingMs) > durationMs) return false;
  if (value.status === "running") return allowRunning && Number.isSafeInteger(value.deadline) && Number(value.remainingMs) > 0;
  if (value.deadline !== null) return false;
  return value.status === "idle" ? value.remainingMs === durationMs
    : value.status === "complete" ? value.remainingMs === 0
      : value.status === "paused" && Number(value.remainingMs) > 0;
}

export function isValidEnduranceSession(value: unknown): value is EnduranceSession {
  if (!exactFields(value, ["version", "game", "mediaIds", "slideTimer", "extraTimer", "videoProgress", "videoComplete"])
    || value.version !== 1 || typeof value.videoComplete !== "boolean") return false;
  const game = value.game;
  if (!exactFields(game, ["id", "preset", "startedAt", "total", "index", "failedIndex", "failures", "recovering"])
    || typeof game.recovering !== "boolean"
    || !isEnduranceResult({ ...game, finishedAt: game.startedAt, outcome: "retired" })) return false;
  // Each slide can fail once. A failure on the current slide still needs recovery.
  if ((game.recovering && Number(game.failures) === 0)
    || (!game.recovering && game.failedIndex === game.index)
    || (game.failedIndex !== null && Number(game.failures) > Number(game.index) - Number(game.failedIndex) + Number(game.recovering))) return false;
  if (game.preset === "game-6" && (game.recovering || Number(game.failures) !== 0)) return false;
  if (!Array.isArray(value.mediaIds) || value.mediaIds.length !== game.total || value.mediaIds.length > MAX_CUSTOM_MEDIA
    || new Set(value.mediaIds).size !== value.mediaIds.length
    || !value.mediaIds.every((id) => typeof id === "string" && (game.preset === "custom"
      ? /^(?:training|punishment|endurance):[^/\\\u0000-\u001f]{1,1024}$/u.test(id)
      : Array.from({ length: Number(game.total) }, (_, index) => `${game.preset}-${index + 1}`).includes(id)))) return false;
  if (!isSavedCountdown(value.slideTimer, SLIDE_DURATION_MS) || !isSavedCountdown(value.extraTimer, RECOVERY_DURATION_MS)) return false;
  const progress = value.videoProgress;
  if (!exactFields(progress, ["positionMs", "durationMs"]) || !Number.isSafeInteger(progress.positionMs) || Number(progress.positionMs) < 0
    || (progress.durationMs !== null && (!Number.isSafeInteger(progress.durationMs) || Number(progress.durationMs) <= 0
      || Number(progress.positionMs) > Number(progress.durationMs)))) return false;
  if (game.preset !== "game-6" && (value.videoComplete || progress.positionMs !== 0 || progress.durationMs !== null)) return false;
  return true;
}

/** Freeze active timers at the checkpoint; reopening never advances them while away. */
export function createEnduranceSession(input: Omit<EnduranceSession, "version">, now = Date.now()): EnduranceSession {
  if (!Number.isSafeInteger(now) || !isSavedCountdown(input.slideTimer, SLIDE_DURATION_MS, true)
    || !isSavedCountdown(input.extraTimer, RECOVERY_DURATION_MS, true)) throw new Error(invalid);
  const session: EnduranceSession = {
    version: 1,
    game: { ...input.game },
    mediaIds: [...input.mediaIds],
    slideTimer: { ...pauseCountdown(input.slideTimer, now) },
    extraTimer: { ...pauseCountdown(input.extraTimer, now) },
    videoProgress: { ...input.videoProgress },
    videoComplete: input.videoComplete,
  };
  if (!isValidEnduranceSession(session)) throw new Error(invalid);
  return session;
}

export function parseEnduranceCurrent(raw: string | null): EnduranceSession | null {
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(invalid); }
  if (!isValidEnduranceSession(value)) throw new Error(invalid);
  return value;
}

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
    if (key !== ENDURANCE_HISTORY_KEY && key !== ENDURANCE_UNLOCK_KEY && key !== ENDURANCE_CURRENT_KEY) continue;
    if (seen.has(key) || typeof row.setting_value !== "string") throw new Error(invalid);
    seen.add(key);
    if (key === ENDURANCE_HISTORY_KEY) parseEnduranceHistory(row.setting_value);
    else if (key === ENDURANCE_CURRENT_KEY) parseEnduranceCurrent(row.setting_value);
    else parseEnduranceUnlock(row.setting_value);
  }
}

export function addEnduranceResult(saved: EndurancePayload, result: EnduranceResult): EndurancePayload {
  if (!isValidEndurancePayload(saved) || !isEnduranceResult(result)) throw new Error(invalid);
  // Keep an existing result on retries, including its original finishedAt and list position.
  if (saved.history.some((entry) => entry.id === result.id)) return saved;
  return { version: 1, history: [result, ...saved.history].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)).slice(0, ENDURANCE_HISTORY_LIMIT) };
}

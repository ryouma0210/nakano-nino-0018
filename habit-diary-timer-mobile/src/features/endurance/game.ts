export const ENDURANCE_PRESETS = ["game-1", "game-2", "game-3", "game-4", "game-5", "game-6", "custom"] as const;
export type EndurancePreset = typeof ENDURANCE_PRESETS[number];
export const ENDURANCE_LABELS: Record<EndurancePreset, string> = {
  "game-1": "勃起我慢①", "game-2": "勃起我慢②", "game-3": "勃起我慢③",
  "game-4": "勃起我慢④", "game-5": "勃起我慢⑤", "game-6": "勃起我慢⑥", custom: "勃起我慢（格納ファイル）",
};
export const SLIDE_DURATION_MS = 60_000;
export const RECOVERY_DURATION_MS = 180_000;
export const MAX_CUSTOM_MEDIA = 100;

export type EnduranceGame = {
  id: string;
  preset: EndurancePreset;
  startedAt: string;
  total: number;
  index: number;
  failedIndex: number | null;
  failures: number;
  recovering: boolean;
};
export type EnduranceVideoProgress = { positionMs: number; durationMs: number | null };
export type EnduranceResult = Omit<EnduranceGame, "recovering"> & {
  finishedAt: string;
  outcome: "cleared" | "failed" | "retired";
  videoProgress?: EnduranceVideoProgress;
};

let sequence = 0;
export function createEnduranceGame(preset: EndurancePreset, total: number, now = new Date().toISOString()): EnduranceGame {
  if (!ENDURANCE_PRESETS.includes(preset) || !Number.isInteger(total) || total < 1 || total > MAX_CUSTOM_MEDIA
    || (preset !== "custom" && total !== (preset === "game-6" ? 1 : 4))) throw new Error("素材の設定を確認してください。");
  return { id: `endurance-${Date.now().toString(36)}-${(++sequence).toString(36)}`,
    preset, startedAt: now, total, index: 0, failedIndex: null, failures: 0, recovering: false };
}

export function failEnduranceSlide(game: EnduranceGame): EnduranceGame {
  if (game.recovering) return game;
  return { ...game, failedIndex: game.failedIndex ?? game.index, failures: game.failures + 1, recovering: true };
}

export function canAdvanceEndurance(game: EnduranceGame, slideComplete: boolean, recoveryComplete: boolean): boolean {
  return game.recovering ? recoveryComplete : slideComplete;
}

/** A completed timer opens navigation; it never advances the slide automatically. */
export function advanceEndurance(game: EnduranceGame, slideComplete: boolean, recoveryComplete: boolean): EnduranceGame {
  if (!canAdvanceEndurance(game, slideComplete, recoveryComplete) || game.index >= game.total - 1) return game;
  return { ...game, index: game.index + 1, recovering: false };
}

export function finishEndurance(game: EnduranceGame, retired = false, now = new Date().toISOString(), videoProgress?: EnduranceVideoProgress): EnduranceResult {
  const { recovering: _recovering, ...snapshot } = game;
  return { ...snapshot, finishedAt: now, outcome: retired ? "retired" : game.failures > 0 ? "failed" : "cleared",
    ...(game.preset === "game-6" && videoProgress !== undefined ? { videoProgress: { ...videoProgress } } : {}) };
}

export function remainingEnduranceSlides(result: EnduranceResult): number {
  return result.outcome === "cleared" ? 0 : result.total - (result.outcome === "retired" ? result.index : result.failedIndex ?? result.index);
}

export function isEnduranceResult(value: unknown): value is EnduranceResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const integer = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
  if (typeof item.id !== "string" || !/^endurance-[a-z0-9-]{1,100}$/.test(item.id)
    || !ENDURANCE_PRESETS.includes(item.preset as EndurancePreset)
    || typeof item.startedAt !== "string" || !Number.isFinite(Date.parse(item.startedAt))
    || typeof item.finishedAt !== "string" || !Number.isFinite(Date.parse(item.finishedAt)) || Date.parse(item.finishedAt) < Date.parse(item.startedAt)
    || !integer(item.total, 1, MAX_CUSTOM_MEDIA) || !integer(item.index, 0, Number(item.total) - 1)
    || !integer(item.failures, 0, Number(item.index) + 1)
    || (item.failedIndex !== null && !integer(item.failedIndex, 0, Number(item.index)))) return false;
  if (item.preset !== "custom" && item.total !== (item.preset === "game-6" ? 1 : 4)) return false;
  if ((item.failures === 0) !== (item.failedIndex === null)) return false;
  if (item.videoProgress !== undefined) {
    if (item.preset !== "game-6" || !item.videoProgress || typeof item.videoProgress !== "object" || Array.isArray(item.videoProgress)) return false;
    const progress = item.videoProgress as Record<string, unknown>;
    if (!Number.isSafeInteger(progress.positionMs) || Number(progress.positionMs) < 0
      || (progress.durationMs !== null && (!Number.isSafeInteger(progress.durationMs) || Number(progress.durationMs) <= 0
        || Number(progress.positionMs) > Number(progress.durationMs)))) return false;
  }
  if (item.outcome === "cleared") return item.failures === 0 && item.index === Number(item.total) - 1;
  if (item.outcome === "failed") return Number(item.failures) > 0 && item.index === Number(item.total) - 1;
  return item.outcome === "retired";
}

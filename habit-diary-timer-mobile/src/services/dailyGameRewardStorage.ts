export const DAILY_GAME_POINTS = { sugoroku: 50, endurance: 50, othello: 50, succubus: 100 } as const;
export type DailyRewardGame = keyof typeof DAILY_GAME_POINTS;

export const GAME_REWARD_RECEIPT_PREFIX = "daily-game-reward-result:";
export const GAME_REWARD_OWNER_PREFIX = "daily-game-reward-owner:";
const DATA_ERROR = "ゲームの日次ポイント記録が正しくありません。";

export type DailyGameRewardReceipt = {
  version: 1;
  game: DailyRewardGame;
  resultId: string;
  completedAt: string;
  date: string;
  awarded: boolean;
};

export function isDailyRewardGame(game: unknown): game is DailyRewardGame {
  return typeof game === "string" && Object.hasOwn(DAILY_GAME_POINTS, game);
}

export function isGameRewardDate(date: unknown): date is string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function gameRewardReceiptKey(game: DailyRewardGame, resultId: string): string {
  return `${GAME_REWARD_RECEIPT_PREFIX}${game}:${encodeURIComponent(resultId)}`;
}

export function gameRewardOwnerKey(game: DailyRewardGame, date: string): string {
  return `${GAME_REWARD_OWNER_PREFIX}${game}:${date}`;
}

export function gameRewardSourceKey(game: DailyRewardGame, date: string): string {
  return `game-clear:${game}:${date}`;
}

/** Date is deliberately persisted, rather than recomputed in a changed device timezone. */
export function parseGameRewardReceipt(raw: string, expectedKey: string): DailyGameRewardReceipt {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(DATA_ERROR); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(DATA_ERROR);
  const receipt = value as DailyGameRewardReceipt;
  if (receipt.version !== 1 || !isDailyRewardGame(receipt.game)
    || typeof receipt.resultId !== "string" || !receipt.resultId.trim() || receipt.resultId.length > 200
    || typeof receipt.completedAt !== "string" || !Number.isFinite(Date.parse(receipt.completedAt))
    || !isGameRewardDate(receipt.date) || typeof receipt.awarded !== "boolean") throw new Error(DATA_ERROR);
  const resultKey = gameRewardReceiptKey(receipt.game, receipt.resultId);
  const ownerKey = gameRewardOwnerKey(receipt.game, receipt.date);
  if (expectedKey !== resultKey && (expectedKey !== ownerKey || !receipt.awarded)) throw new Error(DATA_ERROR);
  return receipt;
}

/** Backup validation is pure and never replays stored results into the point ledger. */
export function validateDailyGameRewardSettings(rows: Record<string, unknown>[]): void {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = row.setting_key;
    if (typeof key !== "string" || (!key.startsWith(GAME_REWARD_RECEIPT_PREFIX) && !key.startsWith(GAME_REWARD_OWNER_PREFIX))) continue;
    if (keys.has(key) || typeof row.setting_value !== "string") throw new Error(DATA_ERROR);
    parseGameRewardReceipt(row.setting_value, key);
    keys.add(key);
  }
}

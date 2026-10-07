import { execute, queryOne, transaction } from "@/database/client";
import { pointRepository } from "@/repositories/rewardRepository";
import { toDateKey, toDateTimeKey } from "@/utils/date";
import {
  DAILY_GAME_POINTS, gameRewardOwnerKey, gameRewardReceiptKey, gameRewardSourceKey,
  isDailyRewardGame, isGameRewardDate, parseGameRewardReceipt,
  type DailyGameRewardReceipt, type DailyRewardGame,
} from "./dailyGameRewardStorage";

export { DAILY_GAME_POINTS, type DailyRewardGame } from "./dailyGameRewardStorage";

export type DailyGameReward = { awarded: boolean; points: number; date: string };
const GAME_NAMES: Record<DailyRewardGame, string> = {
  sugoroku: "すごろく", endurance: "勃起我慢", othello: "オセロ", succubus: "サキュバス討伐",
};

function readSetting(key: string): string | null {
  return queryOne<{ setting_value: string }>("SELECT setting_value FROM app_settings WHERE setting_key=?", [key])?.setting_value ?? null;
}

function readReceipt(key: string): DailyGameRewardReceipt | null {
  const raw = readSetting(key);
  return raw === null ? null : parseGameRewardReceipt(raw, key);
}

function writeReceipt(key: string, receipt: DailyGameRewardReceipt): void {
  execute(`INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=excluded.updated_at`,
  [key, JSON.stringify(receipt), toDateTimeKey()]);
}

function ledgerPoints(game: DailyRewardGame, date: string): number {
  const row = queryOne<{ points: number }>("SELECT points FROM point_transactions WHERE source_key=?", [gameRewardSourceKey(game, date)]);
  return row?.points === DAILY_GAME_POINTS[game] ? row.points : 0;
}

function receiptPoints(receipt: DailyGameRewardReceipt): number {
  if (!receipt.awarded) return 0;
  const owner = readReceipt(gameRewardOwnerKey(receipt.game, receipt.date));
  // A points reset may allow a new result to claim the same day. Only its owner gets a badge.
  if (!owner || owner.resultId !== receipt.resultId || owner.completedAt !== receipt.completedAt) return 0;
  return ledgerPoints(receipt.game, receipt.date);
}

export const dailyGameRewardService = {
  /** Only call for a validated, newly eligible win. Loading legacy history must never call this. */
  award(game: DailyRewardGame, resultId: string, completedAt: string, options: { withinTransaction?: boolean } = {}): DailyGameReward {
    const completed = new Date(completedAt);
    if (!isDailyRewardGame(game) || typeof resultId !== "string" || !resultId.trim() || resultId.length > 200
      || typeof completedAt !== "string" || !Number.isFinite(completed.getTime())) {
      throw new Error("ゲームの完了記録が正しくありません。");
    }
    const key = gameRewardReceiptKey(game, resultId);
    const saved = readReceipt(key);
    // History reconciliation may revisit many completed games. Existing receipts are pure reads.
    if (saved) return { awarded: false, points: receiptPoints(saved), date: saved.date };
    let reward: DailyGameReward = { awarded: false, points: 0, date: toDateKey(completed) };
    const claim = () => {
      // Recheck after entering the transaction before attempting a new claim.
      const previous = readReceipt(key);
      if (previous) {
        reward = { awarded: false, points: receiptPoints(previous), date: previous.date };
        return;
      }
      const date = toDateKey(completed);
      const resetAt = readSetting("points_reset_at");
      const resetTimestamp = resetAt ? Date.parse(resetAt.replace(" ", "T")) : NaN;
      const afterReset = !Number.isFinite(resetTimestamp) || completed.getTime() > resetTimestamp;
      // A unique source key enforces one award per game/day across every difficulty and result.
      const awarded = afterReset && pointRepository.award(
        gameRewardSourceKey(game, date), DAILY_GAME_POINTS[game], `${GAME_NAMES[game]}の本日初回クリア`, toDateTimeKey(completed), { notify: false },
      );
      const receipt: DailyGameRewardReceipt = { version: 1, game, resultId, completedAt, date, awarded };
      writeReceipt(key, receipt);
      if (awarded) writeReceipt(gameRewardOwnerKey(game, date), receipt);
      reward = { awarded, points: awarded ? DAILY_GAME_POINTS[game] : 0, date };
    };
    // With an outer transaction, its caller must notifyChanged() only after that transaction commits.
    if (options.withinTransaction) claim();
    else {
      transaction(claim);
      if (reward.awarded) pointRepository.notifyChanged();
    }
    return reward;
  },

  /** Read-only; badges describe an actual ledger award to this exact result, never an inferred first win. */
  pointsForResult(game: DailyRewardGame, resultId: string): number {
    const receipt = readReceipt(gameRewardReceiptKey(game, resultId));
    return receipt ? receiptPoints(receipt) : 0;
  },

  /** Read-only daily-task status. Does not reconcile history, grant points, or reset counters. */
  completedGames(date: string): DailyRewardGame[] {
    if (!isGameRewardDate(date)) throw new Error("日付が正しくありません。");
    return (Object.keys(DAILY_GAME_POINTS) as DailyRewardGame[]).filter((game) => ledgerPoints(game, date) > 0);
  },
};

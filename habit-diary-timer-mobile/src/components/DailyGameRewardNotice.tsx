import { AppText } from "./AppText";
import { dailyGameRewardService, type DailyRewardGame } from "@/services/dailyGameRewardService";

/** Show a badge only on the result that actually received that day's points. */
export function DailyGameRewardNotice({ game, resultId }: { game: DailyRewardGame; resultId: string }) {
  const points = dailyGameRewardService.pointsForResult(game, resultId);
  if (points === 0) return null;
  return <AppText testID="daily-game-reward" style={{ color: "#9cde71", fontWeight: "700" }}>
    {points === 100 ? "本日初回クリア報酬：＋100Pt" : "本日初回クリア報酬：＋50Pt"}
  </AppText>;
}

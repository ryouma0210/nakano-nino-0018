import { queryOne } from "@/database/client";
import { ENDURANCE_CURRENT_KEY, ENDURANCE_HISTORY_KEY, parseEnduranceCurrent, parseEnduranceHistory } from "../features/endurance/storage";
import { summarizeEndurance, summarizeOthello, summarizeSugoroku, type GameProgressSummary, type ResumableGame } from "../features/games/progress";
import { loadOthello } from "../features/othello/storage";
import { loadSugoroku } from "../features/sugoroku/storage";

export type GameProgressResult =
  | { status: "ready"; summary: GameProgressSummary | null }
  | { status: "error" };

function readEnduranceSetting(key: string): string | null {
  return queryOne<{ setting_value: string }>("SELECT setting_value FROM app_settings WHERE setting_key = ?", [key])?.setting_value ?? null;
}

/** Read progress only: opening the game room never saves games or reconciles rewards. */
export async function loadGameProgress(game: ResumableGame): Promise<GameProgressResult> {
  try {
    const summary = game === "sugoroku" ? summarizeSugoroku(await loadSugoroku())
      : game === "othello" ? summarizeOthello(await loadOthello())
        : summarizeEndurance(
          parseEnduranceCurrent(readEnduranceSetting(ENDURANCE_CURRENT_KEY)),
          parseEnduranceHistory(readEnduranceSetting(ENDURANCE_HISTORY_KEY)).history,
        );
    return { status: "ready", summary };
  } catch {
    // One game's bad save must not hide another game's entry or progress.
    return { status: "error" };
  }
}

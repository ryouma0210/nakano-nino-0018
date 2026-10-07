import { ENDURANCE_LABELS, type EnduranceResult } from "../endurance/game";
import type { EnduranceSession } from "../endurance/storage";
import type { OthelloSave } from "../othello/storage";
import { getCurrentTile, getRemainingSpaces } from "../sugoroku/game";
import type { SugorokuSave } from "../sugoroku/storage";

export const RESUMABLE_GAMES = ["sugoroku", "othello", "endurance"] as const;
export type ResumableGame = typeof RESUMABLE_GAMES[number];
export type GameProgressSummary = {
  id: string;
  details: string[];
  progress?: { label: string; current: number; total: number };
};

export function matchesGameResumeRequest(requestedId: string | string[] | undefined, currentId: string | undefined): boolean {
  return typeof requestedId === "string" && requestedId.length > 0 && requestedId === currentId;
}

export function summarizeSugoroku(saved: SugorokuSave): GameProgressSummary | null {
  const game = saved.current;
  if (!game || game.phase === "finished" || saved.history.some((entry) => entry.id === game.id)) return null;
  // Reaching a goal or penalty still leaves its final event to complete.
  return {
    id: game.id,
    details: [game.extended ? "延長コース" : "通常コース", getCurrentTile(game).label, `残りマス：${getRemainingSpaces(game)}`],
  };
}

export function summarizeOthello(saved: OthelloSave): GameProgressSummary | null {
  const current = saved.current;
  if (!current || current.game.status !== "playing" || saved.history.some((entry) => entry.id === current.id)) return null;
  return {
    id: current.id,
    details: [{ easy: "イージー", normal: "ノーマル", hard: "ハード" }[current.difficulty]],
    progress: { label: "盤上の石", current: current.game.board.filter((cell) => cell !== 0).length, total: 64 },
  };
}

export function summarizeEndurance(current: EnduranceSession | null, history: readonly EnduranceResult[]): GameProgressSummary | null {
  if (!current || history.some((entry) => entry.id === current.game.id)) return null;
  return {
    id: current.game.id,
    details: [ENDURANCE_LABELS[current.game.preset]],
    progress: { label: "進行状況", current: current.game.index + 1, total: current.game.total },
  };
}

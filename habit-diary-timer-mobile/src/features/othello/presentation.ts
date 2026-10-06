import { getLegalMoves, getScore, type Difficulty, type GameState } from "./game";

export const HARD_PRESSURE_DIALOGUE_MS = 2000;
export type HardPressureCue = "single" | "pass";

/** After 30 placements (34 discs), count actual moves rather than assistance restrictions. */
export function getHardPressureCue(game: GameState | null, difficulty: Difficulty): HardPressureCue | null {
  if (difficulty !== "hard" || game?.status !== "playing" || getScore(game.board).empty > 30) return null;
  if (game.turn === -1 && game.passedPlayer === 1) return "pass";
  return game.turn === 1 && getLegalMoves(game.board, 1).length === 1 ? "single" : null;
}

export function getOthelloAudioScene(game: GameState | null, difficulty: Difficulty, active: boolean, temptingMove: number | null): "othello-temptation" | null {
  if (!active || game?.status !== "playing") return null;
  return difficulty === "hard" || temptingMove !== null ? "othello-temptation" : null;
}

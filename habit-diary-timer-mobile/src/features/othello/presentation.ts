import { getFlips, getLegalMoves, getScore, type Difficulty, type GameState } from "./game";

export const HARD_PRESSURE_DIALOGUE_MS = 2000;
export const CPU_ADVANTAGE_DIALOGUE_MS = 1400;
export const DISC_FLIP_DURATION_MS = 520;
export type HardPressureCue = "single" | "pass";
export type CpuAdvantageCue = "corner" | "capture";

/** Describe the actual chosen move, without announcing an illegal or human move. */
export function getCpuAdvantageCue(game: GameState | null, move: number): CpuAdvantageCue | null {
  if (game?.status !== "playing" || game.turn !== -1) return null;
  const flips = getFlips(game.board, -1, move);
  if (flips.length === 0) return null;
  if ([0, 7, 56, 63].includes(move)) return "corner";
  return flips.length >= 5 ? "capture" : null;
}

/** Only animate a real placement; resuming, surrendering and sorting are not moves. */
export function getMoveFlips(previous: GameState | null, next: GameState | null): number[] {
  if (previous?.status !== "playing" || previous.turn === null || !next || next.lastMove === null) return [];
  const flips = getFlips(previous.board, previous.turn, next.lastMove);
  if (flips.length === 0 || next.board.length !== previous.board.length) return [];
  const changed = new Set([next.lastMove, ...flips]);
  return next.board.every((cell, index) => cell === (changed.has(index) ? previous.turn : previous.board[index])) ? flips : [];
}

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

import type { OthelloTemptationImage } from "./temptationImages";
import { shouldShowTemptation, type Board, type Difficulty, type GameState } from "./game";

export type TemptationPresentation = {
  board: Board;
  index: number | null;
  image: OthelloTemptationImage | null;
  acknowledged: boolean;
};

/** Capture a turn's media once, including while returning from another screen. */
export function prepareTemptation(
  previous: TemptationPresentation | null,
  board: Board,
  index: number | null,
  images: readonly OthelloTemptationImage[],
  random: () => number = Math.random,
): TemptationPresentation {
  if (previous?.board === board) return previous;
  const image = index !== null && images.length > 0
    ? images[Math.min(images.length - 1, Math.max(0, Math.floor(random() * images.length)))]
    : null;
  return { board, index, image, acknowledged: index === null };
}

/** Also block the short search delay before the introduction has been created. */
export function isTemptationPending(
  game: GameState | null,
  difficulty: Difficulty,
  hasAssistance: boolean,
  presentation: TemptationPresentation | null,
): boolean {
  if (game?.status !== "playing" || game.turn !== 1 || hasAssistance || !shouldShowTemptation(game.board, difficulty)) return false;
  return presentation?.board !== game.board || !presentation.acknowledged;
}

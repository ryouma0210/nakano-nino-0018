import { describe, expect, it, vi } from "vitest";
import type { OthelloTemptationImage } from "./temptationImages";
import { createGame, playMove } from "./game";
import { isTemptationPending, prepareTemptation } from "./temptation";

const images: OthelloTemptationImage[] = [
  { id: "one", source: 1 },
  { id: "two", source: 2 },
];

describe("othello temptation introduction", () => {
  it("blocks a human turn during selection and the introduction, then releases the acknowledged turn", () => {
    const game = createGame();
    expect(isTemptationPending(game, "hard", false, null)).toBe(true);
    const presentation = prepareTemptation(null, game.board, 19, images, () => 0);
    expect(isTemptationPending(game, "hard", false, presentation)).toBe(true);
    expect(isTemptationPending(game, "hard", false, { ...presentation, acknowledged: true })).toBe(false);
    expect(isTemptationPending(createGame(), "hard", false, { ...presentation, acknowledged: true })).toBe(true);
  });

  it("never interrupts CPU turns, assistance, completed games or turns without temptation", () => {
    const game = createGame();
    expect(isTemptationPending(game, "hard", true, null)).toBe(false);
    expect(isTemptationPending(playMove(game, 19), "hard", false, null)).toBe(false);
    expect(isTemptationPending({ ...game, status: "finished", turn: null, winner: 1 }, "hard", false, null)).toBe(false);
    expect(isTemptationPending(game, "easy", false, null)).toBe(false);
    expect(isTemptationPending(game, "normal", false, null)).toBe(false);
    expect(isTemptationPending(null, "hard", false, null)).toBe(false);
  });

  it("keeps the same selected image and acknowledgement when the same turn is revisited", () => {
    const game = createGame();
    const random = vi.fn(() => 0.99);
    const first = prepareTemptation(null, game.board, 19, images, random);
    expect(first.image).toBe(images[1]);
    expect(prepareTemptation(first, game.board, 26, [], random)).toBe(first);
    const acknowledged = { ...first, acknowledged: true };
    expect(prepareTemptation(acknowledged, game.board, 26, images, random)).toBe(acknowledged);
    expect(random).toHaveBeenCalledTimes(1);
    const next = prepareTemptation(acknowledged, createGame().board, 26, images, () => 0);
    expect(next.image).toBe(images[0]);
    expect(next.acknowledged).toBe(false);
  });

  it("allows a text-only introduction when no images are bundled", () => {
    const game = createGame();
    const random = vi.fn();
    const presentation = prepareTemptation(null, game.board, 19, [], random);
    expect(presentation).toMatchObject({ image: null, acknowledged: false });
    expect(isTemptationPending(game, "hard", false, { ...presentation, acknowledged: true })).toBe(false);
    expect(random).not.toHaveBeenCalled();
  });

  it("does not trap a turn when the search has no suggested move", () => {
    const game = createGame();
    const presentation = prepareTemptation(null, game.board, null, images);
    expect(presentation).toMatchObject({ image: null, index: null, acknowledged: true });
    expect(isTemptationPending(game, "hard", false, presentation)).toBe(false);
  });
});

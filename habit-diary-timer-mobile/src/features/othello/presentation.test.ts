import { describe, expect, it } from "vitest";
import { getRoomAudioTracks } from "../../audio/roomAudio";
import { createGame, getLegalMoves, getScore, playMove, type Cell, type GameState } from "./game";
import { getHardPressureCue, getOthelloAudioScene } from "./presentation";

function singleMove(): GameState {
  const board: Cell[] = Array<Cell>(64).fill(1);
  board[0] = 0;
  board[1] = -1;
  return { ...createGame(), board };
}

function humanPass(): GameState {
  const board: Cell[] = Array<Cell>(64).fill(-1);
  board[0] = board[3] = 0;
  board[1] = board[4] = 1;
  return playMove({ ...createGame(), board, turn: -1 }, 0);
}

function singleMoveAt(occupied: number): GameState {
  const board: Cell[] = Array<Cell>(64).fill(0);
  for (let index = 1; index <= occupied; index += 1) board[index] = 1;
  board[1] = -1;
  return { ...createGame(), board };
}

function humanPassAt(occupied: number): GameState {
  const board: Cell[] = Array<Cell>(64).fill(0);
  board[1] = board[4] = 1;
  // Fill the rays from the surviving human disc, leaving only CPU move 3.
  for (const index of [2, 5, 6, 7, 11, 12, 13, 18, 20, 22, 25, 28, 31, 32, 36, 44, 52, 60]) {
    board[index] = -1;
  }
  for (let index = 1; getScore(board).empty > 65 - occupied; index += 1) {
    if (index !== 3 && board[index] === 0) board[index] = -1;
  }
  return playMove({ ...createGame(), board, turn: -1 }, 0);
}

describe("hard mode dialogue cues", () => {
  it("announces the user's sole legal move and a real forced pass", () => {
    expect(getHardPressureCue(singleMove(), "hard")).toBe("single");
    expect(getHardPressureCue(humanPass(), "hard")).toBe("pass");
  });

  it.each([21, 33])("has no pressure cue at %i discs even for a sole move or actual pass", (occupied) => {
    const single = singleMoveAt(occupied);
    const pass = humanPassAt(occupied);
    expect(getScore(single.board).empty).toBe(64 - occupied);
    expect(getLegalMoves(single.board, 1)).toEqual([0]);
    expect(getScore(pass.board).empty).toBe(64 - occupied);
    expect(pass).toMatchObject({ status: "playing", turn: -1, passedPlayer: 1, lastMove: 0 });
    expect(getLegalMoves(pass.board, 1)).toEqual([]);
    expect(getLegalMoves(pass.board, -1)).toEqual([3]);
    expect(getHardPressureCue(single, "hard")).toBeNull();
    expect(getHardPressureCue(pass, "hard")).toBeNull();
  });

  it.each([34, 40])("announces actual sole moves and passes from %i discs onward", (occupied) => {
    const single = singleMoveAt(occupied);
    const pass = humanPassAt(occupied);
    expect(getScore(single.board).empty).toBe(64 - occupied);
    expect(getLegalMoves(single.board, 1)).toEqual([0]);
    expect(getScore(pass.board).empty).toBe(64 - occupied);
    expect(pass).toMatchObject({ status: "playing", turn: -1, passedPlayer: 1, lastMove: 0 });
    expect(getLegalMoves(pass.board, 1)).toEqual([]);
    expect(getLegalMoves(pass.board, -1)).toEqual([3]);
    expect(getHardPressureCue(single, "hard")).toBe("single");
    expect(getHardPressureCue(pass, "hard")).toBe("pass");
  });

  it.each(["easy", "normal"] as const)("does not interrupt %s matches", (difficulty) => {
    expect(getHardPressureCue(singleMove(), difficulty)).toBeNull();
    expect(getHardPressureCue(humanPass(), difficulty)).toBeNull();
  });

  it("uses actual legal moves, not a suggested or assistance-restricted cell", () => {
    const board = [...singleMoveAt(34).board];
    board[3] = 0;
    board[4] = -1;
    board[35] = 1;
    expect(getScore(board).empty).toBe(30);
    expect(getLegalMoves(board, 1)).toEqual([0, 3]);
    expect(getHardPressureCue({ ...createGame(), board }, "hard")).toBeNull();
    expect(getHardPressureCue(createGame(), "hard")).toBeNull();
    expect(getHardPressureCue({ ...humanPass(), passedPlayer: null }, "hard")).toBeNull();
  });

  it("has no cue before a match or after the last disc is placed", () => {
    expect(getHardPressureCue(null, "hard")).toBeNull();
    expect(getHardPressureCue(playMove(singleMove(), 0), "hard")).toBeNull();
    expect(getHardPressureCue(playMove(humanPass(), 3), "hard")).toBeNull();
  });
});

describe("othello audio scenes", () => {
  it("keeps both hard-mode loops during either turn without a temptation square", () => {
    for (const game of [createGame(), playMove(createGame(), 19), singleMoveAt(33), humanPassAt(33), humanPass()]) {
      expect(getOthelloAudioScene(game, "hard", true, null)).toBe("othello-temptation");
    }
  });

  it("normal mode only requests the loops while a temptation square is visible", () => {
    expect(getOthelloAudioScene(createGame(), "normal", true, null)).toBeNull();
    expect(getOthelloAudioScene(createGame(), "normal", true, 19)).toBe("othello-temptation");
    expect(getOthelloAudioScene(createGame(), "easy", true, null)).toBeNull();
  });

  it("stops before start, after completion, and while inactive even with a stale suggested square", () => {
    expect(getOthelloAudioScene(null, "hard", true, 19)).toBeNull();
    expect(getOthelloAudioScene(playMove(singleMove(), 0), "hard", true, 0)).toBeNull();
    expect(getOthelloAudioScene(createGame(), "hard", false, 19)).toBeNull();
  });

  it("respects independent voice/music settings and volumes for the persistent hard scene", () => {
    const scene = getOthelloAudioScene(humanPass(), "hard", true, null);
    const settings = { soundEnabled: true, backgroundMusicEnabled: true, soundVolume: 0.6, musicVolume: 0.3 };
    expect(getRoomAudioTracks(scene, settings, true)).toEqual([
      { name: "earLick", volume: 0.6 }, { name: "penaltyBgm", volume: 0.3 },
    ]);
    expect(getRoomAudioTracks(scene, { ...settings, soundEnabled: false }, true)).toEqual([{ name: "penaltyBgm", volume: 0.3 }]);
    expect(getRoomAudioTracks(scene, { ...settings, backgroundMusicEnabled: false }, true)).toEqual([{ name: "earLick", volume: 0.6 }]);
    expect(getRoomAudioTracks(scene, settings, false)).toEqual([]);
  });
});

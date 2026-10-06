import { describe, expect, it } from "vitest";
import {
  applyMove, arrangeFinishedBoard, chooseAssistedMove, chooseCpuMove, createGame, createInitialBoard, getFlips,
  getLegalMoves, getScore, getTemptingMove, playMove, shouldShowTemptation,
  type Board, type Cell, type Difficulty, type GameState, type Player,
} from "./game";

const difficulties: Difficulty[] = ["easy", "normal", "hard"];
const deterministic = { random: () => 0, now: () => 0 };

function boardWith(cells: Record<number, Cell>, fill: Cell = 0): Board {
  const board = Array<Cell>(64).fill(fill);
  for (const [index, cell] of Object.entries(cells)) board[Number(index)] = cell;
  return board;
}

function playing(board: Board, turn: Player = 1): GameState {
  return { board, turn, status: "playing", lastMove: null, passedPlayer: null, winner: null };
}

function lateDisadvantagedCpuBoard(): Board {
  return [
    0, -1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, -1, 1, 1, 1,
    0, 1, 1, 0, 1, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
  ];
}

describe("Othello rules", () => {
  it("starts with the four center discs, black to move, and four legal moves per side", () => {
    const game = createGame();
    expect(game).toMatchObject({ turn: 1, status: "playing", lastMove: null, passedPlayer: null, winner: null });
    expect(game.board).toHaveLength(64);
    expect(getScore(game.board)).toEqual({ black: 2, white: 2, empty: 60 });
    expect([game.board[27], game.board[28], game.board[35], game.board[36]]).toEqual([-1, 1, 1, -1]);
    expect(getLegalMoves(game.board, 1)).toEqual([19, 26, 37, 44]);
    expect(getLegalMoves(game.board, -1)).toEqual([20, 29, 34, 43]);
  });

  it.each([
    [-1, -1], [-1, 0], [-1, 1], [0, -1],
    [0, 1], [1, -1], [1, 0], [1, 1],
  ])("flips a bracketed line in direction (%i, %i)", (dr, dc) => {
    const first = (3 + dr) * 8 + 3 + dc;
    const second = (3 + 2 * dr) * 8 + 3 + 2 * dc;
    const end = (3 + 3 * dr) * 8 + 3 + 3 * dc;
    const board = boardWith({ [first]: -1, [second]: -1, [end]: 1 });
    expect(getFlips(board, 1, 27)).toEqual([first, second]);
    const next = applyMove(board, 1, 27);
    expect([next[27], next[first], next[second], next[end]]).toEqual([1, 1, 1, 1]);
  });

  it("flips all bracketed directions from a single move", () => {
    const cells: Record<number, Cell> = {};
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        cells[(3 + dr) * 8 + 3 + dc] = -1;
        cells[(3 + 2 * dr) * 8 + 3 + 2 * dc] = 1;
      }
    }
    expect(getFlips(boardWith(cells), 1, 27)).toHaveLength(8);
    expect(getScore(applyMove(boardWith(cells), 1, 27))).toEqual({ black: 17, white: 0, empty: 47 });
  });

  it("does not wrap horizontal or diagonal lines across board edges", () => {
    const board = boardWith({ 8: -1, 9: 1, 16: -1, 25: 1 });
    expect(getFlips(board, 1, 7)).toEqual([]);
    expect(getLegalMoves(board, 1)).not.toContain(7);
  });

  it("requires an enemy line closed by the moving player's disc", () => {
    expect(getFlips(boardWith({ 1: -1, 2: -1 }), 1, 0)).toEqual([]);
    expect(getFlips(boardWith({ 1: 1, 2: -1, 3: 1 }), 1, 0)).toEqual([]);
    expect(getFlips(boardWith({ 1: -1, 3: 1 }), 1, 0)).toEqual([]);
  });

  it.each([-1, 64, 19.5, NaN, 27, 0])("rejects the invalid initial move %s without changing the board", (move) => {
    const board = Object.freeze([...createInitialBoard()]);
    const original = [...board];
    expect(getFlips(board, 1, move)).toEqual([]);
    expect(() => applyMove(board, 1, move)).toThrow("Illegal Othello move");
    expect(board).toEqual(original);
  });

  it("returns a fresh board and state while leaving the previous position unchanged", () => {
    const game = Object.freeze({ ...createGame(), board: Object.freeze([...createInitialBoard()]) });
    const next = playMove(game, 19);
    expect(game.board).toEqual(createInitialBoard());
    expect(next.board).not.toBe(game.board);
    expect(next).toMatchObject({ turn: -1, status: "playing", lastMove: 19, passedPlayer: null, winner: null });
    expect(getScore(next.board)).toEqual({ black: 4, white: 1, empty: 59 });
  });

  it("automatically passes white and lets black play again when only black has a legal move", () => {
    const next = playMove(playing(boardWith({ 0: 0, 1: -1, 3: 0, 4: -1 }, 1)), 0);
    expect(next).toMatchObject({ turn: 1, passedPlayer: -1, status: "playing", winner: null });
    expect(getLegalMoves(next.board, -1)).toEqual([]);
    expect(getLegalMoves(next.board, 1)).toEqual([3]);
    expect(playMove(next, 3)).toMatchObject({ status: "finished", turn: null, passedPlayer: null, winner: 1 });
  });

  it("automatically passes black and lets the CPU play again", () => {
    const next = playMove(playing(boardWith({ 0: 0, 1: 1, 3: 0, 4: 1 }, -1), -1), 0);
    expect(next).toMatchObject({ turn: -1, passedPlayer: 1, status: "playing" });
    expect(chooseCpuMove(next.board, "hard", deterministic)).toBe(3);
    expect(playMove(next, 3)).toMatchObject({ status: "finished", winner: -1 });
  });

  it("finishes when neither side can move even though empty squares remain", () => {
    const next = playMove(playing(boardWith({ 0: 0, 1: -1, 63: 0 }, 1)), 0);
    expect(next).toMatchObject({ status: "finished", turn: null, winner: 1 });
    expect(getScore(next.board)).toEqual({ black: 63, white: 0, empty: 1 });
  });

  it("counts an equal 32-32 final board as a draw", () => {
    const board: Cell[] = Array.from({ length: 64 }, (_, index) => index < 32 ? 1 : -1);
    board[0] = 0;
    board[1] = -1;
    const next = playMove(playing(board), 0);
    expect(next).toMatchObject({ status: "finished", turn: null, winner: 0 });
    expect(getScore(next.board)).toEqual({ black: 32, white: 32, empty: 0 });
    expect(playMove(next, 42)).toBe(next);
  });

  it("finishes a complete legal game without requiring a manual pass", () => {
    let game = createGame();
    let moves = 0;
    while (game.status === "playing") {
      expect(game.turn).not.toBeNull();
      const legal = getLegalMoves(game.board, game.turn!);
      expect(legal.length).toBeGreaterThan(0);
      const before = getScore(game.board).empty;
      game = playMove(game, legal[0]);
      expect(getScore(game.board).empty).toBe(before - 1);
      moves += 1;
      expect(moves).toBeLessThanOrEqual(60);
    }
    expect(getLegalMoves(game.board, 1)).toEqual([]);
    expect(getLegalMoves(game.board, -1)).toEqual([]);
  });
});

describe("offline CPU difficulty and temptation", () => {
  it("uses the injected random source for weak CPU choices", () => {
    expect(chooseCpuMove(createInitialBoard(), "easy", { random: () => 0 })).toBe(20);
    expect(chooseCpuMove(createInitialBoard(), "easy", { random: () => 0.999 })).toBe(43);
    expect(chooseCpuMove(createInitialBoard(), "easy", { random: () => 1 })).toBe(43);
  });

  it.each(difficulties)("returns null for %s when the CPU must pass", (difficulty) => {
    expect(chooseCpuMove(boardWith({ 0: 0, 1: -1 }, 1), difficulty, deterministic)).toBeNull();
    expect(chooseCpuMove(Array<Cell>(64).fill(-1), difficulty, deterministic)).toBeNull();
  });

  it.each(["normal", "hard"] as const)("makes %s take a safe available corner while weak CPU may miss it", (difficulty) => {
    const board = boardWith({ 1: 1, 2: -1, 27: -1, 28: 1, 35: 1, 36: -1 });
    expect(getLegalMoves(board, -1)).toContain(0);
    expect(chooseCpuMove(board, "easy", { random: () => 0.999 })).not.toBe(0);
    expect(chooseCpuMove(board, difficulty, deterministic)).toBe(0);
  });

  it.each(difficulties)("keeps %s moves legal throughout a game, including automatic passes", (difficulty) => {
    let game = createGame();
    let turns = 0;
    while (game.status === "playing") {
      const legal = getLegalMoves(game.board, game.turn!);
      const move = game.turn === 1 ? legal[legal.length - 1] : chooseCpuMove(game.board, difficulty, { ...deterministic, maxNodes: 80 });
      expect(move).not.toBeNull();
      expect(legal).toContain(move);
      game = playMove(game, move!);
      turns += 1;
      expect(turns).toBeLessThanOrEqual(60);
    }
    expect(game.winner).not.toBeNull();
  });

  it("lets strong CPU read a seven-square endgame past the tempting immediate corner", () => {
    const board: Board = [
      0, 1, -1, -1, -1, -1, -1, -1,
      0, -1, -1, -1, 1, 1, 1, 1,
      -1, -1, -1, -1, -1, -1, 1, 0,
      0, 1, 1, -1, -1, -1, 1, 1,
      1, 1, 1, -1, -1, 1, 1, 1,
      0, 1, -1, 1, -1, 1, -1, 1,
      0, 1, 1, 1, 1, -1, 0, 1,
      -1, 1, 1, 1, 1, 1, 1, 1,
    ];
    // Independent exhaustive continuation gives white +12 from 54, versus
    // +6 from corner 0, +6 from 23, +4 from 24, -8 from 40 and +8 from 48.
    expect(chooseCpuMove(board, "normal", deterministic)).toBe(0);
    expect(chooseCpuMove(board, "hard", deterministic)).toBe(54);
  });

  it.each(["normal", "hard"] as const)("keeps %s CPU and tempting choices deterministic with fixed randomness and node budgets", (difficulty) => {
    const board = Object.freeze([...lateDisadvantagedCpuBoard()]);
    const options = { ...deterministic, maxNodes: 500 };
    expect(chooseCpuMove(board, difficulty, options)).toBe(chooseCpuMove(board, difficulty, options));
    expect(getTemptingMove(board, difficulty, options)).not.toBeNull();
    expect(getTemptingMove(board, difficulty, options)).toBe(getTemptingMove(board, difficulty, options));
    expect(board).toEqual(lateDisadvantagedCpuBoard());
  });

  it("does not tempt on weak difficulty", () => {
    expect(getTemptingMove(createInitialBoard(), "easy")).toBeNull();
  });

  it.each(["normal", "hard"] as const)("tempts toward a legal CPU-favorable move on %s, away from black's safe corner", (difficulty) => {
    const board = lateDisadvantagedCpuBoard();
    const legal = getLegalMoves(board, 1);
    expect(legal).toContain(0);
    const move = getTemptingMove(board, difficulty, deterministic);
    expect(legal).toContain(move);
    expect(move).not.toBe(0);
    expect(getTemptingMove(Array<Cell>(64).fill(1), difficulty, deterministic)).toBeNull();
  });

  it.each(["normal", "hard"] as const)("returns legal %s fallbacks after node or time exhaustion", (difficulty) => {
    const board = createInitialBoard();
    const temptingBoard = lateDisadvantagedCpuBoard();
    for (const options of [{ ...deterministic, maxNodes: 1 }, { ...deterministic, timeLimitMs: 0 }]) {
      expect(getLegalMoves(board, -1)).toContain(chooseCpuMove(board, difficulty, options));
      expect(getLegalMoves(temptingBoard, 1)).toContain(getTemptingMove(temptingBoard, difficulty, options));
    }
  });

  it("stops searching when the injected clock reaches the deadline", () => {
    let clockCalls = 0;
    const now = () => clockCalls++ * 1_000;
    expect(getLegalMoves(createInitialBoard(), -1)).toContain(chooseCpuMove(createInitialBoard(), "hard", { now, random: () => 0 }));
    expect(clockCalls).toBe(2);
  });
});

describe("temptation eligibility", () => {
  it("starts hard temptation immediately but leaves easy and normal disabled at the opening", () => {
    const board = createInitialBoard();
    expect(shouldShowTemptation(board, "easy")).toBe(false);
    expect(shouldShowTemptation(board, "normal")).toBe(false);
    expect(shouldShowTemptation(board, "hard")).toBe(true);
    expect(getTemptingMove(board, "easy", deterministic)).toBeNull();
    expect(getTemptingMove(board, "normal", deterministic)).toBeNull();
    expect(getLegalMoves(board, 1)).toContain(getTemptingMove(board, "hard", deterministic));
  });

  it("enables a disadvantaged normal CPU at exactly 34 occupied squares, never at 33", () => {
    const late = lateDisadvantagedCpuBoard();
    const early = [...late];
    early[34] = 0;
    expect(getScore(early).empty).toBe(31);
    expect(getScore(late).empty).toBe(30);
    expect(shouldShowTemptation(early, "normal")).toBe(false);
    expect(getTemptingMove(early, "normal", deterministic)).toBeNull();
    expect(shouldShowTemptation(late, "normal")).toBe(true);
    expect(getLegalMoves(late, 1)).toContain(getTemptingMove(late, "normal", deterministic));
    expect(shouldShowTemptation(late, "easy")).toBe(false);
  });

  it("does not tempt when normal CPU has a favorable later position", () => {
    const board = lateDisadvantagedCpuBoard().map((cell): Cell => cell === 0 ? 0 : cell === 1 ? -1 : 1);
    expect(getScore(board).empty).toBe(30);
    expect(shouldShowTemptation(board, "normal")).toBe(false);
    expect(getTemptingMove(board, "normal", deterministic)).toBeNull();
    expect(shouldShowTemptation(board, "hard")).toBe(true);
  });

  it("does not regard an equally evaluated later position as a CPU disadvantage", () => {
    const board = Array.from({ length: 64 }, (_, index): Cell => index < 17 ? 1 : index >= 47 ? -1 : 0);
    expect(getScore(board)).toEqual({ black: 17, white: 17, empty: 30 });
    expect(shouldShowTemptation(board, "normal")).toBe(false);
  });

  it("uses position quality rather than the disc count alone to judge CPU disadvantage", () => {
    const board = Array<Cell>(64).fill(0);
    for (const corner of [0, 7, 56, 63]) board[corner] = -1;
    for (let row = 1; row <= 5; row += 1) {
      for (let column = 1; column <= 6; column += 1) board[row * 8 + column] = 1;
    }
    expect(getScore(board)).toEqual({ black: 30, white: 4, empty: 30 });
    expect(shouldShowTemptation(board, "normal")).toBe(false);
    const inverted = board.map((cell): Cell => cell === 0 ? 0 : cell === 1 ? -1 : 1);
    expect(getScore(inverted)).toEqual({ black: 4, white: 30, empty: 30 });
    expect(shouldShowTemptation(inverted, "normal")).toBe(true);
  });
});

describe("finished-board arrangement", () => {
  it("groups player discs from top left and CPU discs from bottom right, leaving empty squares between", () => {
    const board = Object.freeze([...boardWith({ 0: -1, 7: 1, 27: -1, 36: 1, 42: -1, 56: 1 })]);
    const original = [...board];
    const arranged = arrangeFinishedBoard(board);
    expect(arranged).toEqual([...Array<Cell>(3).fill(1), ...Array<Cell>(58).fill(0), ...Array<Cell>(3).fill(-1)]);
    expect(getScore(arranged)).toEqual(getScore(board));
    expect(arranged).not.toBe(board);
    expect(board).toEqual(original);
  });

  it("keeps a filled 32-32 draw intact while separating the two colors", () => {
    const board = Array.from({ length: 64 }, (_, index): Cell => index % 2 === 0 ? -1 : 1);
    const arranged = arrangeFinishedBoard(board);
    expect(arranged.slice(0, 32)).toEqual(Array<Cell>(32).fill(1));
    expect(arranged.slice(32)).toEqual(Array<Cell>(32).fill(-1));
    expect(getScore(arranged)).toEqual({ black: 32, white: 32, empty: 0 });
    expect(arrangeFinishedBoard(arranged)).toEqual(arranged);
  });

  it.each([1, -1] as const)("preserves the count when only player %i discs remain", (player) => {
    const board = boardWith({ 19: player, 28: player });
    const arranged = arrangeFinishedBoard(board);
    expect(getScore(arranged)).toEqual(getScore(board));
    expect(arranged.filter((cell) => cell !== 0)).toEqual([player, player]);
    expect(player === 1 ? arranged.slice(0, 2) : arranged.slice(-2)).toEqual([player, player]);
  });
});

describe("CPU-favorable automatic play", () => {
  it.each([1, -1] as const)("selects a legal move for player %i without changing the state", (turn) => {
    const state = Object.freeze({ ...playing(Object.freeze([...createInitialBoard()]), turn) });
    const before = { ...state, board: [...state.board] };
    const move = chooseAssistedMove(state, deterministic);
    expect(getLegalMoves(state.board, turn)).toContain(move);
    expect(state).toEqual(before);
  });

  it("can start automatic play even while normal and weak temptation are disabled", () => {
    const state = createGame();
    expect(shouldShowTemptation(state.board, "normal")).toBe(false);
    expect(getTemptingMove(state.board, "easy", deterministic)).toBeNull();
    expect(getTemptingMove(state.board, "normal", deterministic)).toBeNull();
    expect(getLegalMoves(state.board, 1)).toContain(chooseAssistedMove(state, deterministic));
  });

  it("plays winning CPU moves and keeps control when the user must pass", () => {
    const board = boardWith({ 0: 0, 1: 1, 3: 0, 4: 1 }, -1);
    const first = chooseAssistedMove(playing(board, -1), deterministic);
    expect(first).toBe(0);
    const next = playMove(playing(board, -1), first!);
    expect(next).toMatchObject({ turn: -1, passedPlayer: 1 });
    const last = chooseAssistedMove(next, deterministic);
    expect(last).toBe(3);
    const finished = playMove(next, last!);
    expect(finished.winner).toBe(-1);
    expect(getScore(finished.board)).toEqual({ black: 0, white: 64, empty: 0 });
  });

  it("chooses a CPU-favorable alternative to the user's available safe corner", () => {
    const board = lateDisadvantagedCpuBoard();
    expect(getLegalMoves(board, 1)).toContain(0);
    const move = chooseAssistedMove(playing(board, 1), deterministic);
    expect(getLegalMoves(board, 1)).toContain(move);
    expect(move).not.toBe(0);
  });

  it("considers cooperation on later user turns instead of reusing competitive minimax", () => {
    const board: Board = [
      -1, 1, 0, 0, 1, 1, 1, 1,
      -1, 1, 1, 1, 1, 1, 1, 1,
      -1, 1, 1, 0, 1, -1, 1, 0,
      -1, 1, 1, -1, -1, 1, -1, -1,
      -1, 1, 1, 1, -1, -1, 1, -1,
      -1, 1, 1, 1, -1, 1, 0, -1,
      -1, 1, 1, 1, 1, 1, -1, -1,
      -1, 1, 1, 1, 1, 1, 1, -1,
    ];
    // Exhaustive cooperative outcomes by first move: 2 => +6, 3 => +10,
    // 19 => +2, 23 => -4, 46 => -4. Competitive play cannot guarantee a win.
    expect(chooseAssistedMove(playing(board, -1), deterministic)).toBe(3);
    expect(chooseCpuMove(board, "hard", deterministic)).not.toBe(3);
    let state = playing(board, -1);
    while (state.status === "playing") {
      const move = chooseAssistedMove(state, deterministic);
      expect(getLegalMoves(state.board, state.turn!)).toContain(move);
      state = playMove(state, move!);
    }
    const score = getScore(state.board);
    expect(score.white - score.black).toBe(10);
    expect(state.winner).toBe(-1);
  });

  it("fills the board when an equal winning margin could leave two squares empty", () => {
    const board: Board = [
      0, -1, -1, -1, -1, -1, -1, -1,
      -1, 1, -1, -1, 0, -1, -1, -1,
      -1, -1, -1, -1, -1, 1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, 0, -1,
      -1, -1, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, 0, -1, -1,
      -1, 1, -1, -1, -1, 1, -1, -1,
    ];
    // Exhaustive cooperative outcomes: 0 => purple 61 / white 3 / empty 0;
    // 12 => purple 60 / white 2 / empty 2. Both margins are +58, but the
    // old margin-only objective could end early at 12 instead of filling.
    let state = playing(board, -1);
    expect(chooseAssistedMove(state, deterministic)).toBe(0);
    while (state.status === "playing") {
      const move = chooseAssistedMove(state, deterministic);
      expect(getLegalMoves(state.board, state.turn!)).toContain(move);
      state = playMove(state, move!);
    }
    expect(state.winner).toBe(-1);
    expect(getScore(state.board)).toEqual({ black: 3, white: 61, empty: 0 });
  });

  it("uses the bounded search budget to find a larger cooperative endgame win", () => {
    const board: Board = [
      1, -1, -1, -1, -1, -1, 1, -1,
      1, -1, 1, 0, -1, 1, 0, -1,
      1, 1, 1, -1, 1, -1, -1, -1,
      1, -1, -1, -1, 1, -1, -1, 0,
      -1, -1, -1, 0, 0, -1, -1, -1,
      -1, -1, -1, -1, -1, 1, -1, 1,
      -1, -1, -1, 1, -1, -1, 1, 0,
      -1, -1, 0, -1, -1, -1, -1, -1,
    ];
    // Independent exhaustive continuations: 58 achieves purple 57 / white 7;
    // 55 achieves 56 / 8, while 11 and 14 achieve only 54 / 10.
    let state = playing(board, -1);
    expect(chooseAssistedMove(state, deterministic)).toBe(58);
    while (state.status === "playing") {
      const move = chooseAssistedMove(state, deterministic);
      expect(getLegalMoves(state.board, state.turn!)).toContain(move);
      state = playMove(state, move!);
    }
    expect(getScore(state.board)).toEqual({ black: 7, white: 57, empty: 0 });
  });

  it("returns null for finished games and missing turns", () => {
    const finished = playMove(playing(boardWith({ 0: 0, 1: -1 }, 1)), 0);
    expect(finished.status).toBe("finished");
    expect(chooseAssistedMove(finished, deterministic)).toBeNull();
    expect(chooseAssistedMove({ ...createGame(), turn: null }, deterministic)).toBeNull();
  });

  it("returns null if the supplied current player has no legal move", () => {
    const board = boardWith({ 0: 0, 1: -1 }, 1);
    expect(chooseAssistedMove(playing(board, -1), deterministic)).toBeNull();
    expect(chooseAssistedMove(playing(board, 1), deterministic)).toBe(0);
  });

  it.each([1, -1] as const)("returns a legal fallback for player %i when the node or time budget is exhausted", (turn) => {
    const state = playing(createInitialBoard(), turn);
    for (const options of [{ ...deterministic, maxNodes: 1 }, { ...deterministic, timeLimitMs: 0 }]) {
      expect(getLegalMoves(state.board, turn)).toContain(chooseAssistedMove(state, options));
    }
  });

  it("caps the automatic search deadline even if a caller requests a longer budget", () => {
    let clockCalls = 0;
    const state = createGame();
    const move = chooseAssistedMove(state, { random: () => 0, now: () => clockCalls++ * 150, timeLimitMs: 5_000 });
    expect(getLegalMoves(state.board, 1)).toContain(move);
    expect(clockCalls).toBe(2);
  });

  it("finishes an automatic game with legal moves and genuine disc counts throughout", () => {
    let state = createGame();
    let turns = 0;
    while (state.status === "playing") {
      const move = chooseAssistedMove(state, { ...deterministic, maxNodes: 200 });
      expect(getLegalMoves(state.board, state.turn!)).toContain(move);
      const previousEmpty = getScore(state.board).empty;
      state = playMove(state, move!);
      expect(getScore(state.board).empty).toBe(previousEmpty - 1);
      turns += 1;
      expect(turns).toBeLessThanOrEqual(60);
    }
    const score = getScore(state.board);
    expect(state.winner).toBe(score.black === score.white ? 0 : score.black > score.white ? 1 : -1);
    expect(chooseAssistedMove(state, deterministic)).toBeNull();
  });
});

describe("hard CPU reply restriction and endgame coverage", () => {
  const restrictedBoard: Board = [
    0, 0, 0, -1, -1, -1, 0, 0,
    0, 0, 1, 0, 1, 1, 1, 1,
    0, 0, 1, 0, 1, 1, -1, 1,
    0, 0, 1, 1, 1, -1, 1, 1,
    0, 0, 1, 1, -1, 1, 0, 0,
    0, 1, -1, -1, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 0, 0,
    0, -1, -1, 0, 0, 0, 0, 0,
  ];

  it("chooses a move leaving exactly one human reply, while normal keeps its existing choice", () => {
    const hard = chooseCpuMove(restrictedBoard, "hard", deterministic);
    expect(hard).toBe(59);
    expect(getLegalMoves(applyMove(restrictedBoard, -1, hard!), 1)).toHaveLength(1);
    const normal = chooseCpuMove(restrictedBoard, "normal", deterministic);
    expect(normal).toBe(56);
    expect(getLegalMoves(applyMove(restrictedBoard, -1, normal!), 1)).toHaveLength(2);
    expect(chooseCpuMove(restrictedBoard, "easy", { random: () => 0 })).toBe(2);
  });

  it("forces a genuine pass when the CPU can continue playing", () => {
    const board: Board = [
      -1, -1, -1, -1, 0, 1, -1, -1,
      -1, -1, -1, 1, 1, -1, -1, -1,
      -1, -1, 1, 1, -1, 1, -1, -1,
      -1, 1, 1, -1, 1, 1, -1, -1,
      1, 1, 1, 1, -1, 1, -1, -1,
      1, 1, 1, -1, -1, -1, -1, -1,
      0, 1, -1, 0, -1, -1, -1, -1,
      1, -1, -1, -1, -1, -1, -1, -1,
    ];
    const move = chooseCpuMove(board, "hard", deterministic);
    expect(move).toBe(51);
    const next = playMove(playing(board, -1), move!);
    expect(next).toMatchObject({ status: "playing", turn: -1, passedPlayer: 1 });
    expect(getLegalMoves(next.board, 1)).toEqual([]);
    expect(getLegalMoves(next.board, -1).length).toBeGreaterThan(0);
    expect(getScore(next.board).empty).toBe(2);
  });

  it("keeps a forced win instead of choosing a pass that only draws", () => {
    const board: Board = [
      -1, -1, -1, -1, -1, 0, 1, 1,
      -1, -1, 1, 1, 1, 1, 1, 1,
      -1, 1, -1, -1, 1, 1, 1, 1,
      -1, -1, 1, -1, 1, 1, 1, 1,
      -1, -1, -1, 1, 1, 1, 1, 1,
      -1, 1, -1, 1, 1, 1, 1, 1,
      -1, 1, 1, -1, 1, 1, 1, 0,
      -1, 1, 1, 1, 1, 1, 1, 0,
    ];
    // Exhaustive endgame: 5 forces a pass but ends 32-32; 55 loses 31-33;
    // 63 wins 36-28 even against the human's best legal continuation.
    expect(playMove(playing(board, -1), 5).passedPlayer).toBe(1);
    expect(chooseCpuMove(board, "hard", deterministic)).toBe(63);
    expect(playMove(playing(board, -1), 63).turn).toBe(1);
  });

  it("prefers more purple discs and a filled board over a larger margin with empty squares", () => {
    const board: Board = [
      -1, -1, -1, -1, 1, -1, -1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1,
      -1, -1, -1, -1, -1, 0, 1, -1,
      -1, -1, -1, -1, -1, -1, -1, -1,
      -1, 0, -1, -1, -1, 1, -1, -1,
      -1, 1, -1, -1, -1, 0, -1, -1,
      -1, 0, -1, -1, -1, 0, -1, -1,
      -1, -1, -1, 1, -1, -1, -1, -1,
    ];
    // Independent exhaustive outcomes: 21 guarantees purple 59 / white 5 /
    // empty 0. Move 45 ends purple 58 / white 3 / empty 3 (a larger margin).
    expect(chooseCpuMove(board, "hard", deterministic)).toBe(21);
  });

  it("sees a guaranteed larger win before the last ten empty squares", () => {
    const board: Board = [
      0, 1, 0, -1, -1, -1, -1, -1,
      0, 0, 1, -1, -1, -1, -1, -1,
      0, 1, 1, 1, -1, -1, -1, -1,
      1, 1, 1, -1, -1, -1, -1, -1,
      1, 1, 1, -1, -1, 1, -1, 1,
      1, 1, 1, 1, 0, -1, 1, 0,
      1, 1, 1, 1, 1, 0, 1, 0,
      1, 1, 1, 1, 1, 1, 0, 0,
    ];
    // Independent exhaustive minimax: 55 guarantees purple 42 / white 21 /
    // empty 1. The previous four-ply choice 44 guarantees only 35 / 28 / 1.
    expect(getScore(board).empty).toBe(11);
    expect(chooseCpuMove(board, "hard", deterministic)).toBe(55);
  });

  it("keeps pursuing a larger victory without overlooking a forced loss", () => {
    const board: Board = [
      -1, -1, 0, -1, -1, -1, -1, 0,
      -1, 1, 1, -1, 1, -1, 0, -1,
      -1, 1, 0, 1, 1, 1, 1, 1,
      -1, -1, 1, 1, 1, -1, 1, -1,
      -1, 1, -1, 1, -1, 1, -1, -1,
      -1, -1, 1, 1, 1, -1, -1, -1,
      -1, 1, 1, 1, 1, -1, -1, -1,
      0, 0, 1, 0, 0, 0, 0, 0,
    ];
    // Independent exhaustive minimax: 2 and 60 win 39-25. The previous
    // four-ply choice 59 loses 29-35 against the human's best replies.
    expect([2, 60]).toContain(chooseCpuMove(board, "hard", deterministic));
  });

  it("fills every square with purple only when legal moves can actually achieve it", () => {
    let state = playing(boardWith({ 0: 0, 1: 1, 3: 0, 4: 1 }, -1), -1);
    state = playMove(state, chooseCpuMove(state.board, "hard", deterministic)!);
    expect(getScore(state.board)).toEqual({ black: 1, white: 62, empty: 1 });
    expect(state).toMatchObject({ status: "playing", turn: -1 });
    state = playMove(state, chooseCpuMove(state.board, "hard", deterministic)!);
    expect(state).toMatchObject({ status: "finished", winner: -1 });
    expect(getScore(state.board)).toEqual({ black: 0, white: 64, empty: 0 });

    const isolatedEmpty = playing(boardWith({ 0: 0, 1: 1, 63: 0 }, -1), -1);
    const finished = playMove(isolatedEmpty, chooseCpuMove(isolatedEmpty.board, "hard", deterministic)!);
    expect(finished).toMatchObject({ status: "finished", winner: -1 });
    expect(getScore(finished.board)).toEqual({ black: 0, white: 63, empty: 1 });
    expect(finished.board[63]).toBe(0);
  });

  it("keeps the 12000-node limit even when the caller asks for more work", () => {
    let clockCalls = 0;
    const move = chooseCpuMove(restrictedBoard, "hard", {
      random: () => 0, now: () => { clockCalls += 1; return 0; }, maxNodes: 1_000_000,
    });
    expect(getLegalMoves(restrictedBoard, -1)).toContain(move);
    expect(clockCalls).toBeLessThanOrEqual(12_001);
  });

  it("keeps the 150ms limit and returns a legal fallback if time runs out", () => {
    let clockCalls = 0;
    const move = chooseCpuMove(restrictedBoard, "hard", {
      random: () => 0, now: () => clockCalls++ * 150, timeLimitMs: 10_000,
    });
    expect(getLegalMoves(restrictedBoard, -1)).toContain(move);
    expect(clockCalls).toBe(2);
  });
});

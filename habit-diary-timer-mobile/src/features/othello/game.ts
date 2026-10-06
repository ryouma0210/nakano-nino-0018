export type Player = 1 | -1;
export type Cell = Player | 0;
export type Board = readonly Cell[];
export type Difficulty = "easy" | "normal" | "hard";

export type GameState = {
  readonly board: Board;
  readonly turn: Player | null;
  readonly status: "playing" | "finished";
  readonly lastMove: number | null;
  readonly passedPlayer: Player | null;
  readonly winner: Player | 0 | null;
};

export type SearchOptions = {
  random?: () => number;
  maxNodes?: number;
  timeLimitMs?: number;
  now?: () => number;
};

const BLACK: Player = 1;
const WHITE: Player = -1;
const SIZE = 8;
const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1],
  [0, 1], [1, -1], [1, 0], [1, 1],
] as const;
const CORNERS = [0, 7, 56, 63] as const;
const WEIGHTS = [
  120, -25, 15, 5, 5, 15, -25, 120,
  -25, -45, -5, -5, -5, -5, -45, -25,
  15, -5, 8, 3, 3, 8, -5, 15,
  5, -5, 3, 1, 1, 3, -5, 5,
  5, -5, 3, 1, 1, 3, -5, 5,
  15, -5, 8, 3, 3, 8, -5, 15,
  -25, -45, -5, -5, -5, -5, -45, -25,
  120, -25, 15, 5, 5, 15, -25, 120,
] as const;

function opponent(player: Player): Player {
  return player === BLACK ? WHITE : BLACK;
}

export function createInitialBoard(): Board {
  const board: Cell[] = Array<Cell>(SIZE * SIZE).fill(0);
  board[27] = WHITE;
  board[28] = BLACK;
  board[35] = BLACK;
  board[36] = WHITE;
  return board;
}

export function createGame(): GameState {
  return {
    board: createInitialBoard(), turn: BLACK, status: "playing",
    lastMove: null, passedPlayer: null, winner: null,
  };
}

export function getFlips(board: Board, player: Player, index: number): number[] {
  if (board.length !== SIZE * SIZE || !Number.isInteger(index) || index < 0 || index >= SIZE * SIZE || board[index] !== 0) return [];
  const row = Math.floor(index / SIZE);
  const column = index % SIZE;
  const flips: number[] = [];
  for (const [rowStep, columnStep] of DIRECTIONS) {
    let nextRow = row + rowStep;
    let nextColumn = column + columnStep;
    const line: number[] = [];
    while (nextRow >= 0 && nextRow < SIZE && nextColumn >= 0 && nextColumn < SIZE) {
      const next = nextRow * SIZE + nextColumn;
      if (board[next] === opponent(player)) {
        line.push(next);
      } else {
        if (board[next] === player && line.length > 0) flips.push(...line);
        break;
      }
      nextRow += rowStep;
      nextColumn += columnStep;
    }
  }
  return flips;
}

export function getLegalMoves(board: Board, player: Player): number[] {
  const moves: number[] = [];
  for (let index = 0; index < SIZE * SIZE; index += 1) {
    if (board[index] === 0 && getFlips(board, player, index).length > 0) moves.push(index);
  }
  return moves;
}

export function applyMove(board: Board, player: Player, index: number): Board {
  const flips = getFlips(board, player, index);
  if (flips.length === 0) throw new Error("Illegal Othello move.");
  const next = [...board];
  next[index] = player;
  for (const flipped of flips) next[flipped] = player;
  return next;
}

export function getScore(board: Board): { black: number; white: number; empty: number } {
  let black = 0;
  let white = 0;
  let empty = 0;
  for (const cell of board) {
    if (cell === BLACK) black += 1;
    else if (cell === WHITE) white += 1;
    else empty += 1;
  }
  return { black, white, empty };
}

/** Display-only arrangement; the original position remains available unchanged. */
export function arrangeFinishedBoard(board: Board): Board {
  const score = getScore(board);
  return [
    ...Array<Cell>(score.black).fill(BLACK),
    ...Array<Cell>(score.empty).fill(0),
    ...Array<Cell>(score.white).fill(WHITE),
  ];
}

/** A forced pass keeps the turn with the player who can still move. */
export function playMove(state: GameState, index: number): GameState {
  if (state.status === "finished" || state.turn === null) return state;
  const board = applyMove(state.board, state.turn, index);
  const nextPlayer = opponent(state.turn);
  if (getLegalMoves(board, nextPlayer).length > 0) {
    return { board, turn: nextPlayer, status: "playing", lastMove: index, passedPlayer: null, winner: null };
  }
  if (getLegalMoves(board, state.turn).length > 0) {
    return { board, turn: state.turn, status: "playing", lastMove: index, passedPlayer: nextPlayer, winner: null };
  }
  const score = getScore(board);
  return {
    board, turn: null, status: "finished", lastMove: index, passedPlayer: null,
    winner: score.black === score.white ? 0 : score.black > score.white ? BLACK : WHITE,
  };
}

/** Positive scores favor the white CPU. */
function evaluate(board: Board, blackMoves?: number[], whiteMoves?: number[]): number {
  let position = 0;
  let blackFrontier = 0;
  let whiteFrontier = 0;
  for (let index = 0; index < SIZE * SIZE; index += 1) {
    const cell = board[index];
    if (cell === 0) continue;
    let weight: number = WEIGHTS[index];
    // Once a corner is held, its neighboring squares are no longer corner traps.
    for (const corner of CORNERS) {
      if (board[corner] === cell && Math.abs(Math.floor(index / SIZE) - Math.floor(corner / SIZE)) <= 1 && Math.abs(index % SIZE - corner % SIZE) <= 1 && index !== corner) {
        weight = 12;
      }
    }
    position += cell === WHITE ? weight : -weight;
    const row = Math.floor(index / SIZE);
    const column = index % SIZE;
    if (DIRECTIONS.some(([dr, dc]) => {
      const r = row + dr;
      const c = column + dc;
      return r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === 0;
    })) {
      if (cell === WHITE) whiteFrontier += 1;
      else blackFrontier += 1;
    }
  }
  const score = getScore(board);
  const mobility = (whiteMoves ?? getLegalMoves(board, WHITE)).length - (blackMoves ?? getLegalMoves(board, BLACK)).length;
  const pieceWeight = score.empty > 20 ? 1 : score.empty > 10 ? 4 : 12;
  return position * 3 + mobility * 16 + (blackFrontier - whiteFrontier) * 5 + (score.white - score.black) * pieceWeight;
}

/** Hard CPU values restricting replies, while still retaining positional safety. */
function evaluateHard(board: Board, blackMoves?: number[], whiteMoves?: number[]): number {
  const humanMoves = blackMoves ?? getLegalMoves(board, BLACK);
  const cpuMoves = whiteMoves ?? getLegalMoves(board, WHITE);
  const score = getScore(board);
  const restrictedReplies = humanMoves.length === 0 ? 1_000 : humanMoves.length === 1 ? 450 : humanMoves.length === 2 ? 160 : 0;
  const lateDiscWeight = score.empty <= 12 ? 14 : score.empty <= 24 ? 4 : 0;
  return evaluate(board, humanMoves, cpuMoves)
    + restrictedReplies - humanMoves.length * 45 + cpuMoves.length * 8
    + score.white * lateDiscWeight;
}

function terminalScore(board: Board, restrictHuman: boolean): number {
  const score = getScore(board);
  const difference = score.white - score.black;
  // The outcome dominates any positional/pass bonus. Among hard-mode wins,
  // prefer more actual CPU discs, then fewer remaining human discs. Empty
  // squares stay empty; only legal play can achieve a completely purple board.
  if (restrictHuman) return Math.sign(difference) * 100_000 + score.white * 128 - score.black;
  return difference === 0 ? 0 : Math.sign(difference) * 100_000 + difference;
}

type SearchContext = {
  nodes: number;
  maxNodes: number;
  deadline: number;
  now: () => number;
  exhausted: boolean;
  cooperative: boolean;
  restrictHuman: boolean;
};

function bounded(value: number | undefined, fallback: number, min: number, max: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function createContext(difficulty: Exclude<Difficulty, "easy">, tempting: boolean, options: SearchOptions, cooperative: boolean): SearchContext {
  const now = options.now ?? Date.now;
  const hard = difficulty === "hard";
  const maxNodes = tempting ? (hard ? 5_000 : 1_500) : (hard ? 12_000 : 3_000);
  const timeLimit = tempting ? (hard ? 80 : 40) : (hard ? 150 : 70);
  return {
    nodes: 0,
    maxNodes: Math.floor(bounded(options.maxNodes, maxNodes, 1, maxNodes)),
    deadline: now() + bounded(options.timeLimitMs, timeLimit, 0, timeLimit),
    now,
    exhausted: false,
    cooperative,
    restrictHuman: hard && !tempting && !cooperative,
  };
}

function visit(context: SearchContext): boolean {
  if (context.nodes >= context.maxNodes || context.now() >= context.deadline) {
    context.exhausted = true;
    return false;
  }
  context.nodes += 1;
  return true;
}

function orderedMoves(moves: number[]): number[] {
  return [...moves].sort((left, right) => WEIGHTS[right] - WEIGHTS[left] || left - right);
}

function search(board: Board, player: Player, depth: number, alpha: number, beta: number, context: SearchContext): number {
  if (!visit(context)) return 0;
  const moves = getLegalMoves(board, player);
  const other = opponent(player);
  if (moves.length === 0) {
    if (getLegalMoves(board, other).length === 0) return terminalScore(board, context.restrictHuman);
    // A pass places no disc and therefore consumes no search depth.
    return search(board, other, depth, alpha, beta, context);
  }
  if (depth <= 0) return (context.restrictHuman ? evaluateHard : evaluate)(board, player === BLACK ? moves : undefined, player === WHITE ? moves : undefined);
  // Assisted play lets both sides help the CPU. Ordinary play still assumes
  // that the user's future moves oppose it and therefore uses minimax.
  const maximizing = player === WHITE || context.cooperative;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of orderedMoves(moves)) {
    const value = search(applyMove(board, player, move), other, depth - 1, alpha, beta, context);
    if (context.exhausted) return 0;
    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, best);
    }
    if (alpha >= beta) break;
  }
  return best;
}

function randomMove(moves: readonly number[], random: () => number): number {
  const value = random();
  const index = Number.isFinite(value) ? Math.min(moves.length - 1, Math.max(0, Math.floor(value * moves.length))) : 0;
  return moves[index];
}

function selectWhiteFavorableMove(board: Board, player: Player, difficulty: Exclude<Difficulty, "easy">, tempting: boolean, options: SearchOptions, cooperative = false): number | null {
  const moves = getLegalMoves(board, player);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];
  const context = createContext(difficulty, tempting, options, cooperative);
  const candidates = moves.map((move) => {
    const next = applyMove(board, player, move);
    // Cheap legal fallback before starting the time- and node-bounded search.
    return { move, board: next, score: player === WHITE ? WEIGHTS[move] : -WEIGHTS[move] };
  }).sort((left, right) => right.score - left.score || left.move - right.move);
  let bestMoves = candidates.filter((candidate) => candidate.score === candidates[0].score).map((candidate) => candidate.move);
  const empty = getScore(board).empty;
  const maxDepth = tempting
    ? (difficulty === "hard" ? 3 : 2)
    : difficulty === "hard" ? (empty <= 10 ? empty : 4) : 2;

  // Only completed iterations replace the fallback: budget exhaustion cannot
  // accidentally prefer a partially searched move over the remaining choices.
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    let bestScore = -Infinity;
    const iterationMoves: number[] = [];
    const scores = new Map<number, number>();
    for (const candidate of candidates) {
      const value = search(candidate.board, opponent(player), depth - 1, -Infinity, Infinity, context);
      if (context.exhausted) break;
      scores.set(candidate.move, value);
      if (value > bestScore) {
        bestScore = value;
        iterationMoves.length = 0;
        iterationMoves.push(candidate.move);
      } else if (value === bestScore) iterationMoves.push(candidate.move);
    }
    if (context.exhausted) break;
    bestMoves = iterationMoves;
    candidates.sort((left, right) => (scores.get(right.move) ?? 0) - (scores.get(left.move) ?? 0) || left.move - right.move);
  }
  return randomMove(bestMoves, options.random ?? Math.random);
}

/** The user plays black; this selects a legal move for the white CPU. */
export function chooseCpuMove(board: Board, difficulty: Difficulty, options: SearchOptions = {}): number | null {
  if (difficulty === "easy") {
    const moves = getLegalMoves(board, WHITE);
    return moves.length > 0 ? randomMove(moves, options.random ?? Math.random) : null;
  }
  return selectWhiteFavorableMove(board, WHITE, difficulty, false, options);
}

/** Normal CPU only tempts after 30 moves when its position is disadvantaged. */
export function shouldShowTemptation(board: Board, difficulty: Difficulty): boolean {
  if (difficulty === "easy") return false;
  if (difficulty === "hard") return true;
  return getScore(board).empty <= 30 && evaluate(board) < 0;
}

/** Suggests a legal black move that benefits the CPU; it never forces a move. */
export function getTemptingMove(board: Board, difficulty: Difficulty, options: SearchOptions = {}): number | null {
  if (difficulty === "easy" || !shouldShowTemptation(board, difficulty)) return null;
  return selectWhiteFavorableMove(board, BLACK, difficulty, true, options);
}

/** Selects either side's legal move in automatic play, favoring the CPU. */
export function chooseAssistedMove(state: GameState, options: SearchOptions = {}): number | null {
  if (state.status === "finished" || state.turn === null) return null;
  return selectWhiteFavorableMove(state.board, state.turn, "hard", false, options, true);
}

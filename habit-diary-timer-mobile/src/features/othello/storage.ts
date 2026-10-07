import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLegalMoves, type Difficulty, type GameState } from "./game";

export const OTHELLO_STORAGE_KEY = "nino-room:othello:v1";
const HISTORY_LIMIT = 100;
const LOAD_ERROR = "オセロのプレイ履歴を読み込めませんでした。";
const SAVE_ERROR = "保存するオセロの結果が正しくありません。";

export type OthelloHistoryEntry = {
  id: string;
  startedAt: string;
  completedAt: string;
  difficulty: Difficulty;
  humanCount: number;
  cpuCount: number;
  result: "win" | "loss" | "draw";
  reason: "completed" | "surrender";
  dailyRewardEligible?: true;
};

export type SavedAssistance = { kind: "manual" | "single"; move: number }
  | { kind: "fast"; paused: boolean } | null;
export type OthelloCurrent = {
  id: string;
  startedAt: string;
  difficulty: Difficulty;
  game: GameState;
  assistance: SavedAssistance;
};
export const OTHELLO_ACHIEVEMENTS = ["played", "win", "normal-win", "hard-win"] as const;
export type OthelloAchievement = typeof OTHELLO_ACHIEVEMENTS[number];
export type OthelloSave = {
  version: 1;
  current: OthelloCurrent | null;
  history: OthelloHistoryEntry[];
  achievements: OthelloAchievement[];
};

let pendingOperation: Promise<void> = Promise.resolve();

function queueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingOperation.then(operation);
  pendingOperation = result.then(() => undefined, () => undefined);
  return result;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 64;
}

function isCurrent(value: unknown): value is OthelloCurrent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const current = value as OthelloCurrent;
  if (typeof current.id !== "string" || !current.id.trim() || current.id.length > 200
    || !isTimestamp(current.startedAt) || !["easy", "normal", "hard"].includes(current.difficulty)) return false;
  const game = current.game;
  if (!game || !Array.isArray(game.board) || game.board.length !== 64
    || !Array.from(game.board).every((cell) => cell === 0 || cell === 1 || cell === -1)
    || game.status !== "playing" || (game.turn !== 1 && game.turn !== -1) || game.winner !== null
    || (game.lastMove !== null && (!Number.isInteger(game.lastMove) || game.lastMove < 0 || game.lastMove >= 64 || game.board[game.lastMove] === 0))
    || (game.passedPlayer !== null && game.passedPlayer !== 1 && game.passedPlayer !== -1)
    || getLegalMoves(game.board, game.turn).length === 0) return false;
  if (game.passedPlayer !== null && (game.passedPlayer === game.turn || getLegalMoves(game.board, game.passedPlayer).length !== 0)) return false;
  const assistance = current.assistance;
  if (assistance === null) return true;
  if (!assistance || typeof assistance !== "object") return false;
  if (assistance.kind === "fast") return typeof assistance.paused === "boolean";
  return (assistance.kind === "manual" || assistance.kind === "single") && game.turn === 1
    && getLegalMoves(game.board, 1).includes(assistance.move);
}

function copyCurrent(current: OthelloCurrent): OthelloCurrent {
  const { id, startedAt, difficulty, game, assistance } = current;
  return { id, startedAt, difficulty, game: { ...game, board: [...game.board] },
    assistance: assistance ? { ...assistance } : null };
}

function earnedAchievements(history: OthelloHistoryEntry[], previous: OthelloAchievement[] = []): OthelloAchievement[] {
  const earned = new Set(previous);
  for (const entry of history) {
    earned.add("played");
    if (entry.result === "win") {
      earned.add("win");
      if (entry.difficulty === "normal") earned.add("normal-win");
      if (entry.difficulty === "hard") earned.add("hard-win");
    }
  }
  return OTHELLO_ACHIEVEMENTS.filter((achievement) => earned.has(achievement));
}

function isEntry(value: unknown): value is OthelloHistoryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  if ("dailyRewardEligible" in entry && (entry.dailyRewardEligible !== true || entry.result !== "win" || entry.reason !== "completed")) return false;
  if (typeof entry.id !== "string" || entry.id.trim().length === 0 || entry.id.length > 200
    || !isTimestamp(entry.startedAt) || !isTimestamp(entry.completedAt)
    || Date.parse(entry.startedAt) > Date.parse(entry.completedAt)
    || !["easy", "normal", "hard"].includes(entry.difficulty as string)
    || !isCount(entry.humanCount) || !isCount(entry.cpuCount) || entry.humanCount + entry.cpuCount > 64) return false;
  if (entry.reason === "surrender") return entry.result === "loss";
  if (entry.reason !== "completed") return false;
  const expected = entry.humanCount > entry.cpuCount ? "win" : entry.humanCount < entry.cpuCount ? "loss" : "draw";
  return entry.result === expected;
}

function copyEntry(entry: OthelloHistoryEntry): OthelloHistoryEntry {
  const { id, startedAt, completedAt, difficulty, humanCount, cpuCount, result, reason } = entry;
  return { id, startedAt, completedAt, difficulty, humanCount, cpuCount, result, reason,
    ...(entry.dailyRewardEligible ? { dailyRewardEligible: true as const } : {}) };
}

function latest(entries: OthelloHistoryEntry[]): OthelloHistoryEntry[] {
  return entries.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)
    || Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, HISTORY_LIMIT);
}

/** Shared by storage reads and backup validation, before any restore writes. */
export function parseOthelloSave(raw: string): OthelloSave {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(LOAD_ERROR);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(LOAD_ERROR);
  const saved = value as Record<string, unknown>;
  if (saved.version !== 1 || !Array.isArray(saved.history) || !saved.history.every(isEntry)
    || new Set(saved.history.map((entry) => entry.id)).size !== saved.history.length) {
    // Never discard good results beside corrupt data or overwrite unknown versions.
    throw new Error(LOAD_ERROR);
  }
  const current = saved.current === undefined || saved.current === null ? null : saved.current;
  const achievements = saved.achievements === undefined ? [] : saved.achievements;
  if ((current !== null && !isCurrent(current))
    || (current !== null && saved.history.some((entry) => entry.id === (current as OthelloCurrent).id))
    || !Array.isArray(achievements) || !achievements.every((value) => OTHELLO_ACHIEVEMENTS.includes(value))
    || new Set(achievements).size !== achievements.length) throw new Error(LOAD_ERROR);
  return { version: 1, current: current === null ? null : copyCurrent(current as OthelloCurrent),
    history: latest(saved.history.map(copyEntry)), achievements: earnedAchievements(saved.history, achievements) };
}

export function parseOthelloHistory(raw: string): OthelloHistoryEntry[] {
  return parseOthelloSave(raw).history;
}

async function readSave(): Promise<OthelloSave> {
  const raw = await AsyncStorage.getItem(OTHELLO_STORAGE_KEY);
  return raw === null ? { version: 1, current: null, history: [], achievements: [] } : parseOthelloSave(raw);
}

export function loadOthello(): Promise<OthelloSave> {
  return queueOperation(readSave);
}

export function loadOthelloHistory(): Promise<OthelloHistoryEntry[]> {
  return queueOperation(async () => (await readSave()).history);
}

export async function saveOthelloCurrent(current: OthelloCurrent): Promise<void> {
  if (!isCurrent(current)) throw new Error("保存するオセロの対局が正しくありません。");
  const snapshot = copyCurrent(current);
  return queueOperation(async () => {
    const saved = await readSave();
    if (saved.history.some((entry) => entry.id === snapshot.id)) throw new Error("終了した対局は再開できません。");
    if (saved.current && saved.current.id !== snapshot.id) throw new Error("別の対局が保存されています。");
    await AsyncStorage.setItem(OTHELLO_STORAGE_KEY, JSON.stringify({ ...saved, current: snapshot }));
  });
}

/** Only discard the game the caller actually confirmed, preserving a newer one. */
export function discardOthelloCurrent(id: string): Promise<void> {
  return queueOperation(async () => {
    const saved = await readSave();
    if (saved.current?.id !== id) return;
    await AsyncStorage.setItem(OTHELLO_STORAGE_KEY, JSON.stringify({ ...saved, current: null }));
  });
}

export async function saveOthelloResult(entry: OthelloHistoryEntry): Promise<OthelloHistoryEntry[]> {
  if (!isEntry(entry)) throw new Error(SAVE_ERROR);
  // Capture primitive fields now, before another pending save can delay this one.
  const snapshot = copyEntry(entry);
  return queueOperation(async () => {
    const saved = await readSave();
    const { history } = saved;
    const existing = history.find((record) => record.id === snapshot.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(snapshot)) {
        throw new Error("同じ対局IDの異なる結果は保存できません。");
      }
      return history;
    }
    const next = latest([snapshot, ...history]);
    await AsyncStorage.setItem(OTHELLO_STORAGE_KEY, JSON.stringify({ ...saved, history: next,
      current: saved.current?.id === snapshot.id ? null : saved.current,
      achievements: earnedAchievements([snapshot], saved.achievements) }));
    return next;
  });
}

export function clearOthelloHistory(): Promise<void> {
  return queueOperation(() => AsyncStorage.removeItem(OTHELLO_STORAGE_KEY));
}

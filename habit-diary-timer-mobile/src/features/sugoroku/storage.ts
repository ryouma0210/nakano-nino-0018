import AsyncStorage from "@react-native-async-storage/async-storage";
import { validateGame, type SugorokuGame } from "./game";

export const SUGOROKU_STORAGE_KEY = "nino-room:sugoroku:v1";
const HISTORY_LIMIT = 100;
export type SugorokuAchievement = "goal-1" | "goal-2";

export type SugorokuSave = {
  version: 1;
  current: SugorokuGame | null;
  history: SugorokuGame[];
  /** Permanent unlocks, independent of the bounded game history. */
  achievements?: SugorokuAchievement[];
};

let pendingOperation: Promise<void> = Promise.resolve();

function queueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingOperation.then(operation);
  // A rejected operation must remain visible to its caller without blocking later work.
  pendingOperation = result.then(() => undefined, () => undefined);
  return result;
}

function isSavedGame(value: unknown): value is SugorokuSave {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const saved = value as Record<string, unknown>;
  if (saved.version !== 1 || !Array.isArray(saved.history)) return false;
  if ("achievements" in saved && (!Array.isArray(saved.achievements)
    || saved.achievements.some((entry) => entry !== "goal-1" && entry !== "goal-2")
    || new Set(saved.achievements).size !== saved.achievements.length)) return false;
  if (saved.current !== null && (!validateGame(saved.current) || saved.current.phase === "finished")) return false;
  if (!saved.history.every((game) => validateGame(game) && game.phase === "finished")) return false;
  const ids = new Set(saved.history.map((game) => game.id));
  if (ids.size !== saved.history.length) return false;
  return saved.current === null || !ids.has(saved.current.id);
}

export function getSugorokuAchievements(saved: Pick<SugorokuSave, "history" | "achievements">): SugorokuAchievement[] {
  const goals = new Set<SugorokuAchievement>(saved.achievements ?? []);
  for (const game of saved.history) {
    if (game.phase === "finished" && (game.outcome === "goal-1" || game.outcome === "goal-2")) goals.add(game.outcome);
  }
  return (["goal-1", "goal-2"] as const).filter((goal) => goals.has(goal));
}

/** Validate backup restores and normalize legacy achievements without writing. */
export function parseSugorokuSave(raw: string): SugorokuSave {
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    throw new Error("すごろくの保存データを読み込めませんでした。");
  }
  // Never silently replace a corrupt record: this also protects valid history beside it.
  if (!isSavedGame(saved)) throw new Error("すごろくの保存データを読み込めませんでした。");
  return { ...saved, achievements: getSugorokuAchievements(saved) };
}

async function readSavedGame(): Promise<SugorokuSave> {
  const raw = await AsyncStorage.getItem(SUGOROKU_STORAGE_KEY);
  return raw === null ? { version: 1, current: null, history: [], achievements: [] } : parseSugorokuSave(raw);
}

function snapshotGame(game: SugorokuGame): SugorokuGame {
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(JSON.stringify(game));
  } catch {
    throw new Error("保存するすごろくのデータが正しくありません。");
  }
  if (!validateGame(snapshot)) throw new Error("保存するすごろくのデータが正しくありません。");
  return snapshot;
}

export function loadSugoroku(): Promise<SugorokuSave> {
  return queueOperation(readSavedGame);
}

export async function saveSugoroku(game: SugorokuGame): Promise<SugorokuSave> {
  // Snapshot immediately, before waiting behind another save.
  const snapshot = snapshotGame(game);
  return queueOperation(async () => {
    const saved = await readSavedGame();
    let next: SugorokuSave;
    if (snapshot.phase === "finished") {
      next = {
        version: 1,
        // A late completion from an older game must not delete a newer active game.
        current: saved.current?.id === snapshot.id ? null : saved.current,
        history: [snapshot, ...saved.history.filter((entry) => entry.id !== snapshot.id)].slice(0, HISTORY_LIMIT),
      };
    } else {
      if (saved.history.some((entry) => entry.id === snapshot.id)) {
        throw new Error("終了したゲームは再開できません。");
      }
      next = { version: 1, current: snapshot, history: saved.history.slice(0, HISTORY_LIMIT) };
    }
    next.achievements = getSugorokuAchievements({ history: next.history, achievements: saved.achievements });
    // Progress, logs, history and permanent unlocks share a single storage write.
    await AsyncStorage.setItem(SUGOROKU_STORAGE_KEY, JSON.stringify(next));
    return next;
  });
}

export function clearSugoroku(): Promise<void> {
  return queueOperation(() => AsyncStorage.removeItem(SUGOROKU_STORAGE_KEY));
}

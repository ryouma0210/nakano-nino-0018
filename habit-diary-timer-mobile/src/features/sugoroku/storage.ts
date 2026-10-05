import AsyncStorage from "@react-native-async-storage/async-storage";
import { validateGame, type SugorokuGame } from "./game";

const STORAGE_KEY = "nino-room:sugoroku:v1";
const HISTORY_LIMIT = 100;

export type SugorokuSave = {
  version: 1;
  current: SugorokuGame | null;
  history: SugorokuGame[];
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
  if (saved.current !== null && (!validateGame(saved.current) || saved.current.phase === "finished")) return false;
  if (!saved.history.every((game) => validateGame(game) && game.phase === "finished")) return false;
  const ids = new Set(saved.history.map((game) => game.id));
  if (ids.size !== saved.history.length) return false;
  return saved.current === null || !ids.has(saved.current.id);
}

async function readSavedGame(): Promise<SugorokuSave> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw === null) return { version: 1, current: null, history: [] };
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    throw new Error("すごろくの保存データを読み込めませんでした。");
  }
  // Never silently replace a corrupt record: this also protects valid history beside it.
  if (!isSavedGame(saved)) throw new Error("すごろくの保存データを読み込めませんでした。");
  return saved;
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
    // Current progress and its finished history are committed in one storage write.
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });
}

export function clearSugoroku(): Promise<void> {
  return queueOperation(() => AsyncStorage.removeItem(STORAGE_KEY));
}

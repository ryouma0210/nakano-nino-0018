import AsyncStorage from "@react-native-async-storage/async-storage";
import { FILE_USAGES, type FileUsage } from "../features/files/usages";
import type { RhythmSession } from "../features/rhythm/model";

export const RHYTHM_STORAGE_KEY = "nino-room:rhythm-challenge:v1";
export const RHYTHM_IMAGE_STATES = ["normal", "paused", "finished"] as const;
export type RhythmImageState = typeof RHYTHM_IMAGE_STATES[number];
export type RhythmImageReference = { name: string; purpose: FileUsage };
export type RhythmImages = Record<RhythmImageState, RhythmImageReference | null>;
export type RhythmHistoryEntry = {
  id: string;
  startedAt: string;
  completedAt: string;
  interruptions: number;
  elapsedSeconds: number;
  dailyRewardEligible?: true;
};
export type RhythmSave = { version: 1; images: RhythmImages; history: RhythmHistoryEntry[] };
const LOAD_ERROR = "耐久チャレンジのデータを読み込めませんでした。";
const SAVE_ERROR = "保存する耐久チャレンジのデータが正しくありません。";
let pending: Promise<void> = Promise.resolve();

function queue<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.then(() => undefined, () => undefined);
  return result;
}

export function defaultRhythmImages(): RhythmImages {
  return { normal: null, paused: null, finished: null };
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isEntry(value: unknown): value is RhythmHistoryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as RhythmHistoryEntry;
  if ("dailyRewardEligible" in entry && (entry.dailyRewardEligible !== true || entry.interruptions < 10)) return false;
  return typeof entry.id === "string" && entry.id.trim().length > 0 && entry.id.length <= 200
    && isTimestamp(entry.startedAt) && isTimestamp(entry.completedAt)
    && Date.parse(entry.completedAt) >= Date.parse(entry.startedAt)
    && isCount(entry.interruptions) && isCount(entry.elapsedSeconds)
    && entry.elapsedSeconds <= Math.floor((Date.parse(entry.completedAt) - Date.parse(entry.startedAt)) / 1000);
}

function isImages(value: unknown): value is RhythmImages {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const images = value as RhythmImages;
  return RHYTHM_IMAGE_STATES.every((state) => {
    const image = images[state];
    return image === null || Boolean(image && typeof image === "object" && !Array.isArray(image)
      && FILE_USAGES.includes(image.purpose) && typeof image.name === "string" && image.name.length <= 500
      && !/[\\/\x00-\x1f\x7f]/.test(image.name) && /\.(png|jpe?g|webp|gif)$/i.test(image.name));
  });
}

function copyImages(images: RhythmImages): RhythmImages {
  return Object.fromEntries(RHYTHM_IMAGE_STATES.map((state) => {
    const image = images[state];
    return [state, image ? { name: image.name, purpose: image.purpose } : null];
  })) as RhythmImages;
}

function copyEntry(entry: RhythmHistoryEntry): RhythmHistoryEntry {
  const { id, startedAt, completedAt, interruptions, elapsedSeconds } = entry;
  return { id, startedAt, completedAt, interruptions, elapsedSeconds,
    ...(entry.dailyRewardEligible ? { dailyRewardEligible: true as const } : {}) };
}

function latest(entries: RhythmHistoryEntry[]): RhythmHistoryEntry[] {
  return entries.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)
    || Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 100);
}

/** Also used by backup validation, before any restore writes. */
export function parseRhythmSave(raw: string): RhythmSave {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error(LOAD_ERROR); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(LOAD_ERROR);
  const saved = value as RhythmSave;
  if (saved.version !== 1 || !isImages(saved.images) || !Array.isArray(saved.history)
    || !saved.history.every(isEntry) || new Set(saved.history.map((entry) => entry.id)).size !== saved.history.length) {
    throw new Error(LOAD_ERROR);
  }
  return { version: 1, images: copyImages(saved.images), history: latest(saved.history.map(copyEntry)) };
}

async function read(): Promise<RhythmSave> {
  const raw = await AsyncStorage.getItem(RHYTHM_STORAGE_KEY);
  return raw === null ? { version: 1, images: defaultRhythmImages(), history: [] } : parseRhythmSave(raw);
}

export function rhythmResult(session: RhythmSession): RhythmHistoryEntry {
  if (session.status !== "finished" || session.completedAt === null) throw new Error(SAVE_ERROR);
  const result = { id: session.id, startedAt: new Date(session.startedAt).toISOString(),
    completedAt: new Date(session.completedAt).toISOString(), interruptions: session.interruptions,
    elapsedSeconds: Math.floor(session.elapsedMs / 1000) };
  if (!isEntry(result)) throw new Error(SAVE_ERROR);
  return result;
}

export const rhythmChallengeService = {
  load: () => queue(read),
  async saveImages(images: RhythmImages): Promise<void> {
    if (!isImages(images)) throw new Error(SAVE_ERROR);
    const snapshot = copyImages(images);
    return queue(async () => {
      const saved = await read();
      await AsyncStorage.setItem(RHYTHM_STORAGE_KEY, JSON.stringify({ ...saved, images: snapshot }));
    });
  },
  async saveResult(entry: RhythmHistoryEntry): Promise<RhythmHistoryEntry[]> {
    if (!isEntry(entry)) throw new Error(SAVE_ERROR);
    const snapshot = copyEntry(entry);
    return queue(async () => {
      const saved = await read();
      const existing = saved.history.find((item) => item.id === snapshot.id);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(snapshot)) throw new Error("同じプレイIDの異なる結果は保存できません。");
        return saved.history;
      }
      const history = latest([snapshot, ...saved.history]);
      await AsyncStorage.setItem(RHYTHM_STORAGE_KEY, JSON.stringify({ ...saved, history }));
      return history;
    });
  },
  clear: () => queue(() => AsyncStorage.removeItem(RHYTHM_STORAGE_KEY)),
  clearHistory: () => queue(async () => {
    const saved = await read();
    await AsyncStorage.setItem(RHYTHM_STORAGE_KEY, JSON.stringify({ ...saved, history: [] }));
  }),
  clearImages: () => queue(async () => {
    const saved = await read();
    await AsyncStorage.setItem(RHYTHM_STORAGE_KEY, JSON.stringify({ ...saved, images: defaultRhythmImages() }));
  }),
};

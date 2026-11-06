import type { StoredFile } from "../../services/fileStorageService";
import { displayedFileName, storedFileKey } from "../files/fileList";
import { fileHasPurpose } from "../files/usages";

export const TIMER_ROOM_MEDIA_KEY = "nino-room:timer-room-media:v1";
export const DEFAULT_TIMER_ROOM_MEDIA_KEY = "default";
export const MAX_TIMER_ROOM_MEDIA = 100;
export type TimerRoomMediaSource = "default" | "files";
export type TimerRoomMediaPreferences = { version: 2; source: TimerRoomMediaSource; selectedKeys: string[]; currentKey: string | null };
export type TimerRoomMediaItem = { key: string; label: string; kind: "image" | "video"; uri?: string };
const defaultItem: TimerRoomMediaItem = { key: DEFAULT_TIMER_ROOM_MEDIA_KEY, label: "デフォルト画像", kind: "image" };

export function defaultTimerRoomMedia(): TimerRoomMediaPreferences {
  return { version: 2, source: "default", selectedKeys: [], currentKey: null };
}

export function timerRoomMediaKind(name: string): "image" | "video" | null {
  if (/\.(mp4|webm|mov)$/i.test(name)) return "video";
  return /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i.test(name) ? "image" : null;
}

export function timerRoomFiles(files: readonly StoredFile[]): StoredFile[] {
  return files.filter((file) => fileHasPurpose(file, "confinement")
    && timerRoomMediaKind(file.name) !== null);
}

export function parseTimerRoomMedia(raw: string | null): TimerRoomMediaPreferences {
  if (raw === null) return defaultTimerRoomMedia();
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("Invalid timer room media preferences");
  const item = value as Record<string, unknown>;
  if ((item.version !== 1 && item.version !== 2) || !Array.isArray(item.selectedKeys) || item.selectedKeys.length > MAX_TIMER_ROOM_MEDIA
    || item.selectedKeys.some((key) => typeof key !== "string" || key.length > 2048
      || (key !== DEFAULT_TIMER_ROOM_MEDIA_KEY && !/^(training|punishment|endurance|confinement):.+$/.test(key)))
    || new Set(item.selectedKeys).size !== item.selectedKeys.length) throw new Error("Invalid timer room media preferences");
  const keys = item.selectedKeys as string[];
  if (item.version === 1) {
    if (typeof item.currentKey !== "string" || !keys.includes(item.currentKey)) throw new Error("Invalid timer room media preferences");
    const selectedKeys = keys.filter((key) => key !== DEFAULT_TIMER_ROOM_MEDIA_KEY);
    return { version: 2, source: item.currentKey === DEFAULT_TIMER_ROOM_MEDIA_KEY ? "default" : "files", selectedKeys,
      currentKey: item.currentKey === DEFAULT_TIMER_ROOM_MEDIA_KEY ? selectedKeys[0] ?? null : item.currentKey };
  }
  if ((item.source !== "default" && item.source !== "files") || keys.includes(DEFAULT_TIMER_ROOM_MEDIA_KEY)
    || (keys.length === 0 ? item.currentKey !== null : typeof item.currentKey !== "string" || !keys.includes(item.currentKey))) {
    throw new Error("Invalid timer room media preferences");
  }
  return { version: 2, source: item.source, selectedKeys: [...keys], currentKey: item.currentKey as string | null };
}

/** A source change remembers the file selection and its last position. */
export function selectTimerRoomMediaSource(preferences: TimerRoomMediaPreferences, source: TimerRoomMediaSource): TimerRoomMediaPreferences {
  return { ...preferences, source, selectedKeys: [...preferences.selectedKeys] };
}

/** Preserve the user's order. Missing files are never replaced with random media. */
export function resolveTimerRoomMedia(preferences: TimerRoomMediaPreferences, files: readonly StoredFile[]) {
  if (preferences.source === "default") return { items: [defaultItem], current: defaultItem, missing: false };
  const available = new Map<string, TimerRoomMediaItem>();
  timerRoomFiles(files).forEach((file) => available.set(storedFileKey(file), {
    key: storedFileKey(file), label: displayedFileName(file), kind: timerRoomMediaKind(file.name)!, uri: file.uri,
  }));
  const items = preferences.selectedKeys.flatMap((key) => available.has(key) ? [available.get(key)!] : []);
  const currentMissing = preferences.currentKey !== null && !available.has(preferences.currentKey);
  if ((currentMissing || items.length === 0) && !items.some((item) => item.key === DEFAULT_TIMER_ROOM_MEDIA_KEY)) items.unshift(defaultItem);
  const currentKey = currentMissing || preferences.currentKey === null ? DEFAULT_TIMER_ROOM_MEDIA_KEY : preferences.currentKey;
  return { items, current: items.find((item) => item.key === currentKey) ?? items[0], missing: currentMissing };
}

export function moveTimerRoomMedia(preferences: TimerRoomMediaPreferences, items: readonly TimerRoomMediaItem[], currentKey: string, direction: -1 | 1): TimerRoomMediaPreferences {
  const files = items.filter((item) => item.key !== DEFAULT_TIMER_ROOM_MEDIA_KEY);
  if (files.length === 0) return preferences;
  const index = files.findIndex((item) => item.key === currentKey);
  const nextIndex = index < 0 ? direction === 1 ? 0 : files.length - 1 : (index + direction + files.length) % files.length;
  return { ...preferences, source: "files", currentKey: files[nextIndex].key };
}

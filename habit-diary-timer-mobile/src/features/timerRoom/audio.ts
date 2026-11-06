import type { LoopAudioName } from "../../audio/AudioProvider";
import { loopAudioOptions } from "../../audio/loopAudioLabels";

export const TIMER_ROOM_AUDIO_KEY = "nino-room:timer-room-audio:v1";
export const TIMER_ROOM_AUDIO_INTERVAL_MS = 60_000;
export const TIMER_ROOM_AUDIO_OPTIONS = loopAudioOptions;
export const MAX_TIMER_ROOM_AUDIO_SETS = 20;
export const MAX_TIMER_ROOM_AUDIO_SET_NAME_LENGTH = 40;
export type TimerRoomAudioName = LoopAudioName;
export type TimerRoomAudioSet = { name: string; voices: TimerRoomAudioName[] };
export type TimerRoomAudioPreferences = { version: 3; mode: "auto" | "manual"; manual: TimerRoomAudioName[]; sets: TimerRoomAudioSet[] };

export function defaultTimerRoomAudioPreferences(): TimerRoomAudioPreferences {
  // Keep existing single-source automatic choices until a user groups them.
  // Unnamed sets receive a translated, numbered label in the selector.
  const voices: TimerRoomAudioName[] = ["earLick", ...TIMER_ROOM_AUDIO_OPTIONS.map(({ key }) => key).filter((key) => key !== "earLick")];
  return { version: 3, mode: "auto", manual: ["earLick"], sets: voices.map((voice) => ({ name: "", voices: [voice] })) };
}

function validVoices(value: unknown): value is TimerRoomAudioName[] {
  return Array.isArray(value) && value.length <= TIMER_ROOM_AUDIO_OPTIONS.length
    && Array.from(value).every((name) => TIMER_ROOM_AUDIO_OPTIONS.some(({ key }) => key === name))
    && new Set(value).size === value.length;
}

export function validTimerRoomAudioSets(value: unknown): value is TimerRoomAudioSet[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= MAX_TIMER_ROOM_AUDIO_SETS
    && Array.from(value).every((set: unknown) => {
      if (!set || typeof set !== "object" || Array.isArray(set)) return false;
      const item = set as Partial<TimerRoomAudioSet>;
      return typeof item.name === "string" && item.name.trim().length <= MAX_TIMER_ROOM_AUDIO_SET_NAME_LENGTH
        && validVoices(item.voices) && item.voices.length >= 1;
    });
}

function validPreferences(value: unknown): value is TimerRoomAudioPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as TimerRoomAudioPreferences;
  return item.version === 3 && (item.mode === "auto" || item.mode === "manual")
    && validVoices(item.manual) && validTimerRoomAudioSets(item.sets);
}

export function copyTimerRoomAudioPreferences(value: TimerRoomAudioPreferences): TimerRoomAudioPreferences {
  return { version: 3, mode: value.mode, manual: [...value.manual], sets: value.sets.map(({ name, voices }) => ({ name, voices: [...voices] })) };
}

function normalizedPreferences(value: TimerRoomAudioPreferences): TimerRoomAudioPreferences {
  const copy = copyTimerRoomAudioPreferences(value);
  copy.sets.forEach((set) => { set.name = set.name.trim(); });
  return copy;
}

export function parseTimerRoomAudioPreferences(raw: string | null): TimerRoomAudioPreferences {
  if (raw === null) return defaultTimerRoomAudioPreferences();
  try {
    const value: unknown = JSON.parse(raw);
    if (validPreferences(value)) return normalizedPreferences(value);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const item = value as { version?: unknown; mode?: unknown; manual?: unknown };
      if (item.version === 2 && (item.mode === "auto" || item.mode === "manual") && validVoices(item.manual)) {
        return { ...defaultTimerRoomAudioPreferences(), mode: item.mode, manual: [...item.manual] };
      }
      // Earlier experimental noise choices do not map to the shared loop
      // catalog. Preserve the mode but migrate their source to the default.
      if (item.version === 1 && (item.mode === "auto" || item.mode === "manual")) {
        return { ...defaultTimerRoomAudioPreferences(), mode: item.mode };
      }
    }
  } catch { /* A malformed preference never prevents entry or exit. */ }
  return defaultTimerRoomAudioPreferences();
}

function elapsedMilliseconds(startedAt: number | null, now: number) {
  if (startedAt === null || !Number.isFinite(startedAt) || !Number.isFinite(now)) return 0;
  // Bound unusual clock values as well as very old sessions without iterating
  // through elapsed minutes or allocating an ever-growing random playlist.
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, now - startedAt));
}

function sessionHash(startedAt: number, pair: number, salt: string) {
  const seed = `${startedAt}:${pair}:${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return hash >>> 0;
}

/** Stable per-session set selection; repeated renders/restarts never reroll a minute. */
export function timerRoomAudioSetIndex(preferences: TimerRoomAudioPreferences, startedAt: number | null, now: number): number {
  const minute = Math.floor(elapsedMilliseconds(startedAt, now) / TIMER_ROOM_AUDIO_INTERVAL_MS);
  const count = preferences.sets.length;
  if (minute === 0 || count <= 1) return 0;
  if (count === 2) return minute % 2;
  const pair = Math.floor(minute / 2);
  // Even minutes are independently seeded anchors. Each intervening odd minute
  // differs from both anchors. Work is bounded by the saved set count,
  // never by elapsed time, and any interval can be restored directly.
  const anchor = (index: number) => index === 0 ? 0 : sessionHash(startedAt!, index, "anchor") % count;
  const current = anchor(pair);
  if (minute % 2 === 0) return current;
  const next = anchor(pair + 1);
  const candidates = Array.from({ length: count }, (_, index) => index).filter((index) => index !== current && index !== next);
  return candidates[sessionHash(startedAt!, pair, "between") % candidates.length];
}

export function timerRoomAudioNames(preferences: TimerRoomAudioPreferences, startedAt: number | null, now: number): TimerRoomAudioName[] {
  if (preferences.mode === "manual") return [...preferences.manual];
  // An in-progress editor draft may temporarily contain no voices or sets.
  return [...(preferences.sets[timerRoomAudioSetIndex(preferences, startedAt, now)]?.voices ?? [])];
}

/** Checking an automatic choice changes only the draft until explicitly saved. */
export function toggleTimerRoomAudio(preferences: TimerRoomAudioPreferences, name: TimerRoomAudioName, startedAt: number | null, now: number): TimerRoomAudioPreferences {
  const current = timerRoomAudioNames(preferences, startedAt, now);
  return { ...copyTimerRoomAudioPreferences(preferences), mode: "manual", manual: current.includes(name) ? current.filter((value) => value !== name) : [...current, name] };
}

export function timerRoomAudioSwitchSeconds(startedAt: number | null, now: number): number {
  const elapsed = elapsedMilliseconds(startedAt, now);
  return Math.ceil((TIMER_ROOM_AUDIO_INTERVAL_MS - elapsed % TIMER_ROOM_AUDIO_INTERVAL_MS) / 1000);
}

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };

export function createTimerRoomAudioPreferenceStore(storage: Storage) {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    async load() {
      await queue;
      return parseTimerRoomAudioPreferences(await storage.getItem(TIMER_ROOM_AUDIO_KEY));
    },
    save(preferences: TimerRoomAudioPreferences) {
      if (!validPreferences(preferences)) return Promise.reject(new Error("ボイス設定を保存できませんでした。選択内容を確認してください。"));
      const snapshot = normalizedPreferences(preferences);
      const result = queue.then(async () => {
        await storage.setItem(TIMER_ROOM_AUDIO_KEY, JSON.stringify(snapshot));
        return snapshot;
      });
      queue = result.catch(() => {});
      return result;
    },
  };
}

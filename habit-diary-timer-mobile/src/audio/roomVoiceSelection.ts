import { loopAudioOptions } from "./loopAudioLabels";

export const ROOM_VOICE_PREFERENCES_KEY = "nino-room:room-voices:v1";
export const ROOM_VOICE_ROOMS = ["training", "punishment", "rhythm"] as const;
export type RoomVoiceRoom = typeof ROOM_VOICE_ROOMS[number];
const loopVoiceNames = loopAudioOptions.map(({ key }) => key);
export const ROOM_VOICE_BUILTINS = {
  training: [...loopVoiceNames, "trainingRhythm"],
  punishment: [...loopVoiceNames],
  rhythm: [...loopVoiceNames, "rhythmBeat"],
} as const;
export type RoomVoiceSelection = { builtin: string[]; storedIds: string[] };
export type RoomVoicePreferences = { version: 1; rooms: Record<RoomVoiceRoom, RoomVoiceSelection> };

export function defaultRoomVoicePreferences(): RoomVoicePreferences {
  return { version: 1, rooms: {
    // Expanding available loops must not select them automatically.
    training: { builtin: ["earLick", "trainingRhythm"], storedIds: [] },
    punishment: { builtin: ["nippleScratch", "sineW", "ikunaSine"], storedIds: [] },
    rhythm: { builtin: ["earLick", "sikosiko", "rhythmBeat"], storedIds: [] },
  } };
}

export function validRoomVoiceSelection(room: RoomVoiceRoom, value: unknown): value is RoomVoiceSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const selection = value as RoomVoiceSelection;
  const allowed: readonly string[] = ROOM_VOICE_BUILTINS[room];
  return Array.isArray(selection.builtin) && selection.builtin.length <= allowed.length
    && selection.builtin.every((name) => allowed.includes(name))
    && new Set(selection.builtin).size === selection.builtin.length
    && Array.isArray(selection.storedIds) && selection.storedIds.length <= 100
    && selection.storedIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 200)
    && new Set(selection.storedIds).size === selection.storedIds.length;
}

export function isRoomVoicePreferences(value: unknown): value is RoomVoicePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prefs = value as RoomVoicePreferences;
  return prefs.version === 1 && !!prefs.rooms && typeof prefs.rooms === "object"
    && ROOM_VOICE_ROOMS.every((room) => validRoomVoiceSelection(room, prefs.rooms[room]));
}

export function parseRoomVoicePreferences(raw: string | null): RoomVoicePreferences {
  if (raw === null) return defaultRoomVoicePreferences();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("ボイス設定を読み込めませんでした。再試行してください。"); }
  if (!isRoomVoicePreferences(parsed)) throw new Error("ボイス設定を読み込めませんでした。再試行してください。");
  return parsed;
}

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
export function createRoomVoicePreferenceStore(storage: Storage) {
  let snapshot = { preferences: defaultRoomVoicePreferences(), ready: false, error: null as string | null };
  const listeners = new Set<() => void>();
  let queue: Promise<unknown> = Promise.resolve();
  function publish(preferences: RoomVoicePreferences, ready: boolean, error: string | null) {
    snapshot = { preferences, ready, error };
    for (const listener of listeners) listener();
  }
  function run<T>(operation: () => Promise<T>) {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load() { return run(async () => {
      try {
        const value = parseRoomVoicePreferences(await storage.getItem(ROOM_VOICE_PREFERENCES_KEY));
        publish(value, true, null);
      } catch (error) {
        publish(snapshot.preferences, false, "ボイス設定を読み込めませんでした。再試行してください。");
        throw error;
      }
    }); },
    reset() { return run(async () => {
      const preferences = defaultRoomVoicePreferences();
      await storage.setItem(ROOM_VOICE_PREFERENCES_KEY, JSON.stringify(preferences));
      publish(preferences, true, null);
    }); },
    save(room: RoomVoiceRoom, selection: RoomVoiceSelection) {
      // Capture caller-owned arrays before entering the write queue.
      const nextSelection = { builtin: [...selection.builtin], storedIds: [...selection.storedIds] };
      return run(async () => {
        if (!validRoomVoiceSelection(room, nextSelection)) throw new Error("ボイス設定を保存できませんでした。選択内容を確認してください。");
        const current = parseRoomVoicePreferences(await storage.getItem(ROOM_VOICE_PREFERENCES_KEY));
        const next = { ...current, rooms: { ...current.rooms, [room]: nextSelection } };
        await storage.setItem(ROOM_VOICE_PREFERENCES_KEY, JSON.stringify(next));
        publish(next, true, null);
      });
    },
  };
}

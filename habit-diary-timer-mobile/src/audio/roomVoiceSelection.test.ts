import { describe, expect, it, vi } from "vitest";
import { createRoomVoicePreferenceStore, defaultRoomVoicePreferences, isRoomVoicePreferences, parseRoomVoicePreferences, ROOM_VOICE_PREFERENCES_KEY, ROOM_VOICE_ROOMS } from "./roomVoiceSelection";
import { loopAudioOptions } from "./loopAudioLabels";

function memoryStorage(initial: string | null = null) {
  let saved = initial;
  return { getItem: vi.fn(async () => saved), setItem: vi.fn(async (_key: string, value: string) => { saved = value; }), value: () => saved };
}

describe("room voice preferences", () => {
  it("checks the room defaults including ear licking and stroking in the challenge", () => {
    expect(parseRoomVoicePreferences(null)).toEqual({ version: 1, rooms: {
      training: { builtin: ["earLick", "trainingRhythm"], storedIds: [] },
      punishment: { builtin: ["nippleScratch", "sineW", "ikunaSine"], storedIds: [] },
      rhythm: { builtin: ["earLick", "sikosiko", "rhythmBeat"], storedIds: [] },
    } });
  });
  it("keeps empty selections instead of restoring default audio", () => {
    const preferences = defaultRoomVoicePreferences();
    preferences.rooms.training = { builtin: [], storedIds: [] };
    expect(parseRoomVoicePreferences(JSON.stringify(preferences)).rooms.training.builtin).toEqual([]);
    preferences.rooms.rhythm = { builtin: [], storedIds: ["saved-voice"] };
    expect(parseRoomVoicePreferences(JSON.stringify(preferences)).rooms.rhythm).toEqual({ builtin: [], storedIds: [] });
  });
  it.each(ROOM_VOICE_ROOMS)("saves all shared loop choices in %s and ignores obsolete stored choices", async (room) => {
    const storage = memoryStorage();
    const store = createRoomVoicePreferenceStore(storage);
    const selection = { builtin: loopAudioOptions.map(({ key }) => key), storedIds: ["saved-voice"] };
    await store.save(room, selection);
    await store.load();
    expect(store.getSnapshot().preferences.rooms[room]).toEqual({ ...selection, storedIds: [] });
    expect(JSON.parse(storage.value()!).rooms[room].storedIds).toEqual([]);
    for (const otherRoom of ROOM_VOICE_ROOMS.filter((name) => name !== room)) {
      expect(store.getSnapshot().preferences.rooms[otherRoom]).toEqual(defaultRoomVoicePreferences().rooms[otherRoom]);
    }
  });
  it("loads original loop selections without adding new loops or retaining stored choices", async () => {
    const original = { version: 1, rooms: {
      training: { builtin: ["earLick", "trainingRhythm"], storedIds: ["training-voice"] },
      punishment: { builtin: ["nippleScratch", "sineW", "ikunaSine"], storedIds: ["punishment-voice"] },
      rhythm: { builtin: ["rhythmBeat"], storedIds: ["rhythm-voice"] },
    } };
    const storage = memoryStorage(JSON.stringify(original));
    const store = createRoomVoicePreferenceStore(storage);
    await store.load();
    for (const room of ROOM_VOICE_ROOMS) {
      expect(store.getSnapshot().preferences.rooms[room]).toEqual({ builtin: original.rooms[room].builtin, storedIds: [] });
    }
    expect(storage.setItem).not.toHaveBeenCalled();
    await store.save("training", { builtin: ["breath"], storedIds: ["ignored"] });
    for (const room of ROOM_VOICE_ROOMS) {
      expect(JSON.parse(storage.value()!).rooms[room].storedIds).toEqual([]);
    }
    expect(original.rooms.training.storedIds).toEqual(["training-voice"]);
  });
  it("keeps rhythm effects exclusive to their original rooms", () => {
    for (const room of ROOM_VOICE_ROOMS) {
      for (const effect of ["trainingRhythm", "rhythmBeat"]) {
        const preferences = defaultRoomVoicePreferences();
        preferences.rooms[room].builtin = [effect];
        expect(isRoomVoicePreferences(preferences)).toBe(
          (room === "training" && effect === "trainingRhythm") || (room === "rhythm" && effect === "rhythmBeat"),
        );
      }
    }
  });
  it("rejects corrupt or unsupported data instead of overwriting it", () => {
    for (const raw of ["{", "null", "[]", '{"version":2}', '{"version":1,"rooms":{}}']) {
      expect(() => parseRoomVoicePreferences(raw)).toThrow();
    }
  });
  it("rejects voices from another room and duplicate IDs", () => {
    const preferences = defaultRoomVoicePreferences();
    preferences.rooms.rhythm.builtin = ["trainingRhythm"];
    expect(isRoomVoicePreferences(preferences)).toBe(false);
    preferences.rooms.rhythm.builtin = ["rhythmBeat", "rhythmBeat"];
    expect(isRoomVoicePreferences(preferences)).toBe(false);
    preferences.rooms.rhythm.builtin = [];
    preferences.rooms.rhythm.storedIds = ["voice", "voice"];
    expect(isRoomVoicePreferences(preferences)).toBe(false);
  });
  it("rejects excessive selections and malformed voice IDs", () => {
    const preferences = defaultRoomVoicePreferences();
    for (const ids of [[""], ["x".repeat(201)], Array.from({ length: 101 }, (_, n) => String(n))]) {
      preferences.rooms.rhythm.storedIds = ids;
      expect(isRoomVoicePreferences(preferences)).toBe(false);
    }
  });
  it("publishes only after a successful write and retains other rooms", async () => {
    const storage = memoryStorage();
    const store = createRoomVoicePreferenceStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    await store.load();
    await store.save("rhythm", { builtin: ["breath"], storedIds: [] });
    expect(storage.setItem).toHaveBeenCalledWith(ROOM_VOICE_PREFERENCES_KEY, expect.any(String));
    expect(store.getSnapshot().preferences.rooms.rhythm).toEqual({ builtin: ["breath"], storedIds: [] });
    expect(store.getSnapshot().preferences.rooms.training).toEqual(defaultRoomVoicePreferences().rooms.training);
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it("serializes simultaneous saves and copies caller-owned arrays", async () => {
    const storage = memoryStorage();
    const store = createRoomVoicePreferenceStore(storage);
    const selection = { builtin: ["breath"], storedIds: [] };
    const first = store.save("rhythm", selection);
    selection.builtin.push("earLick");
    const second = store.save("training", { builtin: ["earLick"], storedIds: [] });
    await Promise.all([first, second]);
    expect(store.getSnapshot().preferences.rooms.rhythm.builtin).toEqual(["breath"]);
    expect(store.getSnapshot().preferences.rooms.training.builtin).toEqual(["earLick"]);
  });
  it("retains the committed selection after write failure and allows retry", async () => {
    const storage = memoryStorage();
    const store = createRoomVoicePreferenceStore(storage);
    await store.load();
    storage.setItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(store.save("rhythm", { builtin: [], storedIds: [] })).rejects.toThrow("disk full");
    expect(store.getSnapshot().preferences.rooms.rhythm.builtin).toEqual(["earLick", "sikosiko", "rhythmBeat"]);
    await store.save("rhythm", { builtin: [], storedIds: [] });
    expect(store.getSnapshot().preferences.rooms.rhythm.builtin).toEqual([]);
  });
  it("does not write over invalid restored data", async () => {
    const storage = memoryStorage("invalid");
    const store = createRoomVoicePreferenceStore(storage);
    await expect(store.load()).rejects.toThrow();
    expect(store.getSnapshot().ready).toBe(false);
    expect(store.getSnapshot().error).not.toBeNull();
    await expect(store.save("rhythm", { builtin: [], storedIds: [] })).rejects.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("reloads external restored preferences and resets without stale cache", async () => {
    const storage = memoryStorage();
    const store = createRoomVoicePreferenceStore(storage);
    await store.load();
    const restored = defaultRoomVoicePreferences();
    restored.rooms.punishment = { builtin: ["breath"], storedIds: ["restored"] };
    await storage.setItem(ROOM_VOICE_PREFERENCES_KEY, JSON.stringify(restored));
    await store.load();
    expect(store.getSnapshot().preferences.rooms.punishment).toEqual({ builtin: ["breath"], storedIds: [] });
    await store.reset();
    expect(store.getSnapshot().preferences).toEqual(defaultRoomVoicePreferences());
    expect(JSON.parse(storage.value()!)).toEqual(defaultRoomVoicePreferences());
  });
});

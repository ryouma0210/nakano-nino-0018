import { describe, expect, it, vi } from "vitest";
import { loopAudioOptions } from "../../audio/loopAudioLabels";
import {
  copyTimerRoomAudioPreferences, createTimerRoomAudioPreferenceStore, defaultTimerRoomAudioPreferences,
  MAX_TIMER_ROOM_AUDIO_SETS, MAX_TIMER_ROOM_AUDIO_SET_NAME_LENGTH, parseTimerRoomAudioPreferences,
  TIMER_ROOM_AUDIO_KEY, TIMER_ROOM_AUDIO_OPTIONS, timerRoomAudioNames, timerRoomAudioSetIndex,
  timerRoomAudioSwitchSeconds, toggleTimerRoomAudio, validTimerRoomAudioSets, type TimerRoomAudioPreferences,
} from "./audio";

describe("timer room audio", () => {
  it("uses the shared loop catalog and the existing default source", () => {
    expect(TIMER_ROOM_AUDIO_OPTIONS).toBe(loopAudioOptions);
    const defaults = defaultTimerRoomAudioPreferences();
    expect(defaults).toMatchObject({ version: 3, mode: "auto", manual: ["earLick"] });
    expect(defaults.sets[0]).toEqual({ name: "", voices: ["earLick"] });
    expect(defaults.sets).toHaveLength(TIMER_ROOM_AUDIO_OPTIONS.length);
    expect(defaults.sets.every(({ name, voices }) => name === "" && voices.length === 1)).toBe(true);
    expect(new Set(defaults.sets.flatMap(({ voices }) => voices))).toEqual(new Set(TIMER_ROOM_AUDIO_OPTIONS.map(({ key }) => key)));
    expect(validTimerRoomAudioSets(defaults.sets)).toBe(true);
  });

  it("selects a stable random sound for each minute without relying on interval ticks", () => {
    const preferences = defaultTimerRoomAudioPreferences(), startedAt = 1_000_000;
    expect(timerRoomAudioNames(preferences, startedAt, startedAt)).toEqual(["earLick"]);
    expect(timerRoomAudioNames(preferences, startedAt, startedAt + 59_999)).toEqual(["earLick"]);
    const minute14 = timerRoomAudioNames(preferences, startedAt, startedAt + 14 * 60_000);
    const reloaded = parseTimerRoomAudioPreferences(JSON.stringify(preferences));
    expect(timerRoomAudioNames(reloaded, startedAt, startedAt + 14 * 60_000 + 30_000)).toEqual(minute14);
    expect(timerRoomAudioNames(reloaded, startedAt, startedAt + 14 * 60_000 + 59_999)).toEqual(minute14);
    expect(timerRoomAudioSwitchSeconds(startedAt, startedAt + 14 * 60_000 + 30_000)).toBe(30);
  });

  it("randomly uses the whole catalog without adjacent repeats and varies between sessions", () => {
    const preferences = defaultTimerRoomAudioPreferences();
    const playlists = [1_000_000, 1_000_001, 1_876_543_210_123].map((startedAt) => {
      const playlist = Array.from({ length: 300 }, (_, minute) => timerRoomAudioNames(preferences, startedAt, startedAt + minute * 60_000)[0]);
      for (let index = 1; index < playlist.length; index++) expect(playlist[index]).not.toBe(playlist[index - 1]);
      expect(new Set(playlist)).toEqual(new Set(TIMER_ROOM_AUDIO_OPTIONS.map(({ key }) => key)));
      expect(playlist.some((value, index) => index >= 10 && value !== playlist[index - 10])).toBe(true);
      return playlist;
    });
    expect(playlists[0]).not.toEqual(playlists[1]);
    expect(playlists[1]).not.toEqual(playlists[2]);
  });

  it("resolves an old session directly and can return to a prior interval", () => {
    const preferences = defaultTimerRoomAudioPreferences(), startedAt = 1_000_000;
    const original = timerRoomAudioNames(preferences, startedAt, startedAt + 75_000);
    const future = timerRoomAudioNames(preferences, startedAt, Number.MAX_SAFE_INTEGER);
    expect(future).toHaveLength(1);
    expect(TIMER_ROOM_AUDIO_OPTIONS.map(({ key }) => key)).toContain(future[0]);
    expect(timerRoomAudioNames(preferences, startedAt, Number.MAX_SAFE_INTEGER)).toEqual(future);
    expect(timerRoomAudioNames(preferences, startedAt, startedAt + 75_000)).toEqual(original);
  });

  it("plays every voice in an automatic set and restores the same set after reload", () => {
    const preferences: TimerRoomAudioPreferences = { ...defaultTimerRoomAudioPreferences(), sets: [
      { name: "A", voices: ["earLick", "breath"] },
      { name: "B", voices: ["breath"] },
      { name: "C", voices: ["earLick"] },
    ] };
    const start = 123456;
    const reloaded = parseTimerRoomAudioPreferences(JSON.stringify(preferences));
    expect(timerRoomAudioNames(preferences, start, start)).toEqual(["earLick", "breath"]);
    let previous = -1;
    for (let minute = 0; minute < 200; minute++) {
      const index = timerRoomAudioSetIndex(preferences, start, start + minute * 60000);
      expect(index).not.toBe(previous);
      expect(timerRoomAudioSetIndex(reloaded, start, start + minute * 60000 + 59999)).toBe(index);
      expect(timerRoomAudioNames(reloaded, start, start + minute * 60000 + 30000)).toEqual(preferences.sets[index].voices);
      previous = index;
    }
    const names = timerRoomAudioNames(preferences, start, start);
    names.pop();
    expect(preferences.sets[0].voices).toEqual(["earLick", "breath"]);
  });

  it("holds one set and alternates two sets without repeating or losing voices", () => {
    const one: TimerRoomAudioPreferences = { ...defaultTimerRoomAudioPreferences(), sets: [{ name: "A", voices: ["earLick", "breath"] }] };
    const two: TimerRoomAudioPreferences = { ...one, sets: [...one.sets, { name: "B", voices: ["breath"] }] };
    for (let minute = 0; minute < 100; minute++) {
      expect(timerRoomAudioSetIndex(one, 12345, 12345 + minute * 60000)).toBe(0);
      expect(timerRoomAudioNames(one, 12345, 12345 + minute * 60000)).toEqual(["earLick", "breath"]);
      expect(timerRoomAudioSetIndex(two, 12345, 12345 + minute * 60000)).toBe(minute % 2);
      expect(timerRoomAudioNames(two, 12345, 12345 + minute * 60000)).toEqual(two.sets[minute % 2].voices);
    }
  });

  it("supports multiple manual choices and an empty selection without automatic additions", () => {
    const preferences: TimerRoomAudioPreferences = { ...defaultTimerRoomAudioPreferences(), mode: "manual", manual: ["earLick", "breath"] };
    for (const now of [0, 60_000, 120_000, 60 * 60_000]) expect(timerRoomAudioNames(preferences, 0, now)).toEqual(preferences.manual);
    const result = timerRoomAudioNames(preferences, 0, 0);
    result.pop();
    expect(preferences.manual).toHaveLength(2);
    expect(timerRoomAudioNames({ ...preferences, manual: [] }, 0, 60_000)).toEqual([]);
  });

  it("switches a checkbox draft from auto to manual without changing committed choices", () => {
    const committed = defaultTimerRoomAudioPreferences();
    const draft = toggleTimerRoomAudio(committed, "breath", 0, 0);
    expect(draft).toEqual({ ...committed, mode: "manual", manual: ["earLick", "breath"] });
    expect(toggleTimerRoomAudio(committed, "earLick", 0, 0)).toEqual({ ...committed, mode: "manual", manual: [] });
    expect(toggleTimerRoomAudio(draft, "earLick", 0, 60_000)).toEqual({ ...committed, mode: "manual", manual: ["breath"] });
    expect(committed).toEqual(defaultTimerRoomAudioPreferences());
    const copied = copyTimerRoomAudioPreferences(draft);
    copied.manual.pop();
    expect(draft.manual).toHaveLength(2);
  });

  it("deep copies every nested set and keeps automatic groups when editing manual choices", () => {
    const original = defaultTimerRoomAudioPreferences();
    original.sets = [{ name: " A ", voices: ["earLick", "breath"] }];
    const copied = copyTimerRoomAudioPreferences(original);
    expect(copied).toEqual(original);
    copied.sets[0].name = "copy";
    copied.sets[0].voices.pop();
    copied.sets.push({ name: "second", voices: ["breath"] });
    expect(original.sets).toEqual([{ name: " A ", voices: ["earLick", "breath"] }]);
    const toggled = toggleTimerRoomAudio(original, "earLick", 1000, 1000);
    expect(toggled.mode).toBe("manual");
    expect(toggled.manual).toEqual(["breath"]);
    expect(toggled.sets).toEqual(original.sets);
    toggled.sets[0].voices.pop();
    expect(original.sets[0].voices).toHaveLength(2);
    const firstDefaults = defaultTimerRoomAudioPreferences();
    firstDefaults.sets[0].voices.pop();
    expect(defaultTimerRoomAudioPreferences().sets[0].voices).toEqual(["earLick"]);
  });

  it("handles missing start times, backward clocks and exact minute boundaries", () => {
    const preferences = defaultTimerRoomAudioPreferences();
    for (const startedAt of [null, NaN, Infinity, 500_000]) {
      expect(timerRoomAudioNames(preferences, startedAt, 0)).toEqual(["earLick"]);
      expect(timerRoomAudioSwitchSeconds(startedAt, 0)).toBe(60);
    }
    expect(timerRoomAudioSwitchSeconds(0, 59_001)).toBe(1);
    expect(timerRoomAudioSwitchSeconds(0, 60_000)).toBe(60);
    expect(timerRoomAudioNames(preferences, 0, Infinity)).toEqual(["earLick"]);
  });

  it.each(["auto", "manual"])("migrates earlier noise preferences while preserving %s mode", (mode) => {
    for (const manual of ["white", "pink", "brown"]) {
      expect(parseTimerRoomAudioPreferences(JSON.stringify({ version: 1, mode, manual })))
        .toEqual({ ...defaultTimerRoomAudioPreferences(), mode });
    }
  });

  it("migrates v2 multiple or empty manual choices with singleton automatic sets", () => {
    for (const mode of ["auto", "manual"]) for (const manual of [[], ["earLick", "breath"]]) {
      const legacy = { version: 2, mode, manual };
      expect(parseTimerRoomAudioPreferences(JSON.stringify(legacy))).toEqual({ ...defaultTimerRoomAudioPreferences(), mode, manual });
    }
  });

  it("rejects malformed versions, duplicates and unknown sources", () => {
    for (const raw of [null, "{", "[]", "null", "true", '{"version":3}',
      '{"version":2,"mode":"auto","manual":"earLick"}',
      '{"version":2,"mode":"manual","manual":["unknown"]}',
      '{"version":2,"mode":"manual","manual":["earLick","earLick"]}']) {
      expect(parseTimerRoomAudioPreferences(raw)).toEqual(defaultTimerRoomAudioPreferences());
    }
  });

  it("validates set limits, unique known voices and names while allowing unnamed sets", () => {
    const valid = { name: "", voices: ["earLick", "breath"] };
    const fullCatalog = { name: "A".repeat(MAX_TIMER_ROOM_AUDIO_SET_NAME_LENGTH), voices: TIMER_ROOM_AUDIO_OPTIONS.map(({ key }) => key) };
    expect(validTimerRoomAudioSets([valid])).toBe(true);
    expect(validTimerRoomAudioSets([fullCatalog])).toBe(true);
    expect(validTimerRoomAudioSets(Array.from({ length: MAX_TIMER_ROOM_AUDIO_SETS }, () => valid))).toBe(true);
    const invalid = [
      null, {}, [], Array(1), [null], [false], [[]],
      Array.from({ length: MAX_TIMER_ROOM_AUDIO_SETS + 1 }, () => valid),
      [{ name: 1, voices: ["earLick"] }], [{ voices: ["earLick"] }],
      [{ name: "A".repeat(MAX_TIMER_ROOM_AUDIO_SET_NAME_LENGTH + 1), voices: ["earLick"] }],
      [{ name: "", voices: [] }], [{ name: "", voices: "earLick" }], [{ name: "", voices: Array(1) }],
      [{ name: "", voices: ["unknown"] }], [{ name: "", voices: ["earLick", "earLick"] }],
    ];
    for (const sets of invalid) {
      expect(validTimerRoomAudioSets(sets)).toBe(false);
      expect(parseTimerRoomAudioPreferences(JSON.stringify({ ...defaultTimerRoomAudioPreferences(), mode: "manual", sets })))
        .toEqual(defaultTimerRoomAudioPreferences());
    }
  });

  it("loads v3 grouped and empty manual selections and normalizes only saved names", () => {
    const preferences: TimerRoomAudioPreferences = { version: 3, mode: "manual", manual: [], sets: [
      { name: "  A  ", voices: ["earLick", "breath"] }, { name: "   ", voices: ["breath"] },
    ] };
    expect(parseTimerRoomAudioPreferences(JSON.stringify(preferences))).toEqual({ ...preferences, sets: [
      { name: "A", voices: ["earLick", "breath"] }, { name: "", voices: ["breath"] },
    ] });
    expect(preferences.sets[0].name).toBe("  A  ");
    expect(timerRoomAudioNames({ ...preferences, mode: "auto", sets: [] }, 0, 60000)).toEqual([]);
  });

  it("serializes rapid saves and captures nested sets before asynchronous writes", async () => {
    let raw: string | null = null;
    const storage = { getItem: vi.fn(async () => raw), setItem: vi.fn(async (_key: string, value: string) => { raw = value; }) };
    const store = createTimerRoomAudioPreferenceStore(storage);
    const first: TimerRoomAudioPreferences = { ...defaultTimerRoomAudioPreferences(), mode: "manual", manual: ["breath"], sets: [{ name: "  A  ", voices: ["earLick", "breath"] }] };
    const second: TimerRoomAudioPreferences = { ...defaultTimerRoomAudioPreferences(), mode: "manual", manual: ["earLick"] };
    const a = store.save(first), b = store.save(second);
    first.manual.push("earLick");
    first.sets[0].name = "mutated";
    first.sets[0].voices.pop();
    first.sets.push({ name: "later", voices: ["breath"] });
    await Promise.all([a, b]);
    expect(await store.load()).toEqual(second);
    expect(JSON.parse(storage.setItem.mock.calls[0][1]).manual).toEqual(["breath"]);
    expect(JSON.parse(storage.setItem.mock.calls[0][1]).sets).toEqual([{ name: "A", voices: ["earLick", "breath"] }]);
    expect(storage.setItem.mock.calls.map(([key]) => key)).toEqual([TIMER_ROOM_AUDIO_KEY, TIMER_ROOM_AUDIO_KEY]);
  });

  it("preserves saved choices after a failed save and allows retry", async () => {
    const original = defaultTimerRoomAudioPreferences();
    let raw = JSON.stringify(original);
    const storage = { getItem: vi.fn(async () => raw), setItem: vi.fn(async (_key: string, value: string) => { raw = value; }) };
    storage.setItem.mockRejectedValueOnce(new Error("full"));
    const store = createTimerRoomAudioPreferenceStore(storage);
    const draft: TimerRoomAudioPreferences = { ...defaultTimerRoomAudioPreferences(), mode: "manual", manual: ["breath"] };
    await expect(store.save(draft)).rejects.toThrow("full");
    expect(await store.load()).toEqual(original);
    expect(await store.save(draft)).toEqual(draft);
    expect(await store.load()).toEqual(draft);
    storage.getItem.mockRejectedValueOnce(new Error("unavailable"));
    await expect(store.load()).rejects.toThrow("unavailable");
  });

  it("rejects invalid choices without writing storage", async () => {
    const storage = { getItem: vi.fn(async () => null), setItem: vi.fn(async () => {}) };
    const store = createTimerRoomAudioPreferenceStore(storage);
    const invalid = { ...defaultTimerRoomAudioPreferences(), mode: "manual", manual: ["unknown"] } as unknown as TimerRoomAudioPreferences;
    await expect(store.save(invalid)).rejects.toThrow();
    for (const sets of [[], [{ name: "", voices: [] }], [{ name: "", voices: ["unknown"] }]]) {
      await expect(store.save({ ...defaultTimerRoomAudioPreferences(), sets } as unknown as TimerRoomAudioPreferences)).rejects.toThrow();
    }
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

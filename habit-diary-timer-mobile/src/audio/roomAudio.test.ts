import { describe, expect, it } from "vitest";
import { getRoomAudioTracks, type RoomAudioScene } from "./roomAudio";
import { defaultRoomVoicePreferences, ROOM_VOICE_ROOMS } from "./roomVoiceSelection";
import { loopAudioOptions } from "./loopAudioLabels";

const settings = {
  soundEnabled: true,
  soundVolume: 0.7,
  backgroundMusicEnabled: true,
  musicVolume: 0.35,
};
const scenes: RoomAudioScene[] = ["preparation", "sugoroku", "sugoroku-zone", "sugoroku-penalty", "othello-temptation", "endurance", "endurance-recovery", "punishment", "training", "rhythm", "rhythm-finished"];

describe("room audio", () => {
  it("uses only the selected standard voices and leaves a silent selection silent", () => {
    const preferences = defaultRoomVoicePreferences();
    preferences.rooms.punishment.builtin = ["sineW"];
    expect(getRoomAudioTracks("punishment", settings, true, [], preferences)).toEqual([{ name: "sineW", volume: 0.7 }]);
    preferences.rooms.punishment.builtin = [];
    expect(getRoomAudioTracks("punishment", settings, true, [], preferences)).toEqual([]);
    expect(getRoomAudioTracks("training", settings, true, [], preferences)).toEqual([{ name: "earLick", volume: 0.7 }]);
    expect(getRoomAudioTracks("training", settings, true, ["earLick"], preferences)).toEqual([]);
    preferences.rooms.training.builtin = ["trainingRhythm"];
    expect(getRoomAudioTracks("training", settings, true, [], preferences)).toEqual([]);
  });

  it("starts challenge loops with its default voices while retaining an explicit empty selection", () => {
    const expected = [{ name: "earLick", volume: 0.7 }, { name: "sikosiko", volume: 0.7 }];
    expect(getRoomAudioTracks("rhythm", settings, true)).toEqual(expected);
    const preferences = defaultRoomVoicePreferences();
    expect(getRoomAudioTracks("rhythm", settings, true, [], preferences)).toEqual(expected);
    preferences.rooms.rhythm.builtin = [];
    expect(getRoomAudioTracks("rhythm", settings, true, [], preferences)).toEqual([]);
  });

  it("uses the completion voice alone when the challenge has finished", () => {
    const expected = [{ name: "ejaculation", volume: 0.7 }];
    expect(getRoomAudioTracks("rhythm-finished", settings, true)).toEqual(expected);
    const preferences = defaultRoomVoicePreferences();
    preferences.rooms.rhythm = { builtin: [], storedIds: [] };
    expect(getRoomAudioTracks("rhythm-finished", settings, true, [], preferences)).toEqual(expected);
  });

  it.each([
    { resting: false, interruptions: 0 },
    { resting: false, interruptions: 10 },
    { resting: true, interruptions: 20 },
  ])("replaces selected and automatic challenge voices on finish, previous state=%j", (previous) => {
    const preferences = defaultRoomVoicePreferences();
    preferences.rooms.rhythm = { builtin: [...loopAudioOptions.map(({ key }) => key), "rhythmBeat"], storedIds: ["stored-voice"] };
    const original = structuredClone(preferences);
    expect(getRoomAudioTracks("rhythm-finished", settings, true, loopAudioOptions.map(({ key }) => key), preferences, previous))
      .toEqual([{ name: "ejaculation", volume: 0.7 }]);
    expect(preferences).toEqual(original);
  });

  it("applies sound volume and visibility to the completion voice without starting background music", () => {
    expect(getRoomAudioTracks("rhythm-finished", { ...settings, soundVolume: 0 }, true)).toEqual([{ name: "ejaculation", volume: 0 }]);
    expect(getRoomAudioTracks("rhythm-finished", { ...settings, soundVolume: 0.2, musicVolume: 1 }, true)).toEqual([{ name: "ejaculation", volume: 0.2 }]);
    expect(getRoomAudioTracks("rhythm-finished", { ...settings, soundEnabled: false }, true)).toEqual([]);
    expect(getRoomAudioTracks("rhythm-finished", settings, false)).toEqual([]);
    expect(getRoomAudioTracks("rhythm-finished", null, true)).toEqual([]);
    expect(getRoomAudioTracks(null, settings, true)).toEqual([]);
  });

  it.each([9, 10, 11])("adds the automatic fast voice at ten without changing saved choices, count=%i", (interruptions) => {
    const preferences = defaultRoomVoicePreferences();
    const original = structuredClone(preferences);
    const tracks = getRoomAudioTracks("rhythm", settings, true, [], preferences, { resting: false, interruptions });
    expect(tracks).toEqual(expect.arrayContaining([{ name: "earLick", volume: 0.7 }, { name: "sikosiko", volume: 0.7 }]));
    expect(tracks.filter(({ name }) => name === "kousokusikosiko")).toEqual(interruptions < 10 ? [] : [{ name: "kousokusikosiko", volume: 0.7 }]);
    expect(tracks.some(({ name }) => name === "kousokutikubikarikari")).toBe(false);
    expect(preferences).toEqual(original);
  });

  it.each([9, 10])("plays only the rest voice and keeps other players paused for resume, count=%i", (interruptions) => {
    const preferences = defaultRoomVoicePreferences();
    const original = structuredClone(preferences);
    const running = getRoomAudioTracks("rhythm", settings, true, [], preferences, { resting: false, interruptions });
    const resting = getRoomAudioTracks("rhythm", settings, true, [], preferences, { resting: true, interruptions });
    expect(resting.filter((track) => !track.paused)).toEqual([{ name: "kousokutikubikarikari", volume: 0.7 }]);
    for (const track of running) {
      expect(resting.find(({ name }) => name === track.name)).toEqual({ ...track, paused: true });
    }
    expect(getRoomAudioTracks("rhythm", settings, true, [], preferences, { resting: false, interruptions })).toEqual(running);
    expect(preferences).toEqual(original);
  });

  it("does not duplicate manually selected automatic voices or remove a saved rest voice after resuming", () => {
    const preferences = defaultRoomVoicePreferences();
    preferences.rooms.rhythm.builtin.push("kousokutikubikarikari", "kousokusikosiko");
    const original = structuredClone(preferences);
    for (const resting of [true, false]) {
      const tracks = getRoomAudioTracks("rhythm", settings, true, [], preferences, { resting, interruptions: 10 });
      expect(tracks.filter(({ name }) => name === "kousokutikubikarikari")).toEqual([{ name: "kousokutikubikarikari", volume: 0.7 }]);
      expect(tracks.filter(({ name }) => name === "kousokusikosiko")).toHaveLength(1);
      expect(new Set(tracks.map(({ name }) => name)).size).toBe(tracks.length);
    }
    expect(preferences).toEqual(original);
  });

  it("still respects mute, background, exit, zero volume, and other rooms during automation", () => {
    const preferences = defaultRoomVoicePreferences();
    const automatic = { resting: true, interruptions: 10 };
    expect(getRoomAudioTracks("rhythm", { ...settings, soundEnabled: false }, true, [], preferences, automatic)).toEqual([]);
    expect(getRoomAudioTracks("rhythm", settings, false, [], preferences, automatic)).toEqual([]);
    expect(getRoomAudioTracks(null, settings, true, [], preferences, automatic)).toEqual([]);
    expect(getRoomAudioTracks("rhythm", null, true, [], preferences, automatic)).toEqual([]);
    expect(getRoomAudioTracks("rhythm", { ...settings, soundVolume: 0 }, true, [], preferences, automatic).every(({ volume }) => volume === 0)).toBe(true);
    for (const room of ["training", "punishment"] as const) {
      expect(getRoomAudioTracks(room, settings, true, [], preferences, automatic)).toEqual(getRoomAudioTracks(room, settings, true, [], preferences));
    }
  });

  it("uses automatic choices without persisting them even when the base selection is empty", () => {
    const preferences = defaultRoomVoicePreferences();
    preferences.rooms.rhythm.builtin = [];
    expect(getRoomAudioTracks("rhythm", settings, true, [], preferences, { resting: false, interruptions: 10 })).toEqual([{ name: "kousokusikosiko", volume: 0.7 }]);
    const resting = getRoomAudioTracks("rhythm", settings, true, [], preferences, { resting: true, interruptions: 9 });
    expect(resting).toEqual([{ name: "kousokutikubikarikari", volume: 0.7 }]);
    expect(preferences.rooms.rhythm.builtin).toEqual([]);
  });

  it("does not layer the preparation alias over a manually playing breath loop", () => {
    expect(getRoomAudioTracks("preparation", settings, true, ["breath"])).toEqual([{ name: "bokkisiro", volume: 0.7 }]);
    expect(getRoomAudioTracks("preparation", settings, true, ["breath", "bokkisiro"])).toEqual([]);
    const preferences = defaultRoomVoicePreferences();
    preferences.rooms.rhythm.builtin = ["breath"];
    expect(getRoomAudioTracks("rhythm", settings, true, ["breath"], preferences)).toEqual([]);
  });

  it.each(ROOM_VOICE_ROOMS)("plays every loop option in %s only when selected", (room) => {
    const preferences = defaultRoomVoicePreferences();
    for (const { key } of loopAudioOptions) {
      preferences.rooms[room].builtin = [key];
      expect(getRoomAudioTracks(room, settings, true, [], preferences)).toEqual([{ name: key, volume: 0.7 }]);
    }
    preferences.rooms[room].builtin = ["dase", "earLick", "kousokusikosiko"];
    expect(getRoomAudioTracks(room, settings, true, [], preferences)).toEqual([
      { name: "earLick", volume: 0.7 },
      { name: "kousokusikosiko", volume: 0.7 },
      { name: "dase", volume: 0.7 },
    ]);
    preferences.rooms[room].builtin = [];
    expect(getRoomAudioTracks(room, settings, true, [], preferences)).toEqual([]);
  });

  it.each(ROOM_VOICE_ROOMS)("applies mute, background, exit, and manual loop rules to selected %s loops", (room) => {
    const preferences = defaultRoomVoicePreferences();
    preferences.rooms[room].builtin = ["earLick", "dase"];
    expect(getRoomAudioTracks(room, settings, true, ["earLick"], preferences)).toEqual([{ name: "dase", volume: 0.7 }]);
    expect(getRoomAudioTracks(room, { ...settings, soundEnabled: false }, true, [], preferences)).toEqual([]);
    expect(getRoomAudioTracks(room, settings, false, [], preferences)).toEqual([]);
    expect(getRoomAudioTracks(null, settings, true, [], preferences)).toEqual([]);
    expect(getRoomAudioTracks(room, { ...settings, soundVolume: 0 }, true, [], preferences)).toEqual([
      { name: "earLick", volume: 0 }, { name: "dase", volume: 0 },
    ]);
  });

  it("owns the three punishment voices separately from the manual mix", () => {
    expect(getRoomAudioTracks("punishment", settings, true)).toEqual([
      { name: "nippleScratch", volume: 0.7 },
      { name: "sineW", volume: 0.7 },
      { name: "ikunaSine", volume: 0.7 },
    ]);
  });

  it("leaves a manually playing voice alone and restores only its room copy when manual playback stops", () => {
    expect(getRoomAudioTracks("punishment", settings, true, ["nippleScratch", "sineW", "ikunaSine", "dase"])).toEqual([]);
    expect(getRoomAudioTracks("punishment", settings, true, ["nippleScratch", "ikunaSine", "dase"])).toEqual([
      { name: "sineW", volume: 0.7 },
    ]);
    expect(getRoomAudioTracks(null, settings, true, ["nippleScratch", "ikunaSine", "dase"])).toEqual([]);
  });

  it("avoids duplicate manual voices in other rooms without removing their own music", () => {
    expect(getRoomAudioTracks("preparation", settings, true, ["bokkisiro"])).toEqual([
      { name: "preparation", volume: 0.7 },
    ]);
    expect(getRoomAudioTracks("othello-temptation", settings, true, ["earLick", "sikosiko"])).toEqual([
      { name: "penaltyBgm", volume: 0.35 },
    ]);
  });

  it("plays the two endurance voices together", () => {
    expect(getRoomAudioTracks("endurance", settings, true)).toEqual([
      { name: "earLick", volume: 0.7 },
      { name: "bokkisiro", volume: 0.7 },
    ]);
  });
  it("replaces only the endurance recovery overlay, with no added music", () => {
    expect(getRoomAudioTracks("endurance-recovery", settings, true)).toEqual([
      { name: "earLick", volume: 0.7 },
      { name: "ikunaSine", volume: 0.7 },
    ]);
    expect(getRoomAudioTracks("endurance-recovery", { ...settings, soundVolume: 0 }, true)).toEqual([
      { name: "earLick", volume: 0 },
      { name: "ikunaSine", volume: 0 },
    ]);
  });
  it("adds the preparation voice while retaining the existing preparation loop", () => {
    expect(getRoomAudioTracks("preparation", settings, true)).toEqual([
      { name: "preparation", volume: 0.7 },
      { name: "bokkisiro", volume: 0.7 },
    ]);
  });

  it("keeps the base sugoroku voice and replaces the zone overlay with the penalty voices", () => {
    const route: RoomAudioScene[] = ["sugoroku", "sugoroku-zone", "sugoroku-penalty", "sugoroku"];
    expect(route.map((scene) => getRoomAudioTracks(scene, settings, true))).toEqual([
      [{ name: "earLick", volume: 0.7 }],
      [{ name: "earLick", volume: 0.7 }, { name: "ikunaSine", volume: 0.7 }],
      [
        { name: "earLick", volume: 0.7 },
        { name: "sineW", volume: 0.7 },
        { name: "penaltyBgm", volume: 0.35 },
      ],
      [{ name: "earLick", volume: 0.7 }],
    ]);
  });

  it("adds the othello voice overlay alongside the existing base voice and music", () => {
    expect(getRoomAudioTracks("othello-temptation", settings, true)).toEqual([
      { name: "earLick", volume: 0.7 },
      { name: "sikosiko", volume: 0.7 },
      { name: "penaltyBgm", volume: 0.35 },
    ]);
  });

  it("disables voices independently while retaining enabled penalty music", () => {
    const mutedVoices = { ...settings, soundEnabled: false };
    expect(scenes.map((scene) => getRoomAudioTracks(scene, mutedVoices, true))).toEqual([
      [], [], [], [{ name: "penaltyBgm", volume: 0.35 }], [{ name: "penaltyBgm", volume: 0.35 }], [], [], [], [], [], [],
    ]);
  });

  it("disables music independently without removing room voices", () => {
    const mutedMusic = { ...settings, backgroundMusicEnabled: false };
    expect(getRoomAudioTracks("sugoroku-penalty", mutedMusic, true)).toEqual([
      { name: "earLick", volume: 0.7 },
      { name: "sineW", volume: 0.7 },
    ]);
    expect(getRoomAudioTracks("othello-temptation", mutedMusic, true)).toEqual([
      { name: "earLick", volume: 0.7 },
      { name: "sikosiko", volume: 0.7 },
    ]);
    for (const scene of scenes.filter((name) => name !== "sugoroku-penalty" && name !== "othello-temptation")) {
      expect(getRoomAudioTracks(scene, mutedMusic, true)).toEqual(getRoomAudioTracks(scene, settings, true));
    }
  });

  it("returns no room audio when both audio settings are disabled", () => {
    const muted = { ...settings, soundEnabled: false, backgroundMusicEnabled: false };
    for (const scene of scenes) expect(getRoomAudioTracks(scene, muted, true)).toEqual([]);
  });

  it("uses separate voice and music volumes, including zero", () => {
    expect(getRoomAudioTracks("sugoroku-penalty", { ...settings, soundVolume: 0, musicVolume: 0.8 }, true)).toEqual([
      { name: "earLick", volume: 0 },
      { name: "sineW", volume: 0 },
      { name: "penaltyBgm", volume: 0.8 },
    ]);
    expect(getRoomAudioTracks("sugoroku-penalty", { ...settings, soundVolume: 0.2, musicVolume: 0 }, true)).toEqual([
      { name: "earLick", volume: 0.2 },
      { name: "sineW", volume: 0.2 },
      { name: "penaltyBgm", volume: 0 },
    ]);
    expect(getRoomAudioTracks("othello-temptation", { ...settings, soundVolume: 0, musicVolume: 0.8 }, true)).toEqual([
      { name: "earLick", volume: 0 },
      { name: "sikosiko", volume: 0 },
      { name: "penaltyBgm", volume: 0.8 },
    ]);
    expect(getRoomAudioTracks("othello-temptation", { ...settings, soundVolume: 0.2, musicVolume: 0 }, true)).toEqual([
      { name: "earLick", volume: 0.2 },
      { name: "sikosiko", volume: 0.2 },
      { name: "penaltyBgm", volume: 0 },
    ]);
  });

  it("stops all room audio in the background or without a focused scene or loaded settings", () => {
    expect(getRoomAudioTracks(null, settings, true)).toEqual([]);
    for (const scene of scenes) {
      expect(getRoomAudioTracks(scene, null, true)).toEqual([]);
      expect(getRoomAudioTracks(scene, settings, false)).toEqual([]);
    }
  });
});

import { describe, expect, it } from "vitest";
import { getRoomAudioTracks, type RoomAudioScene } from "./roomAudio";

const settings = {
  soundEnabled: true,
  soundVolume: 0.7,
  backgroundMusicEnabled: true,
  musicVolume: 0.35,
};
const scenes: RoomAudioScene[] = ["preparation", "sugoroku", "sugoroku-zone", "sugoroku-penalty", "othello-temptation", "endurance", "endurance-recovery"];

describe("room audio", () => {
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
      [], [], [], [{ name: "penaltyBgm", volume: 0.35 }], [{ name: "penaltyBgm", volume: 0.35 }], [], [],
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

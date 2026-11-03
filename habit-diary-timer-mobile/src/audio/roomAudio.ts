import type { AppSettings } from "@/types/models";
import type { LoopAudioName } from "./AudioProvider";
import type { RoomVoicePreferences } from "./roomVoiceSelection";
import { loopAudioOptions } from "./loopAudioLabels";
import { automaticRhythmVoices, RHYTHM_REST_VOICE, type RhythmVoicePlaybackState } from "./rhythmVoicePlayback";

export type RoomAudioScene = "preparation" | "punishment" | "training" | "rhythm" | "rhythm-finished" | "sugoroku" | "sugoroku-zone" | "sugoroku-penalty" | "othello-temptation" | "endurance" | "endurance-recovery";
export type RoomAudioTrackName = LoopAudioName | "preparation" | "penaltyBgm" | "ejaculation";
export type RoomAudioTrack = { name: RoomAudioTrackName; volume: number; paused?: boolean };
type AudioSettings = Pick<AppSettings, "soundEnabled" | "soundVolume" | "backgroundMusicEnabled" | "musicVolume">;

export function getRoomAudioTracks(
  scene: RoomAudioScene | null,
  settings: AudioSettings | null,
  appIsActive: boolean,
  manualLoopNames: readonly LoopAudioName[] = [],
  preferences?: RoomVoicePreferences,
  rhythmVoices?: RhythmVoicePlaybackState | null,
): RoomAudioTrack[] {
  if (!scene || !settings || !appIsActive) return [];
  if (scene === "rhythm-finished") {
    return settings.soundEnabled ? [{ name: "ejaculation", volume: settings.soundVolume }] : [];
  }
  const tracks: RoomAudioTrack[] = [];
  if (settings.soundEnabled) {
    const defaults: RoomAudioTrackName[] = scene === "rhythm" ? ["earLick", "sikosiko"] : scene === "training" ? ["earLick"] : scene === "punishment"
      ? ["nippleScratch", "sineW", "ikunaSine"]
      : scene === "preparation"
        ? ["preparation", "bokkisiro"]
        : scene === "endurance"
          ? ["earLick", "bokkisiro"]
          : scene === "sugoroku-zone" || scene === "endurance-recovery"
            ? ["earLick", "ikunaSine"]
            : scene === "sugoroku-penalty"
              ? ["earLick", "sineW"]
              : scene === "othello-temptation"
                ? ["earLick", "sikosiko"]
                : ["earLick"];
    const selection = scene === "training" || scene === "punishment" || scene === "rhythm" ? preferences?.rooms[scene] : undefined;
    // All configurable rooms use the shared loop catalog, retaining their
    // original defaults until preferences are available.
    const selectedNames = new Set<string>(selection?.builtin ?? defaults);
    if (scene === "rhythm") automaticRhythmVoices(rhythmVoices).forEach((name) => selectedNames.add(name));
    const voices = selection || scene === "rhythm"
      ? loopAudioOptions.filter(({ key }) => selectedNames.has(key)).map(({ key }) => key)
      : defaults;
    // A manually selected voice keeps its own player and playback position.
    // Do not layer a second copy of that voice from the room over it.
    voices.filter((name) => !manualLoopNames.some((manualName) => manualName === name || (name === "preparation" && manualName === "breath")))
      .forEach((name) => tracks.push({ name, volume: settings.soundVolume,
        ...(scene === "rhythm" && rhythmVoices?.resting && name !== RHYTHM_REST_VOICE ? { paused: true } : {}),
      }));
  }
  if ((scene === "sugoroku-penalty" || scene === "othello-temptation") && settings.backgroundMusicEnabled) {
    tracks.push({ name: "penaltyBgm", volume: settings.musicVolume });
  }
  return tracks;
}

import type { AppSettings } from "@/types/models";
import type { LoopAudioName } from "./AudioProvider";

export type RoomAudioScene = "preparation" | "punishment" | "sugoroku" | "sugoroku-zone" | "sugoroku-penalty" | "othello-temptation" | "endurance" | "endurance-recovery";
export type RoomAudioTrackName = "preparation" | "bokkisiro" | "earLick" | "nippleScratch" | "ikunaSine" | "sineW" | "sikosiko" | "penaltyBgm";
export type RoomAudioTrack = { name: RoomAudioTrackName; volume: number };
type AudioSettings = Pick<AppSettings, "soundEnabled" | "soundVolume" | "backgroundMusicEnabled" | "musicVolume">;

export function getRoomAudioTracks(
  scene: RoomAudioScene | null,
  settings: AudioSettings | null,
  appIsActive: boolean,
  manualLoopNames: readonly LoopAudioName[] = [],
): RoomAudioTrack[] {
  if (!scene || !settings || !appIsActive) return [];
  const tracks: RoomAudioTrack[] = [];
  if (settings.soundEnabled) {
    const voices: RoomAudioTrackName[] = scene === "punishment"
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
    // A manually selected voice keeps its own player and playback position.
    // Do not layer a second copy of that voice from the room over it.
    voices.filter((name) => !manualLoopNames.some((manualName) => manualName === name))
      .forEach((name) => tracks.push({ name, volume: settings.soundVolume }));
  }
  if ((scene === "sugoroku-penalty" || scene === "othello-temptation") && settings.backgroundMusicEnabled) {
    tracks.push({ name: "penaltyBgm", volume: settings.musicVolume });
  }
  return tracks;
}

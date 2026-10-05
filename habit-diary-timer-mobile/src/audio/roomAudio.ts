import type { AppSettings } from "@/types/models";

export type RoomAudioScene = "preparation" | "sugoroku" | "sugoroku-zone" | "sugoroku-penalty";
export type RoomAudioTrackName = "preparation" | "bokkisiro" | "earLick" | "ikunaSine" | "sineW" | "penaltyBgm";
export type RoomAudioTrack = { name: RoomAudioTrackName; volume: number };
type AudioSettings = Pick<AppSettings, "soundEnabled" | "soundVolume" | "backgroundMusicEnabled" | "musicVolume">;

export function getRoomAudioTracks(
  scene: RoomAudioScene | null,
  settings: AudioSettings | null,
  appIsActive: boolean,
): RoomAudioTrack[] {
  if (!scene || !settings || !appIsActive) return [];
  const tracks: RoomAudioTrack[] = [];
  if (settings.soundEnabled) {
    const voices: RoomAudioTrackName[] = scene === "preparation"
      ? ["preparation", "bokkisiro"]
      : scene === "sugoroku-zone"
        ? ["earLick", "ikunaSine"]
        : scene === "sugoroku-penalty"
          ? ["earLick", "sineW"]
          : ["earLick"];
    voices.forEach((name) => tracks.push({ name, volume: settings.soundVolume }));
  }
  if (scene === "sugoroku-penalty" && settings.backgroundMusicEnabled) {
    tracks.push({ name: "penaltyBgm", volume: settings.musicVolume });
  }
  return tracks;
}

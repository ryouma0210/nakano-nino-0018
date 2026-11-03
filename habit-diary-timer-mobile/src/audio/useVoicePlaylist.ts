import { useAudioPlaylist } from "expo-audio";
import type { VoicePlaylistHandle } from "./voicePlaylist";

export function useVoicePlaylist(): VoicePlaylistHandle {
  // The native queue advances independently of the screen and JS timers.
  // Lock-screen methods are provided by withVoicePlaylistControls at prebuild.
  return useAudioPlaylist({ updateInterval: 500 }) as VoicePlaylistHandle;
}

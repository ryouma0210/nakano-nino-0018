import { useEffect, useMemo } from "react";
import { createBrowserVoicePlaylist } from "./browserVoicePlaylist";
import type { VoicePlaylistHandle } from "./voicePlaylist";

export function useVoicePlaylist(): VoicePlaylistHandle {
  const playlist = useMemo(() => createBrowserVoicePlaylist(), []);
  useEffect(() => () => playlist.destroy(), [playlist]);
  return playlist;
}

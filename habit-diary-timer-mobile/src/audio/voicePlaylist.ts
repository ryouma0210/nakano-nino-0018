import type { VoicePlaylist } from "./voicePlayback";

export type VoicePlaylistStatus = { playing: boolean; isBuffering: boolean; error?: unknown };
export type VoicePlaylistHandle = VoicePlaylist & {
  readonly currentStatus: VoicePlaylistStatus;
  addListener(event: "playlistStatusUpdate", listener: (status: VoicePlaylistStatus) => void): { remove(): void };
  setActiveForLockScreen?: (active: boolean, metadata?: { title: string; artist: string }, options?: {
    showSeekForward: boolean; showSeekBackward: boolean; isLiveStream: boolean;
  }) => void;
  updateLockScreenMetadata?: (metadata: { title: string; artist: string }) => void;
};

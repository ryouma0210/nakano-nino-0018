import { useEffect, useMemo } from "react";
import { useSessionAudioPlayer } from "./useSessionAudioPlayer";
import { createRoomLoopPlayback } from "./roomLoopPlayback";
import { loopAudioSources } from "./loopAudioSources";
import type { RoomAudioTrack, RoomAudioTrackName } from "./roomAudio";

const sources: Record<RoomAudioTrackName, number> = {
  ...loopAudioSources,
  preparation: require("../../assets/audio/toiki.m4a"),
  penaltyBgm: require("../../assets/audio/yuuwakubgm.m4a"),
  ejaculation: require("../../assets/audio/syasei.m4a"),
};

function RoomLoop({ name, volume, paused }: RoomAudioTrack & { paused: boolean }) {
  const player = useSessionAudioPlayer(sources[name]);
  const playback = useMemo(() => createRoomLoopPlayback(player), [player]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- Expo audio players expose mutable native properties.
    player.volume = volume;
  }, [player, volume]);

  useEffect(() => {
    playback.setPaused(paused).catch(console.error);
    // The audio hook releases the player. Only invalidate asynchronous starts
    // here so cleanup never calls a player already released by that hook.
    return () => playback.cancelPending();
  }, [paused, playback]);

  return null;
}

export type StoredRoomAudioTrack = { id: string; uri: string; volume: number; paused?: boolean };
function StoredRoomLoop({ uri, volume, paused }: StoredRoomAudioTrack & { paused: boolean }) {
  const player = useSessionAudioPlayer({ uri });
  const playback = useMemo(() => createRoomLoopPlayback(player), [player]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- Expo audio players expose mutable native properties.
    player.volume = volume;
  }, [player, volume]);
  useEffect(() => {
    playback.setPaused(paused).catch(console.error);
    return () => playback.cancelPending();
  }, [paused, playback]);
  return null;
}

export function RoomAudioPlayback({ tracks, storedTracks = [], paused = false }: { tracks: readonly RoomAudioTrack[]; storedTracks?: readonly StoredRoomAudioTrack[]; paused?: boolean }) {
  // Stable track keys keep the base voice playing while overlays change.
  return <>{tracks.map((track) => <RoomLoop key={track.name} {...track} paused={paused || track.paused === true} />)}
    {storedTracks.map((track) => <StoredRoomLoop key={`${track.id}:${track.uri}`} {...track} paused={paused || track.paused === true} />)}</>;
}

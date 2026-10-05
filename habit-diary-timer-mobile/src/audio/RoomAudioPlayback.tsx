import { useEffect, useMemo } from "react";
import { useAudioPlayer } from "expo-audio";
import { createLoopPlayback } from "./loopPlayback";
import type { RoomAudioTrack, RoomAudioTrackName } from "./roomAudio";

const sources: Record<RoomAudioTrackName, number> = {
  preparation: require("../../assets/audio/toiki.m4a"),
  bokkisiro: require("../../assets/audio/bokkisiro.m4a"),
  earLick: require("../../assets/audio/miminame.m4a"),
  ikunaSine: require("../../assets/audio/ikuna-sine.m4a"),
  sineW: require("../../assets/audio/sine-w.m4a"),
  penaltyBgm: require("../../assets/audio/yuuwakubgm.m4a"),
};

function RoomLoop({ name, volume }: RoomAudioTrack) {
  const player = useAudioPlayer(sources[name]);
  const playback = useMemo(() => createLoopPlayback([player]), [player]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- Expo audio players expose mutable native properties.
    player.volume = volume;
  }, [player, volume]);

  useEffect(() => {
    playback.play(player, player.volume);
    // The audio hook releases the player. Only invalidate asynchronous starts
    // here so cleanup never calls a player already released by that hook.
    return () => playback.cancelPending();
  }, [playback, player]);

  return null;
}

export function RoomAudioPlayback({ tracks }: { tracks: readonly RoomAudioTrack[] }) {
  // Stable track keys keep the base voice playing while overlays change.
  return <>{tracks.map((track) => <RoomLoop key={track.name} {...track} />)}</>;
}

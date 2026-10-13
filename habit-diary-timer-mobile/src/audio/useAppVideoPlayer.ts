import { useLayoutEffect } from "react";
import { Platform } from "react-native";
import { useVideoPlayer, type VideoPlayer } from "expo-video";
import { useAppAudio } from "./AudioProvider";

function updateAudioMixing(player: VideoPlayer, shouldMixVideoAudio: boolean) {
  if (Platform.OS !== "android") return;
  const mode = shouldMixVideoAudio ? "mixWithOthers" : "auto";
  if (player.audioMixingMode !== mode) player.audioMixingMode = mode;
}

/** Android chooses a global mode across all playing videos, including muted ones. */
export function useAppVideoPlayer(...[source, setup, playerBuilderOptions]: Parameters<typeof useVideoPlayer>): VideoPlayer {
  const { shouldMixVideoAudio } = useAppAudio();
  const player = useVideoPlayer(source, (instance) => {
    // Some callers play in setup, so the policy must be in place before it runs.
    updateAudioMixing(instance, shouldMixVideoAudio);
    setup?.(instance);
  }, playerBuilderOptions);

  useLayoutEffect(() => {
    updateAudioMixing(player, shouldMixVideoAudio);
  }, [shouldMixVideoAudio, player]);
  return player;
}

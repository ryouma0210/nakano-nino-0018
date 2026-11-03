import { useEffect, useMemo } from "react";
import { Asset } from "expo-asset";
import { createBrowserSessionAudio } from "./browserSessionAudio";

export function useSessionAudioPlayer(source: number | string | { uri: string }) {
  const uri = typeof source === "number" ? Asset.fromModule(source).uri : typeof source === "string" ? source : source.uri;
  const player = useMemo(() => createBrowserSessionAudio(uri, console.error), [uri]);
  useEffect(() => () => player.dispose(), [player]);
  return player;
}

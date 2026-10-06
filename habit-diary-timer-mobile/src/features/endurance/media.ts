import type { ImageSourcePropType } from "react-native";
import type { VideoSource } from "expo-video";
import type { EndurancePreset } from "./game";

export type EnduranceMediaItem = {
  id: string;
  label: string;
} & ({ kind: "image"; source: ImageSourcePropType } | { kind: "video"; source: VideoSource });

export function hasCompleteEnduranceAssets(preset: EndurancePreset, media: readonly EnduranceMediaItem[]): boolean {
  if (preset === "custom") return media.length > 0 && media.length <= 100;
  return preset === "game-6" ? media.length === 1 && media[0].kind === "video"
    : media.length === 4 && media.every((item) => item.kind === "image");
}

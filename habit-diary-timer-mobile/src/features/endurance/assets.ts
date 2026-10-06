import type { EndurancePreset } from "./game";
import type { EnduranceMediaItem } from "./media";
export { hasCompleteEnduranceAssets, type EnduranceMediaItem } from "./media";

/**
 * Bundled presets always follow the image filename suffixes 1, 2, 3, 4.
 * Metro requires literal paths, including the exact extension and filename.
 */
export const enduranceAssets: Record<Exclude<EndurancePreset, "custom">, EnduranceMediaItem[]> = {
  "game-1": [
    { id: "game-1-1", label: "1", kind: "image", source: require("../../../assets/endurance/game-1/bokkigamann_1_1.jpeg") },
    { id: "game-1-2", label: "2", kind: "image", source: require("../../../assets/endurance/game-1/bokkigamann_1_2.jpeg") },
    { id: "game-1-3", label: "3", kind: "image", source: require("../../../assets/endurance/game-1/bokkigamann_1_3.jpeg") },
    { id: "game-1-4", label: "4", kind: "image", source: require("../../../assets/endurance/game-1/bokkigamann_1_4.jpeg") },
  ],
  "game-2": [
    { id: "game-2-1", label: "1", kind: "image", source: require("../../../assets/endurance/game-2/bokkigamann_2_1.jpeg") },
    { id: "game-2-2", label: "2", kind: "image", source: require("../../../assets/endurance/game-2/bokkigamann_2_2.jpeg") },
    { id: "game-2-3", label: "3", kind: "image", source: require("../../../assets/endurance/game-2/bokkigamann_2_3.jpeg") },
    { id: "game-2-4", label: "4", kind: "image", source: require("../../../assets/endurance/game-2/bokkigamann_2_4.jpeg") },
  ],
  "game-3": [
    { id: "game-3-1", label: "1", kind: "image", source: require("../../../assets/endurance/game-3/bokkigamann_3_1.jpeg") },
    { id: "game-3-2", label: "2", kind: "image", source: require("../../../assets/endurance/game-3/bokkigamann_3_2.jpeg") },
    { id: "game-3-3", label: "3", kind: "image", source: require("../../../assets/endurance/game-3/bokkigamann_3_3.jpeg") },
    { id: "game-3-4", label: "4", kind: "image", source: require("../../../assets/endurance/game-3/bokkigamann_3_4.jpeg") },
  ],
  "game-4": [
    { id: "game-4-1", label: "1", kind: "image", source: require("../../../assets/endurance/game-4/bokkigamann_4_1.jpeg") },
    { id: "game-4-2", label: "2", kind: "image", source: require("../../../assets/endurance/game-4/bokkigamann_4_2.jpeg") },
    { id: "game-4-3", label: "3", kind: "image", source: require("../../../assets/endurance/game-4/bokkigamann_4_3.jpeg") },
    { id: "game-4-4", label: "4", kind: "image", source: require("../../../assets/endurance/game-4/bokkigamann_4_4.jpeg") },
  ],
  "game-5": [
    { id: "game-5-1", label: "1", kind: "image", source: require("../../../assets/endurance/game-5/bokkigamann_5_1.jpg") },
    { id: "game-5-2", label: "2", kind: "image", source: require("../../../assets/endurance/game-5/bokkigamann_5_2.jpg") },
    { id: "game-5-3", label: "3", kind: "image", source: require("../../../assets/endurance/game-5/bokkigamann_5_3.jpg") },
    { id: "game-5-4", label: "4", kind: "image", source: require("../../../assets/endurance/game-5/bokkigamann_5_4.jpg") },
  ],
  "game-6": [
    { id: "game-6-1", label: "1", kind: "video", source: require("../../../assets/endurance/game-6/○○我慢ゲーム⑥(ファイナル).mp4") },
  ],
};

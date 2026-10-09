import type { ImageSourcePropType } from "react-native";

export type OthelloTemptationImage = { id: string; source: ImageSourcePropType };

/** Register bundled images here with static require calls; see the asset folder README. */
export const OTHELLO_TEMPTATION_IMAGES: readonly OthelloTemptationImage[] = [
  { id: "0c3408b19217203b9422e94044367835", source: require("../../../assets/images/othello-temptation/0c3408b19217203b9422e94044367835.jpg") },
  { id: "0cde5235c88e3671b0d1943ea76af448", source: require("../../../assets/images/othello-temptation/0cde5235c88e3671b0d1943ea76af448.webp") },
  { id: "2e7ce452ba5eec23a60fea0591dbc1dd", source: require("../../../assets/images/othello-temptation/2e7ce452ba5eec23a60fea0591dbc1dd.webp") },
  { id: "39477a395bbb231eb244f035997ce26d", source: require("../../../assets/images/othello-temptation/39477a395bbb231eb244f035997ce26d.jpg") },
  { id: "b09448a45c84bdfaa5269c9459b49808", source: require("../../../assets/images/othello-temptation/b09448a45c84bdfaa5269c9459b49808.webp") },
  { id: "c2e54a2fe2799e92814f6667ae047efc", source: require("../../../assets/images/othello-temptation/c2e54a2fe2799e92814f6667ae047efc.jpg") },
  { id: "dde5ea08648623824d4ad0bfa29e30f9", source: require("../../../assets/images/othello-temptation/dde5ea08648623824d4ad0bfa29e30f9.jpg") },
  { id: "e550349948e62b0253b6f510bbeef9a2", source: require("../../../assets/images/othello-temptation/e550349948e62b0253b6f510bbeef9a2.jpg") },
  { id: "e74edf2be959176adfb137eb88e496a4", source: require("../../../assets/images/othello-temptation/e74edf2be959176adfb137eb88e496a4.webp") },
  { id: "f8d9e1a637f5718a0face53ae79c97b4", source: require("../../../assets/images/othello-temptation/f8d9e1a637f5718a0face53ae79c97b4.jpg") },
];

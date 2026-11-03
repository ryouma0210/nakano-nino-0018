// Keep static requires so Expo includes all three offline images in the bundle.
// Replace the PNGs under assets/rhythm-challenge without changing these names.
export const rhythmDefaultImages = {
  normal: require("../../../assets/rhythm-challenge/tyarennzi-1.png"),
  paused: require("../../../assets/rhythm-challenge/tyarennzi-2.png"),
  finished: require("../../../assets/rhythm-challenge/tyarennzi-3.jpg"),
} as const;

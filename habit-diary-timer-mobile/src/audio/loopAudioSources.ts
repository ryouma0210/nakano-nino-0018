import type { LoopAudioName } from "./AudioProvider";

// The loop selector and room sessions share the same bundled audio files.
export const loopAudioSources: Record<LoopAudioName, number> = {
  bokkisiro: require("../../assets/audio/bokkisiro.m4a"),
  breath: require("../../assets/audio/toiki.m4a"),
  earLick: require("../../assets/audio/miminame.m4a"),
  sikosiko: require("../../assets/audio/sikosiko.m4a"),
  kousokusikosiko: require("../../assets/audio/kousokusikosiko.m4a"),
  nippleScratch: require("../../assets/audio/tikubikarikariseme.m4a"),
  kousokutikubikarikari: require("../../assets/audio/kousokutikubikarikari.m4a"),
  sineW: require("../../assets/audio/sine-w.m4a"),
  ikunaSine: require("../../assets/audio/ikuna-sine.m4a"),
  dase: require("../../assets/audio/dase.m4a"),
};

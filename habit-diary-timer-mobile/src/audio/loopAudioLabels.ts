import type { LoopAudioName } from "./AudioProvider";

export const loopAudioLabels: Record<LoopAudioName, string> = {
  bokkisiro: "勃起しろ",
  earLick: "耳舐め",
  sikosiko: "シコシコ",
  kousokusikosiko: "高速シコシコ",
  nippleScratch: "乳首カリカリ",
  kousokutikubikarikari: "高速乳首カリカリ",
  sineW: "死ね",
  ikunaSine: "逝くな×死ね",
  dase: "出せ",
};

export const loopAudioOptions = (
  Object.keys(loopAudioLabels) as LoopAudioName[]
).map((key) => ({ key, title: loopAudioLabels[key] }));

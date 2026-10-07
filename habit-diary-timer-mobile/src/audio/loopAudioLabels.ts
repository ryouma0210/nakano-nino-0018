import type { LoopAudioName } from "./AudioProvider";

export const loopAudioLabels: Record<LoopAudioName, string> = {
  bokkisiro: "勃起しろ", earLick: "耳舐め", nippleScratch: "乳首カリカリ", sineW: "死ね", ikunaSine: "逝くな×死ね",
};

export const loopAudioOptions = (Object.keys(loopAudioLabels) as LoopAudioName[]).map((key) => ({ key, title: loopAudioLabels[key] }));

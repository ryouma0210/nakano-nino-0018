export type RhythmFeedbackState = "running" | "paused" | "finished";

/** Large, persistent captions, separate from the rotating messages below. */
export const RHYTHM_MAIN_FEEDBACK = {
  running: "よし♡",
  paused: "待て♡",
  finished: "出せ♡",
} as const satisfies Record<RhythmFeedbackState, string>;

/** Captions play in this order: five seconds visible, then two seconds hidden. */
export const RHYTHM_FEEDBACK = {
  running: [
    "いいペース♡",
    "えらいえらい♡",
    "カリ首引っ掛けて♡シコシコ♡",
    "その調子♡",
    "爪を立てて♡乳首カリカリ♡",
  ],
  paused: [
    "ま～だ♡",
    "我慢♡我慢♡",
    "乳首カリカリしながら♡",
    "チンピク休憩♡ピクピク♡",
    "ピク♡ピクピク♡ピクピクピク♡",
  ],
  finished: [
    "びゅるるる～♡",
    "あはは♡沢山出たわね♡",
    "お疲れ様♡",
    "また挑戦しに来てね♡",
    "バイバーイ♡",
  ],
} as const satisfies Record<
  RhythmFeedbackState,
  readonly string[]
>;

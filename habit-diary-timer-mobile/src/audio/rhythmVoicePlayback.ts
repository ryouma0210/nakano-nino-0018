export type RhythmVoicePlaybackState = {
  resting: boolean;
  interruptions: number;
};

export const RHYTHM_REST_VOICE = "kousokutikubikarikari" as const;

/** Automatic choices belong to this play only; saved selections remain unchanged. */
export function automaticRhythmVoices(state?: RhythmVoicePlaybackState | null): string[] {
  if (!state) return [];
  const voices: string[] = [];
  if (state.resting) voices.push(RHYTHM_REST_VOICE);
  if (state.interruptions >= 10) voices.push("kousokusikosiko");
  return voices;
}

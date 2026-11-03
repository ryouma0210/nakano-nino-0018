import { describe, expect, it } from "vitest";
import { automaticRhythmVoices, RHYTHM_REST_VOICE } from "./rhythmVoicePlayback";

describe("automatic rhythm voices", () => {
  it("has no automatic selections outside a challenge", () => {
    expect(automaticRhythmVoices()).toEqual([]);
    expect(automaticRhythmVoices(null)).toEqual([]);
  });

  it.each([0, 9, 10, 11])("selects the fast voice from interruption ten, count=%i", (interruptions) => {
    expect(automaticRhythmVoices({ resting: false, interruptions })).toEqual(
      interruptions < 10 ? [] : ["kousokusikosiko"],
    );
  });

  it("adds the rest voice only during a rest, retaining the threshold choice", () => {
    expect(automaticRhythmVoices({ resting: true, interruptions: 9 })).toEqual([RHYTHM_REST_VOICE]);
    expect(automaticRhythmVoices({ resting: true, interruptions: 10 })).toEqual([RHYTHM_REST_VOICE, "kousokusikosiko"]);
    expect(automaticRhythmVoices({ resting: false, interruptions: 10 })).toEqual(["kousokusikosiko"]);
    expect(automaticRhythmVoices({ resting: false, interruptions: 0 })).toEqual([]);
  });
});

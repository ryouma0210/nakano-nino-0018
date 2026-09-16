import { describe, expect, it } from "vitest";
import { trainingLevels, trainingNeedsPunishment, trainingOutcomeTag } from "./trainingOutcome";

describe("saved training outcomes", () => {
  it.each(trainingLevels)("uses the $key target and treats reaching it as no punishment", (level) => {
    expect(trainingOutcomeTag(level.targetSeconds - 1, level.targetSeconds)).toBe("お仕置き対象");
    expect(trainingOutcomeTag(level.targetSeconds, level.targetSeconds)).toBe("お仕置き不要");
    expect(trainingOutcomeTag(level.targetSeconds + 1, level.targetSeconds)).toBe("お仕置き不要");
  });

  it.each(trainingLevels)("recovers the $key legacy outcome from its saved difficulty and duration", (level) => {
    const tags = `調教,完了,射精記録, ${level.label} `;
    expect(trainingNeedsPunishment({ tags, duration_seconds: level.targetSeconds - 1 })).toBe(true);
    expect(trainingNeedsPunishment({ tags, duration_seconds: level.targetSeconds })).toBe(false);
    expect(trainingNeedsPunishment({ tags, duration_seconds: level.targetSeconds + 1 })).toBe(false);
    expect(trainingNeedsPunishment({ tags, duration_seconds: 0 })).toBe(true);
  });

  it("preserves explicit outcomes even if the old difficulty or duration suggests otherwise", () => {
    expect(trainingNeedsPunishment({ tags: "調教,ハード,お仕置き不要", duration_seconds: 1 })).toBe(false);
    expect(trainingNeedsPunishment({ tags: "調教,イージー,お仕置き対象", duration_seconds: 1000 })).toBe(true);
    expect(trainingNeedsPunishment({ tags: "調教, お仕置き対象 ", duration_seconds: null })).toBe(true);
    expect(trainingNeedsPunishment({ tags: "調教,お仕置き不要" })).toBe(false);
  });

  it.each([undefined, null, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "does not infer a legacy outcome from invalid duration %s", (duration_seconds) => {
      expect(trainingNeedsPunishment({ tags: "調教,ノーマル", duration_seconds })).toBeNull();
    },
  );

  it.each([null, "", "調教,完了,射精記録", "お仕置き対象外", "イージー,ハード"])(
    "leaves unknown or conflicting legacy difficulty tags %s unclassified", (tags) => {
      expect(trainingNeedsPunishment({ tags, duration_seconds: 100 })).toBeNull();
    },
  );

  it("does not choose between conflicting explicit outcomes", () => {
    expect(trainingNeedsPunishment({
      tags: "調教,イージー,お仕置き対象,お仕置き不要", duration_seconds: 100,
    })).toBeNull();
  });
});

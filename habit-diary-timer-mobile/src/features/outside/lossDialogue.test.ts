import { describe, expect, it } from "vitest";
import { lossStageComments } from "./lossDialogue";

describe("succubus loss dialogue", () => {
  it.each(["beginner", "middle", "queen"] as const)("has 20 lines for every loss kind at %s", (stage) => {
    for (const kind of ["chest", "back", "foot"] as const) {
      expect(lossStageComments[stage][kind]).toHaveLength(20);
      expect(new Set(lossStageComments[stage][kind]).size).toBe(20);
    }
  });
  it("contains 180 distinct stage/kind/step combinations", () => {
    const all = (["beginner", "middle", "queen"] as const).flatMap((stage) =>
      (["chest", "back", "foot"] as const).flatMap((kind) => lossStageComments[stage][kind]),
    );
    expect(all).toHaveLength(180);
    expect(new Set(all).size).toBe(180);
  });
});

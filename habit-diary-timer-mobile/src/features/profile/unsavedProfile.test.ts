import { describe, expect, it } from "vitest";
import type { ProfileSettings } from "@/services/profileService";
import { hasUnsavedProfileChanges } from "./unsavedProfile";

const baseline: ProfileSettings = {
  sexualExperience: "unknown", romanceExperience: "unknown", analExperience: "unknown",
  nippleExperience: "unknown", exposureExperience: "unknown", specialFetish: "unknown",
  erectionLengthCm: "", masturbationPerWeek: "", masturbationMinutes: "", tissueCount: "",
  weaknesses: ["A"], weaknessCandidates: ["A"], topWeaknesses: ["A"],
  favoriteIds: ["custom-a", "custom-b"], favoriteCandidateIds: ["custom-a", "custom-b"],
  topFavoriteIds: ["custom-a", "custom-b"], photoFileName: null, ninoOutfit: "default", ninoVoiceStyle: "queen",
};

describe("certificate unsaved edits", () => {
  it("accepts identical saved values even when array references differ", () => {
    expect(hasUnsavedProfileChanges(structuredClone(baseline), baseline, "Saved Name", "Saved Name")).toBe(false);
  });
  it("detects a name change but matches the name-save trim and blank-name behavior", () => {
    expect(hasUnsavedProfileChanges(baseline, baseline, "Edited Name", "Saved Name")).toBe(true);
    expect(hasUnsavedProfileChanges(baseline, baseline, " Saved Name ", "Saved Name")).toBe(false);
    expect(hasUnsavedProfileChanges(baseline, baseline, "  ", "Saved Name")).toBe(false);
  });
  it("detects edited inputs and ranking order, including emptying a saved value", () => {
    expect(hasUnsavedProfileChanges({ ...baseline, tissueCount: "2" }, baseline, "A", "A")).toBe(true);
    expect(hasUnsavedProfileChanges(baseline, { ...baseline, tissueCount: "2" }, "A", "A")).toBe(true);
    expect(hasUnsavedProfileChanges({ ...baseline, topFavoriteIds: ["custom-b", "custom-a"] }, baseline, "A", "A")).toBe(true);
  });
  it("becomes clean only when the edited fields have actually been saved", () => {
    const edited = { ...baseline, tissueCount: "3" };
    const savedPhotoOnly = { ...baseline, photoFileName: "photo.png" };
    const editedAfterPhoto = { ...edited, photoFileName: "photo.png" };
    expect(hasUnsavedProfileChanges(editedAfterPhoto, savedPhotoOnly, "A", "A")).toBe(true);
    expect(hasUnsavedProfileChanges(editedAfterPhoto, structuredClone(editedAfterPhoto), "A", "A")).toBe(false);
  });
});

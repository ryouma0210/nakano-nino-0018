import { describe, expect, it } from "vitest";
import { appSettingsSchema, dailyOrderSchema, profileSettingsSchema } from "./storage";

describe("persisted data schemas", () => {
  it("fills defaults while migrating old settings", () => {
    expect(appSettingsSchema.parse({}).listLimit).toBe(50);
  });
  it("loads legacy profiles without dropping their full weakness list", () => {
    const weaknesses = Array.from({ length: 8 }, (_, index) => `weakness-${index}`);
    expect(profileSettingsSchema.parse({ weaknesses, ninoOutfit: "custom" })).toMatchObject({
      weaknesses, weaknessCandidates: weaknesses, ninoOutfit: "custom", topWeaknesses: [],
      favoriteIds: [], favoriteCandidateIds: [], topFavoriteIds: [], photoFileName: null,
    });
  });
  it("keeps complete selections while limiting rankings to distinct registered choices", () => {
    const choices = ["a", "b", "c", "d", "e", "f", "g"];
    expect(profileSettingsSchema.parse({
      weaknesses: choices, topWeaknesses: ["missing", "b", "b", "a", "c", "d", "e", "f"],
      favoriteIds: choices, topFavoriteIds: ["g", "missing", "g", "f", "e", "d"], photoFileName: "stored_photo.png",
    })).toMatchObject({ weaknesses: choices, topWeaknesses: ["b", "a", "c", "d", "e"],
      favoriteIds: choices, topFavoriteIds: ["g", "f", "e"], photoFileName: "stored_photo.png" });
  });
  it("rejects a photo path or URL in place of a stable filename", () => {
    for (const photoFileName of ["../photo.png", "https://example.test/photo.png", "..", "folder\\photo.png"]) {
      expect(profileSettingsSchema.safeParse({ photoFileName }).success).toBe(false);
    }
  });
  it("migrates legacy favorite registrations into candidates without selecting extra entries", () => {
    const profile = profileSettingsSchema.parse({ favoriteIds: ["fixed-id", "manual-v1:Alex", "fixed-id"], topFavoriteIds: ["manual-v1:Alex"] });
    expect(profile).toMatchObject({
      weaknessCandidates: [], favoriteIds: ["fixed-id", "manual-v1:Alex"],
      favoriteCandidateIds: ["fixed-id", "manual-v1:Alex"], topFavoriteIds: ["manual-v1:Alex"],
    });
  });
  it("keeps unselected candidates through the schema used for backup validation", () => {
    const saved = profileSettingsSchema.parse({
      weaknesses: ["selected"], weaknessCandidates: ["unselected", "unselected"], topWeaknesses: ["selected"],
      favoriteIds: ["fixed-id"], favoriteCandidateIds: ["manual-v1:Alex", "manual-v1:Alex"], topFavoriteIds: ["fixed-id"],
    });
    const restored = profileSettingsSchema.parse(JSON.parse(JSON.stringify(saved)));
    expect(restored).toEqual(saved);
    expect(restored).toMatchObject({
      weaknesses: ["selected"], weaknessCandidates: ["unselected", "selected"], topWeaknesses: ["selected"],
      favoriteIds: ["fixed-id"], favoriteCandidateIds: ["manual-v1:Alex", "fixed-id"], topFavoriteIds: ["fixed-id"],
    });
    expect(profileSettingsSchema.parse({ ...restored, weaknesses: [], favoriteIds: [] })).toMatchObject({
      weaknesses: [], weaknessCandidates: ["unselected", "selected"], topWeaknesses: [],
      favoriteIds: [], favoriteCandidateIds: ["manual-v1:Alex", "fixed-id"], topFavoriteIds: [],
    });
  });
  it("rejects malformed candidate arrays before they can be restored", () => {
    expect(profileSettingsSchema.safeParse({ weaknessCandidates: [42] }).success).toBe(false);
    expect(profileSettingsSchema.safeParse({ favoriteCandidateIds: "manual-v1:Alex" }).success).toBe(false);
  });
  it("rejects invalid persisted orders", () => {
    expect(dailyOrderSchema.safeParse({ date: "2026-01-01", completed: "yes" }).success).toBe(false);
  });
  it("rejects unsafe volume and list limits", () => {
    expect(appSettingsSchema.safeParse({ musicVolume: 4, listLimit: 0 }).success).toBe(false);
  });
});

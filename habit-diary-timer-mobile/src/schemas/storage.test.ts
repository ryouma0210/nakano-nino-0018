import { describe, expect, it } from "vitest";
import { appSettingsSchema, dailyOrderSchema, profileSettingsSchema } from "./storage";

describe("persisted data schemas", () => {
  it("fills defaults while migrating old settings", () => {
    expect(appSettingsSchema.parse({}).listLimit).toBe(50);
  });
  it("loads legacy profiles without dropping their full weakness list", () => {
    const weaknesses = Array.from({ length: 8 }, (_, index) => `weakness-${index}`);
    expect(profileSettingsSchema.parse({ weaknesses, ninoOutfit: "custom" })).toMatchObject({
      weaknesses, ninoOutfit: "custom", topWeaknesses: [], favoriteIds: [], topFavoriteIds: [], photoFileName: null,
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
  it("rejects invalid persisted orders", () => {
    expect(dailyOrderSchema.safeParse({ date: "2026-01-01", completed: "yes" }).success).toBe(false);
  });
  it("rejects unsafe volume and list limits", () => {
    expect(appSettingsSchema.safeParse({ musicVolume: 4, listLimit: 0 }).success).toBe(false);
  });
});

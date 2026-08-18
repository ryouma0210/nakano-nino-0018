import { describe, expect, it } from "vitest";
import { appSettingsSchema, dailyOrderSchema } from "./storage";

describe("persisted data schemas", () => {
  it("fills defaults while migrating old settings", () => {
    expect(appSettingsSchema.parse({}).listLimit).toBe(50);
  });
  it("rejects invalid persisted orders", () => {
    expect(dailyOrderSchema.safeParse({ date: "2026-01-01", completed: "yes" }).success).toBe(false);
  });
  it("rejects unsafe volume and list limits", () => {
    expect(appSettingsSchema.safeParse({ musicVolume: 4, listLimit: 0 }).success).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../../database/client.web";
import { createEnduranceGame, failEnduranceSlide, finishEndurance } from "./game";
import { clearEndurance, loadEndurance, saveEnduranceResult, unlockEndurance } from "./service";
import { ENDURANCE_HISTORY_KEY } from "./storage";

vi.mock("@/database/client", () => import("../../database/client.web"));
const localValues = new Map<string, string>();
const local = {
  get length() { return localValues.size; }, key: (index: number) => [...localValues.keys()][index] ?? null,
  getItem: (key: string) => localValues.get(key) ?? null,
  setItem: vi.fn((key: string, value: string) => { localValues.set(key, value); }),
  removeItem: (key: string) => { localValues.delete(key); },
};
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("localStorage", local);
  client.execute("DELETE FROM app_settings");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("endurance durable results and unlock", () => {
  it("unlocks both presets once and retains the unlock when only records reset", () => {
    expect(loadEndurance().unlocked).toBe(false);
    expect(unlockEndurance("wrong")).toBe(false);
    expect(loadEndurance().unlocked).toBe(false);
    expect(unlockEndurance("NinoLave20260505")).toBe(true);
    expect(loadEndurance().unlocked).toBe(true);
    clearEndurance();
    expect(loadEndurance().unlocked).toBe(true);
    clearEndurance(true);
    expect(loadEndurance().unlocked).toBe(false);
  });
  it("requires the exact password and never persists attempts", () => {
    for (const password of [" NinoLave20260505", "NinoLave20260505 ", "ninolave20260505", ""]) expect(unlockEndurance(password)).toBe(false);
    expect(client.query("SELECT * FROM app_settings")).toEqual([]);
  });
  it("persists a finished snapshot, retains it after retry and clears history", () => {
    const game = createEnduranceGame("custom", 2, "2026-10-06T00:00:00.000Z");
    const result = finishEndurance(game, true, "2026-10-06T00:01:00.000Z");
    expect(saveEnduranceResult(result).history).toEqual([result]);
    expect(saveEnduranceResult(result).history).toEqual([result]);
    expect(loadEndurance().history).toEqual([result]);
    clearEndurance();
    expect(loadEndurance().history).toEqual([]);
  });
  it("refuses to overwrite corrupt existing history", () => {
    client.execute("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", [ENDURANCE_HISTORY_KEY, "broken"]);
    const result = finishEndurance(createEnduranceGame("custom", 1), true);
    expect(() => saveEnduranceResult(result)).toThrow();
    expect(client.queryOne<{ setting_value: string }>("SELECT setting_value FROM app_settings WHERE setting_key=?", [ENDURANCE_HISTORY_KEY])?.setting_value).toBe("broken");
  });
  it("does not mark a failed write as saved or unlock an unavailable store", () => {
    const result = finishEndurance(createEnduranceGame("custom", 1), true);
    const failure = vi.spyOn(client, "execute").mockImplementation(() => { throw new Error("disk full"); });
    expect(() => saveEnduranceResult(result)).toThrow("disk full");
    expect(() => unlockEndurance("NinoLave20260505")).toThrow("disk full");
    failure.mockRestore();
    expect(loadEndurance()).toEqual({ version: 1, history: [], unlocked: false });
  });
  it("preserves the first saved failure position when a video result is retried", () => {
    const game = failEnduranceSlide(createEnduranceGame("game-6", 1, "2026-10-06T00:00:00.000Z"));
    const result = finishEndurance(game, false, "2026-10-06T00:01:00.000Z", { positionMs: 12_345, durationMs: 60_000 });
    saveEnduranceResult(result);
    const retry = finishEndurance(game, false, "2026-10-06T00:02:00.000Z", { positionMs: 22_345, durationMs: 60_000 });
    expect(saveEnduranceResult(retry).history).toEqual([result]);
    expect(loadEndurance().history).toEqual([result]);
  });
  it("rejects invalid progress without modifying previously saved history", () => {
    const video = createEnduranceGame("game-6", 1, "2026-10-06T00:00:00.000Z");
    const legacy = finishEndurance(video, true, "2026-10-06T00:01:00.000Z");
    saveEnduranceResult(legacy);
    const invalid = { ...legacy, id: "endurance-invalid", videoProgress: { positionMs: -1, durationMs: null } };
    expect(() => saveEnduranceResult(invalid)).toThrow();
    expect(loadEndurance().history).toEqual([legacy]);
  });
});

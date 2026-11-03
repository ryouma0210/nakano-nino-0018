import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRhythmSession, finishRhythmSession, pauseRhythmSession } from "../features/rhythm/model";
import { defaultRhythmImages, parseRhythmSave, rhythmChallengeService, rhythmResult, RHYTHM_STORAGE_KEY, type RhythmHistoryEntry, type RhythmImages } from "./rhythmChallengeService";

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
let raw: string | null;
function entry(id = "one", overrides: Partial<RhythmHistoryEntry> = {}): RhythmHistoryEntry {
  return { id, startedAt: "2026-11-03T01:00:00.000Z", completedAt: "2026-11-03T01:05:00.000Z", interruptions: 3, elapsedSeconds: 120, ...overrides };
}
const images = (): RhythmImages => ({ normal: { purpose: "training", name: "normal.png" }, paused: { purpose: "punishment", name: "paused.jpg" }, finished: null });

beforeEach(() => {
  vi.resetAllMocks(); raw = null;
  storage.getItem.mockImplementation(async () => raw);
  storage.setItem.mockImplementation(async (_key: string, value: string) => { raw = value; });
  storage.removeItem.mockImplementation(async () => { raw = null; });
});

describe("rhythm challenge persistence", () => {
  it("loads independent defaults without saving and emits a fixed result only after finishing", async () => {
    expect(await rhythmChallengeService.load()).toEqual({ version: 1, images: defaultRhythmImages(), history: [] });
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(RHYTHM_STORAGE_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
    const started = Date.parse("2026-11-03T01:00:00.000Z");
    const session = createRhythmSession("one", started);
    expect(() => rhythmResult(session)).toThrow();
    expect(rhythmResult(finishRhythmSession(pauseRhythmSession(session, started + 12500), started + 20000)))
      .toEqual(entry("one", { completedAt: "2026-11-03T01:00:20.000Z", interruptions: 1, elapsedSeconds: 12 }));
  });

  it("serializes image changes and results without dropping either and copies caller owned data", async () => {
    const selected = images(); const result = entry();
    const writes = [rhythmChallengeService.saveImages(selected), rhythmChallengeService.saveResult(result)];
    selected.normal!.name = "changed.png"; result.interruptions = 999;
    await Promise.all(writes);
    expect(await rhythmChallengeService.load()).toEqual({ version: 1, images: images(), history: [entry()] });
    const loaded = await rhythmChallengeService.load(); loaded.history[0].interruptions = 9;
    loaded.images.normal!.name = "mutated.png";
    expect((await rhythmChallengeService.load()).history).toEqual([entry()]);
  });

  it("saves repeated retries once and refuses conflicting results with the same ID", async () => {
    await Promise.all([rhythmChallengeService.saveResult(entry()), rhythmChallengeService.saveResult(entry())]);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    const before = raw;
    await expect(rhythmChallengeService.saveResult(entry("one", { interruptions: 9 }))).rejects.toThrow("同じプレイID");
    expect(raw).toBe(before);
  });

  it("preserves previous results after a failed write and accepts retrying the exact pending result", async () => {
    await rhythmChallengeService.saveResult(entry("first"));
    const before = raw;
    storage.setItem.mockRejectedValueOnce(new Error("disk full"));
    const pending = entry("second");
    await expect(rhythmChallengeService.saveResult(pending)).rejects.toThrow("disk full");
    expect(raw).toBe(before);
    expect(await rhythmChallengeService.saveResult(pending)).toHaveLength(2);
    expect(await rhythmChallengeService.saveResult(pending)).toHaveLength(2);
  });

  it("retains only the latest 100 results by completion date rather than save order", async () => {
    for (let index = 0; index < 105; index++) {
      await rhythmChallengeService.saveResult(entry(String(index), { completedAt: new Date(Date.UTC(2026, 10, 3, 1, 5, index)).toISOString() }));
    }
    await rhythmChallengeService.saveResult(entry("late-old", { completedAt: "2026-11-03T01:04:00.000Z" }));
    const saved = await rhythmChallengeService.load();
    expect(saved.history).toHaveLength(100);
    expect(saved.history[0].id).toBe("104"); expect(saved.history[99].id).toBe("5");
  });

  it.each([
    "broken", "null", JSON.stringify({ version: 2, images: defaultRhythmImages(), history: [] }),
    JSON.stringify({ version: 1, images: defaultRhythmImages(), history: [entry(), entry()] }),
    JSON.stringify({ version: 1, images: defaultRhythmImages(), history: [entry("bad", { interruptions: -1 })] }),
    JSON.stringify({ version: 1, images: defaultRhythmImages(), history: [entry("bad", { elapsedSeconds: 301 })] }),
    JSON.stringify({ version: 1, images: { ...defaultRhythmImages(), normal: { purpose: "profile", name: "private.png" } }, history: [] }),
    JSON.stringify({ version: 1, images: { ...defaultRhythmImages(), normal: { purpose: "training", name: "../picture.png" } }, history: [] }),
    JSON.stringify({ version: 1, images: { ...defaultRhythmImages(), normal: { purpose: "training", name: "video.mp4" } }, history: [] }),
  ])("rejects malformed or unsupported saved data without overwriting it: %s", async (invalid) => {
    raw = invalid;
    expect(() => parseRhythmSave(invalid)).toThrow();
    await expect(rhythmChallengeService.saveImages(images())).rejects.toThrow();
    await expect(rhythmChallengeService.saveResult(entry())).rejects.toThrow();
    expect(raw).toBe(invalid); expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("stores stable image references without caller-provided object URLs", async () => {
    const selected = { ...images(), normal: { purpose: "training" as const, name: "normal.png", uri: "blob:old" } };
    await rhythmChallengeService.saveImages(selected);
    expect(raw).not.toContain("blob:");
    expect((await rhythmChallengeService.load()).images.normal).toEqual(images().normal);
  });

  it("preserves the eligible marker through history writes, backup parsing and image changes", async () => {
    const qualified = entry("clear", { interruptions: 10, dailyRewardEligible: true });
    await rhythmChallengeService.saveResult(qualified);
    await rhythmChallengeService.saveImages(images());
    expect(parseRhythmSave(raw!).history).toEqual([qualified]);
    expect((await rhythmChallengeService.load()).history).toEqual([qualified]);
    await rhythmChallengeService.clearImages();
    expect((await rhythmChallengeService.load()).history).toEqual([qualified]);
  });

  it.each([
    { interruptions: 9, dailyRewardEligible: true },
    { interruptions: 10, dailyRewardEligible: false },
    { interruptions: 10, dailyRewardEligible: "true" },
  ])("rejects invalid eligibility markers in restored results: %j", (change) => {
    expect(() => parseRhythmSave(JSON.stringify({ version: 1, images: defaultRhythmImages(), history: [{ ...entry(), ...change }] }))).toThrow();
  });

  it("does not invent an eligibility marker for legacy history with ten or more interruptions", async () => {
    raw = JSON.stringify({ version: 1, images: images(), history: [entry("old", { interruptions: 20 })] });
    await rhythmChallengeService.saveImages(defaultRhythmImages());
    expect((await rhythmChallengeService.load()).history[0]).not.toHaveProperty("dailyRewardEligible");
  });

  it("clears just records or image references as requested, and full reset removes the key", async () => {
    await rhythmChallengeService.saveImages(images()); await rhythmChallengeService.saveResult(entry());
    await rhythmChallengeService.clearHistory();
    expect(await rhythmChallengeService.load()).toEqual({ version: 1, images: images(), history: [] });
    await rhythmChallengeService.saveResult(entry()); await rhythmChallengeService.clearImages();
    expect(await rhythmChallengeService.load()).toEqual({ version: 1, images: defaultRhythmImages(), history: [entry()] });
    await rhythmChallengeService.clear(); expect(raw).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(RHYTHM_STORAGE_KEY);
  });
});

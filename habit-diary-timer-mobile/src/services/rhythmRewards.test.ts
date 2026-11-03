import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as web from "../database/client.web";
import { pointRepository } from "../repositories/rewardRepository";
import { dailyGameRewardService } from "./dailyGameRewardService";
import { loadRewardedRhythm, saveRewardedRhythmResult } from "./gameCompletionService";
import { rhythmChallengeService, RHYTHM_STORAGE_KEY, type RhythmHistoryEntry } from "./rhythmChallengeService";
import { toDateKey, toDateTimeKey } from "../utils/date";

const database = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }));
const asyncStorage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: asyncStorage }));
vi.mock("@/database/client", () => database);
vi.mock("@/repositories/rewardRepository", () => import("../repositories/rewardRepository"));
vi.mock("@/utils/date", () => import("../utils/date"));
vi.mock("@/features/sugoroku/storage", () => import("../features/sugoroku/storage"));
vi.mock("@/features/othello/storage", () => import("../features/othello/storage"));
vi.mock("@/constants/messages", () => ({
  rewardBrutalOrderMessages: [], rewardInsultMessages: [], rewardPraiseMessages: [], rewardSecretMessages: [],
}));

const saved = new Map<string, string>();
const databaseValues = new Map<string, string>();
const local = {
  get length() { return databaseValues.size; },
  key: (index: number) => [...databaseValues.keys()][index] ?? null,
  getItem: (key: string) => databaseValues.get(key) ?? null,
  setItem: (key: string, value: string) => { databaseValues.set(key, value); },
  removeItem: (key: string) => { databaseValues.delete(key); },
};
const ledger = () => web.query<{ source_key: string; points: number; created_at: string }>("SELECT * FROM point_transactions");
function result(id: string, interruptions = 10, day = 4, hour = 12): RhythmHistoryEntry {
  return {
    id, interruptions, startedAt: new Date(2026, 10, day, hour - 1).toISOString(),
    completedAt: new Date(2026, 10, day, hour).toISOString(), elapsedSeconds: 600,
  };
}

beforeEach(() => {
  vi.resetAllMocks(); saved.clear();
  vi.stubGlobal("localStorage", local);
  for (const table of ["app_settings", "point_transactions"]) web.execute(`DELETE FROM ${table}`);
  database.execute.mockImplementation(web.execute);
  database.query.mockImplementation(web.query);
  database.queryOne.mockImplementation(web.queryOne);
  database.transaction.mockImplementation(web.transaction);
  asyncStorage.getItem.mockImplementation(async (key: string) => saved.get(key) ?? null);
  asyncStorage.setItem.mockImplementation(async (key: string, value: string) => { saved.set(key, value); });
  asyncStorage.removeItem.mockImplementation(async (key: string) => { saved.delete(key); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("rhythm first-clear reward integration", () => {
  it("requires ten interruptions and awards only fifty per day, with a new claim the next day", async () => {
    await saveRewardedRhythmResult(result("nine", 9));
    expect(ledger()).toEqual([]);
    await saveRewardedRhythmResult(result("ten", 10));
    await saveRewardedRhythmResult(result("twenty", 20, 4, 13));
    expect(ledger()).toEqual([expect.objectContaining({ source_key: "game-clear:rhythm:2026-11-04", points: 50 })]);
    expect(dailyGameRewardService.pointsForResult("rhythm", "nine")).toBe(0);
    expect(dailyGameRewardService.pointsForResult("rhythm", "ten")).toBe(50);
    expect(dailyGameRewardService.pointsForResult("rhythm", "twenty")).toBe(0);
    await saveRewardedRhythmResult(result("tomorrow", 10, 5));
    expect(ledger().map((row) => row.points)).toEqual([50, 50]);
    expect(dailyGameRewardService.pointsForResult("rhythm", "tomorrow")).toBe(50);
  });

  it("serializes concurrent saves and reloads without duplicate ledger rows or notifications", async () => {
    const listener = vi.fn();
    const unsubscribe = pointRepository.subscribe(listener);
    try {
      const first = result("first");
      await Promise.all([
        saveRewardedRhythmResult(first), saveRewardedRhythmResult(first),
        saveRewardedRhythmResult(result("second", 30)), loadRewardedRhythm(),
      ]);
      await saveRewardedRhythmResult(first);
      await loadRewardedRhythm();
      expect(ledger()).toHaveLength(1);
      expect(listener).toHaveBeenCalledTimes(1);
      expect((await rhythmChallengeService.load()).history).toHaveLength(2);
      expect(dailyGameRewardService.pointsForResult("rhythm", "first")).toBe(50);
      expect(dailyGameRewardService.pointsForResult("rhythm", "second")).toBe(0);
    } finally { unsubscribe(); }
  });

  it("rejects changes to an already saved result instead of claiming another day", async () => {
    const original = result("same-id");
    await saveRewardedRhythmResult(original);
    await expect(saveRewardedRhythmResult(result("same-id", 20, 5))).rejects.toThrow("同じプレイID");
    expect(ledger()).toHaveLength(1);
    expect((await rhythmChallengeService.load()).history).toEqual([{ ...original, dailyRewardEligible: true }]);
    expect(dailyGameRewardService.completedGames("2026-11-05")).toEqual([]);
  });

  it("never grants points when the result cannot be durably saved", async () => {
    asyncStorage.setItem.mockRejectedValueOnce(new Error("history disk full"));
    await expect(saveRewardedRhythmResult(result("retry"))).rejects.toThrow("history disk full");
    expect(saved.has(RHYTHM_STORAGE_KEY)).toBe(false);
    expect(ledger()).toEqual([]);
    expect(web.query("SELECT * FROM app_settings")).toEqual([]);
    await saveRewardedRhythmResult(result("retry"));
    expect(ledger()).toHaveLength(1);
    expect(dailyGameRewardService.pointsForResult("rhythm", "retry")).toBe(50);
  });

  it("recovers a persisted eligible result after a failed point write exactly once on reopening", async () => {
    database.execute.mockImplementation((...args: Parameters<typeof web.execute>) => {
      if (args[0].startsWith("INSERT OR IGNORE INTO point_transactions")) throw new Error("point disk full");
      return web.execute(...args);
    });
    const first = result("recover");
    await expect(saveRewardedRhythmResult(first)).rejects.toThrow("point disk full");
    expect((await rhythmChallengeService.load()).history).toEqual([{ ...first, dailyRewardEligible: true }]);
    expect(ledger()).toEqual([]);
    expect(web.query("SELECT * FROM app_settings")).toEqual([]);
    database.execute.mockImplementation(web.execute);
    await loadRewardedRhythm();
    await loadRewardedRhythm();
    await saveRewardedRhythmResult(first);
    expect(ledger()).toHaveLength(1);
    expect(dailyGameRewardService.pointsForResult("rhythm", "recover")).toBe(50);
  });

  it("does not resurrect old awards or pending claims after a points reset", async () => {
    const awarded = result("before-reset", 10, 4, 10);
    await saveRewardedRhythmResult(awarded);
    await rhythmChallengeService.saveResult({ ...result("pending-before-reset", 10, 4, 10), dailyRewardEligible: true });
    web.execute("DELETE FROM point_transactions");
    web.execute("INSERT INTO app_settings(setting_key, setting_value) VALUES(?, ?)", ["points_reset_at", "2026-11-04 11:00:00"]);
    await loadRewardedRhythm();
    await saveRewardedRhythmResult(awarded);
    expect(ledger()).toEqual([]);
    expect(dailyGameRewardService.pointsForResult("rhythm", "before-reset")).toBe(0);
    await saveRewardedRhythmResult(result("after-reset", 10, 4, 12));
    await loadRewardedRhythm();
    expect(ledger()).toHaveLength(1);
    expect(dailyGameRewardService.pointsForResult("rhythm", "after-reset")).toBe(50);
    expect(dailyGameRewardService.pointsForResult("rhythm", "before-reset")).toBe(0);
    expect(dailyGameRewardService.pointsForResult("rhythm", "pending-before-reset")).toBe(0);
  });

  it("leaves legacy history unclaimed even if a caller tries to add a reward marker on retry", async () => {
    const legacy = result("legacy", 20);
    await rhythmChallengeService.saveResult(legacy);
    await loadRewardedRhythm();
    await saveRewardedRhythmResult({ ...legacy, dailyRewardEligible: true });
    expect(ledger()).toEqual([]);
    expect((await rhythmChallengeService.load()).history).toEqual([legacy]);
    await saveRewardedRhythmResult(result("new", 10, 4, 13));
    expect(ledger()).toHaveLength(1);
    expect(dailyGameRewardService.pointsForResult("rhythm", "new")).toBe(50);
  });

  it("reconciles pending clears by completion time and uses the completed day when reopening later", async () => {
    const first = { ...result("earlier", 10, 4, 10), dailyRewardEligible: true as const };
    const later = { ...result("later", 20, 4, 12), dailyRewardEligible: true as const };
    await rhythmChallengeService.saveResult(later);
    await rhythmChallengeService.saveResult(first);
    await loadRewardedRhythm();
    expect(dailyGameRewardService.pointsForResult("rhythm", "earlier")).toBe(50);
    expect(dailyGameRewardService.pointsForResult("rhythm", "later")).toBe(0);
    expect(ledger()).toEqual([expect.objectContaining({
      source_key: `game-clear:rhythm:${toDateKey(new Date(first.completedAt))}`,
      created_at: toDateTimeKey(new Date(first.completedAt)), points: 50,
    })]);
  });
});

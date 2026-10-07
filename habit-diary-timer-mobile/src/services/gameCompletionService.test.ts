import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGame, type SugorokuGame } from "../features/sugoroku/game";
import type { OthelloHistoryEntry } from "../features/othello/storage";
import { parseSugorokuSave, SUGOROKU_STORAGE_KEY } from "../features/sugoroku/storage";
import { OTHELLO_STORAGE_KEY, parseOthelloSave } from "../features/othello/storage";
import { loadRewardedOthello, loadRewardedSugoroku, saveRewardedOthelloResult, saveRewardedSugoroku } from "./gameCompletionService";

const mocks = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), award: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: mocks }));
vi.mock("@/features/sugoroku/storage", () => import("../features/sugoroku/storage"));
vi.mock("@/features/othello/storage", () => import("../features/othello/storage"));
vi.mock("./dailyGameRewardService", () => ({ dailyGameRewardService: { award: mocks.award } }));

const values = new Map<string, string>();
const start = "2026-10-07T00:00:00.000Z";
const end = "2026-10-07T00:10:00.000Z";
function sugoroku(id = "sugoroku-first"): SugorokuGame {
  return { ...createGame(start), id, position: 25, phase: "finished", outcome: "goal-1", completedAt: end };
}
function othello(id = "othello-first"): OthelloHistoryEntry {
  return { id, startedAt: start, completedAt: end, difficulty: "easy", humanCount: 40, cpuCount: 24, result: "win", reason: "completed" };
}
beforeEach(() => {
  vi.resetAllMocks(); values.clear();
  mocks.getItem.mockImplementation(async (key: string) => values.get(key) ?? null);
  mocks.setItem.mockImplementation(async (key: string, value: string) => { values.set(key, value); });
});

describe("daily rewards paired with durable game history", () => {
  it("persists a sugoroku winning marker before claiming, while retaining its original finish on retries", async () => {
    mocks.award.mockImplementation(() => {
      expect(JSON.parse(values.get(SUGOROKU_STORAGE_KEY)!).history[0].dailyRewardEligible).toBe(true);
    });
    const first = await saveRewardedSugoroku(sugoroku());
    expect(first.history[0].dailyRewardEligible).toBe(true);
    expect(mocks.award).toHaveBeenCalledWith("sugoroku", "sugoroku-first", end);
    await saveRewardedSugoroku({ ...sugoroku(), completedAt: "2026-10-08T00:00:00.000Z" });
    expect((await loadRewardedSugoroku()).history[0].completedAt).toBe(end);
  });

  it("does not give a sugoroku reward before its goal event is completed", async () => {
    await saveRewardedSugoroku({ ...sugoroku(), phase: "goal", completedAt: null });
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("does not give an othello loss, surrender, or draw a reward", async () => {
    for (const result of [
      { ...othello("loss"), result: "loss" as const, humanCount: 24, cpuCount: 40 },
      { ...othello("draw"), result: "draw" as const, humanCount: 32, cpuCount: 32 },
      { ...othello("surrender"), result: "loss" as const, reason: "surrender" as const },
    ]) await saveRewardedOthelloResult(result);
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it.each(["sugoroku", "othello"] as const)("recovers a persisted %s win when its first point write failed", async (game) => {
    mocks.award.mockImplementationOnce(() => { throw new Error("disk full"); });
    const save = game === "sugoroku" ? () => saveRewardedSugoroku(sugoroku()) : () => saveRewardedOthelloResult(othello());
    const load = game === "sugoroku" ? loadRewardedSugoroku : loadRewardedOthello;
    await expect(save()).rejects.toThrow("disk full");
    expect((await load()).history).toHaveLength(1);
    expect(mocks.award).toHaveBeenCalledTimes(2);
    expect(mocks.award.mock.calls[0]).toEqual(mocks.award.mock.calls[1]);
  });

  it.each(["sugoroku", "othello"] as const)("does not claim %s points when history storage fails", async (game) => {
    mocks.setItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(game === "sugoroku" ? saveRewardedSugoroku(sugoroku()) : saveRewardedOthelloResult(othello())).rejects.toThrow("disk full");
    expect(mocks.award).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
  });

  it("never turns pre-update winning history into a new reward, including a duplicate save", async () => {
    values.set(SUGOROKU_STORAGE_KEY, JSON.stringify({ version: 1, current: null, history: [sugoroku()] }));
    values.set(OTHELLO_STORAGE_KEY, JSON.stringify({ version: 1, current: null, history: [othello()], achievements: [] }));
    await loadRewardedSugoroku(); await loadRewardedOthello();
    await saveRewardedSugoroku(sugoroku()); await saveRewardedOthelloResult(othello());
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("reconciles pending wins in completion order so the oldest pending clear claims first", async () => {
    const earlier = { ...othello("earlier"), completedAt: "2026-10-07T00:05:00.000Z", dailyRewardEligible: true };
    const later = { ...othello("later"), dailyRewardEligible: true };
    values.set(OTHELLO_STORAGE_KEY, JSON.stringify({ version: 1, current: null, history: [later, earlier], achievements: [] }));
    await loadRewardedOthello();
    expect(mocks.award.mock.calls.map((call) => call[1])).toEqual(["earlier", "later"]);
  });

  it("preserves a winning marker on ordinary othello save retries and rejects a conflicting result", async () => {
    await saveRewardedOthelloResult(othello());
    await saveRewardedOthelloResult(othello());
    expect((await loadRewardedOthello()).history[0].dailyRewardEligible).toBe(true);
    await expect(saveRewardedOthelloResult({ ...othello(), humanCount: 50, cpuCount: 14 })).rejects.toThrow();
  });

  it("rejects reward markers on unfinished, losing or malformed restored games", () => {
    expect(() => parseSugorokuSave(JSON.stringify({ version: 1, current: { ...createGame(start), dailyRewardEligible: true }, history: [] }))).toThrow();
    for (const change of [{ dailyRewardEligible: false }, { result: "loss", humanCount: 24, cpuCount: 40 }]) {
      expect(() => parseOthelloSave(JSON.stringify({ version: 1, current: null,
        history: [{ ...othello(), dailyRewardEligible: true, ...change }], achievements: [] }))).toThrow();
    }
  });
});

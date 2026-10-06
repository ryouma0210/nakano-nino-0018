import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chooseRoute, completeEvent, createGame, failGame, getDefeatTile, getDiceMovementRule, getDisplayedDiceResult, retireGame,
  rollDice, ROUTE_TILES, type SugorokuGame,
} from "./game";
import { clearSugoroku, getSugorokuAchievements, loadSugoroku, parseSugorokuSave, saveSugoroku } from "./storage";

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));

const key = "nino-room:sugoroku:v1";
let raw: string | null;

function started(id = "game-1"): SugorokuGame {
  return { ...createGame("2026-10-03T00:00:00.000Z"), id };
}

function finished(id = "game-1"): SugorokuGame {
  return completeEvent(rollDice(failGame(started(id)), 3), "2026-10-03T00:01:00.000Z");
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  raw = null;
  storage.getItem.mockImplementation(async () => raw);
  storage.setItem.mockImplementation(async (_key: string, value: string) => { raw = value; });
  storage.removeItem.mockImplementation(async () => { raw = null; });
});

describe("sugoroku persistence", () => {
  it("returns an empty save for a missing key without writing", async () => {
    expect(await loadSugoroku()).toEqual({ version: 1, current: null, history: [], achievements: [] });
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(key);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("resumes exact progress and stores current progress and history in one key", async () => {
    const previous = finished("previous");
    await saveSugoroku(previous);
    const game = rollDice(started(), 3);
    const result = await saveSugoroku(game);

    expect(result).toEqual({ version: 1, current: game, history: [previous], achievements: [] });
    expect(await loadSugoroku()).toEqual(result);
    expect(storage.setItem.mock.calls.every(([storageKey]) => storageKey === key)).toBe(true);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("snapshots input before queued reads and does not retain references to returned data", async () => {
    const game = started();
    const saving = saveSugoroku(game);
    game.id = "mutated-after-call";
    const saved = await saving;
    expect(saved.current?.id).toBe("game-1");

    saved.current!.id = "mutated-after-save";
    expect((await loadSugoroku()).current?.id).toBe("game-1");
  });

  it("restores adjusted faces including zero without consuming the persistent reduction", async () => {
    for (const [die, adjusted] of [[6, 4], [2, 0]]) {
      const game = rollDice({ ...started(`adjusted-${die}`), nextRollReduction: 2 }, die);
      await saveSugoroku(game);
      const restored = (await loadSugoroku()).current!;
      expect(restored).toMatchObject({ diceResult: die, adjustedDiceResult: adjusted, nextRollReduction: 2 });
      expect(getDisplayedDiceResult(restored)).toBe(adjusted);
      expect(getDiceMovementRule(restored)).toBe("minus-two");
    }
  });

  it("resumes a legacy -2 debuff across rolls, a forced stop, and repeated reloads", async () => {
    const legacy = { ...started(), nextRollReduction: 2 as const };
    delete legacy.adjustedDiceResult;
    raw = JSON.stringify({ version: 1, current: legacy, history: [finished("previous")] });
    let state = (await loadSugoroku()).current!;
    for (const position of [4, 7, 11, 14, 18, 21]) {
      state = rollDice(state, 6);
      expect(state.position).toBe(position);
      await saveSugoroku(state);
      state = (await loadSugoroku()).current!;
      expect(getDiceMovementRule(state)).toBe("minus-two");
      state = completeEvent(state);
      await saveSugoroku(state);
      state = (await loadSugoroku()).current!;
      expect(getDiceMovementRule(state)).toBe(position === 21 ? "forced-one" : "minus-two");
    }
    expect(state).toMatchObject({ nextRollReduction: 0, forceOneUntilBranch: true });
    expect((await loadSugoroku()).history[0].id).toBe("previous");
  });

  it("loads legacy progress and history and starts preserving corrections on the next roll", async () => {
    const current = completeEvent(rollDice(started(), 3));
    const previous = finished("legacy-history");
    delete current.adjustedDiceResult;
    delete previous.adjustedDiceResult;
    raw = JSON.stringify({ version: 1, current, history: [previous] });

    const loaded = await loadSugoroku();
    expect(loaded).toEqual({ version: 1, current, history: [previous], achievements: [] });
    expect(getDisplayedDiceResult(loaded.current!)).toBe(3);
    expect(getDisplayedDiceResult(loaded.history[0])).toBe(3);
    const next = rollDice(loaded.current!, 6);
    await saveSugoroku(next);
    expect((await loadSugoroku()).current).toMatchObject({ diceResult: 6, adjustedDiceResult: 6, movement: 4 });
    expect((await loadSugoroku()).history).toEqual([previous]);
  });

  it("derives defeat spaces from unchanged legacy history, including inserted stops", async () => {
    const stopped = {
      ...started("legacy-retire"), extended: true,
      position: ROUTE_TILES.find((tile) => tile.id === "stop-2")!.position!, phase: "event" as const,
    };
    const failed = { ...started("legacy-fail"), position: -5, phase: "event" as const };
    const history = [
      completeEvent(rollDice(completeEvent(retireGame(stopped)), 3), "2026-10-03T00:01:00.000Z"),
      completeEvent(rollDice(failGame(failed), 5), "2026-10-03T00:01:00.000Z"),
    ];
    for (const game of history) delete game.adjustedDiceResult;
    raw = JSON.stringify({ version: 1, current: null, history });
    const originalRaw = raw;

    const loaded = await loadSugoroku();
    expect(loaded.history.map((game) => getDefeatTile(game)?.label)).toEqual(["ストップ2", "-5マス目"]);
    expect(raw).toBe(originalRaw);
    expect(storage.setItem).not.toHaveBeenCalled();

    await saveSugoroku(started("next-game"));
    expect((await loadSugoroku()).history).toEqual(history);
  });

  it("rejects invalid stored corrections without replacing the saved progress or history", async () => {
    const current = rollDice(started(), 6);
    raw = JSON.stringify({ version: 1, current: { ...current, adjustedDiceResult: 4 }, history: [finished("previous")] });
    const invalid = raw;
    await expect(loadSugoroku()).rejects.toThrow("すごろくの保存データを読み込めませんでした。");
    await expect(saveSugoroku(started("new"))).rejects.toThrow("すごろくの保存データを読み込めませんでした。");
    expect(raw).toBe(invalid);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("finishes a game atomically, prepends history, and deduplicates repeated completion", async () => {
    const previous = finished("previous");
    const game = finished();
    await saveSugoroku(previous);
    await saveSugoroku(started());
    await saveSugoroku(game);
    const saved = await saveSugoroku(game);

    expect(saved).toEqual({ version: 1, current: null, history: [game, previous], achievements: [] });
    expect(await loadSugoroku()).toEqual(saved);
  });

  it("retains only the most recent 100 completed games", async () => {
    const games = Array.from({ length: 105 }, (_, index) => finished(`game-${index}`));
    await Promise.all(games.map(saveSugoroku));

    expect((await loadSugoroku()).history.map((game) => game.id)).toEqual(
      games.slice(5).reverse().map((game) => game.id),
    );
  });

  it("serializes saves and reads so overlapping completions do not lose history", async () => {
    const entered = deferred();
    const release = deferred();
    storage.setItem.mockImplementationOnce(async (_key: string, value: string) => {
      entered.resolve();
      await release.promise;
      raw = value;
    });
    const first = saveSugoroku(finished("first"));
    await entered.promise;
    const second = saveSugoroku(finished("second"));
    const loading = loadSugoroku();
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    release.resolve();

    await Promise.all([first, second]);
    expect((await loading).history.map((game) => game.id)).toEqual(["second", "first"]);
  });

  it("keeps an existing save when a write fails and allows a subsequent retry", async () => {
    await saveSugoroku(started());
    const previousRaw = raw;
    const failure = new Error("disk full");
    storage.setItem.mockRejectedValueOnce(failure);
    await expect(saveSugoroku(finished())).rejects.toBe(failure);
    expect(raw).toBe(previousRaw);
    expect((await loadSugoroku()).current?.id).toBe("game-1");

    expect((await saveSugoroku(finished())).current).toBeNull();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("does not overwrite data when reading storage fails", async () => {
    const failure = new Error("read failed");
    storage.getItem.mockRejectedValueOnce(failure);
    await expect(saveSugoroku(started())).rejects.toBe(failure);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect((await saveSugoroku(started())).current?.id).toBe("game-1");
  });

  it.each([
    "",
    "{broken json",
    "null",
    "[]",
    JSON.stringify({ version: 2, current: null, history: [] }),
    JSON.stringify({ version: 1, history: [] }),
    JSON.stringify({ version: 1, current: null, history: "not-an-array" }),
  ])("rejects invalid stored data without replacing it: %s", async (invalid) => {
    raw = invalid;
    await expect(loadSugoroku()).rejects.toThrow("すごろくの保存データを読み込めませんでした。");
    await expect(saveSugoroku(started())).rejects.toThrow("すごろくの保存データを読み込めませんでした。");
    expect(raw).toBe(invalid);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("preserves good history beside an invalid record until the data is repaired", async () => {
    raw = JSON.stringify({ version: 1, current: null, history: [finished("good"), { id: "broken" }] });
    const invalid = raw;
    await expect(saveSugoroku(started())).rejects.toThrow("すごろくの保存データを読み込めませんでした。");
    expect(raw).toBe(invalid);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("rejects malformed current games or unfinished/duplicate history", async () => {
    const invalidRecords = [
      { current: { id: "broken" }, history: [finished()] },
      { current: finished(), history: [] },
      { current: null, history: [started()] },
      { current: null, history: [finished(), finished()] },
      { current: started(), history: [finished()] },
    ];
    for (const invalid of invalidRecords) {
      raw = JSON.stringify({ version: 1, ...invalid });
      await expect(loadSugoroku()).rejects.toThrow("すごろくの保存データを読み込めませんでした。");
    }
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("rejects invalid incoming game data before touching storage", async () => {
    await expect(saveSugoroku({ id: "invalid" } as SugorokuGame)).rejects.toThrow(
      "保存するすごろくのデータが正しくありません。",
    );
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("prevents a delayed progress save from reopening an already finished game", async () => {
    await saveSugoroku(finished());
    await expect(saveSugoroku(started())).rejects.toThrow("終了したゲームは再開できません。");
    expect((await loadSugoroku()).current).toBeNull();
  });

  it("keeps a different active game if an older completion is saved again", async () => {
    await saveSugoroku(finished("older"));
    const current = started("newer");
    await saveSugoroku(current);
    const saved = await saveSugoroku(finished("older"));

    expect(saved.current).toEqual(current);
    expect(saved.history).toHaveLength(1);
  });

  it("serializes full reset after any pending save", async () => {
    const entered = deferred();
    const release = deferred();
    storage.setItem.mockImplementationOnce(async (_key: string, value: string) => {
      entered.resolve();
      await release.promise;
      raw = value;
    });
    const saving = saveSugoroku(started());
    await entered.promise;
    const clearing = clearSugoroku();
    expect(storage.removeItem).not.toHaveBeenCalled();
    release.resolve();
    await Promise.all([saving, clearing]);

    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(key);
    expect(await loadSugoroku()).toEqual({ version: 1, current: null, history: [], achievements: [] });
  });
});

function goalGame(id: string, goal: "goal-1" | "goal-2"): SugorokuGame {
  const state = goal === "goal-1"
    ? chooseRoute(completeEvent({ ...started(id), position: 25, phase: "event" }), false)
    : rollDice({ ...started(id), position: 44, extended: true }, 6);
  return completeEvent(state, "2026-10-03T00:02:00.000Z");
}

describe("sugoroku logs and permanent achievements", () => {
  it("retains exact logs on resume and snapshots nested log arrays before saving", async () => {
    const state = completeEvent(rollDice(started(), 1));
    const expected = JSON.parse(JSON.stringify(state));
    const saving = saveSugoroku(state);
    state.logs![1].effectsAdded.length = 0;
    state.logs![0].toTileId = "40";
    await saving;
    const restored = (await loadSugoroku()).current!;
    expect(restored).toEqual(expected);
    const next = rollDice(completeEvent(restored), 6);
    expect(next.logs!.at(-1)).toMatchObject({ sequence: 4, fromTileId: "-6", toTileId: "-5", dice: 6, adjustedDice: 1 });
    await saveSugoroku(next);
    expect((await loadSugoroku()).current?.logs).toEqual(next.logs);
  });

  it("loads old saves without making up past actions and starts the log at the next operation", async () => {
    const current = completeEvent(rollDice(started(), 3));
    delete current.logs;
    const previous = finished("legacy");
    delete previous.logs;
    raw = JSON.stringify({ version: 1, current, history: [previous] });
    const before = raw;
    const saved = await loadSugoroku();
    expect(saved.current?.logs).toBeUndefined();
    expect(saved.history[0].logs).toBeUndefined();
    expect(raw).toBe(before);
    expect(storage.setItem).not.toHaveBeenCalled();
    const next = rollDice(saved.current!, 6);
    expect(next.logs).toHaveLength(1);
    expect(next.logs![0]).toMatchObject({ sequence: 1, fromTileId: "3", toTileId: "7", forcedStop: true });
    await saveSugoroku(next);
    expect((await loadSugoroku()).history[0].logs).toBeUndefined();
  });

  it("normalizes legacy goal achievements without writing or awarding an unfinished goal", async () => {
    const current = chooseRoute(completeEvent({ ...started("pending"), position: 25, phase: "event" }), false);
    raw = JSON.stringify({ version: 1, current, history: [goalGame("old-hard", "goal-2"), finished("old-failed")] });
    const original = raw;
    const saved = await loadSugoroku();
    expect(saved.achievements).toEqual(["goal-2"]);
    expect(getSugorokuAchievements(saved)).toEqual(["goal-2"]);
    expect(parseSugorokuSave(original).achievements).toEqual(["goal-2"]);
    expect(raw).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
    await saveSugoroku(current);
    expect((await loadSugoroku()).achievements).toEqual(["goal-2"]);
    await saveSugoroku(completeEvent(current));
    expect((await loadSugoroku()).achievements).toEqual(["goal-1", "goal-2"]);
  });

  it("keeps goal unlocks after both winning games have left the 100-entry history", async () => {
    await saveSugoroku(goalGame("normal-clear", "goal-1"));
    await saveSugoroku(goalGame("hard-clear", "goal-2"));
    for (let index = 0; index < 101; index += 1) await saveSugoroku(finished(`later-${index}`));
    const saved = await loadSugoroku();
    expect(saved.history).toHaveLength(100);
    expect(saved.history.every((entry) => entry.outcome === "penalty")).toBe(true);
    expect(saved.achievements).toEqual(["goal-1", "goal-2"]);
    expect(JSON.parse(raw!).achievements).toEqual(["goal-1", "goal-2"]);
    await clearSugoroku();
    expect((await loadSugoroku()).achievements).toEqual([]);
  });

  it("commits a finished game's logs and achievement together, preserving both on a failed write", async () => {
    const pending = chooseRoute(completeEvent({ ...started(), position: 25, phase: "event" }), false);
    await saveSugoroku(pending);
    const before = raw;
    const completed = completeEvent(pending);
    storage.setItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(saveSugoroku(completed)).rejects.toThrow("disk full");
    expect(raw).toBe(before);
    expect((await loadSugoroku()).achievements).toEqual([]);
    const saved = await saveSugoroku(completed);
    expect(saved.current).toBeNull();
    expect(saved.achievements).toEqual(["goal-1"]);
    expect(saved.history[0].logs).toEqual(completed.logs);
    expect(saved.history[0].logs!.at(-1)?.kind).toBe("finish");
  });

  it.each([null, "goal-1", ["goal-3"], ["goal-1", "goal-1"]])("rejects malformed achievement flags without rewriting data: %j", async (achievements) => {
    raw = JSON.stringify({ version: 1, current: started(), history: [], achievements });
    const before = raw;
    expect(() => parseSugorokuSave(raw!)).toThrow();
    await expect(saveSugoroku(started("new"))).rejects.toThrow();
    expect(raw).toBe(before);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("rejects a malformed progress log during loading, backup parsing and saving", async () => {
    const state = rollDice(started(), 6);
    state.logs![0].toTileId = "missing-space";
    raw = JSON.stringify({ version: 1, current: state, history: [], achievements: [] });
    const before = raw;
    expect(() => parseSugorokuSave(raw!)).toThrow();
    await expect(loadSugoroku()).rejects.toThrow();
    await expect(saveSugoroku(state)).rejects.toThrow();
    expect(raw).toBe(before);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOthelloHistory, discardOthelloCurrent, loadOthello, loadOthelloHistory, OTHELLO_STORAGE_KEY,
  parseOthelloSave, saveOthelloCurrent, saveOthelloResult, type OthelloCurrent, type OthelloHistoryEntry,
} from "./storage";
import { createGame, playMove, type Cell } from "./game";

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
let raw: string | null;

function finished(id = "game-1", overrides: Partial<OthelloHistoryEntry> = {}): OthelloHistoryEntry {
  return {
    id, startedAt: "2026-10-06T01:00:00.000Z", completedAt: "2026-10-06T01:10:00.000Z",
    difficulty: "normal", humanCount: 36, cpuCount: 28, result: "win", reason: "completed", ...overrides,
  };
}

function current(overrides: Partial<OthelloCurrent> = {}): OthelloCurrent {
  return { id: "current", startedAt: "2026-10-06T01:00:00.000Z", difficulty: "normal", game: createGame(), assistance: null, ...overrides };
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

describe("othello history persistence", () => {
  it("loads empty history without creating a save", async () => {
    expect(await loadOthelloHistory()).toEqual([]);
    expect(storage.getItem).toHaveBeenCalledExactlyOnceWith(OTHELLO_STORAGE_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("persists completed wins, losses, draws, and a surrender while ahead", async () => {
    const entries = [
      finished("win", { difficulty: "easy" }),
      finished("loss", { humanCount: 22, cpuCount: 42, result: "loss", difficulty: "hard" }),
      finished("draw", { humanCount: 32, cpuCount: 32, result: "draw" }),
      finished("surrender", { humanCount: 10, cpuCount: 2, result: "loss", reason: "surrender" }),
    ];
    for (const entry of entries) await saveOthelloResult(entry);
    expect(await loadOthelloHistory()).toEqual([...entries].reverse());
    expect(JSON.parse(raw!)).toEqual({ version: 1, current: null, history: [...entries].reverse(), achievements: ["played", "win"] });
    expect(storage.setItem.mock.calls.every(([key]) => key === OTHELLO_STORAGE_KEY)).toBe(true);
  });

  it("accepts a finished board with empty spaces and sorts by completion, not write order", async () => {
    const later = finished("later", { humanCount: 10, cpuCount: 0 });
    const earlier = finished("earlier", { completedAt: "2026-10-06T01:01:00.000Z" });
    await saveOthelloResult(later);
    await saveOthelloResult(earlier);
    expect(await loadOthelloHistory()).toEqual([later, earlier]);
  });

  it("keeps only the newest 100 completions even when an old game is saved late", async () => {
    for (let index = 0; index < 105; index += 1) {
      await saveOthelloResult(finished(`game-${index}`, { completedAt: new Date(Date.UTC(2026, 9, 6, 1, 1, index)).toISOString() }));
    }
    await saveOthelloResult(finished("old", { completedAt: "2026-10-06T01:00:00.000Z" }));
    const history = await loadOthelloHistory();
    expect(history).toHaveLength(100);
    expect(history[0].id).toBe("game-104");
    expect(history[99].id).toBe("game-5");
    expect(JSON.parse(raw!).history).toHaveLength(100);
  });

  it("makes repeated result saving idempotent without another write", async () => {
    const entry = finished();
    await Promise.all([saveOthelloResult(entry), saveOthelloResult(entry), saveOthelloResult({ ...entry })]);
    expect(await loadOthelloHistory()).toEqual([entry]);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("protects a stored result when the same ID is reused for different valid data", async () => {
    const entry = finished();
    await saveOthelloResult(entry);
    const previous = raw;
    await expect(saveOthelloResult({ ...entry, humanCount: 40, cpuCount: 24 })).rejects.toThrow("同じ対局IDの異なる結果は保存できません。");
    expect(raw).toBe(previous);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("snapshots submitted data and keeps later caller mutations outside storage", async () => {
    const entry = finished();
    const saving = saveOthelloResult(entry);
    entry.id = "changed";
    const history = await saving;
    expect(history[0].id).toBe("game-1");
    history[0].id = "mutated-return";
    expect((await loadOthelloHistory())[0].id).toBe("game-1");
  });

  it("serializes overlapping saves and reads without dropping either completion", async () => {
    const entered = deferred();
    const release = deferred();
    storage.setItem.mockImplementationOnce(async (_key: string, value: string) => {
      entered.resolve();
      await release.promise;
      raw = value;
    });
    const first = saveOthelloResult(finished("first"));
    await entered.promise;
    const second = saveOthelloResult(finished("second"));
    const reading = loadOthelloHistory();
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    release.resolve();
    await Promise.all([first, second]);
    expect((await reading).map((entry) => entry.id)).toEqual(["second", "first"]);
  });

  it("propagates write failures, retains earlier history, and allows retry", async () => {
    await saveOthelloResult(finished("earlier"));
    const previous = raw;
    const failure = new Error("storage full");
    storage.setItem.mockRejectedValueOnce(failure);
    await expect(saveOthelloResult(finished("new"))).rejects.toBe(failure);
    expect(raw).toBe(previous);
    expect((await saveOthelloResult(finished("new"))).map((entry) => entry.id)).toEqual(["new", "earlier"]);
  });

  it("never writes after a failed read and recovers the operation queue", async () => {
    const failure = new Error("unavailable");
    storage.getItem.mockRejectedValueOnce(failure);
    await expect(saveOthelloResult(finished())).rejects.toBe(failure);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(await saveOthelloResult(finished())).toEqual([finished()]);
  });

  it.each([
    "", "{broken", "null", "[]", JSON.stringify({ version: 2, history: [] }),
    JSON.stringify({ version: 1 }), JSON.stringify({ version: 1, history: {} }),
    JSON.stringify({ version: 1, history: [finished(), finished()] }),
    JSON.stringify({ version: 1, history: [finished(), { id: "broken" }] }),
    JSON.stringify({ version: 1, history: [finished("invalid", { result: "loss" })] }),
  ])("rejects corrupt stored data on load and save without replacing it: %s", async (invalid) => {
    raw = invalid;
    await expect(loadOthelloHistory()).rejects.toThrow("オセロのプレイ履歴を読み込めませんでした。");
    await expect(saveOthelloResult(finished("new"))).rejects.toThrow("オセロのプレイ履歴を読み込めませんでした。");
    expect(raw).toBe(invalid);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    { id: " " }, { id: "x".repeat(201) }, { difficulty: "unknown" }, { result: "unfinished" }, { reason: "playing" },
    { humanCount: -1 }, { humanCount: 1.5 }, { cpuCount: 65 }, { cpuCount: Number.NaN }, { cpuCount: "28" },
    { humanCount: 64, cpuCount: 1 }, { humanCount: 20, cpuCount: 44, result: "win" },
    { humanCount: 32, cpuCount: 32, result: "loss" }, { reason: "surrender", result: "win" },
    { startedAt: "yesterday" }, { completedAt: "2026-02-30T01:00:00.000Z" },
    { completedAt: "2026-10-06" }, { completedAt: "2026-10-06T00:59:00.000Z" },
  ])("rejects invalid incoming data before accessing storage: %j", async (overrides) => {
    await expect(saveOthelloResult({ ...finished(), ...overrides } as OthelloHistoryEntry)).rejects.toThrow("保存するオセロの結果が正しくありません。");
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("waits for pending writes before reset and can explicitly clear corrupt data", async () => {
    const entered = deferred();
    const release = deferred();
    storage.setItem.mockImplementationOnce(async (_key: string, value: string) => {
      entered.resolve();
      await release.promise;
      raw = value;
    });
    const saving = saveOthelloResult(finished());
    await entered.promise;
    const clearing = clearOthelloHistory();
    expect(storage.removeItem).not.toHaveBeenCalled();
    release.resolve();
    await Promise.all([saving, clearing]);
    expect(storage.removeItem).toHaveBeenCalledExactlyOnceWith(OTHELLO_STORAGE_KEY);
    expect(await loadOthelloHistory()).toEqual([]);
    raw = "corrupt";
    await clearOthelloHistory();
    expect(await loadOthelloHistory()).toEqual([]);
  });

  it("re-reads restored storage instead of returning cached history", async () => {
    await saveOthelloResult(finished("current"));
    raw = JSON.stringify({ version: 1, history: [finished("restored")] });
    expect((await loadOthelloHistory()).map((entry) => entry.id)).toEqual(["restored"]);
  });
});

describe("othello resumable matches and permanent achievements", () => {
  it("loads a fresh save without writing or granting achievements", async () => {
    expect(await loadOthello()).toEqual({ version: 1, current: null, history: [], achievements: [] });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each(["easy", "normal", "hard"] as const)("resumes both turns at %s strength with the original board and last move", async (difficulty) => {
    const humanTurn = current({ difficulty });
    await saveOthelloCurrent(humanTurn);
    expect((await loadOthello()).current).toEqual(humanTurn);
    const cpuTurn = { ...humanTurn, game: playMove(humanTurn.game, 19) };
    await saveOthelloCurrent(cpuTurn);
    expect((await loadOthello()).current).toEqual(cpuTurn);
    expect((await loadOthello()).achievements).toEqual([]);
  });

  it.each([
    { kind: "manual", move: 19 }, { kind: "single", move: 26 },
    { kind: "fast", paused: false }, { kind: "fast", paused: true },
  ] as const)("resumes saved assistance %j without changing its intent", async (assistance) => {
    const entry = current({ assistance });
    await saveOthelloCurrent(entry);
    expect((await loadOthello()).current).toEqual(entry);
  });

  it("preserves a valid forced pass and the remaining player's turn", async () => {
    const board = Array<Cell>(64).fill(1);
    board[0] = 0; board[1] = -1;
    const entry = current({ game: { board, turn: 1, status: "playing", lastMove: 2, passedPlayer: -1, winner: null } });
    await saveOthelloCurrent(entry);
    expect((await loadOthello()).current).toEqual(entry);
  });

  it("snapshots a queued current board and assistance before the caller can mutate them", async () => {
    const entered = deferred();
    const release = deferred();
    storage.setItem.mockImplementationOnce(async (_key: string, value: string) => {
      entered.resolve(); await release.promise; raw = value;
    });
    const blocking = saveOthelloResult(finished("earlier"));
    await entered.promise;
    const submitted = current({ assistance: { kind: "manual", move: 19 } });
    const expected = structuredClone(submitted);
    const saving = saveOthelloCurrent(submitted);
    submitted.id = "caller-mutated";
    (submitted.game.board as Cell[])[19] = 1;
    if (submitted.assistance?.kind === "manual") submitted.assistance.move = 26;
    release.resolve();
    await Promise.all([blocking, saving]);
    const loaded = await loadOthello();
    expect(loaded.current).toEqual(expected);
    (loaded.current!.game.board as Cell[])[26] = -1;
    loaded.current!.difficulty = "easy";
    expect((await loadOthello()).current).toEqual(expected);
  });

  it("clears only the matching in-progress match when its result is saved", async () => {
    await saveOthelloCurrent(current());
    await saveOthelloResult(finished("different"));
    expect((await loadOthello()).current?.id).toBe("current");
    await saveOthelloResult(finished("current"));
    expect((await loadOthello()).current).toBeNull();
    expect((await loadOthello()).history.map((entry) => entry.id)).toEqual(["current", "different"]);
  });

  it("rejects a delayed current save after its queued result finishes", async () => {
    await saveOthelloCurrent(current());
    const completed = saveOthelloResult(finished("current"));
    const late = saveOthelloCurrent(current());
    await expect(late).rejects.toThrow("終了した対局は再開できません。");
    await completed;
    const saved = await loadOthello();
    expect(saved.current).toBeNull();
    expect(saved.history).toEqual([finished("current")]);
  });

  it("protects a newer match from another match's save or stale discard", async () => {
    await saveOthelloCurrent(current({ id: "old" }));
    await discardOthelloCurrent("old");
    await saveOthelloCurrent(current({ id: "new" }));
    const previous = raw;
    await discardOthelloCurrent("old");
    await expect(saveOthelloCurrent(current({ id: "old" }))).rejects.toThrow("別の対局が保存されています。");
    expect(raw).toBe(previous);
    expect((await loadOthello()).current?.id).toBe("new");
  });

  it("serializes current saves, discard, new match, and reset without reviving old state", async () => {
    const entered = deferred();
    const release = deferred();
    storage.setItem.mockImplementationOnce(async (_key: string, value: string) => {
      entered.resolve(); await release.promise; raw = value;
    });
    const first = saveOthelloCurrent(current());
    await entered.promise;
    const moved = saveOthelloCurrent(current({ game: playMove(createGame(), 19) }));
    const discarding = discardOthelloCurrent("current");
    const newMatch = saveOthelloCurrent(current({ id: "next" }));
    const resetting = clearOthelloHistory();
    const reading = loadOthello();
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    release.resolve();
    await Promise.all([first, moved, discarding, newMatch, resetting]);
    expect(await reading).toEqual({ version: 1, current: null, history: [], achievements: [] });
    expect(raw).toBeNull();
  });

  it("preserves the last successful current after failed movement save, then retries", async () => {
    const start = current();
    await saveOthelloCurrent(start);
    const previous = raw;
    const moved = current({ game: playMove(start.game, 19) });
    storage.setItem.mockRejectedValueOnce(new Error("storage full"));
    await expect(saveOthelloCurrent(moved)).rejects.toThrow("storage full");
    expect(raw).toBe(previous);
    expect((await loadOthello()).current).toEqual(start);
    await saveOthelloCurrent(moved);
    expect((await loadOthello()).current).toEqual(moved);
  });

  it("preserves the current and existing achievements if saving its result fails", async () => {
    await saveOthelloResult(finished("previous", { difficulty: "hard" }));
    await saveOthelloCurrent(current());
    const previous = raw;
    storage.setItem.mockRejectedValueOnce(new Error("storage full"));
    await expect(saveOthelloResult(finished("current"))).rejects.toThrow("storage full");
    expect(raw).toBe(previous);
    await saveOthelloResult(finished("current"));
    expect((await loadOthello()).current).toBeNull();
    expect((await loadOthello()).achievements).toEqual(["played", "win", "normal-win", "hard-win"]);
  });

  it("recovers after read, discard, and reset failures without silently losing the current", async () => {
    await saveOthelloCurrent(current());
    const previous = raw;
    storage.getItem.mockRejectedValueOnce(new Error("read failed"));
    await expect(saveOthelloCurrent(current())).rejects.toThrow("read failed");
    storage.setItem.mockRejectedValueOnce(new Error("discard failed"));
    await expect(discardOthelloCurrent("current")).rejects.toThrow("discard failed");
    storage.removeItem.mockRejectedValueOnce(new Error("reset failed"));
    await expect(clearOthelloHistory()).rejects.toThrow("reset failed");
    expect(raw).toBe(previous);
    await discardOthelloCurrent("current");
    expect((await loadOthello()).current).toBeNull();
    await clearOthelloHistory();
    expect(raw).toBeNull();
  });

  it("derives all earned titles from legacy history without rewriting it on load", async () => {
    const history = [finished("normal"), finished("hard", { difficulty: "hard" })];
    raw = JSON.stringify({ version: 1, history });
    expect(await loadOthello()).toEqual({ version: 1, current: null, history, achievements: ["played", "win", "normal-win", "hard-win"] });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("retains achievements when their winning record drops outside the 100-game history", async () => {
    await saveOthelloResult(finished("hard-win", { difficulty: "hard", completedAt: "2026-10-06T01:00:00.000Z" }));
    for (let index = 0; index < 100; index += 1) {
      await saveOthelloResult(finished(`loss-${index}`, {
        difficulty: "normal", humanCount: 1, cpuCount: 3, result: "loss", reason: "surrender",
        completedAt: new Date(Date.UTC(2026, 9, 6, 1, 1, index)).toISOString(),
      }));
    }
    const saved = await loadOthello();
    expect(saved.history).toHaveLength(100);
    expect(saved.history.some((entry) => entry.id === "hard-win")).toBe(false);
    expect(saved.achievements).toEqual(["played", "win", "hard-win"]);
    await saveOthelloCurrent(current());
    await discardOthelloCurrent("current");
    expect((await loadOthello()).achievements).toEqual(saved.achievements);
  });

  it("derives legacy titles before trimming an oversized history", () => {
    const history = Array.from({ length: 101 }, (_, index) => finished(`game-${index}`, {
      difficulty: index === 0 ? "hard" : "easy", humanCount: index === 0 ? 36 : 20,
      cpuCount: index === 0 ? 28 : 44, result: index === 0 ? "win" : "loss",
      completedAt: new Date(Date.UTC(2026, 9, 6, 1, 1, index)).toISOString(),
    }));
    const parsed = parseOthelloSave(JSON.stringify({ version: 1, history }));
    expect(parsed.history.some((entry) => entry.id === "game-0")).toBe(false);
    expect(parsed.achievements).toEqual(["played", "win", "hard-win"]);
  });

  const invalidCurrents = [
    { ...current(), id: "" }, { ...current(), difficulty: "other" }, { ...current(), startedAt: "bad date" },
    { ...current(), game: { ...createGame(), board: Array(63).fill(0) } },
    { ...current(), game: { ...createGame(), board: [2, ...createGame().board.slice(1)] } },
    { ...current(), game: { ...createGame(), status: "finished" } },
    { ...current(), game: { ...createGame(), turn: null } },
    { ...current(), game: { ...createGame(), winner: 1 } },
    { ...current(), game: { ...createGame(), lastMove: 0 } },
    { ...current(), game: { ...createGame(), passedPlayer: 1 } },
    { ...current(), game: { ...createGame(), passedPlayer: -1 } },
    { ...current(), game: { ...createGame(), board: Array(64).fill(1) } },
    { ...current(), assistance: { kind: "manual", move: 0 } },
    { ...current(), assistance: { kind: "single", move: 19 }, game: playMove(createGame(), 19) },
    { ...current(), assistance: { kind: "fast", paused: "false" } },
    { ...current(), assistance: { kind: "unknown" } },
  ];

  it.each(invalidCurrents)("rejects an invalid current without accessing storage: %j", async (invalid) => {
    await expect(saveOthelloCurrent(invalid as OthelloCurrent)).rejects.toThrow("保存するオセロの対局が正しくありません。");
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("rejects sparse boards before JSON serialization can turn missing cells into null", async () => {
    const board = [...createGame().board];
    delete board[0];
    const invalid = current({ game: { ...createGame(), board } });
    await expect(saveOthelloCurrent(invalid)).rejects.toThrow("保存するオセロの対局が正しくありません。");
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    { current: { id: "broken" } }, { achievements: ["unknown"] }, { achievements: ["played", "played"] },
    { achievements: "played" }, { achievements: null },
    { current: current({ id: "completed" }), history: [finished("completed")] },
  ])("never overwrites corrupt resume or achievement data: %j", async (extra) => {
    raw = JSON.stringify({ version: 1, current: null, history: [], achievements: [], ...extra });
    const previous = raw;
    await expect(loadOthello()).rejects.toThrow("オセロのプレイ履歴を読み込めませんでした。");
    await expect(saveOthelloCurrent(current())).rejects.toThrow("オセロのプレイ履歴を読み込めませんでした。");
    await expect(saveOthelloResult(finished())).rejects.toThrow("オセロのプレイ履歴を読み込めませんでした。");
    await expect(discardOthelloCurrent("current")).rejects.toThrow("オセロのプレイ履歴を読み込めませんでした。");
    expect(raw).toBe(previous);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

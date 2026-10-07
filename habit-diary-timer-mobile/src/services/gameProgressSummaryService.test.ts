import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEnduranceGame, finishEndurance } from "../features/endurance/game";
import { createEnduranceSession, ENDURANCE_CURRENT_KEY, ENDURANCE_HISTORY_KEY } from "../features/endurance/storage";
import { RESUMABLE_GAMES } from "../features/games/progress";
import { createGame as createOthelloGame } from "../features/othello/game";
import { OTHELLO_STORAGE_KEY } from "../features/othello/storage";
import { createCountdown } from "../features/sugoroku/countdown";
import { createGame as createSugorokuGame } from "../features/sugoroku/game";
import { SUGOROKU_STORAGE_KEY } from "../features/sugoroku/storage";
import { loadGameProgress } from "./gameProgressSummaryService";

const storage = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }));
const database = vi.hoisted(() => ({ queryOne: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
vi.mock("@/database/client", () => database);

const startedAt = "2026-10-07T01:00:00.000Z";
let rows: Map<string, string>;
let settings: Map<string, string>;

function seedGames() {
  const sugoroku = createSugorokuGame(startedAt);
  const othello = { id: "othello-current", startedAt, difficulty: "normal", game: createOthelloGame(), assistance: null };
  const endurance = createEnduranceSession({
    game: createEnduranceGame("game-1", 4, startedAt),
    mediaIds: ["game-1-1", "game-1-2", "game-1-3", "game-1-4"],
    slideTimer: createCountdown(60_000), extraTimer: createCountdown(180_000),
    videoProgress: { positionMs: 0, durationMs: null }, videoComplete: false,
  });
  rows.set(SUGOROKU_STORAGE_KEY, JSON.stringify({ version: 1, current: sugoroku, history: [] }));
  rows.set(OTHELLO_STORAGE_KEY, JSON.stringify({ version: 1, current: othello, history: [], achievements: [] }));
  settings.set(ENDURANCE_CURRENT_KEY, JSON.stringify(endurance));
  return { sugoroku, othello, endurance };
}

beforeEach(() => {
  vi.resetAllMocks();
  rows = new Map();
  settings = new Map();
  storage.getItem.mockImplementation(async (key: string) => rows.get(key) ?? null);
  database.queryOne.mockImplementation((_sql: string, [key]: [string]) => settings.has(key) ? { setting_value: settings.get(key) } : null);
});

afterEach(() => {
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).not.toHaveBeenCalled();
  expect(database.execute).not.toHaveBeenCalled();
  expect(database.transaction).not.toHaveBeenCalled();
});

describe("read-only game room progress", () => {
  it("loads empty legacy installs without creating games, rewards, or settings", async () => {
    expect(await Promise.all(RESUMABLE_GAMES.map(loadGameProgress))).toEqual(
      RESUMABLE_GAMES.map(() => ({ status: "ready", summary: null })),
    );
  });

  it("reads all three current games without writing or consuming timer time", async () => {
    const current = seedGames();
    const before = [...rows, ...settings];
    const results = await Promise.all(RESUMABLE_GAMES.map(loadGameProgress));
    expect(results.map((result) => result.status === "ready" ? result.summary?.id : null)).toEqual([
      current.sugoroku.id, current.othello.id, current.endurance.game.id,
    ]);
    expect([...rows, ...settings]).toEqual(before);
    expect(database.queryOne.mock.calls.every(([sql]) => String(sql).startsWith("SELECT setting_value FROM app_settings"))).toBe(true);
  });

  it("isolates corrupt saved data to one game and recovers on that game's retry", async () => {
    seedGames();
    const valid = rows.get(SUGOROKU_STORAGE_KEY)!;
    rows.set(SUGOROKU_STORAGE_KEY, "broken json");
    expect((await Promise.all(RESUMABLE_GAMES.map(loadGameProgress))).map((result) => result.status)).toEqual(["error", "ready", "ready"]);
    rows.set(SUGOROKU_STORAGE_KEY, valid);
    expect((await loadGameProgress("sugoroku")).status).toBe("ready");
  });

  it("handles independent async and SQLite read failures without rejecting other progress", async () => {
    seedGames();
    storage.getItem.mockImplementation(async (key: string) => {
      if (key === OTHELLO_STORAGE_KEY) throw new Error("storage unavailable");
      return rows.get(key) ?? null;
    });
    database.queryOne.mockImplementation(() => { throw new Error("database unavailable"); });
    expect((await Promise.all(RESUMABLE_GAMES.map(loadGameProgress))).map((result) => result.status)).toEqual(["ready", "error", "error"]);
  });

  it("lets other summaries finish while one game's storage read is still pending", async () => {
    seedGames();
    let release!: (value: string | null) => void;
    const delayed = new Promise<string | null>((resolve) => { release = resolve; });
    storage.getItem.mockImplementation((key: string) => key === SUGOROKU_STORAGE_KEY ? delayed : Promise.resolve(rows.get(key) ?? null));
    const pending = loadGameProgress("sugoroku");
    expect((await loadGameProgress("othello")).status).toBe("ready");
    expect((await loadGameProgress("endurance")).status).toBe("ready");
    release(rows.get(SUGOROKU_STORAGE_KEY)!);
    expect((await pending).status).toBe("ready");
  });

  it("hides an endurance current whose retirement was already recorded", async () => {
    const { endurance } = seedGames();
    settings.set(ENDURANCE_HISTORY_KEY, JSON.stringify({ version: 1, history: [finishEndurance(endurance.game, true, startedAt)] }));
    expect(await loadGameProgress("endurance")).toEqual({ status: "ready", summary: null });
    expect(settings.has(ENDURANCE_CURRENT_KEY)).toBe(true);
  });

  it("does not offer resume for invalid finished-current records", async () => {
    const { sugoroku, othello } = seedGames();
    rows.set(SUGOROKU_STORAGE_KEY, JSON.stringify({ version: 1, current: { ...sugoroku, phase: "finished" }, history: [] }));
    rows.set(OTHELLO_STORAGE_KEY, JSON.stringify({ version: 1, current: { ...othello, game: { ...othello.game, status: "finished" } }, history: [], achievements: [] }));
    expect(await loadGameProgress("sugoroku")).toEqual({ status: "error" });
    expect(await loadGameProgress("othello")).toEqual({ status: "error" });
  });

  it("does not reconcile unclaimed winning history when opening the game room", async () => {
    rows.set(OTHELLO_STORAGE_KEY, JSON.stringify({ version: 1, current: null, achievements: [], history: [{
      id: "unclaimed-win", startedAt, completedAt: startedAt, difficulty: "normal", humanCount: 33, cpuCount: 31,
      reason: "completed", result: "win", dailyRewardEligible: true,
    }] }));
    expect(await loadGameProgress("othello")).toEqual({ status: "ready", summary: null });
    expect(database.queryOne).not.toHaveBeenCalled();
  });
});

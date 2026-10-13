import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dailyPointDateKey, dailyPointKey, hpKey, initializeDailyOutsidePoints, initializeLevel,
  initializePlayerStat, initializeSuccubusAbsorbBonus, levelDateKey, levelKey, mpKey,
  readOutsideLevelSnapshot, readSetting, saveSetting, succubusAbsorbDateKey, succubusAbsorbKey,
} from "./gameState";

const state = vi.hoisted(() => ({ today: "2026-10-06", values: new Map<string, string>() }));
const database = vi.hoisted(() => ({ execute: vi.fn(), queryOne: vi.fn() }));
vi.mock("@/database/client", () => database);
vi.mock("@/utils/date", () => ({ toDateKey: () => state.today, toDateTimeKey: () => `${state.today} 12:00:00` }));

beforeEach(() => {
  vi.resetAllMocks();
  state.today = "2026-10-06";
  state.values.clear();
  database.queryOne.mockImplementation((_sql: string, [key]: string[]) => {
    const value = state.values.get(key);
    return value === undefined ? null : { setting_value: value };
  });
  database.execute.mockImplementation((_sql: string, [key, value]: string[]) => { state.values.set(key, value); });
});

describe("read-only outside level snapshot", () => {
  it("reports the initial 10/10 levels without starting or saving the game", () => {
    expect(readOutsideLevelSnapshot()).toEqual({ playerLevel: 10, succubusLevel: 10 });
    expect(readOutsideLevelSnapshot()).toEqual({ playerLevel: 10, succubusLevel: 10 });
    expect(state.values.size).toBe(0);
    expect(database.execute).not.toHaveBeenCalled();
  });

  it.each([[120, 100], [999, 999], [150, 999]])("reads saved player %i and enemy %i independently without changing them", (playerLevel, succubusLevel) => {
    state.values.set(levelKey, String(playerLevel));
    state.values.set(succubusAbsorbKey, String(succubusLevel));
    const saved = new Map(state.values);
    expect(readOutsideLevelSnapshot()).toEqual({ playerLevel, succubusLevel });
    expect(state.values).toEqual(saved);
    expect(database.execute).not.toHaveBeenCalled();
  });

  it("preserves yesterday's saved levels and leaves daily progression for the next game entry", () => {
    state.values.set(levelKey, "150");
    state.values.set(levelDateKey, "2026-10-05");
    state.values.set(succubusAbsorbKey, "999");
    state.values.set(succubusAbsorbDateKey, "2026-10-05");
    const saved = new Map(state.values);
    expect(readOutsideLevelSnapshot()).toEqual({ playerLevel: 150, succubusLevel: 999 });
    expect(readOutsideLevelSnapshot()).toEqual({ playerLevel: 150, succubusLevel: 999 });
    expect(state.values).toEqual(saved);
    expect(database.execute).not.toHaveBeenCalled();

    expect(initializeLevel()).toBe(160);
    expect(initializeSuccubusAbsorbBonus()).toBe(0);
    expect(readOutsideLevelSnapshot()).toEqual({ playerLevel: 160, succubusLevel: 160 });
    expect(initializeLevel()).toBe(160);
  });

  it.each([undefined, "0", "-5", "NaN", "Infinity"])("falls back to the saved player level when enemy level is %s", (enemyLevel) => {
    state.values.set(levelKey, "151");
    if (enemyLevel !== undefined) state.values.set(succubusAbsorbKey, enemyLevel);
    const saved = new Map(state.values);
    expect(readOutsideLevelSnapshot()).toEqual({ playerLevel: 151, succubusLevel: 151 });
    expect(state.values).toEqual(saved);
    expect(database.execute).not.toHaveBeenCalled();
  });

  it.each([
    { player: "1000", enemy: "9999", expectedPlayer: 999, expectedEnemy: 999 },
    { player: "998.9", enemy: "150.9", expectedPlayer: 998, expectedEnemy: 150 },
    { player: "NaN", enemy: "0", expectedPlayer: 1, expectedEnemy: 1 },
    { player: "-5", enemy: "100", expectedPlayer: 1, expectedEnemy: 100 },
  ])("normalizes displayed levels for $player/$enemy without rewriting storage", ({ player, enemy, expectedPlayer, expectedEnemy }) => {
    state.values.set(levelKey, player);
    state.values.set(succubusAbsorbKey, enemy);
    const saved = new Map(state.values);
    expect(readOutsideLevelSnapshot()).toEqual({ playerLevel: expectedPlayer, succubusLevel: expectedEnemy });
    expect(state.values).toEqual(saved);
    expect(database.execute).not.toHaveBeenCalled();
  });

  it("reads newly saved levels on the next request", () => {
    state.values.set(levelKey, "120");
    expect(readOutsideLevelSnapshot()).toEqual({ playerLevel: 120, succubusLevel: 120 });
    state.values.set(levelKey, "140");
    state.values.set(succubusAbsorbKey, "500");
    expect(readOutsideLevelSnapshot()).toEqual({ playerLevel: 140, succubusLevel: 500 });
    expect(database.execute).not.toHaveBeenCalled();
  });
});

describe("outside player level persistence", () => {
  it("starts at level 10 and awards the daily increase only once", () => {
    expect(initializeLevel()).toBe(10);
    expect(readSetting(levelKey)).toBe("10");
    expect(readSetting(levelDateKey)).toBe(state.today);
    expect(initializeLevel()).toBe(10);
    expect(database.execute).toHaveBeenCalledTimes(2);
  });

  it.each([100, 101, 120, 150, 151, 500, 998, 999])("retains saved level %i on reload without another daily increase", (level) => {
    saveSetting(levelKey, String(level));
    saveSetting(levelDateKey, state.today);
    database.execute.mockClear();
    expect(initializeLevel()).toBe(level);
    expect(readSetting(levelKey)).toBe(String(level));
    expect(database.execute).not.toHaveBeenCalled();
  });

  it.each([[100, 110], [140, 150], [145, 155], [150, 160], [500, 510], [988, 998], [989, 999], [994, 999], [998, 999], [999, 999]])("adds 10 to level %i on the next day, capped at %i", (level, expected) => {
    saveSetting(levelKey, String(level));
    saveSetting(levelDateKey, "2026-10-05");
    expect(initializeLevel()).toBe(expected);
    expect(readSetting(levelKey)).toBe(String(expected));
    expect(readSetting(levelDateKey)).toBe(state.today);
    expect(initializeLevel()).toBe(expected);
  });

  it.each([["NaN", 1], ["Infinity", 1], ["-5", 1], ["1000", 999], ["9999", 999]])("normalizes invalid saved level %s before using or saving it", (level, expected) => {
    state.values.set(levelKey, level);
    state.values.set(levelDateKey, state.today);
    expect(initializeLevel()).toBe(expected);
    expect(readSetting(levelKey)).toBe(String(expected));
  });

  it("keeps HP, MP, and daily points capped at 100 independently of enemy levels", () => {
    state.values.set(hpKey, "120");
    state.values.set(mpKey, "120");
    state.values.set(dailyPointDateKey, state.today);
    state.values.set(dailyPointKey, "120");
    state.values.set(succubusAbsorbDateKey, state.today);
    state.values.set(succubusAbsorbKey, "999");
    expect(initializePlayerStat(hpKey, 100)).toBe(100);
    expect(initializePlayerStat(mpKey, 100, 0)).toBe(100);
    expect(initializeDailyOutsidePoints()).toBe(100);
    expect(initializeSuccubusAbsorbBonus()).toBe(999);
    state.values.set(mpKey, "0");
    expect(initializePlayerStat(mpKey, 100, 0)).toBe(0);
  });

  it.each([80, 100, 150, 151, 500, 998, 999])("preserves saved enemy level %i on same-day reload", (level) => {
    saveSetting(succubusAbsorbKey, String(level));
    saveSetting(succubusAbsorbDateKey, state.today);
    database.execute.mockClear();
    expect(initializeSuccubusAbsorbBonus()).toBe(level);
    expect(readSetting(succubusAbsorbKey)).toBe(String(level));
    expect(database.execute).not.toHaveBeenCalled();
  });

  it("caps restored enemy levels at 999 and keeps the existing next-day reset", () => {
    state.values.set(succubusAbsorbKey, "1000");
    state.values.set(succubusAbsorbDateKey, state.today);
    expect(initializeSuccubusAbsorbBonus()).toBe(999);
    state.today = "2026-10-07";
    expect(initializeSuccubusAbsorbBonus()).toBe(0);
    expect(readSetting(succubusAbsorbKey)).toBe("0");
    expect(readSetting(succubusAbsorbDateKey)).toBe(state.today);
  });
});

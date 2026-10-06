import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dailyPointDateKey, dailyPointKey, hpKey, initializeDailyOutsidePoints, initializeLevel,
  initializePlayerStat, initializeSuccubusAbsorbBonus, levelDateKey, levelKey, mpKey,
  readSetting, saveSetting, succubusAbsorbDateKey, succubusAbsorbKey,
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

describe("outside player level persistence", () => {
  it("starts at level 10 and awards the daily increase only once", () => {
    expect(initializeLevel()).toBe(10);
    expect(readSetting(levelKey)).toBe("10");
    expect(readSetting(levelDateKey)).toBe(state.today);
    expect(initializeLevel()).toBe(10);
    expect(database.execute).toHaveBeenCalledTimes(2);
  });

  it.each([100, 101, 110, 119, 120])("retains saved level %i on reload without another daily increase", (level) => {
    saveSetting(levelKey, String(level));
    saveSetting(levelDateKey, state.today);
    database.execute.mockClear();
    expect(initializeLevel()).toBe(level);
    expect(readSetting(levelKey)).toBe(String(level));
    expect(database.execute).not.toHaveBeenCalled();
  });

  it.each([[100, 110], [110, 120], [115, 120], [120, 120]])("adds 10 to level %i on the next day, capped at %i", (level, expected) => {
    saveSetting(levelKey, String(level));
    saveSetting(levelDateKey, "2026-10-05");
    expect(initializeLevel()).toBe(expected);
    expect(readSetting(levelKey)).toBe(String(expected));
    expect(readSetting(levelDateKey)).toBe(state.today);
    expect(initializeLevel()).toBe(expected);
  });

  it.each([["NaN", 1], ["Infinity", 1], ["-5", 1], ["999", 120]])("normalizes invalid saved level %s before using or saving it", (level, expected) => {
    state.values.set(levelKey, level);
    state.values.set(levelDateKey, state.today);
    expect(initializeLevel()).toBe(expected);
    expect(readSetting(levelKey)).toBe(String(expected));
  });

  it("does not raise HP, MP, daily points, or saved enemy levels above 100", () => {
    state.values.set(hpKey, "120");
    state.values.set(mpKey, "120");
    state.values.set(dailyPointDateKey, state.today);
    state.values.set(dailyPointKey, "120");
    state.values.set(succubusAbsorbDateKey, state.today);
    state.values.set(succubusAbsorbKey, "120");
    expect(initializePlayerStat(hpKey, 100)).toBe(100);
    expect(initializePlayerStat(mpKey, 100, 0)).toBe(100);
    expect(initializeDailyOutsidePoints()).toBe(100);
    expect(initializeSuccubusAbsorbBonus()).toBe(100);
    state.values.set(mpKey, "0");
    expect(initializePlayerStat(mpKey, 100, 0)).toBe(0);
  });
});

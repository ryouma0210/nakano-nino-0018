import { describe, expect, it } from "vitest";
import { ATTACK_MP_COST, charmDefenseCount, clamp, clampEnemyLevel, clampPlayerLevel, createSlimes, ENEMY_MAX_LEVEL, entryPosition, ESCAPE_MP_COST, isNear, PLAYER_MAX_LEVEL, succubusForLevel } from "./gameLogic";

describe("outside game logic", () => {
  it("uses level-independent battle MP costs", () => {
    expect(ATTACK_MP_COST).toBe(20);
    expect(ESCAPE_MP_COST).toBe(50);
  });
  it("clamps stats", () => { expect(clamp(-1)).toBe(0); expect(clamp(120)).toBe(100); });
  it("allows both player and enemy levels from 1 through 999", () => {
    expect(PLAYER_MAX_LEVEL).toBe(999);
    expect(ENEMY_MAX_LEVEL).toBe(999);
    for (let value = 1; value <= 999; value += 1) {
      expect(clampPlayerLevel(value)).toBe(value);
      expect(clampEnemyLevel(value)).toBe(value);
    }
  });
  it.each([[1000, 999], [9999, 999], [0, 1], [-1, 1], [998.9, 998], [NaN, 1], [Infinity, 1]])("normalizes level %s to %i for both sides", (value, expected) => {
    expect(clampPlayerLevel(value)).toBe(expected);
    expect(clampEnemyLevel(value)).toBe(expected);
  });
  it("uses the current player level or saved enemy level up to 999", () => {
    expect(succubusForLevel(999, 0)).toMatchObject({ level: 999, stage: "queen" });
    expect(succubusForLevel(150, 998)).toMatchObject({ level: 998, stage: "queen" });
    expect(succubusForLevel(999, 1000)).toMatchObject({ level: 999, stage: "queen" });
    expect(succubusForLevel(999, 29)).toMatchObject({ level: 29, stage: "beginner" });
  });
  it("selects enemy stages at boundaries", () => {
    expect(succubusForLevel(29, 0).stage).toBe("beginner");
    expect(succubusForLevel(30, 0).stage).toBe("middle");
    expect(succubusForLevel(79, 0).stage).toBe("middle");
    expect(succubusForLevel(80, 0).stage).toBe("queen");
    expect(succubusForLevel(999, 0).stage).toBe("queen");
  });
  it.each([1, 10, 20, 50, 100])("caps a level increase of %i at 999 without lowering existing levels", (increase) => {
    expect(clampPlayerLevel(998 + increase)).toBe(999);
    expect(clampEnemyLevel(998 + increase)).toBe(999);
    expect(clampPlayerLevel(500 + increase)).toBe(500 + increase);
    expect(clampEnemyLevel(500 + increase)).toBe(500 + increase);
  });
  it("requires more defenses against stronger charm", () => {
    expect(charmDefenseCount("beginner")).toBe(1);
    expect(charmDefenseCount("middle")).toBe(2);
    expect(charmDefenseCount("queen")).toBe(3);
  });
  it("creates deterministic slimes and map transitions", () => {
    expect(createSlimes(() => 0)).toHaveLength(4);
    expect(entryPosition("center", "left")).toEqual({ x: 82, y: 54 });
    expect(isNear({ x: 10, y: 10 }, { x: 18, y: 18 })).toBe(true);
  });
});

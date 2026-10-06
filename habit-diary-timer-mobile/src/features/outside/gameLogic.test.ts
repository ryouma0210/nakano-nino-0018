import { describe, expect, it } from "vitest";
import { ATTACK_MP_COST, charmDefenseCount, clamp, clampEnemyLevel, clampPlayerLevel, createSlimes, ENEMY_MAX_LEVEL, entryPosition, ESCAPE_MP_COST, isNear, PLAYER_MAX_LEVEL, succubusForLevel } from "./gameLogic";

describe("outside game logic", () => {
  it("uses level-independent battle MP costs", () => {
    expect(ATTACK_MP_COST).toBe(20);
    expect(ESCAPE_MP_COST).toBe(50);
  });
  it("clamps stats", () => { expect(clamp(-1)).toBe(0); expect(clamp(120)).toBe(100); });
  it("allows player levels above 100 while keeping the enemy cap at 100", () => {
    expect(PLAYER_MAX_LEVEL).toBe(120);
    expect(ENEMY_MAX_LEVEL).toBe(100);
    for (const value of [101, 110, 119, 120]) {
      expect(clampPlayerLevel(value)).toBe(value);
      expect(clampEnemyLevel(value)).toBe(100);
    }
    expect(clampPlayerLevel(121)).toBe(120);
    expect(clampPlayerLevel(0)).toBe(1);
    expect(clampEnemyLevel(0)).toBe(1);
  });
  it("keeps enemies capped when generated from a level 120 player or a saved enemy level", () => {
    expect(succubusForLevel(120, 0)).toMatchObject({ level: 100, stage: "queen" });
    expect(succubusForLevel(120, 120)).toMatchObject({ level: 100, stage: "queen" });
    expect(succubusForLevel(120, 29)).toMatchObject({ level: 29, stage: "beginner" });
  });
  it("selects enemy stages at boundaries", () => {
    expect(succubusForLevel(29, 0).stage).toBe("beginner");
    expect(succubusForLevel(30, 0).stage).toBe("middle");
    expect(succubusForLevel(80, 0).stage).toBe("queen");
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

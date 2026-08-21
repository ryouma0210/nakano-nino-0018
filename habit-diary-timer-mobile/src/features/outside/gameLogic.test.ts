import { describe, expect, it } from "vitest";
import { ATTACK_MP_COST, charmDefenseCount, clamp, createSlimes, entryPosition, ESCAPE_MP_COST, isNear, succubusForLevel } from "./gameLogic";

describe("outside game logic", () => {
  it("uses level-independent battle MP costs", () => {
    expect(ATTACK_MP_COST).toBe(20);
    expect(ESCAPE_MP_COST).toBe(50);
  });
  it("clamps stats", () => { expect(clamp(-1)).toBe(0); expect(clamp(120)).toBe(100); });
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

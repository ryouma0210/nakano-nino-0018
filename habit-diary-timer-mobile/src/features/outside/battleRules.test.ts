import { describe, expect, it } from "vitest";
import { ATTACK_MP_COST, charmDefenseCount } from "./gameLogic";
import {
  ENEMY_MAX_HP, getEnemyDamage, getPlayerAttackDamage, getPlayerCombatStats, resolvePlayerAttack,
} from "./battleRules";

describe("outside battle rules", () => {
  it("keeps each enemy's full HP and the original level-one attack", () => {
    expect(ENEMY_MAX_HP).toEqual({ beginner: 100, middle: 300, queen: 500 });
    expect(getPlayerCombatStats(1)).toEqual({ attack: 34, defense: 0 });
    expect(getPlayerCombatStats(120)).toEqual({ attack: 153, defense: 36 });
    expect(getPlayerCombatStats(150)).toEqual({ attack: 183, defense: 45 });
  });

  it.each([
    { hp: 500, remaining: 466, damage: 34 },
    { hp: 300, remaining: 266, damage: 34 },
    { hp: 110, remaining: 76, damage: 34 },
    { hp: 100, remaining: 66, damage: 34 },
    { hp: 34, remaining: 0, damage: 34 },
    { hp: 10, remaining: 0, damage: 10 },
    { hp: 0, remaining: 0, damage: 0 },
  ])("reduces $hp HP to $remaining and reports only $damage actual damage", ({ hp, remaining, damage }) => {
    expect(resolvePlayerAttack(hp, 1)).toEqual({ enemyHp: remaining, damage });
  });

  it.each([
    { level: 1, damage: 17 },
    { level: 2, damage: 17 },
    { level: 120, damage: 76 },
    { level: 150, damage: 91 },
  ])("rounds weakened attacks down to $damage at level $level", ({ level, damage }) => {
    expect(getPlayerAttackDamage(level, true)).toBe(damage);
    expect(resolvePlayerAttack(100, level, true)).toEqual({ enemyHp: 100 - damage, damage });
  });

  it.each([
    { level: 1, normal: 35, defendedNormal: 18, temptation: 50, defendedTemptation: 25 },
    { level: 120, normal: 10, defendedNormal: 5, temptation: 14, defendedTemptation: 7 },
    { level: 150, normal: 4, defendedNormal: 2, temptation: 5, defendedTemptation: 3 },
  ])("applies defense and action multipliers to queen damage at level $level", (values) => {
    expect(getEnemyDamage("queen", values.level, "normal")).toBe(values.normal);
    expect(getEnemyDamage("queen", values.level, "normal", true)).toBe(values.defendedNormal);
    expect(getEnemyDamage("queen", values.level, "temptation")).toBe(values.temptation);
    expect(getEnemyDamage("queen", values.level, "temptation", true)).toBe(values.defendedTemptation);
  });

  it("retains at least one damage against high defense", () => {
    for (const stage of ["beginner", "middle"] as const) {
      for (const kind of ["normal", "temptation"] as const) {
        expect(getEnemyDamage(stage, 150, kind)).toBe(1);
        expect(getEnemyDamage(stage, 150, kind, true)).toBe(1);
      }
    }
  });

  it("improves attack and defense without increasing incoming damage across levels 1–150", () => {
    for (let level = 2; level <= 150; level += 1) {
      const previous = getPlayerCombatStats(level - 1);
      const current = getPlayerCombatStats(level);
      expect(current.attack).toBeGreaterThan(previous.attack);
      expect(current.defense).toBeGreaterThanOrEqual(previous.defense);
      expect(getPlayerAttackDamage(level)).toBeGreaterThan(getPlayerAttackDamage(level - 1));
      expect(Number.isInteger(getPlayerAttackDamage(level, true))).toBe(true);
      for (const stage of ["beginner", "middle", "queen"] as const) {
        for (const kind of ["normal", "temptation"] as const) {
          for (const defending of [false, true]) {
            const damage = getEnemyDamage(stage, level, kind, defending);
            expect(damage).toBeGreaterThanOrEqual(1);
            expect(damage).toBeLessThanOrEqual(getEnemyDamage(stage, level - 1, kind, defending));
          }
        }
      }
    }
  });

  it.each([
    { level: 120, attacks: 4, remainingHp: 49, remainingMp: 20 },
    { level: 150, attacks: 3, remainingHp: 83, remainingMp: 40 },
  ])("can defeat a full-HP queen at level $level after clearing opening charm", ({ level, attacks, remainingHp, remainingMp }) => {
    let hp = 100;
    let mp = 100;
    let enemyHp = ENEMY_MAX_HP.queen;
    let attackCount = 0;
    let totalDamage = 0;

    // A deterministic legal battle: clear the opening charm with three defenses,
    // then attack while the enemy uses its ordinary counterattack. No healing.
    expect(charmDefenseCount("queen")).toBe(3);
    for (let turn = 0; turn < charmDefenseCount("queen"); turn += 1) {
      hp -= getEnemyDamage("queen", level, "temptation", true);
      mp = Math.min(100, mp + 8);
      expect(hp).toBeGreaterThan(0);
    }
    while (enemyHp > 0 && attackCount < 10) {
      expect(mp).toBeGreaterThanOrEqual(ATTACK_MP_COST);
      const hit = resolvePlayerAttack(enemyHp, level);
      enemyHp = hit.enemyHp;
      totalDamage += hit.damage;
      mp -= ATTACK_MP_COST;
      attackCount += 1;
      if (enemyHp > 0) hp -= getEnemyDamage("queen", level, "normal");
      expect(hp).toBeGreaterThan(0);
    }

    expect(enemyHp).toBe(0);
    expect(totalDamage).toBe(500);
    expect(attackCount).toBe(attacks);
    expect(hp).toBe(remainingHp);
    expect(mp).toBe(remainingMp);
  });
});

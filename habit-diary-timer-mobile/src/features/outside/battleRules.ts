import { clampEnemyLevel, clampPlayerLevel, type SuccubusStage } from "./gameLogic";

// The queen's baseline is level 100; encounters must use getEnemyCombatStats.
export const ENEMY_BASE_HP: Record<SuccubusStage, number> = {
  beginner: 100,
  middle: 300,
  queen: 500,
};

const enemyAttackPower: Record<SuccubusStage, number> = {
  beginner: 10,
  middle: 20,
  queen: 50,
};

export function getEnemyCombatStats(stage: SuccubusStage, enemyLevel: number) {
  if (stage !== "queen") return { maxHp: ENEMY_BASE_HP[stage], attack: enemyAttackPower[stage] };
  const queenLevel = Math.max(80, clampEnemyLevel(enemyLevel));
  const growth = queenLevel - 100;
  return {
    maxHp: ENEMY_BASE_HP.queen + growth * 4,
    attack: enemyAttackPower.queen + Math.floor(growth * 0.3),
  };
}

export function getPlayerCombatStats(level: number) {
  const playerLevel = clampPlayerLevel(level);
  return {
    // Preserve the level 1 attack, then reward every additional level.
    attack: 33 + playerLevel,
    defense: Math.floor(playerLevel * 0.3),
  };
}

export function getPlayerAttackDamage(level: number, weakened = false) {
  const { attack } = getPlayerCombatStats(level);
  return weakened ? Math.max(1, Math.floor(attack / 2)) : attack;
}

export function resolvePlayerAttack(enemyHp: number, level: number, weakened = false) {
  const damage = Math.min(Math.max(0, enemyHp), getPlayerAttackDamage(level, weakened));
  // Enemy HP can exceed 100; the player stat/gauge clamp must not be used here.
  return { damage, enemyHp: Math.max(0, enemyHp - damage) };
}

export function getEnemyDamage(
  stage: SuccubusStage,
  playerLevel: number,
  kind: "normal" | "temptation",
  defending = false,
  enemyLevel = 100,
) {
  const { defense } = getPlayerCombatStats(playerLevel);
  const { attack } = getEnemyCombatStats(stage, enemyLevel);
  const damage = Math.max(1, attack - defense);
  const attackMultiplier = kind === "normal" ? 0.7 : 1;
  return Math.max(1, Math.ceil(damage * attackMultiplier * (defending ? 0.5 : 1)));
}

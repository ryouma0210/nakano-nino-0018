export type SuccubusStage = "beginner" | "middle" | "queen";
export type MapArea = "center" | "left" | "right" | "top";
export type Direction = "up" | "down" | "left" | "right";
export type MapPosition = { x: number; y: number };
export type MapSlime = MapPosition & { id: number; active: boolean };

export const ATTACK_MP_COST = 20;
export const ESCAPE_MP_COST = 50;

export const startPositions: Record<MapArea, MapPosition> = {
  center: { x: 48, y: 74 }, left: { x: 68, y: 54 },
  right: { x: 24, y: 54 }, top: { x: 48, y: 76 },
};

export function clamp(value: number) { return Math.max(0, Math.min(100, value)); }
export function randomSlimePosition(random = Math.random): MapPosition {
  return { x: 24 + random() * 58, y: 24 + random() * 54 };
}
export function createSlimes(random = Math.random): MapSlime[] {
  return Array.from({ length: 4 }, (_, index) => ({ id: index + 1, active: true, ...randomSlimePosition(random) }));
}
export function entryPosition(from: MapArea, to: MapArea): MapPosition {
  if (from === "center" && to === "left") return { x: 82, y: 54 };
  if (from === "left" && to === "center") return { x: 18, y: 54 };
  if (from === "center" && to === "right") return { x: 18, y: 54 };
  if (from === "right" && to === "center") return { x: 78, y: 54 };
  if (from === "center" && to === "top") return { x: 48, y: 82 };
  if (from === "top" && to === "center") return { x: 48, y: 20 };
  return startPositions[to];
}
export function facingForEntry(from: MapArea, to: MapArea): Direction {
  if (to === "top") return "up";
  if (to === "left") return "left";
  if (to === "right") return "right";
  if (from === "top") return "down";
  if (from === "left") return "right";
  if (from === "right") return "left";
  return "down";
}
export function isNear(a: MapPosition, b: MapPosition, range = 8) {
  return Math.abs(a.x - b.x) <= range && Math.abs(a.y - b.y) <= range;
}
export function charmDefenseCount(stage: SuccubusStage) {
  if (stage === "beginner") return 1;
  if (stage === "middle") return 2;
  return 3;
}
export function succubusForLevel(level: number, savedLevel: number) {
  const value = Math.max(1, Math.min(100, savedLevel > 0 ? savedLevel : level));
  if (value < 30) return { stage: "beginner" as const, title: "初級サキュバス", level: value, message: "Lv.1〜30。油断した相手を逆転する小悪魔。", color: "#ff69b4" };
  if (value < 80) return { stage: "middle" as const, title: "上級サキュバス", level: value, message: "Lv.30〜79。駆け引きと選択肢で揺さぶってくる。", color: "#9b5de5" };
  return { stage: "queen" as const, title: "女王サキュバス", level: value, message: "Lv.80〜。圧倒的な格で、帰宅意思をねじ伏せにくる。", color: "#d9202a" };
}

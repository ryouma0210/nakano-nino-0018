import { readSetting, saveSetting } from "@/features/outside/gameState";
import type { SuccubusStage } from "@/features/outside/gameLogic";

export type OutsideAchievementEvent =
  | "slimeDefeat"
  | "purify"
  | "escape"
  | "victory"
  | "defeat"
  | "surrender"
  | "grip"
  | "stroke"
  | "nipple"
  | "statusAttack"
  | "charmClear"
  | "temptationMax"
  | "mark"
  | "deepMark";

const prefix = "outside_achievement_";
const countKey = (event: OutsideAchievementEvent) => `${prefix}${event}_count`;
const stageKey = (event: "victory" | "defeat", stage: SuccubusStage) => `${prefix}${event}_${stage}`;

function numberSetting(key: string) {
  const value = Number(readSetting(key) ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function recordOutsideAchievement(event: OutsideAchievementEvent, stage?: SuccubusStage) {
  saveSetting(countKey(event), String(numberSetting(countKey(event)) + 1));
  if ((event === "victory" || event === "defeat") && stage) saveSetting(stageKey(event, stage), "1");
}

type OutsideStats = Record<OutsideAchievementEvent, number> & {
  victoryBeginner: number;
  victoryMiddle: number;
  victoryQueen: number;
  defeatBeginner: number;
  defeatMiddle: number;
  defeatQueen: number;
};

export function outsideAchievementStats(): OutsideStats {
  const count = (event: OutsideAchievementEvent) => numberSetting(countKey(event));
  return {
    slimeDefeat: count("slimeDefeat"), purify: count("purify"), escape: count("escape"),
    victory: count("victory"), defeat: count("defeat"), surrender: count("surrender"),
    grip: count("grip"), stroke: count("stroke"), nipple: count("nipple"), statusAttack: count("statusAttack"),
    charmClear: count("charmClear"), temptationMax: count("temptationMax"),
    mark: count("mark"), deepMark: count("deepMark"),
    victoryBeginner: numberSetting(stageKey("victory", "beginner")),
    victoryMiddle: numberSetting(stageKey("victory", "middle")),
    victoryQueen: numberSetting(stageKey("victory", "queen")),
    defeatBeginner: numberSetting(stageKey("defeat", "beginner")),
    defeatMiddle: numberSetting(stageKey("defeat", "middle")),
    defeatQueen: numberSetting(stageKey("defeat", "queen")),
  };
}

type OutsideAchievement = {
  name: string;
  condition: string;
  value: (stats: OutsideStats) => number;
  target: number;
  unit: string;
};

export const outsideAchievements: OutsideAchievement[] = [
  { name: "はじめての一歩", condition: "スライムを1体倒す", value: (s) => s.slimeDefeat, target: 1, unit: "体" },
  { name: "スライムハンター", condition: "スライムを10体倒す", value: (s) => s.slimeDefeat, target: 10, unit: "体" },
  { name: "ぷるぷるキラー", condition: "スライムを50体倒す", value: (s) => s.slimeDefeat, target: 50, unit: "体" },
  { name: "百体斬り", condition: "スライムを100体倒す", value: (s) => s.slimeDefeat, target: 100, unit: "体" },
  { name: "清らかな水", condition: "浄化の水辺を1回利用する", value: (s) => s.purify, target: 1, unit: "回" },
  { name: "浄化の常連", condition: "浄化の水辺を10回利用する", value: (s) => s.purify, target: 10, unit: "回" },
  { name: "逃げるが勝ち", condition: "サキュバスから1回逃走する", value: (s) => s.escape, target: 1, unit: "回" },
  { name: "逃走の達人", condition: "サキュバスから5回逃走する", value: (s) => s.escape, target: 5, unit: "回" },
  { name: "小悪魔退治", condition: "初級サキュバスに勝利する", value: (s) => s.victoryBeginner, target: 1, unit: "回" },
  { name: "誘惑破り", condition: "上級サキュバスに勝利する", value: (s) => s.victoryMiddle, target: 1, unit: "回" },
  { name: "女王殺し", condition: "女王サキュバスに勝利する", value: (s) => s.victoryQueen, target: 1, unit: "回" },
  { name: "初勝利", condition: "サキュバスに1回勝利する", value: (s) => s.victory, target: 1, unit: "回" },
  { name: "百戦錬磨", condition: "サキュバスに5回勝利する", value: (s) => s.victory, target: 5, unit: "回" },
  { name: "誘惑の天敵", condition: "サキュバスに10回勝利する", value: (s) => s.victory, target: 10, unit: "回" },
  { name: "小悪魔の獲物", condition: "初級サキュバスに敗北する", value: (s) => s.defeatBeginner, target: 1, unit: "回" },
  { name: "上級者の玩具", condition: "上級サキュバスに敗北する", value: (s) => s.defeatMiddle, target: 1, unit: "回" },
  { name: "女王の所有物", condition: "女王サキュバスに敗北する", value: (s) => s.defeatQueen, target: 1, unit: "回" },
  { name: "敗北を知る者", condition: "サキュバスに1回敗北する", value: (s) => s.defeat, target: 1, unit: "回" },
  { name: "懲りない挑戦者", condition: "サキュバスに5回敗北する", value: (s) => s.defeat, target: 5, unit: "回" },
  { name: "敗北コレクター", condition: "サキュバスに10回敗北する", value: (s) => s.defeat, target: 10, unit: "回" },
  { name: "白旗", condition: "初めて降参する", value: (s) => s.surrender, target: 1, unit: "回" },
  { name: "降参の常連", condition: "5回降参する", value: (s) => s.surrender, target: 5, unit: "回" },
  { name: "自制心はどこへ", condition: "おちんぽ握る♡を選ぶ", value: (s) => s.grip, target: 1, unit: "回" },
  { name: "見せつける弱点", condition: "シコシコする♡を選ぶ", value: (s) => s.stroke, target: 1, unit: "回" },
  { name: "乳首いじり", condition: "乳首を弄る♡を選ぶ", value: (s) => s.nipple, target: 1, unit: "回" },
  { name: "無防備の極み", condition: "特殊行動を合計10回選ぶ", value: (s) => s.grip + s.stroke + s.nipple, target: 10, unit: "回" },
  { name: "状態異常まみれ", condition: "状態異常攻撃を1回受ける", value: (s) => s.statusAttack, target: 1, unit: "回" },
  { name: "誘惑の実験台", condition: "状態異常攻撃を10回受ける", value: (s) => s.statusAttack, target: 10, unit: "回" },
  { name: "鋼の理性", condition: "防御で魅了モードを解除する", value: (s) => s.charmClear, target: 1, unit: "回" },
  { name: "理性崩壊", condition: "誘惑ゲージを100%にする", value: (s) => s.temptationMax, target: 1, unit: "回" },
  { name: "刻まれた敗者", condition: "淫紋を付与される", value: (s) => s.mark, target: 1, unit: "回" },
  { name: "深く刻まれた者", condition: "刻印深化を付与される", value: (s) => s.deepMark, target: 1, unit: "回" },
];

export function unlockedOutsideTitles() {
  const stats = outsideAchievementStats();
  return outsideAchievements.map((achievement) => {
    const current = achievement.value(stats);
    return {
      name: achievement.name,
      condition: achievement.condition,
      progress: `${current}${achievement.unit} / ${achievement.target}${achievement.unit}`,
      unlocked: current >= achievement.target,
    };
  }).filter((title) => title.unlocked);
}

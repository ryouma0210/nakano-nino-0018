import type { OthelloAchievement } from "../othello/storage";
import type { SugorokuAchievement } from "../sugoroku/storage";

export function earnedGameTitles(othello: readonly OthelloAchievement[], sugoroku: readonly SugorokuAchievement[]) {
  return [
    { name: "盤上の挑戦者", condition: "オセロの対局を1回終了する", unlocked: othello.includes("played") },
    { name: "オセロ初勝利", condition: "オセロで1回勝利する", unlocked: othello.includes("win") },
    { name: "ノーマル攻略", condition: "オセロのノーマルで勝利する", unlocked: othello.includes("normal-win") },
    { name: "ハード攻略", condition: "オセロのハードで勝利する", unlocked: othello.includes("hard-win") },
    { name: "すごろく通常制覇", condition: "すごろくでゴール①をクリアする", unlocked: sugoroku.includes("goal-1") },
    { name: "すごろくハード制覇", condition: "すごろくでゴール②をクリアする", unlocked: sugoroku.includes("goal-2") },
  ].filter((title) => title.unlocked).map((title) => ({ ...title, progress: "達成済み" }));
}

import { describe, expect, it } from "vitest";
import { earnedGameTitles } from "./achievements";
import type { OthelloAchievement } from "../othello/storage";
import type { SugorokuAchievement } from "../sugoroku/storage";

describe("earned game titles", () => {
  it("hides every unearned title", () => {
    expect(earnedGameTitles([], [])).toEqual([]);
  });

  it("shows all six earned titles together, without replacing either game's awards", () => {
    const titles = earnedGameTitles(["played", "win", "normal-win", "hard-win"], ["goal-1", "goal-2"]);
    expect(titles.map((title) => title.name)).toEqual([
      "盤上の挑戦者", "オセロ初勝利", "ノーマル攻略", "ハード攻略", "すごろく通常制覇", "すごろくハード制覇",
    ]);
    expect(titles.every((title) => title.unlocked && title.progress === "達成済み" && title.condition.length > 0)).toBe(true);
  });

  it.each([
    ["played", "盤上の挑戦者"], ["win", "オセロ初勝利"],
    ["normal-win", "ノーマル攻略"], ["hard-win", "ハード攻略"],
  ] as const)("maps Othello flag %s only to its own award", (flag, expectedName) => {
    const titles = earnedGameTitles([flag], []);
    expect(titles.map((title) => title.name)).toEqual([expectedName]);
  });

  it.each([["goal-1", "すごろく通常制覇"], ["goal-2", "すごろくハード制覇"]] as const)(
    "keeps sugoroku goal %s separate from the other course and Othello awards", (flag, expectedName) => {
      expect(earnedGameTitles([], [flag]).map((title) => title.name)).toEqual([expectedName]);
    },
  );

  it("deduplicates repeated flags while keeping a stable display order", () => {
    const titles = earnedGameTitles(["hard-win", "played", "hard-win", "played"], ["goal-2", "goal-1", "goal-2"]);
    expect(titles.map((title) => title.name)).toEqual(["盤上の挑戦者", "ハード攻略", "すごろく通常制覇", "すごろくハード制覇"]);
    expect(new Set(titles.map((title) => title.name)).size).toBe(titles.length);
  });

  it("leaves persisted flags unchanged and returns independent display entries", () => {
    const othello = Object.freeze<OthelloAchievement[]>(["win", "played"]);
    const sugoroku = Object.freeze<SugorokuAchievement[]>(["goal-2"]);
    const first = earnedGameTitles(othello, sugoroku);
    first[0].name = "changed by caller";
    expect(earnedGameTitles(othello, sugoroku)[0].name).toBe("盤上の挑戦者");
    expect(othello).toEqual(["win", "played"]);
    expect(sugoroku).toEqual(["goal-2"]);
  });
});

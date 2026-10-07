import { describe, expect, it } from "vitest";
import { createEnduranceGame, finishEndurance } from "../endurance/game";
import { createEnduranceSession } from "../endurance/storage";
import { createGame as createOthelloGame, playMove } from "../othello/game";
import type { OthelloSave } from "../othello/storage";
import { createCountdown } from "../sugoroku/countdown";
import { createGame, type SugorokuGame } from "../sugoroku/game";
import { matchesGameResumeRequest, summarizeEndurance, summarizeOthello, summarizeSugoroku } from "./progress";

const startedAt = "2026-10-07T01:00:00.000Z";

function endurance() {
  return createEnduranceSession({
    game: { ...createEnduranceGame("game-1", 4, startedAt), index: 2 },
    mediaIds: ["game-1-1", "game-1-2", "game-1-3", "game-1-4"],
    slideTimer: createCountdown(60_000), extraTimer: createCountdown(180_000),
    videoProgress: { positionMs: 0, durationMs: null }, videoComplete: false,
  });
}

function othello(): OthelloSave {
  return { version: 1, history: [], achievements: [], current: {
    id: "othello-current", startedAt, difficulty: "hard", game: playMove(createOthelloGame(), 19),
    assistance: { kind: "fast", paused: false },
  } };
}

describe("saved game progress summaries", () => {
  it("does not offer resume when no game has been saved", () => {
    expect(summarizeSugoroku({ version: 1, current: null, history: [] })).toBeNull();
    expect(summarizeOthello({ version: 1, current: null, history: [], achievements: [] })).toBeNull();
    expect(summarizeEndurance(null, [])).toBeNull();
  });

  it("reports the actual negative sugoroku tile and remaining distance", () => {
    const current = { ...createGame(startedAt), position: -6, phase: "event" as const };
    expect(summarizeSugoroku({ version: 1, current, history: [] })).toEqual({
      id: current.id, details: ["通常コース", "-6マス目", "残りマス：31"],
    });
  });

  it.each([
    { phase: "goal", outcome: "goal-1", position: 25 },
    { phase: "retire", outcome: "penalty", position: 5 },
    { phase: "penalty-roll", outcome: "penalty", position: 5 },
    { phase: "penalty-event", outcome: "penalty", position: 5 },
  ] as const)("keeps sugoroku $phase resumable until the final event is recorded", (changes) => {
    const current: SugorokuGame = { ...createGame(startedAt), ...changes };
    expect(summarizeSugoroku({ version: 1, current, history: [] })?.id).toBe(current.id);
  });

  it("does not revive finished sugoroku games or games already recorded in history", () => {
    const current: SugorokuGame = { ...createGame(startedAt), phase: "finished", position: 25, outcome: "goal-1", completedAt: startedAt };
    expect(summarizeSugoroku({ version: 1, current, history: [] })).toBeNull();
    expect(summarizeSugoroku({ version: 1, current: { ...current, phase: "goal" }, history: [current] })).toBeNull();
  });

  it("reports occupied othello squares without moving or changing automatic-play settings", () => {
    const saved = othello();
    const original = JSON.stringify(saved);
    expect(summarizeOthello(saved)).toEqual({
      id: saved.current!.id, details: ["ハード"], progress: { label: "盤上の石", current: 5, total: 64 },
    });
    expect(JSON.stringify(saved)).toBe(original);
  });

  it("hides an othello current when finished or when its result is already recorded", () => {
    const saved = othello();
    expect(summarizeOthello({ ...saved, current: { ...saved.current!, game: { ...saved.current!.game, status: "finished" } } })).toBeNull();
    expect(summarizeOthello({ ...saved, history: [{ id: saved.current!.id, startedAt, completedAt: startedAt,
      difficulty: "hard", humanCount: 33, cpuCount: 31, result: "win", reason: "completed" }] })).toBeNull();
  });

  it("uses the saved endurance position without advancing time or changing its material order", () => {
    const session = endurance();
    const original = JSON.stringify(session);
    expect(summarizeEndurance(session, [])).toEqual({
      id: session.game.id, details: ["勃起我慢①"], progress: { label: "進行状況", current: 3, total: 4 },
    });
    expect(JSON.stringify(session)).toBe(original);
  });

  it("keeps completed endurance timers pending until a result is saved, then hides a leftover current", () => {
    const session = endurance();
    session.game.index = 3;
    session.slideTimer = { ...session.slideTimer, status: "complete", remainingMs: 0 };
    expect(summarizeEndurance(session, [])).not.toBeNull();
    expect(summarizeEndurance(session, [finishEndurance(session.game, false, startedAt)])).toBeNull();
  });

  it("only accepts an explicit matching saved ID, never an absent, old, empty, or ambiguous link", () => {
    expect(matchesGameResumeRequest("saved-id", "saved-id")).toBe(true);
    for (const request of [undefined, "", "old-id", ["saved-id"], ["old-id", "saved-id"]]) {
      expect(matchesGameResumeRequest(request, "saved-id")).toBe(false);
    }
    expect(matchesGameResumeRequest("saved-id", undefined)).toBe(false);
    expect(matchesGameResumeRequest(undefined, undefined)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { getSugorokuAudioScene } from "./audio";
import {
  chooseRoute, completeEvent, createGame, failGame, retireGame, rollDice,
  SUGOROKU_TILES, type SugorokuGame,
} from "./game";

function at(id: string, changes: Partial<SugorokuGame> = {}): SugorokuGame {
  const position = SUGOROKU_TILES.find((tile) => tile.id === id)?.position;
  if (typeof position !== "number") throw new Error(`Not a route tile: ${id}`);
  return {
    ...createGame("2026-10-04T00:00:00Z"), position, extended: position > 25,
    phase: position === 0 ? "ready" : "event", ...changes,
  };
}

describe("sugoroku room audio", () => {
  it("uses the base scene before a game and through the normal course's forced stops", () => {
    expect(getSugorokuAudioScene(null)).toBe("sugoroku");
    expect(getSugorokuAudioScene(createGame())).toBe("sugoroku");
    for (const id of ["7", "14", "21", "25"]) {
      expect(getSugorokuAudioScene(at(id))).toBe("sugoroku");
    }
  });

  it("starts the later-zone scene only after leaving 25, not when choosing the extended route", () => {
    const choice = completeEvent(at("25"));
    expect(getSugorokuAudioScene(choice)).toBe("sugoroku");
    const extended = chooseRoute(choice, true);
    expect(getSugorokuAudioScene(extended)).toBe("sugoroku");
    expect(getSugorokuAudioScene(rollDice(extended, 4))).toBe("sugoroku-zone");
  });

  it("keeps the later-zone scene across inserted stops and rule transfers", () => {
    for (const id of ["26", "28", "stop-1", "stop-2", "stop-3", "stop-4", "40"]) {
      const game = at(id);
      expect(getSugorokuAudioScene(game)).toBe("sugoroku-zone");
      expect(getSugorokuAudioScene({ ...game, phase: "ready" })).toBe("sugoroku-zone");
    }
    expect(getSugorokuAudioScene(completeEvent(at("37")))).toBe("sugoroku-zone");
  });

  it("returns to base audio when 26 sends an extended game back to start", () => {
    const returned = completeEvent(at("26"));
    expect(returned.extended).toBe(true);
    expect(getSugorokuAudioScene(returned)).toBe("sugoroku");
    expect(getSugorokuAudioScene(rollDice(returned, 6))).toBe("sugoroku");
  });

  it.each([false, true])("switches into and out of the negative zone with extended=%s", (extended) => {
    const entered = completeEvent(at("1", { extended }));
    expect(getSugorokuAudioScene(entered)).toBe("sugoroku-zone");
    const lastNegative = completeEvent(at("-1", { extended }));
    expect(getSugorokuAudioScene(lastNegative)).toBe("sugoroku-zone");
    expect(getSugorokuAudioScene(rollDice(lastNegative, 6))).toBe("sugoroku");
  });

  it("uses base audio for both goals and their completed results", () => {
    const firstGoal = chooseRoute(completeEvent(at("25")), false);
    const secondGoal = rollDice(at("40", { phase: "ready", forceOneUntilEnd: true }), 1);
    for (const goal of [firstGoal, secondGoal]) {
      expect(getSugorokuAudioScene(goal)).toBe("sugoroku");
      expect(getSugorokuAudioScene(completeEvent(goal))).toBe("sugoroku");
    }
  });

  it.each(["3", "-6", "26"])("prioritizes retirement and every penalty phase over the former position %s", (id) => {
    const retired = retireGame(at(id));
    expect(getSugorokuAudioScene(retired)).toBe("sugoroku-penalty");
    for (const penaltyRoll of [completeEvent(retired), failGame(at(id))]) {
      expect(getSugorokuAudioScene(penaltyRoll)).toBe("sugoroku-penalty");
      const penaltyEvent = rollDice(penaltyRoll, 2);
      expect(getSugorokuAudioScene(penaltyEvent)).toBe("sugoroku-penalty");
      expect(getSugorokuAudioScene(completeEvent(penaltyEvent))).toBe("sugoroku-penalty");
    }
    expect(getSugorokuAudioScene(createGame())).toBe("sugoroku");
  });
});

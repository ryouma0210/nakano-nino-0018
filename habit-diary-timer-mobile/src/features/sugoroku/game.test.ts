import { describe, expect, it } from "vitest";
import {
  chooseRoute, completeEvent, createGame, failGame, getAdjustedDiceResult, getCurrentTile,
  getDiceMovementRule, getDisplayedDiceResult,
  getRemainingSpaces, getTileRuleDescription, retireGame, rollDice,
  ROUTE_TILES, SUGOROKU_TILES, validateGame, type SugorokuGame,
} from "./game";

const startedAt = "2026-10-03T00:00:00.000Z";
const completedAt = "2026-10-03T01:00:00.000Z";

function at(id: string, changes: Partial<SugorokuGame> = {}): SugorokuGame {
  const position = SUGOROKU_TILES.find((tile) => tile.id === id)?.position;
  if (typeof position !== "number") throw new Error(`Not a route tile: ${id}`);
  return {
    ...createGame(startedAt), position, extended: position > 25,
    phase: position === 0 ? "ready" : "event", ...changes,
  };
}

describe("neutral sugoroku route", () => {
  it("includes every ordinary space and the four inserted stops in order", () => {
    expect(ROUTE_TILES).toHaveLength(46);
    expect(new Set(SUGOROKU_TILES.map((tile) => tile.id)).size).toBe(SUGOROKU_TILES.length);
    for (const [before, stop, after] of [["28", "stop-1", "29"], ["31", "stop-2", "32"], ["34", "stop-3", "35"], ["37", "stop-4", "38"]]) {
      const index = ROUTE_TILES.findIndex((tile) => tile.id === before);
      expect(ROUTE_TILES.slice(index, index + 3).map((tile) => tile.id)).toEqual([before, stop, after]);
    }
    expect(ROUTE_TILES.slice(-2).map((tile) => tile.id)).toEqual(["40", "goal-2"]);
  });

  it("creates unique sessions and preserves input objects", () => {
    const state = createGame(startedAt);
    const copy = JSON.parse(JSON.stringify(state));
    expect(createGame(startedAt).id).not.toBe(state.id);
    expect(getRemainingSpaces(state)).toBe(25);
    const next = rollDice(state, 3);
    expect(state).toEqual(copy);
    expect(next).toMatchObject({ phase: "event", position: 3, diceResult: 3, adjustedDiceResult: 3, movement: 3, rollCount: 1 });
    expect(completeEvent(next)).toMatchObject({ phase: "ready", position: 3 });
  });

  it.each([["5", "7"], ["11", "14"], ["19", "21"], ["24", "25"], ["27", "stop-1"], ["30", "stop-2"], ["33", "stop-3"], ["36", "stop-4"]])(
    "stops a forward roll from %s at %s and discards excess movement",
    (from, to) => {
      const state = at(from, { phase: "ready" });
      const next = rollDice(state, 6);
      expect(getCurrentTile(next).id).toBe(to);
      expect(next.movement).toBe(next.position - state.position);
      expect(next.phase).toBe("event");
    },
  );

  it.each(["1", "8", "15"])("moves %s to -6 only after event completion", (id) => {
    const state = at(id);
    expect(rollDice(state, 6)).toBe(state);
    const next = completeEvent(state);
    expect(next).toMatchObject({ position: -6, phase: "event" });
    expect(rollDice(next, 6)).toBe(next);
    expect(completeEvent(next)).toMatchObject({ position: -6, phase: "ready" });
  });

  it.each(["2", "6", "13", "26"])("returns %s to start without erasing the chosen route", (id) => {
    const state = at(id, { extended: true });
    expect(completeEvent(state)).toMatchObject({ position: 0, phase: "ready", extended: true });
  });

  it.each([["12", "9"], ["20", "16"], ["37", "29"]])("transfers %s to %s as an event requiring completion", (from, to) => {
    const next = completeEvent(at(from));
    expect(getCurrentTile(next).id).toBe(to);
    expect(next.phase).toBe("event");
    expect(rollDice(next, 6)).toBe(next);
  });

  it("moves exactly one space throughout the negative zone and carries -2 out to start", () => {
    let state = at("-6", { extended: false, phase: "ready" });
    for (let position = -5; position <= -1; position += 1) {
      state = rollDice(state, 6);
      expect(state).toMatchObject({ position, phase: "event", movement: 1 });
      state = completeEvent(state);
    }
    expect(state.nextRollReduction).toBe(2);
    expect(getDiceMovementRule(state)).toBe("forced-one");
    state = rollDice(state, 1);
    expect(state).toMatchObject({ position: 0, phase: "ready", nextRollReduction: 2 });
    expect(getDiceMovementRule(state)).toBe("minus-two");
    state = rollDice(state, 6);
    expect(state).toMatchObject({ position: 4, phase: "event", movement: 4, nextRollReduction: 0 });
    expect(getDiceMovementRule(state)).toBeNull();
  });

  it.each([1, 2])("consumes -2 once when die %i cannot move, allowing an ordinary reroll", (die) => {
    const state = at("start", { nextRollReduction: 2 });
    const next = rollDice(state, die);
    expect(next).toMatchObject({ phase: "ready", position: 0, movement: 0, diceResult: die, adjustedDiceResult: 0, nextRollReduction: 0, rollCount: 1 });
    expect(getDisplayedDiceResult(next)).toBe(0);
    expect(rollDice(next, 3)).toMatchObject({ phase: "event", position: 3, movement: 3 });
  });

  it("advances one at a time from 21 until the first 25 choice", () => {
    let state = completeEvent(at("21"));
    expect(state.forceOneUntilBranch).toBe(true);
    for (let position = 22; position <= 25; position += 1) {
      state = rollDice(state, 6);
      expect(state.position).toBe(position);
      state = completeEvent(state);
    }
    expect(state.phase).toBe("choice");
    const next = chooseRoute(state, true);
    expect(next).toMatchObject({ phase: "ready", extended: true, position: 25, forceOneUntilBranch: false });
    expect(rollDice(next, 6)).toMatchObject({ position: 28, movement: 3 });
  });

  it("requires completion before choosing the short goal, then finishes exactly once", () => {
    const state = at("25");
    expect(chooseRoute(state, false)).toBe(state);
    const goal = chooseRoute(completeEvent(state), false);
    expect(getCurrentTile(goal).id).toBe("goal-1");
    expect(getRemainingSpaces(goal)).toBe(0);
    const done = completeEvent(goal, completedAt);
    expect(done).toMatchObject({ phase: "finished", completedAt, outcome: "goal-1" });
    expect(completeEvent(done, "2026-10-04T00:00:00Z")).toBe(done);
    expect(rollDice(goal, 6)).toBe(goal);
    expect(retireGame(goal)).toBe(goal);
    expect(failGame(goal)).toBe(goal);
  });

  it("never reopens the first route choice after extending, including returns to start", () => {
    const state = completeEvent(at("25", { extended: true }));
    expect(state.phase).toBe("ready");
    expect(chooseRoute(state, false)).toBe(state);
    expect(completeEvent(at("21", { extended: true })).forceOneUntilBranch).toBe(false);
    const restarted = completeEvent(at("26"));
    expect(restarted).toMatchObject({ extended: true, position: 0 });
    expect(rollDice(restarted, 6)).toMatchObject({ position: 3, movement: 3 });
  });

  it.each([1, 2, 3])("keeps the extended player ready when die %i produces zero movement", (die) => {
    const state = at("28", { phase: "ready" });
    const next = rollDice(state, die);
    expect(next).toMatchObject({ phase: "ready", position: state.position, movement: 0, diceResult: die, adjustedDiceResult: 0 });
    expect(getDisplayedDiceResult(next)).toBe(0);
    expect(completeEvent(next)).toBe(next);
  });

  it("lets the negative-zone rule override the extended reduction", () => {
    const state = at("-6", { phase: "ready", extended: true, nextRollReduction: 2 });
    expect(getDiceMovementRule(state)).toBe("forced-one");
    expect(rollDice(state, 1)).toMatchObject({ position: -5, movement: 1, phase: "event" });
  });

  it("shows the effective next-roll rule with fixed movement above either reduction", () => {
    const branch = completeEvent(at("21", { nextRollReduction: 2 }));
    expect(getDiceMovementRule(branch)).toBe("forced-one");
    expect(rollDice(branch, 6)).toMatchObject({ movement: 1, nextRollReduction: 0 });

    const extended = at("start", { extended: true, nextRollReduction: 2 });
    expect(getDiceMovementRule(extended)).toBe("minus-three");
    expect(rollDice(extended, 6)).toMatchObject({ position: 3, movement: 3, nextRollReduction: 0 });
    expect(getDiceMovementRule(createGame(startedAt))).toBeNull();
  });

  it("keeps stop-4's one-space rule through the end, overriding reduced dice", () => {
    let state = completeEvent(at("stop-4"));
    expect(state.forceOneUntilEnd).toBe(true);
    expect(getDiceMovementRule(state)).toBe("forced-one");
    for (const id of ["38", "39", "40", "goal-2"]) {
      state = rollDice(state, 1);
      expect(getCurrentTile(state).id).toBe(id);
      expect(state.movement).toBe(1);
      if (id !== "goal-2") state = completeEvent(state);
    }
    expect(state).toMatchObject({ phase: "goal", position: 45, outcome: "goal-2" });
    expect(getDiceMovementRule(state)).toBeNull();
    expect(completeEvent(state, completedAt)).toMatchObject({ phase: "finished", completedAt });
  });

  it("counts inserted stops and the final goal as remaining spaces", () => {
    expect(getRemainingSpaces(at("25", { extended: true }))).toBe(20);
    expect(getRemainingSpaces(at("28"))).toBe(17);
    expect(getRemainingSpaces(at("40"))).toBe(1);
    expect(getRemainingSpaces(at("-6", { extended: true }))).toBe(51);
    expect(getRemainingSpaces(at("-6"))).toBe(31);
  });
});

describe("sugoroku adjusted dice faces", () => {
  it.each([
    ["start", {}, 6],
    ["start", { nextRollReduction: 2 }, 4],
    ["start", { extended: true, nextRollReduction: 2 }, 3],
    ["-1", { extended: true, nextRollReduction: 2 }, 1],
    ["21", { forceOneUntilBranch: true, nextRollReduction: 2 }, 1],
    ["stop-4", { forceOneUntilEnd: true }, 1],
  ] as const)("keeps the original roll and stores the adjusted face from %s with %j", (id, changes, expected) => {
    const state = at(id, { ...changes, phase: "ready" });
    expect(getAdjustedDiceResult(state, 6)).toBe(expected);
    const rolled = rollDice(state, 6);
    expect(rolled.diceResult).toBe(6);
    expect(rolled.adjustedDiceResult).toBe(expected);
    expect(getDisplayedDiceResult(rolled)).toBe(expected);
  });

  it("keeps the corrected face when forced stops or the goal shorten actual movement", () => {
    for (const [from, adjusted, movement] of [["5", 6, 2], ["28", 3, 1], ["40", 3, 1]] as const) {
      const rolled = rollDice(at(from, { phase: "ready" }), 6);
      expect(rolled).toMatchObject({ diceResult: 6, adjustedDiceResult: adjusted, movement });
      expect(getDisplayedDiceResult(rolled)).toBe(adjusted);
    }
  });

  it("does not reapply a newly activated rule to the previous roll", () => {
    const rolled = rollDice(at("19", { phase: "ready" }), 6);
    const branch = completeEvent(rolled);
    expect(getAdjustedDiceResult(branch, 6)).toBe(1);
    expect(getDisplayedDiceResult(branch)).toBe(6);

    const exited = rollDice(completeEvent(at("-1")), 6);
    expect(getAdjustedDiceResult(exited, 6)).toBe(4);
    expect(getDisplayedDiceResult(exited)).toBe(1);
  });

  it("keeps a saved correction after the one-time rule has been consumed", () => {
    const rolled = rollDice(at("start", { nextRollReduction: 2 }), 6);
    const restored = JSON.parse(JSON.stringify(completeEvent(rolled))) as SugorokuGame;
    expect(getDiceMovementRule(restored)).toBeNull();
    expect(getDisplayedDiceResult(restored)).toBe(4);
    expect(validateGame(restored)).toBe(true);
  });

  it("uses the raw face for older saves and no face before the first roll", () => {
    expect(getDisplayedDiceResult(createGame())).toBeNull();
    const legacy = rollDice(at("start", { nextRollReduction: 2 }), 6);
    delete legacy.adjustedDiceResult;
    expect(validateGame(legacy)).toBe(true);
    expect(getDisplayedDiceResult(legacy)).toBe(6);
  });
});

describe("neutral sugoroku exit and penalty points", () => {
  it("hides movement modifiers during every penalty phase and uses the raw die", () => {
    const state = at("-1", { extended: true, nextRollReduction: 2, forceOneUntilEnd: true });
    const retired = retireGame(state);
    const pending = completeEvent(retired);
    const rolled = rollDice(pending, 4);
    expect(getDisplayedDiceResult(pending)).toBeNull();
    for (const ended of [retired, pending, rolled, completeEvent(rolled, completedAt), failGame(state)]) {
      expect(getDiceMovementRule(ended)).toBeNull();
    }
    expect(rolled).toMatchObject({ penaltyRoll: 4, diceResult: 4, adjustedDiceResult: 4, movement: 0, penaltyPoints: 1840 });
    expect(getDisplayedDiceResult(rolled)).toBe(4);
  });

  it("requires the retire event before the one-time penalty roll", () => {
    const initial = at("28");
    const retired = retireGame(initial);
    expect(getCurrentTile(retired).id).toBe("retire");
    expect(retired.failureRemainingSpaces).toBe(17);
    expect(rollDice(retired, 6)).toBe(retired);
    const pending = completeEvent(retired);
    expect(pending.phase).toBe("penalty-roll");
    expect(getCurrentTile(pending).id).toBe("penalty");
    expect(completeEvent(pending)).toBe(pending);
    const rolled = rollDice(pending, 4);
    expect(rolled).toMatchObject({ phase: "penalty-event", penaltyRoll: 4, penaltyPoints: 680 });
    expect(getRemainingSpaces(rolled)).toBe(17);
    expect(rollDice(rolled, 1)).toBe(rolled);
    expect(failGame(rolled)).toBe(rolled);
    expect(retireGame(rolled)).toBe(rolled);
    const done = completeEvent(rolled, completedAt);
    expect(done).toMatchObject({ phase: "finished", completedAt, outcome: "penalty", penaltyPoints: 680 });
    expect(getCurrentTile(done).id).toBe("penalty");
  });

  it("fails directly to the penalty roll and uses the frozen short-course distance", () => {
    const state = failGame(at("-6"));
    expect(state).toMatchObject({ phase: "penalty-roll", failureRemainingSpaces: 31 });
    expect(rollDice(state, 6).penaltyPoints).toBe(1860);
  });

  it("handles exit at the unchosen branch consistently with zero remaining distance", () => {
    const state = completeEvent(at("25"));
    expect(retireGame(state)).toMatchObject({ phase: "retire", failureRemainingSpaces: 0 });
    const failed = failGame(state);
    expect(failed).toMatchObject({ phase: "penalty-roll", failureRemainingSpaces: 0 });
    expect(rollDice(failed, 6).penaltyPoints).toBe(0);
  });

  it.each([0, 7, -1, 1.5, NaN, Infinity])("ignores invalid die %s in both roll phases", (die) => {
    const ready = createGame(startedAt);
    const penalty = failGame(ready);
    expect(rollDice(ready, die)).toBe(ready);
    expect(rollDice(penalty, die)).toBe(penalty);
  });

  it("ignores actions outside their phases", () => {
    const ready = createGame(startedAt);
    expect(completeEvent(ready)).toBe(ready);
    expect(chooseRoute(ready, true)).toBe(ready);
    const choice = completeEvent(at("25"));
    expect(rollDice(choice, 6)).toBe(choice);
    const done = completeEvent(rollDice(failGame(ready), 2), completedAt);
    expect(retireGame(done)).toBe(done);
    expect(failGame(done)).toBe(done);
    expect(chooseRoute(done, true)).toBe(done);
    expect(rollDice(done, 6)).toBe(done);
  });
});

describe("sugoroku saved-state validation", () => {
  it("accepts absent legacy corrections but rejects present malformed or contradictory corrections", () => {
    const rolled = rollDice(createGame(startedAt), 6);
    const legacy = { ...rolled };
    delete legacy.adjustedDiceResult;
    expect(validateGame(legacy)).toBe(true);
    for (const adjustedDiceResult of [undefined, null, "6", NaN, Infinity, -1, 7, 1.5, 0, 1, 3, 4, 5]) {
      expect(validateGame({ ...rolled, adjustedDiceResult }), String(adjustedDiceResult)).toBe(false);
    }
    expect(validateGame({ ...createGame(startedAt), adjustedDiceResult: 0 })).toBe(false);
    const zero = rollDice(at("start", { nextRollReduction: 2 }), 2);
    expect(validateGame(zero)).toBe(true);
    expect(validateGame({ ...zero, adjustedDiceResult: 2 })).toBe(false);
    const penalty = rollDice(failGame(createGame(startedAt)), 6);
    expect(validateGame({ ...penalty, adjustedDiceResult: 3 })).toBe(false);
    delete penalty.adjustedDiceResult;
    expect(validateGame(penalty)).toBe(true);
  });

  it("accepts all public transition results after a JSON roundtrip", () => {
    const states = [createGame(startedAt)];
    for (const tile of SUGOROKU_TILES) {
      if (tile.position === null || tile.kind === "goal") continue;
      const state = at(tile.id);
      states.push(state, completeEvent(state), retireGame(state), failGame(state));
      for (let die = 1; die <= 6; die += 1) {
        const rolled = rollDice(completeEvent(state), die);
        states.push(rolled);
        const penalty = rollDice(failGame(state), die);
        states.push(penalty, completeEvent(penalty, completedAt));
      }
    }
    const choice = completeEvent(at("25"));
    states.push(chooseRoute(choice, true), chooseRoute(choice, false));
    states.push(completeEvent(chooseRoute(choice, false), completedAt));
    states.push(rollDice(at("40", { phase: "ready" }), 6));
    for (const state of states) expect(validateGame(JSON.parse(JSON.stringify(state))), JSON.stringify(state)).toBe(true);
  });

  it.each([
    { version: 2 }, { id: "" }, { startedAt: "bad" }, { completedAt: completedAt },
    { phase: "unknown" }, { position: -7 }, { position: 46 }, { position: 28 },
    { phase: "choice", position: 0 }, { phase: "event", position: 0 },
    { phase: "ready", position: 25 }, { movement: -1 }, { movement: 7 },
    { diceResult: 9 }, { diceResult: 1, movement: null }, { rollCount: -1 },
    { diceResult: 1, movement: 1, rollCount: 0 }, { rollCount: 1 },
    { nextRollReduction: 3 }, { extended: true, forceOneUntilBranch: true },
    { forceOneUntilEnd: true }, { outcome: "goal-2" }, { penaltyRoll: 4 },
    { penaltyPoints: 20 }, { failureRemainingSpaces: 20 }, { phase: "finished" },
  ])("rejects contradictory or malformed saved fields: %j", (change) => {
    expect(validateGame({ ...createGame(startedAt), ...change })).toBe(false);
  });

  it("rejects incomplete objects, impossible goal states, and changed penalty totals", () => {
    for (const value of [null, [], {}, "game", undefined]) expect(validateGame(value)).toBe(false);
    const penalty = rollDice(failGame(createGame(startedAt)), 2);
    expect(validateGame({ ...penalty, penaltyPoints: 1 })).toBe(false);
    expect(validateGame({ ...penalty, failureRemainingSpaces: 24 })).toBe(false);
    expect(validateGame({ ...penalty, diceResult: 3 })).toBe(false);
    expect(validateGame({ ...penalty, movement: 1 })).toBe(false);
    expect(validateGame({ ...penalty, extended: true, position: 45, failureRemainingSpaces: 0, penaltyPoints: 0 })).toBe(false);
    const goal = chooseRoute(completeEvent(at("25")), false);
    expect(validateGame({ ...goal, extended: true })).toBe(false);
    expect(validateGame({ ...goal, completedAt, phase: "finished", startedAt: "2026-10-04T00:00:00Z" })).toBe(false);
  });

  it("provides nonempty descriptions for every configurable tile", () => {
    for (const tile of SUGOROKU_TILES) expect(getTileRuleDescription(tile.id).length).toBeGreaterThan(0);
  });
});

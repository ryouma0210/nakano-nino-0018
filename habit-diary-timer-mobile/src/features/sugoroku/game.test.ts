import { describe, expect, it } from "vitest";
import {
  chooseRoute, completeEvent, createGame, failGame, getAdjustedDiceResult, getCurrentTile, getDefeatTile,
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
    expect(state).toMatchObject({ position: 4, phase: "event", movement: 4, nextRollReduction: 2 });
    expect(getDiceMovementRule(state)).toBe("minus-two");
  });

  it.each([1, 2])("retains the -2 debuff when die %i cannot move, including on repeated rerolls", (die) => {
    const state = at("start", { nextRollReduction: 2 });
    const next = rollDice(state, die);
    expect(next).toMatchObject({ phase: "ready", position: 0, movement: 0, diceResult: die, adjustedDiceResult: 0, nextRollReduction: 2, rollCount: 1 });
    expect(getDisplayedDiceResult(next)).toBe(0);
    const repeated = rollDice(next, die);
    expect(getDiceMovementRule(repeated)).toBe("minus-two");
    expect(rollDice(repeated, 3)).toMatchObject({ phase: "event", position: 1, movement: 1, nextRollReduction: 2 });
  });

  it("reapplies -1 after a second visit from 8 and keeps the debuff through stop 7", () => {
    let state = at("8");
    for (let visit = 1; visit <= 2; visit += 1) {
      state = completeEvent(state);
      expect(getCurrentTile(state).id).toBe("-6");
      state = completeEvent(state);
      for (let position = -5; position <= -1; position += 1) {
        state = rollDice(state, 6);
        expect(state).toMatchObject({ position, movement: 1, adjustedDiceResult: 1 });
        state = completeEvent(state);
      }
      state = rollDice(state, 6);
      expect(state).toMatchObject({ position: 0, phase: "ready", nextRollReduction: 2 });
      expect(getDiceMovementRule(state)).toBe("minus-two");
      state = completeEvent(rollDice(state, 6));
      expect(state).toMatchObject({ position: 4, adjustedDiceResult: 4, nextRollReduction: 2 });
      state = completeEvent(rollDice(state, 6));
      expect(state).toMatchObject({ position: 7, adjustedDiceResult: 4, movement: 3, nextRollReduction: 2 });
      expect(getDiceMovementRule(state)).toBe("minus-two");
      if (visit === 1) state = rollDice(state, 3);
    }
    expect(validateGame(state)).toBe(true);
  });

  it("keeps -2 through stops 7 and 14, then replaces it only when the 21 event completes", () => {
    let state = rollDice(completeEvent(at("-1")), 6);
    for (const position of [4, 7, 11, 14, 18, 21]) {
      state = rollDice(state, 6);
      expect(state.position).toBe(position);
      expect(getDiceMovementRule(state)).toBe("minus-two");
      if (position !== 21) {
        state = completeEvent(state);
        expect(getDiceMovementRule(state)).toBe("minus-two");
      }
    }
    state = completeEvent(state);
    expect(state).toMatchObject({ forceOneUntilBranch: true, nextRollReduction: 0 });
    expect(getDiceMovementRule(state)).toBe("forced-one");
    expect(rollDice(state, 6)).toMatchObject({ position: 22, adjustedDiceResult: 1, movement: 1 });
  });

  it.each(["2", "6", "13"])("keeps the -2 debuff after %s sends the player back to start", (id) => {
    const restarted = completeEvent(at(id, { nextRollReduction: 2 }));
    expect(restarted).toMatchObject({ position: 0, nextRollReduction: 2 });
    expect(getDiceMovementRule(restarted)).toBe("minus-two");
    expect(rollDice(restarted, 6)).toMatchObject({ position: 4, adjustedDiceResult: 4 });
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
    expect(getDiceMovementRule(restarted)).toBe("minus-three");
    expect(rollDice(restarted, 6)).toMatchObject({ position: 3, movement: 3 });
  });

  it("resumes the hard-mode -3 debuff after traversing the negative zone again", () => {
    let state = completeEvent(at("8", { extended: true }));
    state = completeEvent(state);
    for (let position = -5; position <= -1; position += 1) {
      state = completeEvent(rollDice(state, 6));
      expect(state.position).toBe(position);
      expect(getDiceMovementRule(state)).toBe("forced-one");
    }
    state = rollDice(state, 6);
    expect(state.position).toBe(0);
    expect(getDiceMovementRule(state)).toBe("minus-three");
    expect(rollDice(state, 6)).toMatchObject({ position: 3, adjustedDiceResult: 3 });
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
    expect(rollDice(extended, 6)).toMatchObject({ position: 3, movement: 3 });
    expect(getDiceMovementRule(createGame(startedAt))).toBeNull();
  });

  it("keeps stop-4's one-space rule through the end, overriding reduced dice", () => {
    let state = completeEvent(at("stop-4", { nextRollReduction: 2 }));
    expect(state.forceOneUntilEnd).toBe(true);
    expect(state.nextRollReduction).toBe(0);
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

  it("keeps both the adjusted face and the active debuff through a save roundtrip", () => {
    const rolled = rollDice(at("start", { nextRollReduction: 2 }), 6);
    const restored = JSON.parse(JSON.stringify(completeEvent(rolled))) as SugorokuGame;
    expect(getDiceMovementRule(restored)).toBe("minus-two");
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
  it.each([
    ["start", "スタート"], ["3", "3マス目"], ["-6", "-6マス目"], ["-1", "-1マス目"],
    ["25", "25マス目"], ["stop-1", "ストップ1"], ["stop-2", "ストップ2"],
    ["stop-3", "ストップ3"], ["stop-4", "ストップ4"], ["29", "29マス目"], ["40", "40マス目"],
  ])("retains the defeat space %s through both exit flows and penalty completion", (id, label) => {
    const original = id === "25" ? completeEvent(at(id)) : at(id);
    for (const exit of [retireGame, failGame]) {
      const exited = exit(original);
      const pending = exited.phase === "retire" ? completeEvent(exited) : exited;
      const rolled = rollDice(pending, 4);
      const finished = completeEvent(rolled, completedAt);
      for (const state of [exited, pending, rolled, finished]) {
        expect(getDefeatTile(state)).toMatchObject({ id, label, position: original.position });
        expect(validateGame(state)).toBe(true);
      }
      expect(getCurrentTile(finished).id).toBe("penalty");
    }
  });

  it("does not label active or successful games with a defeat space", () => {
    const normalGoal = chooseRoute(completeEvent(at("25")), false);
    const extendedGoal = rollDice(at("40", { phase: "ready" }), 6);
    for (const state of [
      createGame(startedAt), at("-5"), completeEvent(at("25")), normalGoal, extendedGoal,
      completeEvent(normalGoal, completedAt), completeEvent(extendedGoal, completedAt),
    ]) {
      expect(getDefeatTile(state)).toBeNull();
    }
  });

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

describe("sugoroku progress log", () => {
  it("records rolls, actual movement and forced stops without mutating previous entries", () => {
    const initial = at("5", { phase: "ready" });
    const before = JSON.parse(JSON.stringify(initial));
    const next = rollDice(initial, 6);
    expect(next.logs).toHaveLength(1);
    expect(next.logs![0]).toEqual({
      sequence: 1, kind: "roll", fromTileId: "5", toTileId: "7", dice: 6, adjustedDice: 6,
      movement: 2, forcedStop: true, rule: null, effectsAdded: [], effectsRemoved: [],
    });
    expect(initial).toEqual(before);
    const stopped = completeEvent(next);
    expect(stopped.logs!.map((entry) => entry.sequence)).toEqual([1, 2]);
    expect(stopped.logs![1]).toMatchObject({ kind: "event", fromTileId: "7", toTileId: "7", effectsRemoved: [] });
    expect(next.logs).toHaveLength(1);
  });

  it("records a corrected zero roll without inventing movement", () => {
    const next = rollDice(at("start", { nextRollReduction: 2 }), 1);
    expect(next.logs![0]).toMatchObject({ fromTileId: "start", toTileId: "start", dice: 1, adjustedDice: 0, movement: 0, forcedStop: false, rule: "minus-two" });
  });

  it("distinguishes rule-driven transfer to the negative zone from the next one-square roll", () => {
    const moved = completeEvent(at("8"));
    expect(moved.logs![0]).toMatchObject({ kind: "event", fromTileId: "8", toTileId: "-6", movement: -14, dice: null, effectsAdded: ["negative-zone"] });
    const ready = completeEvent(moved);
    const next = rollDice(ready, 6);
    expect(next.logs!.at(-1)).toMatchObject({ kind: "roll", fromTileId: "-6", toTileId: "-5", dice: 6, adjustedDice: 1, movement: 1, rule: "forced-one" });
  });

  it("records the pending -2 effect inside the negative zone and its return to normal movement", () => {
    const next = completeEvent(at("-1"));
    expect(next.logs![0]).toMatchObject({ effectsAdded: ["minus-two"], effectsRemoved: [] });
    const start = rollDice(next, 5);
    expect(start.logs!.at(-1)).toMatchObject({ fromTileId: "-1", toTileId: "start", rule: "forced-one", adjustedDice: 1, effectsRemoved: ["negative-zone"] });
    const reduced = rollDice(start, 6);
    expect(reduced.logs!.at(-1)).toMatchObject({ dice: 6, adjustedDice: 4, rule: "minus-two", effectsRemoved: [] });
  });

  it("records the replacement of -2 at 21 and the hard-course modifier at the branch", () => {
    const next = completeEvent(at("21", { nextRollReduction: 2 }));
    expect(next.logs![0]).toMatchObject({ effectsAdded: ["one-until-branch"], effectsRemoved: ["minus-two"] });
    const atBranch = { ...next, position: 25, phase: "event" as const };
    const hard = chooseRoute(completeEvent(atBranch), true);
    expect(hard.logs!.at(-1)).toMatchObject({ kind: "route", effectsAdded: ["minus-three"], effectsRemoved: ["one-until-branch"] });
  });

  it("retains the hard-course modifier after returning from 26 and records its replacement at stop-4", () => {
    const returned = completeEvent(at("26", { extended: true }));
    expect(returned.logs![0]).toMatchObject({ fromTileId: "26", toTileId: "start", effectsAdded: [], effectsRemoved: [] });
    const next = completeEvent(at("stop-4", { extended: true }));
    expect(next.logs![0]).toMatchObject({ effectsAdded: ["one-until-end"], effectsRemoved: ["minus-three"] });
  });

  it("records retire, penalty roll and completion as separate actions", () => {
    const next = completeEvent(rollDice(completeEvent(retireGame(at("-5"))), 3), completedAt);
    expect(next.logs!.map((entry) => entry.kind)).toEqual(["retire", "event", "penalty-roll", "finish"]);
    expect(next.logs![0]).toMatchObject({ fromTileId: "-5", toTileId: "retire", effectsRemoved: ["negative-zone"] });
    expect(next.logs![2]).toMatchObject({ dice: 3, adjustedDice: 3, movement: 0, rule: null });
    expect(next.logs![3]).toMatchObject({ fromTileId: "penalty", toTileId: "penalty", dice: null });
  });

  it("never adds a log for rejected actions", () => {
    const state = createGame(startedAt);
    expect(rollDice(state, 0)).toBe(state);
    expect(completeEvent(state)).toBe(state);
    expect(chooseRoute(state, true)).toBe(state);
    expect(state.logs).toEqual([]);
  });

  it("keeps the latest 100 entries with continuing sequence numbers", () => {
    let state = at("start", { nextRollReduction: 2 });
    for (let index = 0; index < 125; index += 1) state = rollDice(state, 1);
    expect(state.logs).toHaveLength(100);
    expect(state.logs![0].sequence).toBe(26);
    expect(state.logs!.at(-1)?.sequence).toBe(125);
    expect(validateGame(state)).toBe(true);
  });

  it("accepts absent legacy logs but rejects explicit malformed logs", () => {
    const legacy = rollDice(createGame(startedAt), 3);
    delete legacy.logs;
    expect(validateGame(legacy)).toBe(true);
    for (const logs of [undefined, null, {}, "log", [null], Array(101).fill({})]) {
      expect(validateGame({ ...legacy, logs })).toBe(false);
    }
  });

  it.each([
    { sequence: 0 }, { sequence: 1.5 }, { kind: "unknown" }, { fromTileId: "missing" },
    { toTileId: "missing" }, { movement: -1 }, { movement: 7 }, { dice: 9 },
    { adjustedDice: 3 }, { forcedStop: true }, { rule: "unknown" },
    { effectsAdded: ["unknown"] }, { effectsRemoved: null },
    { effectsAdded: ["minus-two", "minus-two"] },
    { effectsAdded: ["minus-two"], effectsRemoved: ["minus-two"] },
  ])("rejects malformed recorded actions: %j", (changes) => {
    const state = rollDice(createGame(startedAt), 6);
    expect(validateGame({ ...state, logs: [{ ...state.logs![0], ...changes }] })).toBe(false);
  });

  it("rejects duplicate or out-of-order log sequence numbers", () => {
    const state = completeEvent(rollDice(createGame(startedAt), 3));
    expect(validateGame({ ...state, logs: [state.logs![0], { ...state.logs![1], sequence: 1 }] })).toBe(false);
    expect(validateGame({ ...state, logs: [state.logs![1], state.logs![0]] })).toBe(false);
  });
});

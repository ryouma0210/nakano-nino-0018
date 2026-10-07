export type SugorokuPhase =
  | "ready" | "event" | "choice" | "goal" | "retire"
  | "penalty-roll" | "penalty-event" | "finished";

export type SugorokuOutcome = "goal-1" | "goal-2" | "penalty";
export type SugorokuMovementRule = "forced-one" | "minus-three" | "minus-two" | null;
export type SugorokuLogEffect = "negative-zone" | "minus-two" | "minus-three" | "one-until-branch" | "one-until-end";
export type SugorokuLogEntry = {
  sequence: number;
  kind: "roll" | "penalty-roll" | "event" | "route" | "retire" | "fail" | "finish";
  fromTileId: string;
  toTileId: string;
  dice: number | null;
  adjustedDice: number | null;
  movement: number;
  forcedStop: boolean;
  rule: SugorokuMovementRule;
  effectsAdded: SugorokuLogEffect[];
  effectsRemoved: SugorokuLogEffect[];
};
export const SUGOROKU_LOG_LIMIT = 100;

export type SugorokuGame = {
  version: 1;
  id: string;
  startedAt: string;
  completedAt: string | null;
  phase: SugorokuPhase;
  /** Physical route index, including the four inserted stop spaces. */
  position: number;
  extended: boolean;
  /** Original random roll, retained for logs and penalty calculations. */
  diceResult: number | null;
  /** Rule-adjusted result before a stop or route end shortens movement; absent in older saves. */
  adjustedDiceResult?: number | null;
  /** Actual distance moved, after modifiers and intervening stop spaces. */
  movement: number | null;
  rollCount: number;
  /** Persistent normal-mode -2 debuff; retain the legacy field name for saved games. */
  nextRollReduction: 0 | 2;
  forceOneUntilBranch: boolean;
  forceOneUntilEnd: boolean;
  outcome: SugorokuOutcome | null;
  failureRemainingSpaces: number | null;
  penaltyRoll: number | null;
  penaltyPoints: number | null;
  /** Absent in legacy saves; older actions are never reconstructed. */
  logs?: SugorokuLogEntry[];
  /** Only new completed wins opt in to daily rewards; legacy history stays unchanged. */
  dailyRewardEligible?: true;
};

export type SugorokuTile = {
  id: string;
  label: string;
  position: number | null;
  kind: "start" | "event" | "stop" | "goal" | "retire" | "penalty";
};

const numberedStops = new Set([7, 14, 21, 25]);
const insertedStops = new Map([[28, 1], [31, 2], [34, 3], [37, 4]]);
const route: SugorokuTile[] = [{ id: "start", label: "スタート", position: 0, kind: "start" }];
for (let number = 1; number <= 40; number += 1) {
  route.push({
    id: String(number), label: `${number}マス目`, position: route.length,
    kind: numberedStops.has(number) ? "stop" : "event",
  });
  const stop = insertedStops.get(number);
  if (stop) route.push({
    id: `stop-${stop}`, label: `ストップ${stop}`, position: route.length, kind: "stop",
  });
}
route.push({ id: "goal-2", label: "ゴール②", position: route.length, kind: "goal" });

export const ROUTE_TILES: readonly SugorokuTile[] = route;
export const SUGOROKU_TILES: readonly SugorokuTile[] = [
  ...Array.from({ length: 6 }, (_, index): SugorokuTile => ({
    id: String(index - 6), label: `${index - 6}マス目`, position: index - 6, kind: "event",
  })),
  ...route,
  { id: "goal-1", label: "ゴール①", position: null, kind: "goal" },
  { id: "retire", label: "リタイアイベント", position: null, kind: "retire" },
  { id: "penalty", label: "ペナルティ", position: null, kind: "penalty" },
];

const tilesById = new Map(SUGOROKU_TILES.map((tile) => [tile.id, tile]));
const finalPosition = route.length - 1;
let idSequence = 0;

function timestamp(value?: string): string {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
}

export function createGame(now?: string): SugorokuGame {
  const startedAt = timestamp(now);
  idSequence += 1;
  return {
    version: 1,
    id: `${startedAt}-${idSequence}-${Math.random().toString(36).slice(2, 10)}`,
    startedAt, completedAt: null, phase: "ready", position: 0, extended: false,
    diceResult: null, adjustedDiceResult: null, movement: null, rollCount: 0, nextRollReduction: 0,
    forceOneUntilBranch: false, forceOneUntilEnd: false,
    outcome: null, failureRemainingSpaces: null, penaltyRoll: null, penaltyPoints: null,
    logs: [],
  };
}

function positionOf(id: string): number {
  return tilesById.get(id)?.position ?? 0;
}

function routeRemaining(state: SugorokuGame): number {
  return Math.max(0, (state.extended ? finalPosition : 25) - state.position);
}

export function getRemainingSpaces(state: SugorokuGame): number {
  return state.failureRemainingSpaces ?? routeRemaining(state);
}

export function getCurrentTile(state: SugorokuGame): SugorokuTile {
  if (state.phase === "retire") return tilesById.get("retire")!;
  if (state.phase === "penalty-roll" || state.phase === "penalty-event") return tilesById.get("penalty")!;
  if ((state.phase === "goal" || state.phase === "finished") && state.outcome) return tilesById.get(state.outcome)!;
  return state.position < 0 ? tilesById.get(String(state.position))! : route[state.position];
}

/** Exit flows retain their original route position, including in older history records. */
export function getDefeatTile(state: SugorokuGame): SugorokuTile | null {
  if (state.outcome !== "penalty") return null;
  return state.position < 0 ? tilesById.get(String(state.position))! : route[state.position];
}

function validDie(die: unknown): die is number {
  return typeof die === "number" && Number.isInteger(die) && die >= 1 && die <= 6;
}

/** The currently effective modifier for the next movement roll. */
export function getDiceMovementRule(state: SugorokuGame): SugorokuMovementRule {
  if (state.outcome !== null) return null;
  if (state.position < 0 || state.forceOneUntilBranch || state.forceOneUntilEnd) return "forced-one";
  if (state.extended) return "minus-three";
  return state.nextRollReduction === 2 ? "minus-two" : null;
}

/** Apply the current rule to a valid 1–6 roll, before any stop or route boundary. */
export function getAdjustedDiceResult(state: SugorokuGame, die: number): number {
  const movementRule = getDiceMovementRule(state);
  if (movementRule === "forced-one") return 1;
  const reduction = movementRule === "minus-three" ? 3 : movementRule === "minus-two" ? 2 : 0;
  return Math.max(0, die - reduction);
}

/** Older saves retain their original face; a pending penalty roll has no face yet. */
export function getDisplayedDiceResult(state: SugorokuGame): number | null {
  if (state.phase === "penalty-roll") return null;
  return state.adjustedDiceResult ?? state.diceResult;
}

function rollDiceCore(state: SugorokuGame, die: number): SugorokuGame {
  if (!validDie(die)) return state;
  if (state.phase === "penalty-roll") {
    return {
      ...state, phase: "penalty-event", penaltyRoll: die,
      penaltyPoints: getRemainingSpaces(state) * die * 10,
      diceResult: die, adjustedDiceResult: die, movement: 0, rollCount: state.rollCount + 1,
    };
  }
  if (state.phase !== "ready") return state;

  // Movement debuffs persist until another rule replaces them. The negative
  // zone temporarily overrides them with one-space movement while inside it.
  const distance = getAdjustedDiceResult(state, die);
  const next = {
    ...state, diceResult: die, adjustedDiceResult: distance, movement: 0, rollCount: state.rollCount + 1,
  };
  if (distance === 0) return next;

  const end = Math.min(state.position + distance, state.extended ? finalPosition : 25);
  let destination = end;
  for (let position = state.position + 1; position <= end; position += 1) {
    if (position >= 0 && route[position].kind === "stop") {
      destination = position;
      break;
    }
  }
  return {
    ...next, position: destination, movement: destination - state.position,
    phase: destination === 0 ? "ready" : destination === finalPosition ? "goal" : "event",
    outcome: destination === finalPosition ? "goal-2" : null,
  };
}

function finish(state: SugorokuGame, now?: string): SugorokuGame {
  const completedAt = timestamp(now);
  return {
    ...state, phase: "finished",
    completedAt: Date.parse(completedAt) < Date.parse(state.startedAt) ? state.startedAt : completedAt,
  };
}

function completeEventCore(state: SugorokuGame, now?: string): SugorokuGame {
  if (state.phase === "goal" || state.phase === "penalty-event") return finish(state, now);
  if (state.phase === "retire") return { ...state, phase: "penalty-roll" };
  if (state.phase !== "event") return state;

  const id = getCurrentTile(state).id;
  if (["1", "8", "15"].includes(id)) return { ...state, position: -6 };
  if (["2", "6", "13", "26"].includes(id)) return { ...state, position: 0, phase: "ready" };
  const transfer = { "12": "9", "20": "16", "37": "29" }[id];
  if (transfer) return { ...state, position: positionOf(transfer) };
  if (id === "-1") return { ...state, phase: "ready", nextRollReduction: 2 };
  if (id === "21" && !state.extended) return { ...state, phase: "ready", forceOneUntilBranch: true, nextRollReduction: 0 };
  if (id === "25" && !state.extended) return { ...state, phase: "choice" };
  if (id === "stop-4") return { ...state, phase: "ready", forceOneUntilEnd: true, nextRollReduction: 0 };
  return { ...state, phase: "ready" };
}

function chooseRouteCore(state: SugorokuGame, extended: boolean): SugorokuGame {
  if (state.phase !== "choice" || state.extended || state.position !== 25) return state;
  return extended
    ? { ...state, phase: "ready", extended: true, forceOneUntilBranch: false, nextRollReduction: 0 }
    : { ...state, phase: "goal", outcome: "goal-1", forceOneUntilBranch: false };
}

function canExit(state: SugorokuGame): boolean {
  return state.phase === "ready" || state.phase === "event" || state.phase === "choice";
}

/** Freeze the remaining distance before entering either exit flow. */
function retireGameCore(state: SugorokuGame): SugorokuGame {
  if (!canExit(state)) return state;
  return { ...state, phase: "retire", outcome: "penalty", failureRemainingSpaces: routeRemaining(state) };
}

function failGameCore(state: SugorokuGame): SugorokuGame {
  if (!canExit(state)) return state;
  return { ...state, phase: "penalty-roll", outcome: "penalty", failureRemainingSpaces: routeRemaining(state) };
}

function retainedEffects(state: SugorokuGame): SugorokuLogEffect[] {
  if (state.outcome !== null) return [];
  const effects: SugorokuLogEffect[] = [];
  if (state.position < 0) effects.push("negative-zone");
  if (state.forceOneUntilEnd) effects.push("one-until-end");
  else if (state.forceOneUntilBranch) effects.push("one-until-branch");
  else if (state.extended) effects.push("minus-three");
  else if (state.nextRollReduction === 2) effects.push("minus-two");
  return effects;
}

function logTransition(state: SugorokuGame, next: SugorokuGame, kind: SugorokuLogEntry["kind"]): SugorokuGame {
  if (next === state) return state;
  const previousLogs = state.logs ?? [];
  const from = getCurrentTile(state);
  const to = getCurrentTile(next);
  const isRoll = kind === "roll" || kind === "penalty-roll";
  const before = retainedEffects(state);
  const after = retainedEffects(next);
  const entry: SugorokuLogEntry = {
    sequence: (previousLogs[previousLogs.length - 1]?.sequence ?? 0) + 1,
    kind, fromTileId: from.id, toTileId: to.id,
    dice: isRoll ? next.diceResult : null,
    adjustedDice: isRoll ? next.adjustedDiceResult ?? next.diceResult : null,
    movement: next.position - state.position,
    forcedStop: kind === "roll" && next.position !== state.position && to.kind === "stop",
    rule: isRoll ? getDiceMovementRule(state) : null,
    effectsAdded: after.filter((effect) => !before.includes(effect)),
    effectsRemoved: before.filter((effect) => !after.includes(effect)),
  };
  return { ...next, logs: [...previousLogs, entry].slice(-SUGOROKU_LOG_LIMIT) };
}

export function rollDice(state: SugorokuGame, die: number): SugorokuGame {
  return logTransition(state, rollDiceCore(state, die), state.phase === "penalty-roll" ? "penalty-roll" : "roll");
}

export function completeEvent(state: SugorokuGame, now?: string): SugorokuGame {
  return logTransition(state, completeEventCore(state, now), state.phase === "goal" || state.phase === "penalty-event" ? "finish" : "event");
}

export function chooseRoute(state: SugorokuGame, extended: boolean): SugorokuGame {
  return logTransition(state, chooseRouteCore(state, extended), "route");
}

export function retireGame(state: SugorokuGame): SugorokuGame {
  return logTransition(state, retireGameCore(state), "retire");
}

export function failGame(state: SugorokuGame): SugorokuGame {
  return logTransition(state, failGameCore(state), "fail");
}

export function getTileRuleDescription(id: string): string {
  if (["1", "8", "15"].includes(id)) return "イベント完了後、マイナス６のマスへ移動します。";
  if (["2", "6", "13", "26"].includes(id)) return "イベント完了後、スタートに戻ります。";
  if (id === "12") return "イベント完了後、３マス戻ります。";
  if (id === "20") return "イベント完了後、４マス戻ります。";
  if (id === "37") return "イベント完了後、２９のマスへ移動します。";
  if (id === "-1") return "マイナスゾーンでは１マスずつ進みます。通常モードでは、スタートに戻った後は出目から２を引きます。このデバフは、２１マス目の命令完了で強制１マス移動に置き換わります。";
  if (id.startsWith("-")) return "マイナスゾーンでは、サイコロの出目に関係なく１マスずつ進みます。";
  if (id === "21") return "必ず止まります。通常モードでは、命令完了後から２５の分岐まで強制１マス移動となり、それまでのデバフを置き換えます。";
  if (id === "25") return "必ず止まります。初回の完了後、ゴールするか延長するか選べます。延長後は選び直せません。";
  if (id === "stop-4") return "必ず止まります。命令完了後は、それまでのデバフを置き換え、ゲーム終了まで強制１マス移動になります。";
  if (id.startsWith("stop-") || id === "7" || id === "14") return "通過する場合も必ず止まり、残りの出目は持ち越しません。";
  if (id === "start") return "サイコロを振って進みます。延長コースでは出目から３を引き、０以下ならその場で振り直します。";
  if (id === "retire") return "イベント完了後、ペナルティのサイコロを振ります。";
  if (id === "penalty") return "残りマス数とサイコロの出目と１０を掛けた計算結果を記録します。";
  if (id === "goal-1" || id === "goal-2") return "完了ボタンを押すとゲームが終了し、結果を記録します。";
  return "イベントを完了すると、次のサイコロを振れます。";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validLogEffects(value: unknown): value is SugorokuLogEffect[] {
  return Array.isArray(value) && value.length <= 5 && new Set(value).size === value.length
    && value.every((effect) => ["negative-zone", "minus-two", "minus-three", "one-until-branch", "one-until-end"].includes(effect));
}

function validLogs(value: unknown): value is SugorokuLogEntry[] {
  if (!Array.isArray(value) || value.length > SUGOROKU_LOG_LIMIT) return false;
  return value.every((entry, index) => {
    if (!isRecord(entry) || !nonNegativeInteger(entry.sequence) || entry.sequence === 0) return false;
    if (index > 0 && entry.sequence !== value[index - 1].sequence + 1) return false;
    if (!["roll", "penalty-roll", "event", "route", "retire", "fail", "finish"].includes(entry.kind as string)) return false;
    if (typeof entry.fromTileId !== "string" || typeof entry.toTileId !== "string") return false;
    const from = tilesById.get(entry.fromTileId);
    const to = tilesById.get(entry.toTileId);
    if (!from || !to || typeof entry.movement !== "number" || !Number.isInteger(entry.movement) || entry.movement < -finalPosition - 6 || entry.movement > 6) return false;
    if (from.position !== null && to.position !== null && entry.movement !== to.position - from.position) return false;
    if (typeof entry.forcedStop !== "boolean" || (entry.forcedStop && (entry.kind !== "roll" || to.kind !== "stop" || entry.movement <= 0))) return false;
    if (entry.rule !== null && !["forced-one", "minus-two", "minus-three"].includes(entry.rule as string)) return false;
    if (!validLogEffects(entry.effectsAdded) || !validLogEffects(entry.effectsRemoved)) return false;
    const removedEffects = entry.effectsRemoved;
    if (entry.effectsAdded.some((effect) => removedEffects.includes(effect))) return false;
    if (entry.kind === "roll" || entry.kind === "penalty-roll") {
      if (!validDie(entry.dice) || !nonNegativeInteger(entry.adjustedDice) || entry.adjustedDice > 6 || entry.movement < 0 || entry.movement > entry.adjustedDice) return false;
      const adjusted = entry.rule === "forced-one" ? 1 : Math.max(0, entry.dice - (entry.rule === "minus-two" ? 2 : entry.rule === "minus-three" ? 3 : 0));
      if (entry.adjustedDice !== adjusted) return false;
      return entry.kind !== "penalty-roll" || (entry.rule === null && entry.movement === 0);
    }
    return entry.dice === null && entry.adjustedDice === null && entry.rule === null;
  });
}

/** Reject malformed or contradictory saves before they can drive the UI. */
export function validateGame(value: unknown): value is SugorokuGame {
  if (!isRecord(value) || value.version !== 1 || typeof value.id !== "string" || !value.id || value.id.length > 200) return false;
  if (typeof value.startedAt !== "string" || !Number.isFinite(Date.parse(value.startedAt))) return false;
  if (value.completedAt !== null && (typeof value.completedAt !== "string" || !Number.isFinite(Date.parse(value.completedAt)))) return false;
  if (typeof value.phase !== "string" || !["ready", "event", "choice", "goal", "retire", "penalty-roll", "penalty-event", "finished"].includes(value.phase)) return false;
  if (typeof value.position !== "number" || !Number.isInteger(value.position) || value.position < -6 || value.position > finalPosition) return false;
  if (typeof value.extended !== "boolean" || (!value.extended && value.position > 25)) return false;
  if (value.diceResult !== null && !validDie(value.diceResult)) return false;
  if (value.movement !== null && (!nonNegativeInteger(value.movement) || value.movement > 6)) return false;
  if ((value.diceResult === null) !== (value.movement === null) || !nonNegativeInteger(value.rollCount)) return false;
  if ((value.rollCount === 0) !== (value.diceResult === null)) return false;
  if (value.nextRollReduction !== 0 && value.nextRollReduction !== 2) return false;
  if (typeof value.forceOneUntilBranch !== "boolean" || typeof value.forceOneUntilEnd !== "boolean") return false;
  if ((value.extended && value.forceOneUntilBranch) || (!value.extended && value.forceOneUntilEnd)) return false;
  if (value.outcome !== null && (typeof value.outcome !== "string" || !["goal-1", "goal-2", "penalty"].includes(value.outcome))) return false;
  if (value.failureRemainingSpaces !== null && !nonNegativeInteger(value.failureRemainingSpaces)) return false;
  if (value.penaltyRoll !== null && !validDie(value.penaltyRoll)) return false;
  if (value.penaltyPoints !== null && !nonNegativeInteger(value.penaltyPoints)) return false;
  if ("logs" in value && !validLogs(value.logs)) return false;
  if ("dailyRewardEligible" in value && (value.dailyRewardEligible !== true || value.phase !== "finished"
    || (value.outcome !== "goal-1" && value.outcome !== "goal-2"))) return false;

  const state = value as SugorokuGame;
  if ("adjustedDiceResult" in value) {
    const adjusted = state.adjustedDiceResult;
    if (adjusted === null) {
      if (state.diceResult !== null) return false;
    } else {
      if (!nonNegativeInteger(adjusted) || adjusted > 6 || state.diceResult === null || state.movement === null) return false;
      // Rules may have changed after this roll, so validate possible past results
      // rather than applying the current square's rule to a historical roll.
      if (![state.diceResult, 1, Math.max(0, state.diceResult - 2), Math.max(0, state.diceResult - 3)].includes(adjusted)) return false;
      if (state.movement > adjusted) return false;
      if (state.movement === 0 && adjusted > 0 && state.penaltyRoll === null) return false;
    }
  }
  if ((state.phase === "finished") !== (state.completedAt !== null)) return false;
  if (state.completedAt && Date.parse(state.completedAt) < Date.parse(state.startedAt)) return false;
  if (state.phase === "choice" && (state.position !== 25 || state.extended)) return false;
  if (state.phase === "ready" && (state.position === finalPosition || (!state.extended && state.position === 25))) return false;
  if (state.phase === "event" && (state.position === 0 || state.position === finalPosition)) return false;

  if (state.outcome === "penalty") {
    if (!["retire", "penalty-roll", "penalty-event", "finished"].includes(state.phase)) return false;
    if (state.position === finalPosition) return false;
    if (state.failureRemainingSpaces !== routeRemaining(state)) return false;
    const rolled = state.phase === "penalty-event" || state.phase === "finished";
    if (!rolled) return state.penaltyRoll === null && state.penaltyPoints === null;
    return state.penaltyRoll !== null && state.diceResult === state.penaltyRoll && state.movement === 0
      && (!("adjustedDiceResult" in state) || state.adjustedDiceResult === state.penaltyRoll)
      && state.penaltyPoints === state.failureRemainingSpaces * state.penaltyRoll * 10;
  }
  if (state.failureRemainingSpaces !== null || state.penaltyRoll !== null || state.penaltyPoints !== null) return false;
  if (state.outcome === "goal-1" || state.outcome === "goal-2") {
    if (state.phase !== "goal" && state.phase !== "finished") return false;
    return state.outcome === "goal-1"
      ? state.position === 25 && !state.extended
      : state.position === finalPosition && state.extended;
  }
  return state.phase === "ready" || state.phase === "event" || state.phase === "choice";
}

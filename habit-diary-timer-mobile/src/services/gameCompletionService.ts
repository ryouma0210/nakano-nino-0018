import type { SugorokuGame } from "@/features/sugoroku/game";
import { loadSugoroku, saveSugoroku, type SugorokuSave } from "@/features/sugoroku/storage";
import { loadOthello, saveOthelloResult, type OthelloHistoryEntry, type OthelloSave } from "@/features/othello/storage";
import { dailyGameRewardService } from "./dailyGameRewardService";
import { rhythmChallengeService, type RhythmHistoryEntry, type RhythmSave } from "./rhythmChallengeService";

// Serialize the history write and claim together. A durable marker bridges
// AsyncStorage and SQLite, allowing an interrupted claim to finish on reopening.
let pending: Promise<void> = Promise.resolve();
function queue<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work);
  pending = result.then(() => undefined, () => undefined);
  return result;
}

function reconcileSugoroku(saved: SugorokuSave) {
  for (const entry of [...saved.history].sort((a, b) => Date.parse(a.completedAt!) - Date.parse(b.completedAt!))) {
    if (entry.dailyRewardEligible && entry.completedAt && (entry.outcome === "goal-1" || entry.outcome === "goal-2")) {
      dailyGameRewardService.award("sugoroku", entry.id, entry.completedAt);
    }
  }
}

function reconcileOthello(saved: OthelloSave) {
  for (const entry of [...saved.history].sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt))) {
    if (entry.dailyRewardEligible && entry.result === "win") {
      dailyGameRewardService.award("othello", entry.id, entry.completedAt);
    }
  }
}

function reconcileRhythm(saved: RhythmSave) {
  for (const entry of [...saved.history].sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt))) {
    if (entry.dailyRewardEligible && entry.interruptions >= 10) {
      dailyGameRewardService.award("rhythm", entry.id, entry.completedAt);
    }
  }
}

export function loadRewardedRhythm(): Promise<RhythmSave> {
  return queue(async () => {
    const saved = await rhythmChallengeService.load();
    reconcileRhythm(saved);
    return saved;
  });
}

export function saveRewardedRhythmResult(entry: RhythmHistoryEntry): Promise<RhythmHistoryEntry[]> {
  // Only new, qualifying completions get a marker; callers cannot upgrade legacy history.
  const { id, startedAt, completedAt, interruptions, elapsedSeconds } = entry;
  const snapshot = { id, startedAt, completedAt, interruptions, elapsedSeconds };
  return queue(async () => {
    const previous = await rhythmChallengeService.load();
    // Resolve older claims before the history limit can remove them.
    reconcileRhythm(previous);
    const existing = previous.history.find((item) => item.id === snapshot.id);
    const eligible = existing ? existing.dailyRewardEligible : snapshot.interruptions >= 10;
    const next = { ...snapshot, ...(eligible ? { dailyRewardEligible: true as const } : {}) };
    const history = await rhythmChallengeService.saveResult(next);
    reconcileRhythm({ ...previous, history });
    return history;
  });
}

export function loadRewardedSugoroku(): Promise<SugorokuSave> {
  return queue(async () => {
    const saved = await loadSugoroku();
    reconcileSugoroku(saved);
    return saved;
  });
}

export function saveRewardedSugoroku(game: SugorokuGame): Promise<SugorokuSave> {
  const snapshot = JSON.parse(JSON.stringify(game)) as SugorokuGame;
  return queue(async () => {
    if (snapshot.phase !== "finished") return saveSugoroku(snapshot);
    const previous = await loadSugoroku();
    reconcileSugoroku(previous);
    const existing = previous.history.find((entry) => entry.id === snapshot.id);
    // Preserve the first finished snapshot and its reward marker on retries.
    const next = existing && snapshot.phase === "finished" ? existing
      : snapshot.phase === "finished" && (snapshot.outcome === "goal-1" || snapshot.outcome === "goal-2")
        ? { ...snapshot, dailyRewardEligible: true as const } : snapshot;
    const saved = await saveSugoroku(next);
    reconcileSugoroku(saved);
    return saved;
  });
}

export function loadRewardedOthello(): Promise<OthelloSave> {
  return queue(async () => {
    const saved = await loadOthello();
    reconcileOthello(saved);
    return saved;
  });
}

export function saveRewardedOthelloResult(entry: OthelloHistoryEntry): Promise<OthelloHistoryEntry[]> {
  const snapshot = { ...entry };
  return queue(async () => {
    const previous = await loadOthello();
    reconcileOthello(previous);
    const existing = previous.history.find((item) => item.id === snapshot.id);
    const next = existing
      ? { ...snapshot, ...(existing.dailyRewardEligible ? { dailyRewardEligible: true as const } : {}) }
      : snapshot.result === "win" && snapshot.reason === "completed"
        ? { ...snapshot, dailyRewardEligible: true as const } : snapshot;
    const history = await saveOthelloResult(next);
    reconcileOthello({ ...previous, history });
    return history;
  });
}

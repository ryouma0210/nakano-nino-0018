import { describe, expect, it } from "vitest";
import { autoResumeRhythmSession, createRhythmSession, finishRhythmSession, pauseRhythmSession, randomRhythm, resumeRhythmSession, rhythmElapsedMs, rhythmPauseSecondsRemaining, suspendRhythmSession, RHYTHM_TEMPOS } from "./model";

describe("rhythm session state", () => {
  it("counts an explicit interruption once and excludes the paused interval", () => {
    const initial = createRhythmSession("one", 1000);
    const paused = pauseRhythmSession(initial, 3500);
    expect(initial.status).toBe("running");
    expect(paused).toMatchObject({ status: "paused", interruptions: 1, elapsedMs: 2500 });
    expect(pauseRhythmSession(paused, 8000)).toBe(paused);
    expect(rhythmElapsedMs(paused, 30000)).toBe(2500);
    const resumed = resumeRhythmSession(paused, 10000);
    expect(rhythmElapsedMs(resumed, 12500)).toBe(5000);
    expect(pauseRhythmSession(resumed, 12500).interruptions).toBe(2);
  });

  it("suspends on navigation or background without adding an interruption or automatically resuming", () => {
    const suspended = pauseRhythmSession(createRhythmSession("one", 0), 1500, false);
    expect(suspended).toMatchObject({ status: "paused", interruptions: 0, runningSince: null });
    expect(rhythmElapsedMs(suspended, 100000)).toBe(1500);
    expect(pauseRhythmSession(suspended, 100000, true).interruptions).toBe(0);
  });

  it("automatically resumes only after 30 seconds without counting paused time", () => {
    const paused = pauseRhythmSession(createRhythmSession("one", 1000), 2500);
    expect(paused.autoResumeAt).toBe(32500);
    expect(rhythmPauseSecondsRemaining(paused, 2500)).toBe(30);
    expect(rhythmPauseSecondsRemaining(paused, 32499)).toBe(1);
    expect(autoResumeRhythmSession(paused, 32499)).toBe(paused);
    expect(pauseRhythmSession(paused, 3000)).toBe(paused);
    const resumed = autoResumeRhythmSession(paused, 32500);
    expect(resumed).toMatchObject({ status: "running", interruptions: 1, elapsedMs: 1500, runningSince: 32500, autoResumeAt: null });
    expect(rhythmElapsedMs(resumed, 34000)).toBe(3000);
    expect(rhythmPauseSecondsRemaining(resumed, 34000)).toBeNull();
    expect(autoResumeRhythmSession(resumed, 100000)).toBe(resumed);
  });

  it("allows an early manual resume and makes the old automatic deadline inert", () => {
    const paused = pauseRhythmSession(createRhythmSession("one", 0), 2000);
    expect(paused.autoResumeAt).toBe(32000);
    const resumed = resumeRhythmSession(paused, 7000);
    expect(resumed).toMatchObject({ status: "running", interruptions: 1, elapsedMs: 2000, runningSince: 7000, autoResumeAt: null });
    expect(rhythmPauseSecondsRemaining(resumed, 7000)).toBeNull();
    expect(resumeRhythmSession(resumed, 7100)).toBe(resumed);
    expect(autoResumeRhythmSession(resumed, 32000)).toBe(resumed);
    expect(autoResumeRhythmSession(resumed, 33000)).toBe(resumed);
    expect(rhythmElapsedMs(resumed, 32000)).toBe(27000);
    expect(finishRhythmSession(resumed, 35000)).toMatchObject({ interruptions: 1, elapsedMs: 30000, autoResumeAt: null });
  });

  it("uses the new pause deadline after an early manual resume and another interruption", () => {
    const firstPause = pauseRhythmSession(createRhythmSession("one", 0), 2000);
    const resumed = resumeRhythmSession(firstPause, 7000);
    const secondPause = pauseRhythmSession(resumed, 8000);
    expect(secondPause).toMatchObject({ status: "paused", interruptions: 2, elapsedMs: 3000, autoResumeAt: 38000 });
    expect(autoResumeRhythmSession(secondPause, firstPause.autoResumeAt!)).toBe(secondPause);
    expect(rhythmPauseSecondsRemaining(secondPause, 32000)).toBe(6);
    expect(autoResumeRhythmSession(secondPause, 37999)).toBe(secondPause);
    const autoResumed = autoResumeRhythmSession(secondPause, 38000);
    expect(autoResumed).toMatchObject({ status: "running", interruptions: 2, elapsedMs: 3000, runningSince: 38000, autoResumeAt: null });
    expect(rhythmElapsedMs(autoResumed, 39000)).toBe(4000);
  });

  it("does not backdate a delayed resume or restart a finished pause", () => {
    const paused = pauseRhythmSession(createRhythmSession("one", 0), 1000);
    const resumed = autoResumeRhythmSession(paused, 60000);
    expect(resumed.runningSince).toBe(60000);
    expect(rhythmElapsedMs(resumed, 61000)).toBe(2000);
    const finished = finishRhythmSession(paused, 2000);
    expect(finished.autoResumeAt).toBeNull();
    expect(autoResumeRhythmSession(finished, 100000)).toBe(finished);
  });

  it("cancels automatic resume for background, settings, or navigation suspension", () => {
    const paused = pauseRhythmSession(createRhythmSession("one", 0), 1000);
    const suspended = suspendRhythmSession(paused, 1500);
    expect(suspended).toMatchObject({ status: "paused", interruptions: 1, elapsedMs: 1000, autoResumeAt: null });
    expect(autoResumeRhythmSession(suspended, 100000)).toBe(suspended);
    expect(suspendRhythmSession(suspended, 110000)).toBe(suspended);
    const resumed = resumeRhythmSession(suspended, 120000);
    expect(rhythmElapsedMs(resumed, 121000)).toBe(2000);
    expect(pauseRhythmSession(resumed, 121000)).toMatchObject({ interruptions: 2, autoResumeAt: 151000 });
    expect(suspendRhythmSession(createRhythmSession("two", 0), 1000)).toMatchObject({ interruptions: 0, autoResumeAt: null });
  });

  it("finishes running or paused sessions and prevents later resume, count, or elapsed changes", () => {
    const finished = finishRhythmSession(createRhythmSession("one", 1000), 4500);
    expect(finished).toMatchObject({ status: "finished", elapsedMs: 3500, completedAt: 4500, runningSince: null });
    expect(finishRhythmSession(finished, 100000)).toBe(finished);
    expect(resumeRhythmSession(finished, 100000)).toBe(finished);
    expect(pauseRhythmSession(finished, 100000)).toBe(finished);
    expect(rhythmElapsedMs(finished, 100000)).toBe(3500);
    expect(finishRhythmSession(pauseRhythmSession(createRhythmSession("two", 0), 1000), 3000))
      .toMatchObject({ interruptions: 1, elapsedMs: 1000, completedAt: 3000 });
  });

  it("does not restart a running interval on duplicate resume or accumulate negative elapsed time", () => {
    const initial = createRhythmSession("one", 1000);
    expect(resumeRhythmSession(initial, 2000)).toBe(initial);
    expect(rhythmElapsedMs(initial, 500)).toBe(0);
    const paused = pauseRhythmSession(initial, 3500);
    const finished = finishRhythmSession(paused, 2000);
    expect(finished.completedAt).toBe(3500);
  });

  it("chooses bounded rhythms without repeating the previous tempo", () => {
    for (const previous of RHYTHM_TEMPOS) {
      for (const sample of [0, 0.5, 0.999999, 1, -1, Number.NaN]) {
        const next = randomRhythm(previous, () => sample);
        expect(RHYTHM_TEMPOS).toContain(next.bpm);
        expect(next.bpm).not.toBe(previous);
        expect(next.durationMs).toBeGreaterThanOrEqual(4000);
        expect(next.durationMs).toBeLessThanOrEqual(8000);
      }
    }
    const samples = [0, 0.5];
    expect(randomRhythm(undefined, () => samples.shift()!)).toEqual({ bpm: 48, durationMs: 6000 });
  });
});

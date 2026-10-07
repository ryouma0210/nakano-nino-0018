import { describe, expect, it } from "vitest";
import { getRoomAudioTracks } from "../../audio/roomAudio";
import { advanceCountdown, createCountdown, startCountdown, type CountdownState } from "../sugoroku/countdown";
import { getEnduranceAudioScene, getEnduranceTimerMode } from "./audio";
import { advanceEndurance, createEnduranceGame, failEnduranceSlide, type EndurancePreset } from "./game";
import { createEnduranceSession, parseEnduranceCurrent } from "./storage";

const timerPresets: EndurancePreset[] = ["game-1", "game-2", "game-3", "game-4", "game-5", "custom"];
const statuses: CountdownState["status"][] = ["idle", "running", "paused", "complete"];
const settings = { soundEnabled: true, soundVolume: 0.5, backgroundMusicEnabled: true, musicVolume: 0.7 };

describe("endurance timer visibility and room audio", () => {
  it.each(timerPresets)("shows only the applicable timer for %s and gates both voices by that timer", (preset) => {
    for (const recovering of [false, true]) {
      const game = { preset, recovering };
      expect(getEnduranceTimerMode(game)).toBe(recovering ? "recovery" : "slide");
      for (const slideStatus of statuses) {
        for (const recoveryStatus of statuses) {
          const status = recovering ? recoveryStatus : slideStatus;
          const scene = getEnduranceAudioScene(game, true, slideStatus, recoveryStatus);
          expect(scene).toBe(status === "running" ? recovering ? "endurance-recovery" : "endurance" : null);
          expect(getRoomAudioTracks(scene, settings, true).map((track) => track.name)).toEqual(
            status === "running" ? ["earLick", recovering ? "ikunaSine" : "bokkisiro"] : [],
          );
          expect(getEnduranceAudioScene(game, false, slideStatus, recoveryStatus)).toBeNull();
        }
      }
    }
  });

  it("has no countdown controls or room voice scene for game 6 or an unstarted game", () => {
    for (const game of [null, { preset: "game-6" as const, recovering: false }, { preset: "game-6" as const, recovering: true }]) {
      expect(getEnduranceTimerMode(game)).toBeNull();
      expect(getEnduranceAudioScene(game, true, "running", "running")).toBeNull();
    }
  });

  it("stops the one-minute voices immediately on failure and waits for explicit recovery start", () => {
    const game = createEnduranceGame("game-1", 4);
    const slide = startCountdown(60_000, 0);
    const failed = failEnduranceSlide(game);
    const recovery = createCountdown(180_000);
    expect(getEnduranceAudioScene(game, true, slide.status, recovery.status)).toBe("endurance");
    expect(getEnduranceAudioScene(failed, true, slide.status, recovery.status)).toBeNull();
    const running = startCountdown(180_000, 1000);
    expect(getEnduranceAudioScene(failed, true, "paused", running.status)).toBe("endurance-recovery");
    const complete = advanceCountdown(running, 181_000);
    expect(getEnduranceAudioScene(failed, true, "paused", complete.status)).toBeNull();
    const next = advanceEndurance(failed, false, complete.status === "complete");
    expect(next).toMatchObject({ index: 1, recovering: false });
    expect(getEnduranceTimerMode(next)).toBe("slide");
    expect(getEnduranceAudioScene(next, true, "idle", "idle")).toBeNull();
  });

  it.each([false, true])("keeps saved timer data compatible and silent after restore (recovering=%s)", (recovering) => {
    const game = createEnduranceGame("game-1", 4);
    const session = createEnduranceSession({
      game: recovering ? failEnduranceSlide(game) : game,
      mediaIds: ["game-1-1", "game-1-2", "game-1-3", "game-1-4"],
      slideTimer: createCountdown(60_000), extraTimer: startCountdown(180_000, 0),
      videoProgress: { positionMs: 0, durationMs: null }, videoComplete: false,
    }, 10_000);
    const restored = parseEnduranceCurrent(JSON.stringify(session))!;
    expect(restored).toEqual(session);
    expect(restored.extraTimer).toMatchObject({ status: "paused", remainingMs: 170_000, deadline: null });
    expect(getEnduranceTimerMode(restored.game)).toBe(recovering ? "recovery" : "slide");
    expect(getEnduranceAudioScene(restored.game, true, restored.slideTimer.status, restored.extraTimer.status)).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createVoiceMediaSession } from "./voiceMediaSession";

function setup() {
  const actions = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
  const session = {
    metadata: null as MediaMetadata | null,
    playbackState: "none" as MediaSessionPlaybackState,
    setActionHandler: vi.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => { actions.set(action, handler); }),
    setPositionState: vi.fn((_state?: MediaPositionState) => {}),
  };
  vi.stubGlobal("navigator", { mediaSession: session });
  vi.stubGlobal("MediaMetadata", class {
    title: string;
    artist: string;
    constructor(data: MediaMetadataInit) {
      this.title = data.title ?? "";
      this.artist = data.artist ?? "";
    }
  });
  const callbacks = { play: vi.fn(), pause: vi.fn(), stop: vi.fn(), next: vi.fn(), previous: vi.fn() };
  return { session, actions, callbacks, browser: createVoiceMediaSession(callbacks) };
}

afterEach(() => vi.unstubAllGlobals());

describe("voice library browser media controls", () => {
  it("publishes voice controls and clears position and seek actions inherited from manual loops", () => {
    const { browser, session, actions, callbacks } = setup();
    browser.activate("Selected voice");

    expect(session.metadata?.title).toBe("Selected voice");
    expect(session.metadata?.artist).toBe("ボイス格納");
    expect(session.playbackState).toBe("playing");
    expect(session.setPositionState).toHaveBeenCalledExactlyOnceWith();
    expect([...actions].filter(([, action]) => !!action).map(([action]) => action)).toEqual([
      "play", "pause", "stop", "nexttrack", "previoustrack",
    ]);
    for (const action of ["seekto", "seekforward", "seekbackward"] as const) expect(actions.get(action)).toBeNull();
    actions.get("play")!({ action: "play" });
    actions.get("pause")!({ action: "pause" });
    actions.get("stop")!({ action: "stop" });
    actions.get("nexttrack")!({ action: "nexttrack" });
    actions.get("previoustrack")!({ action: "previoustrack" });
    for (const callback of Object.values(callbacks)) expect(callback).toHaveBeenCalledOnce();
  });

  it("updates the title and paused state without replacing the handlers or resetting position", () => {
    const { browser, session, actions, callbacks } = setup();
    browser.activate("Old title");
    const pause = actions.get("pause")!;
    session.setActionHandler.mockClear();
    session.setPositionState.mockClear();

    browser.updateTitle("Renamed voice");
    browser.updatePlaying(false);

    expect(session.metadata?.title).toBe("Renamed voice");
    expect(session.playbackState).toBe("paused");
    expect(session.setActionHandler).not.toHaveBeenCalled();
    expect(session.setPositionState).not.toHaveBeenCalled();
    pause({ action: "pause" });
    expect(callbacks.pause).toHaveBeenCalledOnce();
    browser.updatePlaying(true);
    expect(session.playbackState).toBe("playing");
  });

  it("cleans up its controls and makes retained browser handlers inert after stopping", () => {
    const { browser, session, actions, callbacks } = setup();
    browser.activate("Voice");
    const previousActions = [...actions].filter(([, handler]) => !!handler);

    browser.deactivate();

    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe("none");
    expect([...actions.values()].every((handler) => handler === null)).toBe(true);
    for (const [action, handler] of previousActions) handler!({ action });
    for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
    browser.updateTitle("Stale title");
    browser.updatePlaying(true);
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe("none");
  });

  it("does not change or control a media session that took ownership later", () => {
    const { browser, session, actions, callbacks } = setup();
    browser.activate("Voice");
    const stalePause = actions.get("pause")!;
    const staleNext = actions.get("nexttrack")!;
    const otherMetadata = new MediaMetadata({ title: "Video", artist: "Other" });
    session.metadata = otherMetadata;
    const otherPause = vi.fn();
    session.setActionHandler("pause", otherPause);
    session.setActionHandler.mockClear();
    session.setPositionState.mockClear();

    browser.updateTitle("Stale voice");
    browser.updatePlaying(false);
    browser.deactivate();
    stalePause({ action: "pause" });
    staleNext({ action: "nexttrack" });

    expect(session.metadata).toBe(otherMetadata);
    expect(session.playbackState).toBe("playing");
    expect(actions.get("pause")).toBe(otherPause);
    expect(session.setActionHandler).not.toHaveBeenCalled();
    expect(session.setPositionState).not.toHaveBeenCalled();
    expect(callbacks.pause).not.toHaveBeenCalled();
    expect(callbacks.next).not.toHaveBeenCalled();
  });

  it("tolerates browsers that reject optional action or position APIs", () => {
    const { browser, session } = setup();
    session.setActionHandler.mockImplementation(() => { throw new Error("Unsupported action"); });
    session.setPositionState.mockImplementation(() => { throw new Error("Unsupported position"); });
    expect(() => browser.activate("Voice")).not.toThrow();
    expect(session.metadata?.title).toBe("Voice");
    expect(() => browser.deactivate()).not.toThrow();
    expect(session.metadata).toBeNull();
  });

  it("does nothing when a browser media session is unavailable", () => {
    vi.stubGlobal("navigator", undefined);
    const callbacks = { play: vi.fn(), pause: vi.fn(), stop: vi.fn(), next: vi.fn(), previous: vi.fn() };
    const browser = createVoiceMediaSession(callbacks);
    expect(() => {
      browser.activate("Voice");
      browser.updateTitle("New title");
      browser.updatePlaying(false);
      browser.deactivate();
    }).not.toThrow();
  });
});

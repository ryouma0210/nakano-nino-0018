import { describe, expect, it, vi } from "vitest";
import { createBrowserLoopMediaSession, type LoopMediaMetadata } from "./loopMediaSession";

const makeMetadata = (metadata: LoopMediaMetadata) => ({ ...metadata, album: "", artwork: [] }) as MediaMetadata;
function setup() {
  const actions = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
  const session = {
    metadata: null as MediaMetadata | null,
    playbackState: "none" as MediaSessionPlaybackState,
    setActionHandler: vi.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => { actions.set(action, handler); }),
    setPositionState: vi.fn((_state?: MediaPositionState) => {}),
  };
  return { session, actions, adapter: createBrowserLoopMediaSession(session, makeMetadata) };
}

describe("manual loop browser metadata", () => {
  it("publishes the mix as unbounded live media with only whole-mix stop actions", () => {
    const { session, actions, adapter } = setup();
    const stop = vi.fn();
    const remove = adapter.activate({ title: "First / Second", artist: "" }, stop);
    expect(session.metadata?.title).toBe("First / Second");
    expect(session.playbackState).toBe("playing");
    expect(session.setPositionState).toHaveBeenCalledExactlyOnceWith({ duration: Infinity, position: 0, playbackRate: 1 });
    expect([...actions].filter(([, handler]) => !!handler).map(([action]) => action)).toEqual(["pause", "stop"]);
    const pause = actions.get("pause")!;
    const stopAction = actions.get("stop")!;
    pause({ action: "pause" }); stopAction({ action: "stop" });
    expect(stop).toHaveBeenCalledTimes(2);
    remove();
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe("none");
    expect(session.setPositionState).toHaveBeenLastCalledWith();
    expect([...actions.values()].every((handler) => handler === null)).toBe(true);
    pause({ action: "pause" }); stopAction({ action: "stop" });
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it("updates names and language without resetting position or actions", () => {
    const { session, adapter } = setup();
    const remove = adapter.activate({ title: "First / Second", artist: "" }, vi.fn());
    const actionCalls = session.setActionHandler.mock.calls.length;
    adapter.updateMetadata({ title: "Second", artist: "" });
    adapter.updateMetadata({ title: "Deuxième", artist: "" });
    expect(session.metadata?.title).toBe("Deuxième");
    expect(session.setPositionState).toHaveBeenCalledTimes(1);
    expect(session.setActionHandler).toHaveBeenCalledTimes(actionCalls);
    remove();
    expect(session.metadata).toBeNull();
  });

  it("does not erase or stop another audio/video session that takes ownership later", () => {
    const { session, actions, adapter } = setup();
    const stop = vi.fn();
    const remove = adapter.activate({ title: "Loop", artist: "" }, stop);
    const stalePause = actions.get("pause")!;
    const other = makeMetadata({ title: "Video", artist: "Other" });
    session.metadata = other;
    const calls = session.setActionHandler.mock.calls.length;
    adapter.updateMetadata({ title: "Changed loop", artist: "" });
    remove();
    stalePause({ action: "pause" });
    expect(stop).not.toHaveBeenCalled();
    expect(session.metadata).toBe(other);
    expect(session.playbackState).toBe("playing");
    expect(session.setActionHandler).toHaveBeenCalledTimes(calls);
    expect(session.setPositionState).toHaveBeenCalledTimes(1);
  });

  it("keeps a new registration when an old cleanup or action runs", () => {
    const { session, actions, adapter } = setup();
    const firstStop = vi.fn();
    const oldRemove = adapter.activate({ title: "First", artist: "" }, firstStop);
    const oldPause = actions.get("pause")!;
    const nextStop = vi.fn();
    adapter.activate({ title: "Second", artist: "" }, nextStop);
    oldRemove(); oldPause({ action: "pause" });
    expect(session.metadata?.title).toBe("Second");
    expect(firstStop).not.toHaveBeenCalled();
    actions.get("stop")!({ action: "stop" });
    expect(nextStop).toHaveBeenCalledTimes(1);
  });

  it("tolerates missing support and clears position when live duration is unsupported", () => {
    expect(() => createBrowserLoopMediaSession(undefined, undefined).activate({ title: "Loop", artist: "" }, vi.fn())()).not.toThrow();
    const { session, adapter } = setup();
    session.setActionHandler.mockImplementation(() => { throw new Error("unsupported"); });
    session.setPositionState.mockImplementation((state) => { if (state) throw new Error("live unsupported"); });
    const remove = adapter.activate({ title: "Loop", artist: "" }, vi.fn());
    expect(session.setPositionState).toHaveBeenLastCalledWith();
    expect(() => remove()).not.toThrow();
  });
});

import { describe, expect, it, vi } from "vitest";
import { createLoopPlayback } from "./loopPlayback";
import { createLoopMediaControls, installLoopMediaSessionActions, type LoopMediaStatus } from "./loopMediaControls";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function flush() { for (let index = 0; index < 20; index++) await Promise.resolve(); }

function makePlayer() {
  const player = {
    loop: false, volume: 1, playing: false,
    currentStatus: { playing: false, isLoaded: true, isBuffering: false, timeControlStatus: "paused",
      playbackState: "ready", didJustFinish: false } as LoopMediaStatus,
    changed: () => {},
    pause: vi.fn(), play: vi.fn(), seekTo: vi.fn(async (_seconds: number) => {}),
    setActiveForLockScreen: vi.fn(), updateLockScreenMetadata: vi.fn(),
  };
  player.pause.mockImplementation(() => {
    player.playing = false;
    player.currentStatus = { ...player.currentStatus, playing: false, timeControlStatus: "paused" };
    player.changed();
  });
  player.play.mockImplementation(() => {
    player.playing = true;
    player.currentStatus = { ...player.currentStatus, playing: true, timeControlStatus: "playing" };
    player.changed();
  });
  return player;
}

function setup() {
  const players = [makePlayer(), makePlayer()];
  const playback = createLoopPlayback(players);
  const setMode = vi.fn(async (_mode: "mixWithOthers" | "doNotMix") => {});
  const onExternalStop = vi.fn(() => playback.stop());
  const onStartFailure = vi.fn((player: ReturnType<typeof makePlayer>) => playback.stop(player));
  const onError = vi.fn();
  const cleanupActions = vi.fn();
  const installStopActions = vi.fn((_stop: () => void) => cleanupActions);
  const controls = createLoopMediaControls(players, {
    setMode, onExternalStop, onStartFailure, onError, installStopActions,
    onUnexpectedPlayback: (player) => playback.stop(player),
  });
  players.forEach((player) => { player.changed = () => controls.checkPlayer(player); });
  controls.initialize();
  const start = (index: number) => controls.start(players[index], () => playback.play(players[index], 0.4));
  const stop = (index?: number) => { controls.stop(index === undefined ? undefined : players[index]); playback.stop(index === undefined ? undefined : players[index]); };
  return { players, playback, controls, setMode, onExternalStop, onStartFailure, onError, installStopActions, cleanupActions, start, stop };
}

describe("manual loop system media controls", () => {
  it("waits for exclusive audio mode before playback and registers one representative after it starts", async () => {
    const fixture = setup();
    const mode = deferred();
    fixture.setMode.mockImplementation((next) => next === "doNotMix" ? mode.promise : Promise.resolve());
    fixture.start(0);
    await flush();
    expect(fixture.players[0].play).not.toHaveBeenCalled();
    expect(fixture.players[0].setActiveForLockScreen).not.toHaveBeenCalled();
    mode.resolve();
    await flush();
    expect(fixture.players[0].playing).toBe(true);
    expect(fixture.players[0].setActiveForLockScreen).toHaveBeenCalledExactlyOnceWith(true,
      { title: "ループ音声", artist: "Nino Room" }, { showSeekForward: false, showSeekBackward: false, isLiveStream: true });
    fixture.start(1);
    await flush();
    expect(fixture.players[1].playing).toBe(true);
    expect(fixture.players[1].setActiveForLockScreen).not.toHaveBeenCalled();
    expect(fixture.players[0].setActiveForLockScreen).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending start when stopped before the mode change completes", async () => {
    const fixture = setup();
    const mode = deferred();
    fixture.setMode.mockImplementation((next) => next === "doNotMix" ? mode.promise : Promise.resolve());
    fixture.start(0);
    await flush();
    fixture.stop();
    mode.resolve();
    await flush();
    expect(fixture.players[0].play).not.toHaveBeenCalled();
    expect(fixture.controls.hasRequests()).toBe(false);
    expect(fixture.setMode).toHaveBeenLastCalledWith("mixWithOthers");
  });

  it("serializes rapid stop/restart mode changes and only starts the newest request", async () => {
    const fixture = setup();
    const mode = deferred();
    fixture.setMode.mockImplementation((next) => next === "doNotMix" ? mode.promise : Promise.resolve());
    fixture.start(0);
    fixture.start(0);
    await flush();
    fixture.stop();
    fixture.start(1);
    mode.resolve();
    await flush();
    expect(fixture.players[0].play).not.toHaveBeenCalled();
    expect(fixture.players[1].play).toHaveBeenCalledTimes(1);
    expect(fixture.setMode.mock.calls.map(([mode]) => mode)).toEqual(["mixWithOthers", "doNotMix", "mixWithOthers", "doNotMix"]);
    expect(fixture.onExternalStop).not.toHaveBeenCalled();
  });

  it("stops all loops for an OS pause and cancels another loop's pending seek", async () => {
    const fixture = setup();
    const seek = deferred();
    fixture.players[1].seekTo.mockReturnValueOnce(seek.promise);
    fixture.start(0);
    fixture.start(1);
    await flush();
    fixture.players[0].pause();
    seek.resolve();
    await flush();
    expect(fixture.onExternalStop).toHaveBeenCalledTimes(1);
    fixture.players.forEach((player) => expect(player.playing).toBe(false));
    expect(fixture.players[1].play).not.toHaveBeenCalled();
    expect(fixture.players[0].setActiveForLockScreen).toHaveBeenLastCalledWith(false);
    expect(fixture.cleanupActions).toHaveBeenCalledTimes(1);
    expect(fixture.controls.hasRequests()).toBe(false);
  });

  it("moves controls to another loop when the current representative is individually stopped", async () => {
    const fixture = setup();
    fixture.start(0); fixture.start(1);
    await flush();
    fixture.stop(0);
    expect(fixture.onExternalStop).not.toHaveBeenCalled();
    expect(fixture.players[1].playing).toBe(true);
    expect(fixture.players[0].setActiveForLockScreen).toHaveBeenLastCalledWith(false);
    expect(fixture.players[1].setActiveForLockScreen).toHaveBeenLastCalledWith(true, expect.anything(), expect.anything());
    const oldAction = fixture.installStopActions.mock.calls[0][0];
    oldAction();
    expect(fixture.players[1].playing).toBe(true);
    fixture.installStopActions.mock.calls[1][0]();
    expect(fixture.onExternalStop).toHaveBeenCalledTimes(1);
    expect(fixture.players[1].playing).toBe(false);
  });

  it("does not interpret a local replay or a single nonrepresentative stop as an OS pause", async () => {
    const fixture = setup();
    fixture.start(0); fixture.start(1);
    await flush();
    fixture.start(0);
    await flush();
    expect(fixture.players[0].playing).toBe(true);
    expect(fixture.players[1].playing).toBe(true);
    fixture.stop(1);
    expect(fixture.players[0].playing).toBe(true);
    expect(fixture.onExternalStop).not.toHaveBeenCalled();
  });

  it("ignores loading, buffering and loop-boundary status changes", async () => {
    const fixture = setup();
    fixture.start(0);
    await flush();
    const player = fixture.players[0];
    for (const changes of [
      { isBuffering: true, isLoaded: false, timeControlStatus: "paused" },
      { isBuffering: false, isLoaded: true, timeControlStatus: "waiting" },
      { isBuffering: false, isLoaded: true, timeControlStatus: "paused", didJustFinish: true },
    ]) {
      player.playing = false;
      player.currentStatus = { ...player.currentStatus, playing: false, ...changes };
      fixture.controls.checkPlayer(player);
    }
    expect(fixture.onExternalStop).not.toHaveBeenCalled();
  });

  it("detects pauses without a status event when checking current state", async () => {
    const fixture = setup();
    fixture.start(0); fixture.start(1);
    await flush();
    fixture.players[0].changed = () => {};
    fixture.players[0].pause();
    expect(fixture.onExternalStop).not.toHaveBeenCalled();
    fixture.controls.check();
    expect(fixture.onExternalStop).toHaveBeenCalledTimes(1);
    expect(fixture.players[1].playing).toBe(false);
  });

  it("stops an unsolicited SDK resume after all loop selections were cleared", async () => {
    const fixture = setup();
    fixture.start(0); fixture.start(1);
    await flush();
    fixture.stop();
    fixture.players[0].play();
    fixture.players[1].play();
    expect(fixture.players.every((player) => !player.playing)).toBe(true);
    expect(fixture.controls.hasRequests()).toBe(false);
    expect(fixture.onExternalStop).not.toHaveBeenCalled();
  });

  it("recovers from a failed mode change without leaving selected but silent loops", async () => {
    const fixture = setup();
    fixture.setMode.mockImplementation(async (next) => { if (next === "doNotMix") throw new Error("audio session failed"); });
    fixture.start(0);
    await flush();
    expect(fixture.onStartFailure).toHaveBeenCalledWith(fixture.players[0]);
    expect(fixture.controls.hasRequests()).toBe(false);
    expect(fixture.players[0].play).not.toHaveBeenCalled();
    fixture.setMode.mockResolvedValue(undefined);
    fixture.start(0);
    await flush();
    expect(fixture.players[0].playing).toBe(true);
  });

  it("does not clear a newer selection when an older mode request fails", async () => {
    const fixture = setup();
    const first = deferred();
    let calls = 0;
    fixture.setMode.mockImplementation((next) => next === "doNotMix" && calls++ === 0 ? first.promise : Promise.resolve());
    fixture.start(0);
    await flush();
    fixture.stop(0);
    fixture.start(0);
    first.reject(new Error("old request failed"));
    await flush();
    expect(fixture.onStartFailure).not.toHaveBeenCalled();
    expect(fixture.players[0].playing).toBe(true);
  });

  it("updates localized metadata without repeatedly activating the player", async () => {
    const fixture = setup();
    fixture.start(0);
    await flush();
    fixture.controls.updateTitle("Loop audio");
    expect(fixture.players[0].updateLockScreenMetadata).toHaveBeenCalledWith({ title: "Loop audio", artist: "Nino Room" });
    expect(fixture.players[0].setActiveForLockScreen).toHaveBeenCalledTimes(1);
  });

  it("removes only the failed loop when its asynchronous seek rejects", async () => {
    const fixture = setup();
    fixture.start(1);
    await flush();
    fixture.players[0].seekTo.mockRejectedValueOnce(new Error("seek failed"));
    fixture.start(0);
    await flush();
    expect(fixture.onStartFailure).toHaveBeenCalledExactlyOnceWith(fixture.players[0]);
    expect(fixture.players[0].play).not.toHaveBeenCalled();
    expect(fixture.players[1].playing).toBe(true);
    expect(fixture.setMode).toHaveBeenLastCalledWith("doNotMix");
    expect(fixture.onExternalStop).not.toHaveBeenCalled();
  });

  it("releases audio focus after an asynchronous play error in the only loop", async () => {
    const fixture = setup();
    fixture.players[0].play.mockImplementation(() => { throw new Error("play failed"); });
    fixture.start(0);
    await flush();
    expect(fixture.onStartFailure).toHaveBeenCalledExactlyOnceWith(fixture.players[0]);
    expect(fixture.controls.hasRequests()).toBe(false);
    expect(fixture.setMode).toHaveBeenLastCalledWith("mixWithOthers");
  });

  it("does not clear a replay when an earlier asynchronous seek eventually fails", async () => {
    const fixture = setup();
    const seek = deferred();
    fixture.players[0].seekTo.mockReturnValueOnce(seek.promise);
    fixture.start(0);
    await flush();
    fixture.start(0);
    await flush();
    seek.reject(new Error("old seek failed"));
    await flush();
    expect(fixture.players[0].playing).toBe(true);
    expect(fixture.onStartFailure).not.toHaveBeenCalled();
  });

  it("handles Web error event payloads even when currentStatus has no error", async () => {
    const fixture = setup();
    fixture.start(0); fixture.start(1);
    await flush();
    fixture.controls.checkPlayer(fixture.players[0], { error: "decode failed", isLoaded: false });
    expect(fixture.onStartFailure).toHaveBeenCalledExactlyOnceWith(fixture.players[0]);
    expect(fixture.players[0].playing).toBe(false);
    expect(fixture.players[1].playing).toBe(true);
    expect(fixture.players[1].setActiveForLockScreen).toHaveBeenLastCalledWith(true, expect.anything(), expect.anything());
    fixture.controls.checkPlayer(fixture.players[0], { error: null, isLoaded: true });
    fixture.start(0);
    await flush();
    expect(fixture.players[0].playing).toBe(true);
  });

  it("remembers an initial load error before a loop was selected", async () => {
    const fixture = setup();
    fixture.controls.checkPlayer(fixture.players[0], { error: "missing asset", isLoaded: false });
    fixture.start(0);
    await flush();
    expect(fixture.onStartFailure).toHaveBeenCalledExactlyOnceWith(fixture.players[0]);
    expect(fixture.players[0].play).not.toHaveBeenCalled();
    expect(fixture.controls.hasRequests()).toBe(false);
  });

  it("invalidates queued starts and removes controls when disposed", async () => {
    const fixture = setup();
    fixture.start(0);
    await flush();
    const mode = deferred();
    fixture.stop();
    await flush();
    fixture.setMode.mockImplementation((next) => next === "doNotMix" ? mode.promise : Promise.resolve());
    fixture.start(1);
    await flush();
    fixture.controls.dispose();
    fixture.playback.cancelPending();
    mode.resolve();
    await flush();
    expect(fixture.players[1].play).not.toHaveBeenCalled();
    expect(fixture.cleanupActions).toHaveBeenCalledTimes(1);
    expect(fixture.setMode).toHaveBeenLastCalledWith("mixWithOthers");
  });
});

describe("browser media actions", () => {
  it("routes pause and stop to the whole mix and invalidates handlers on cleanup", () => {
    const actions = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
    const session = { setActionHandler: vi.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => { actions.set(action, handler); }) };
    const stop = vi.fn();
    const remove = installLoopMediaSessionActions(session, stop);
    const pause = actions.get("pause")!;
    const stopAction = actions.get("stop")!;
    pause({ action: "pause" }); stopAction({ action: "stop" });
    expect(stop).toHaveBeenCalledTimes(2);
    expect(actions.get("play")).toBeNull();
    remove();
    pause({ action: "pause" }); stopAction({ action: "stop" });
    expect(stop).toHaveBeenCalledTimes(2);
    expect(actions.get("pause")).toBeNull();
    expect(actions.get("stop")).toBeNull();
  });

  it("tolerates missing browser support and unsupported individual actions", () => {
    expect(() => installLoopMediaSessionActions(undefined, vi.fn())()).not.toThrow();
    const session = { setActionHandler: vi.fn(() => { throw new Error("unsupported"); }) };
    expect(() => installLoopMediaSessionActions(session, vi.fn())()).not.toThrow();
  });
});

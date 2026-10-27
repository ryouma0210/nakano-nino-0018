import { describe, expect, it, vi } from "vitest";
import { createVoicePlayback, type VoicePlaybackState, type VoicePlaylist, type VoiceTrack } from "./voicePlayback";

const tracks: VoiceTrack[] = [
  { id: "first", name: "First voice", uri: "file:///first.mp3" },
  { id: "second", name: "Second voice", uri: "file:///second.m4a" },
  { id: "third", name: "Third voice", uri: "file:///third.wav" },
];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  const queue: { uri: string; name: string }[] = [];
  const player = {
    currentIndex: 0,
    currentTime: 0,
    playing: false,
    isBuffering: false,
    get currentStatus(): { playing: boolean; isBuffering: boolean } {
      return { playing: player.playing, isBuffering: player.isBuffering };
    },
    loop: "none" as VoicePlaylist["loop"],
    volume: 0,
    play: vi.fn(() => { player.playing = true; }),
    pause: vi.fn(() => { player.playing = false; }),
    clear: vi.fn(() => { queue.length = 0; player.currentIndex = 0; player.currentTime = 0; }),
    add: vi.fn((source: { uri: string; name: string }) => { queue.push(source); }),
    skipTo: vi.fn((index: number) => { player.currentIndex = index; player.currentTime = 0; }),
    seekTo: vi.fn(async (seconds: number) => { player.currentTime = seconds; }),
    updateTrackName: vi.fn((index: number, name: string) => { queue[index].name = name; }),
  };
  let state: VoicePlaybackState = { currentId: null, playing: false };
  const options = {
    prepare: vi.fn(async (_isCurrent: () => boolean) => {}),
    activate: vi.fn(),
    updateTitle: vi.fn(),
    deactivate: vi.fn(),
    release: vi.fn(),
    onChange: vi.fn((next: VoicePlaybackState) => { state = next; }),
    onError: vi.fn(),
  };
  return { player, queue, options, playback: createVoicePlayback(player, options), state: () => state };
}

describe("voice library playback", () => {
  it("loads the ordered native queue and switches repeat modes without restarting it", async () => {
    const { playback, player, queue } = setup();
    await playback.sync(tracks, "one");
    expect(queue).toEqual(tracks.map(({ uri, name }) => ({ uri, name })));
    expect(player.loop).toBe("single");
    playback.setVolume(0.35);
    await playback.play("second");
    expect(player.volume).toBe(0.35);
    expect(player.currentIndex).toBe(1);
    expect(player.playing).toBe(true);
    player.clear.mockClear();
    player.add.mockClear();
    player.pause.mockClear();
    player.seekTo.mockClear();
    player.play.mockClear();

    await playback.sync(tracks, "all");

    expect(player.loop).toBe("all");
    expect(player.clear).not.toHaveBeenCalled();
    expect(player.add).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it.each([true, false])("preserves the selected ID and position when reordering (playing=%s)", async (playing) => {
    const { playback, player, options, state } = setup();
    await playback.sync(tracks, "all");
    await playback.play("second");
    player.currentTime = 24.5;
    if (!playing) playback.pause();
    player.play.mockClear();
    options.prepare.mockClear();

    await playback.sync([tracks[1], tracks[2], tracks[0]], "all");

    expect(player.currentIndex).toBe(0);
    expect(player.currentTime).toBe(24.5);
    expect(player.playing).toBe(playing);
    expect(state()).toEqual({ currentId: "second", playing });
    expect(player.play).toHaveBeenCalledTimes(playing ? 1 : 0);
    expect(options.prepare).toHaveBeenCalledTimes(playing ? 1 : 0);
  });

  it("updates names and metadata without rebuilding or seeking the active queue", async () => {
    const { playback, player, queue, options, state } = setup();
    await playback.sync(tracks, "one");
    await playback.play("second");
    player.currentTime = 18;
    player.clear.mockClear();
    player.add.mockClear();
    player.pause.mockClear();
    player.seekTo.mockClear();
    options.activate.mockClear();

    await playback.sync(tracks.map((track) => track.id === "second" ? { ...track, name: "Renamed voice" } : track), "one");

    expect(player.updateTrackName).toHaveBeenCalledExactlyOnceWith(1, "Renamed voice");
    expect(queue[1].name).toBe("Renamed voice");
    expect(options.updateTitle).toHaveBeenLastCalledWith("Renamed voice");
    expect(options.activate).not.toHaveBeenCalled();
    expect(player.clear).not.toHaveBeenCalled();
    expect(player.add).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(player.currentTime).toBe(18);
    expect(state()).toEqual({ currentId: "second", playing: true });
  });

  it("supports older players without an optional queue rename method", async () => {
    const { player, options } = setup();
    const { updateTrackName: _updateTrackName, ...olderPlayer } = player;
    const playback = createVoicePlayback(olderPlayer, options);
    await playback.sync(tracks, "one");
    await playback.play("first");
    player.clear.mockClear();

    await playback.sync([{ ...tracks[0], name: "New title" }, ...tracks.slice(1)], "one");

    expect(player.clear).not.toHaveBeenCalled();
    expect(options.updateTitle).toHaveBeenLastCalledWith("New title");
    expect(options.onError).not.toHaveBeenCalled();
  });

  it("cancels a pending preparation before it can acquire focus or play", async () => {
    const { playback, player, options, state } = setup();
    await playback.sync(tracks, "one");
    const preparation = deferred();
    const acquireFocus = vi.fn();
    options.prepare.mockImplementation(async (isCurrent) => {
      await preparation.promise;
      if (isCurrent()) acquireFocus();
    });
    const start = playback.play("second");
    playback.stop();
    preparation.resolve();
    await start;

    expect(acquireFocus).not.toHaveBeenCalled();
    expect(player.skipTo).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    expect(options.activate).not.toHaveBeenCalled();
    expect(options.deactivate).toHaveBeenCalledOnce();
    expect(options.release).toHaveBeenCalledOnce();
    expect(state()).toEqual({ currentId: null, playing: false });
  });

  it.each(["stop", "dispose"] as const)("does not resume when a pending seek completes after %s", async (action) => {
    const { playback, player, options, state } = setup();
    await playback.sync(tracks, "one");
    const seek = deferred();
    player.seekTo.mockReturnValueOnce(seek.promise);
    const start = playback.play("second");
    await Promise.resolve();
    await Promise.resolve();
    expect(player.seekTo).toHaveBeenCalledWith(0);
    playback[action]();
    seek.resolve();
    await start;

    expect(player.play).not.toHaveBeenCalled();
    expect(options.activate).not.toHaveBeenCalled();
    expect(player.playing).toBe(false);
    expect(state()).toEqual({ currentId: null, playing: false });
  });

  it("serializes seeks so an older start cannot overwrite a newer selected track", async () => {
    const { playback, player, options, state } = setup();
    await playback.sync(tracks, "all");
    const seek = deferred();
    player.seekTo.mockReturnValueOnce(seek.promise);
    const firstStart = playback.play("second");
    await Promise.resolve();
    await Promise.resolve();
    const nextStart = playback.play("third");
    await Promise.resolve();
    expect(player.skipTo).toHaveBeenCalledExactlyOnceWith(1);

    seek.resolve();
    await Promise.all([firstStart, nextStart]);

    expect(player.currentIndex).toBe(2);
    expect(player.play).toHaveBeenCalledOnce();
    expect(options.activate).toHaveBeenCalledExactlyOnceWith("Third voice");
    expect(state()).toEqual({ currentId: "third", playing: true });
  });

  it.each([false, true])("stops and releases controls when deleting the selected voice (last=%s)", async (last) => {
    const { playback, player, options, state, queue } = setup();
    await playback.sync(last ? [tracks[1]] : tracks, "all");
    await playback.play("second");
    player.play.mockClear();

    await playback.sync(last ? [] : [tracks[0], tracks[2]], "all");

    expect(queue).toHaveLength(last ? 0 : 2);
    expect(player.playing).toBe(false);
    expect(player.play).not.toHaveBeenCalled();
    expect(options.deactivate).toHaveBeenCalledOnce();
    expect(options.release).toHaveBeenCalledOnce();
    expect(state()).toEqual({ currentId: null, playing: false });
  });

  it("keeps the selected voice playing when a preceding voice is deleted", async () => {
    const { playback, player, state } = setup();
    await playback.sync(tracks, "all");
    await playback.play("second");
    player.currentTime = 9;

    await playback.sync(tracks.slice(1), "all");

    expect(player.currentIndex).toBe(0);
    expect(player.currentTime).toBe(9);
    expect(state()).toEqual({ currentId: "second", playing: true });
  });

  it("reflects native advancement and external pause/resume without resetting position", async () => {
    const { playback, player, options, state } = setup();
    await playback.sync(tracks, "all");
    await playback.play("first");
    player.currentIndex = 1;
    player.currentTime = 6;
    player.seekTo.mockClear();
    playback.check({ playing: true, isBuffering: false });
    expect(state()).toEqual({ currentId: "second", playing: true });
    expect(options.updateTitle).toHaveBeenLastCalledWith("Second voice");
    playback.check({ playing: false, isBuffering: true });
    expect(state().playing).toBe(true);
    playback.check({ playing: false, isBuffering: false });
    expect(state()).toEqual({ currentId: "second", playing: false });
    await playback.play("second");
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(player.currentTime).toBe(6);
    playback.check({ playing: false, isBuffering: false });
    playback.check({ playing: true, isBuffering: false });
    expect(state()).toEqual({ currentId: "second", playing: true });
  });

  it("ignores transitional native status and rejects external restarts after stop", async () => {
    const { playback, player, state } = setup();
    await playback.sync(tracks, "all");
    const seek = deferred();
    player.seekTo.mockReturnValueOnce(seek.promise);
    const start = playback.play("second");
    playback.check({ playing: false, isBuffering: false });
    expect(state()).toEqual({ currentId: "second", playing: true });
    seek.resolve();
    await start;
    playback.stop();
    player.pause.mockClear();
    playback.check({ playing: true, isBuffering: false });
    expect(player.pause).toHaveBeenCalledOnce();
    expect(state()).toEqual({ currentId: null, playing: false });
  });

  it("releases playback and reports a native playback failure", async () => {
    const { playback, player, options, state } = setup();
    await playback.sync(tracks, "one");
    await playback.play("first");
    const error = new Error("Unreadable audio");
    playback.check({ playing: false, isBuffering: false, error });

    expect(player.playing).toBe(false);
    expect(options.onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(options.deactivate).toHaveBeenCalledOnce();
    expect(options.release).toHaveBeenCalledOnce();
    expect(state()).toEqual({ currentId: null, playing: false });
  });

  it.each([
    ["overlapping folder", [tracks[1], tracks[2]]],
    ["another folder", [tracks[0], tracks[2]]],
    ["empty folder", []],
  ] as const)("replaces the queue without autoplay when switching scopes (%s)", async (_label, selected) => {
    const { playback, player, queue, options, state } = setup();
    await playback.sync(tracks, "all");
    await playback.play("second");
    player.currentTime = 13;
    player.play.mockClear();
    options.activate.mockClear();

    // The library explicitly stops before syncing a newly selected folder.
    playback.stop();
    await playback.sync(selected, "all");

    expect(queue).toEqual(selected.map(({ uri, name }) => ({ uri, name })));
    expect(player.play).not.toHaveBeenCalled();
    expect(options.activate).not.toHaveBeenCalled();
    expect(player.playing).toBe(false);
    expect(state()).toEqual({ currentId: null, playing: false });
    if (selected.length === 0) {
      playback.step(1);
      playback.step(-1);
      expect(state()).toEqual({ currentId: null, playing: false });
      expect(player.play).not.toHaveBeenCalled();
    }
  });

  it("keeps next and previous within the selected folder and ignores voices outside it", async () => {
    const { playback, player, queue, options, state } = setup();
    const selected = [tracks[0], tracks[2]];
    await playback.sync(selected, "all");

    await playback.play("second");
    expect(player.play).not.toHaveBeenCalled();
    expect(options.prepare).not.toHaveBeenCalled();
    expect(state()).toEqual({ currentId: null, playing: false });

    await playback.play("third");
    playback.step(1);
    await vi.waitFor(() => expect(options.activate).toHaveBeenLastCalledWith("First voice"));
    expect(player.currentIndex).toBe(0);
    expect(state()).toEqual({ currentId: "first", playing: true });

    playback.step(-1);
    await vi.waitFor(() => expect(options.activate).toHaveBeenLastCalledWith("Third voice"));
    expect(player.currentIndex).toBe(1);
    expect(state()).toEqual({ currentId: "third", playing: true });
    expect(queue).toEqual(selected.map(({ uri, name }) => ({ uri, name })));
    expect(options.activate.mock.calls.flat()).not.toContain("Second voice");
  });

  it("cancels a voice preparing in the old folder before replacing its queue", async () => {
    const { playback, player, queue, options, state } = setup();
    await playback.sync([tracks[0], tracks[1]], "all");
    const preparation = deferred();
    const acquireFocus = vi.fn();
    options.prepare.mockImplementation(async (isCurrent) => {
      await preparation.promise;
      if (isCurrent()) acquireFocus();
    });
    const start = playback.play("second");

    playback.stop();
    await playback.sync([tracks[2]], "all");
    preparation.resolve();
    await start;

    expect(queue).toEqual([{ uri: tracks[2].uri, name: tracks[2].name }]);
    expect(acquireFocus).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    expect(options.activate).not.toHaveBeenCalled();
    expect(player.playing).toBe(false);
    expect(state()).toEqual({ currentId: null, playing: false });
  });

  it("preserves the actual native current voice when a folder queue changes before its status arrives", async () => {
    const { playback, player, queue, state } = setup();
    await playback.sync(tracks, "all");
    await playback.play("first");
    player.currentIndex = 1;
    player.currentTime = 8.5;
    expect(state().currentId).toBe("first");
    expect(playback.getState()).toEqual({ currentId: "second", playing: true });

    // The first voice moved out of this folder after native advancement.
    await playback.sync([tracks[1], tracks[2]], "all");

    expect(queue).toEqual(tracks.slice(1).map(({ uri, name }) => ({ uri, name })));
    expect(player.currentIndex).toBe(0);
    expect(player.currentTime).toBe(8.5);
    expect(player.playing).toBe(true);
    expect(state()).toEqual({ currentId: "second", playing: true });
  });

  it("stops when the actual native current voice leaves the folder before its status arrives", async () => {
    const { playback, player, options, state } = setup();
    await playback.sync(tracks, "all");
    await playback.play("first");
    player.currentIndex = 1;
    player.currentTime = 8.5;
    player.play.mockClear();

    // The old UI voice remains, but the voice actually playing moved elsewhere.
    await playback.sync([tracks[0], tracks[2]], "all");

    expect(player.play).not.toHaveBeenCalled();
    expect(player.playing).toBe(false);
    expect(options.deactivate).toHaveBeenCalledOnce();
    expect(options.release).toHaveBeenCalledOnce();
    expect(state()).toEqual({ currentId: null, playing: false });
  });

  it.each(["rename", "reorder"] as const)("preserves buffering playback intent during a folder voice %s", async (action) => {
    const { playback, player, state } = setup();
    await playback.sync([tracks[0], tracks[2]], "all");
    await playback.play("third");
    player.currentTime = 5;
    player.playing = false;
    player.isBuffering = true;
    playback.check({ playing: false, isBuffering: true });
    expect(state()).toEqual({ currentId: "third", playing: true });
    player.play.mockClear();

    await playback.sync(action === "rename"
      ? [tracks[0], { ...tracks[2], name: "Updated folder voice" }]
      : [tracks[2], tracks[0]], "all");

    expect(state()).toEqual({ currentId: "third", playing: true });
    expect(player.currentTime).toBe(5);
    expect(player.play).toHaveBeenCalledTimes(action === "reorder" ? 1 : 0);
  });

  it.each([
    [1, "first", "First voice", 0],
    [-1, "second", "Second voice", 1],
  ] as const)("steps from native advancement before the UI status arrives (direction=%s)", async (direction, id, name, index) => {
    const { playback, player, options, state } = setup();
    await playback.sync(tracks, "all");
    await playback.play("first");
    player.currentIndex = 2;
    expect(state().currentId).toBe("first");
    options.activate.mockClear();

    playback.step(direction);

    await vi.waitFor(() => expect(options.activate).toHaveBeenLastCalledWith(name));
    expect(player.currentIndex).toBe(index);
    expect(state()).toEqual({ currentId: id, playing: true });
  });
});

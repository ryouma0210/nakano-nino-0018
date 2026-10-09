import { describe, expect, it, vi } from "vitest";
import { createLoopPlayback } from "./loopPlayback";
import { loopAudioOptions } from "./loopAudioLabels";

function makePlayer() {
  const player = {
    loop: false,
    volume: 0,
    playing: false,
    pause: vi.fn(),
    play: vi.fn(),
    seekTo: vi.fn(async (_seconds: number) => {}),
  };
  player.pause.mockImplementation(() => { player.playing = false; });
  player.play.mockImplementation(() => { player.playing = true; });
  return player;
}

function deferredSeek() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("loop playback", () => {
  it("starts all loops concurrently using the sound volume", async () => {
    const players = loopAudioOptions.map(makePlayer);
    const playback = createLoopPlayback(players);
    players.forEach((player) => playback.play(player, 0.35));
    await Promise.resolve();
    for (const player of players) {
      expect(player.playing).toBe(true);
      expect(player.loop).toBe(true);
      expect(player.volume).toBe(0.35);
      expect(player.seekTo).toHaveBeenLastCalledWith(0);
      expect(player.play).toHaveBeenCalledOnce();
    }
  });

  it("starting another loop does not pause or reset an existing loop", async () => {
    const first = makePlayer();
    const second = makePlayer();
    const playback = createLoopPlayback([first, second]);
    playback.play(first, 1);
    await Promise.resolve();
    first.pause.mockClear();
    first.seekTo.mockClear();
    playback.play(second, 0.6);
    await Promise.resolve();
    expect(first.pause).not.toHaveBeenCalled();
    expect(first.seekTo).not.toHaveBeenCalled();
    expect(first.playing).toBe(true);
    expect(second.playing).toBe(true);
  });

  it("stops one loop without disturbing another playing loop or pending start", async () => {
    const first = makePlayer();
    const second = makePlayer();
    const third = makePlayer();
    const seek = deferredSeek();
    third.seekTo.mockReturnValueOnce(seek.promise);
    const playback = createLoopPlayback([first, second, third]);
    playback.play(first, 1);
    playback.play(second, 1);
    playback.play(third, 1);
    await Promise.resolve();
    second.pause.mockClear();
    second.seekTo.mockClear();
    third.pause.mockClear();
    third.seekTo.mockClear();
    playback.stop(first);
    seek.resolve();
    await seek.promise;
    expect(first.playing).toBe(false);
    expect(first.seekTo).toHaveBeenLastCalledWith(0);
    for (const player of [second, third]) {
      expect(player.playing).toBe(true);
      expect(player.pause).not.toHaveBeenCalled();
      expect(player.seekTo).not.toHaveBeenCalled();
    }
  });

  it("invalidates only the selected loop's pending start when stopping it", async () => {
    const first = makePlayer();
    const second = makePlayer();
    const firstSeek = deferredSeek();
    const secondSeek = deferredSeek();
    first.seekTo.mockReturnValueOnce(firstSeek.promise);
    second.seekTo.mockReturnValueOnce(secondSeek.promise);
    const playback = createLoopPlayback([first, second]);
    playback.play(first, 1);
    playback.play(second, 1);
    playback.stop(first);
    firstSeek.resolve();
    secondSeek.resolve();
    await Promise.all([firstSeek.promise, secondSeek.promise]);
    expect(first.play).not.toHaveBeenCalled();
    expect(second.playing).toBe(true);
  });

  it("stops all playing loops and prevents pending starts from restarting", async () => {
    const players = loopAudioOptions.map(makePlayer);
    const seeks = [deferredSeek(), deferredSeek()];
    seeks.forEach((seek, index) => players[index].seekTo.mockReturnValueOnce(seek.promise));
    const playback = createLoopPlayback(players);
    players.forEach((player) => playback.play(player, 1));
    await Promise.resolve();
    expect(players[2].playing).toBe(true);
    playback.stop();
    seeks.forEach((seek) => seek.resolve());
    await Promise.all(seeks.map((seek) => seek.promise));
    expect(players[0].play).not.toHaveBeenCalled();
    expect(players[1].play).not.toHaveBeenCalled();
    players.forEach((player) => {
      expect(player.playing).toBe(false);
      expect(player.seekTo).toHaveBeenLastCalledWith(0);
    });
  });

  it("replays only the newest request for one loop while preserving another pending start", async () => {
    const player = makePlayer();
    const other = makePlayer();
    const seek = deferredSeek();
    const otherSeek = deferredSeek();
    player.seekTo.mockReturnValueOnce(seek.promise);
    other.seekTo.mockReturnValueOnce(otherSeek.promise);
    const playback = createLoopPlayback([player, other]);
    playback.play(player, 1);
    playback.play(other, 1);
    playback.play(player, 0.4);
    await Promise.resolve();
    seek.resolve();
    otherSeek.resolve();
    await Promise.all([seek.promise, otherSeek.promise]);
    expect(player.play).toHaveBeenCalledOnce();
    expect(player.volume).toBe(0.4);
    expect(other.playing).toBe(true);
  });

  it("invalidates all pending starts when the provider unmounts", async () => {
    const players = [makePlayer(), makePlayer()];
    const seeks = players.map(() => deferredSeek());
    players.forEach((player, index) => player.seekTo.mockReturnValueOnce(seeks[index].promise));
    const playback = createLoopPlayback(players);
    players.forEach((player) => playback.play(player, 1));
    playback.cancelPending();
    seeks.forEach((seek) => seek.resolve());
    await Promise.all(seeks.map((seek) => seek.promise));
    players.forEach((player) => expect(player.play).not.toHaveBeenCalled());
  });

  it("still stops remaining loops when a released player rejects pause", async () => {
    const players = [makePlayer(), makePlayer()];
    const playback = createLoopPlayback(players);
    players.forEach((player) => playback.play(player, 1));
    await Promise.resolve();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    players[0].pause.mockImplementation(() => { throw new Error("already released"); });
    try {
      playback.stop();
      expect(players[1].playing).toBe(false);
      expect(error).toHaveBeenCalledOnce();
    } finally { error.mockRestore(); }
  });
});

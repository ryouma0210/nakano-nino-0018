import { describe, expect, it, vi } from "vitest";
import { createRoomLoopPlayback } from "./roomLoopPlayback";

function makePlayer() {
  const player = { loop: false, currentTime: 0, playing: false,
    pause: vi.fn(), play: vi.fn(), seekTo: vi.fn(async (_seconds: number) => {}) };
  player.pause.mockImplementation(() => { player.playing = false; });
  player.play.mockImplementation(() => { player.playing = true; });
  player.seekTo.mockImplementation(async (seconds: number) => { player.currentTime = seconds; });
  return player;
}

describe("position-preserving room playback", () => {
  it("resumes each selected voice at its paused position without seeking to the start", async () => {
    const players = [makePlayer(), makePlayer()];
    const controls = players.map(createRoomLoopPlayback);
    await Promise.all(controls.map((control) => control.setPaused(false)));
    players[0].currentTime = 4.75; players[1].currentTime = 8.25;
    await Promise.all(controls.map((control) => control.setPaused(true)));
    expect(players.map((player) => player.playing)).toEqual([false, false]);
    expect(players.map((player) => player.currentTime)).toEqual([4.75, 8.25]);
    await Promise.all(controls.map((control) => control.setPaused(false)));
    expect(players.map((player) => player.playing)).toEqual([true, true]);
    expect(players.map((player) => player.currentTime)).toEqual([4.75, 8.25]);
    for (const player of players) {
      expect(player.seekTo).toHaveBeenCalledExactlyOnceWith(0);
      expect(player.loop).toBe(true);
    }
  });

  it("does not start a newly selected track while the session is paused", async () => {
    const player = makePlayer(); const control = createRoomLoopPlayback(player);
    await control.setPaused(true);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.seekTo).not.toHaveBeenCalled();
    await control.setPaused(false);
    expect(player.playing).toBe(true);
    expect(player.seekTo).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("prevents an unresolved initial seek from starting audio after a pause", async () => {
    const player = makePlayer(); const control = createRoomLoopPlayback(player);
    let resolve!: () => void;
    player.seekTo.mockReturnValueOnce(new Promise<void>((done) => { resolve = done; }));
    const start = control.setPaused(false);
    await control.setPaused(true); resolve(); await start;
    expect(player.play).not.toHaveBeenCalled();
    await control.setPaused(false);
    expect(player.play).toHaveBeenCalledOnce();
  });

  it("invalidates pending starts without using a released player during cleanup", async () => {
    const player = makePlayer(); const control = createRoomLoopPlayback(player);
    let resolve!: () => void;
    player.seekTo.mockReturnValueOnce(new Promise<void>((done) => { resolve = done; }));
    const start = control.setPaused(false);
    const pauseCalls = player.pause.mock.calls.length;
    control.cancelPending(); resolve(); await start;
    expect(player.pause).toHaveBeenCalledTimes(pauseCalls);
    expect(player.play).not.toHaveBeenCalled();
  });

  it("leaves independent paused voices unchanged when another voice is added", async () => {
    const existing = makePlayer(); const added = makePlayer();
    const first = createRoomLoopPlayback(existing); const second = createRoomLoopPlayback(added);
    await first.setPaused(false); existing.currentTime = 12;
    await first.setPaused(true); await second.setPaused(true);
    expect(existing.currentTime).toBe(12);
    expect(added.play).not.toHaveBeenCalled();
    await first.setPaused(false); await second.setPaused(false);
    expect(existing.currentTime).toBe(12); expect(added.currentTime).toBe(0);
  });
});

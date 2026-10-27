import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserVoicePlaylist } from "./browserVoicePlaylist";

class FakeAudio extends EventTarget {
  src = "";
  currentSrc = "";
  preload = "";
  volume = 1;
  loop = false;
  currentTime = 0;
  duration = 90;
  readyState = 4;
  paused = true;
  ended = false;
  setAttribute = vi.fn();
  removeAttribute = vi.fn((name: string) => { if (name === "src") this.src = ""; });
  load = vi.fn(() => { this.currentSrc = this.src; this.currentTime = 0; this.ended = false; });
  pause = vi.fn(() => { this.paused = true; this.dispatchEvent(new Event("pause")); });
  play = vi.fn(() => {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  });
  finish() {
    this.currentTime = this.duration;
    this.paused = true;
    this.ended = true;
    this.dispatchEvent(new Event("ended"));
  }
}

function setup() {
  const elements: FakeAudio[] = [];
  const factory = vi.fn(() => {
    const audio = new FakeAudio();
    elements.push(audio);
    return audio as unknown as HTMLAudioElement;
  });
  const playlist = createBrowserVoicePlaylist(factory);
  return { playlist, elements, factory };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, failed) => { resolve = done; reject = failed; });
  return { promise, resolve, reject };
}

async function settle() { await Promise.resolve(); await Promise.resolve(); }

afterEach(() => { vi.useRealTimers(); });

describe("browser voice playlist", () => {
  it("advances and wraps ordered tracks on the same media element", async () => {
    const { playlist, elements, factory } = setup();
    expect(factory).not.toHaveBeenCalled();
    playlist.loop = "all";
    playlist.add({ uri: "blob:first", name: "First" });
    playlist.add({ uri: "blob:second", name: "Second" });
    playlist.add({ uri: "blob:third", name: "Third" });
    const audio = elements[0];
    playlist.play();
    await settle();
    expect(playlist.playing).toBe(true);
    expect(audio.loop).toBe(false);
    for (const [index, uri] of [[1, "blob:second"], [2, "blob:third"], [0, "blob:first"]] as const) {
      audio.finish();
      await settle();
      expect(playlist.currentIndex).toBe(index);
      expect(audio.src).toBe(uri);
      expect(playlist.playing).toBe(true);
    }
    expect(factory).toHaveBeenCalledOnce();
    expect(audio.play).toHaveBeenCalledTimes(4);
    playlist.destroy();
  });

  it("uses the media element's native repeat flag for single-track repeat and preserves pause position", async () => {
    const { playlist, elements } = setup();
    playlist.loop = "single";
    playlist.volume = 0.4;
    playlist.add({ uri: "blob:first", name: "First" });
    const audio = elements[0];
    expect(audio.loop).toBe(true);
    expect(audio.volume).toBe(0.4);
    playlist.play();
    await settle();
    audio.currentTime = 23;
    playlist.pause();
    expect(playlist.currentTime).toBe(23);
    expect(playlist.playing).toBe(false);
    playlist.play();
    await settle();
    expect(audio.currentTime).toBe(23);
    playlist.loop = "all";
    expect(audio.loop).toBe(false);
    playlist.destroy();
  });

  it("ignores a queued prior-track pause after the next track has started, while reporting a genuine pause", async () => {
    const { playlist, elements } = setup();
    playlist.loop = "all";
    playlist.add({ uri: "blob:first", name: "First" });
    playlist.add({ uri: "blob:second", name: "Second" });
    playlist.play();
    await settle();
    const audio = elements[0];
    const queued: (() => void)[] = [];
    audio.pause.mockImplementation(() => {
      audio.paused = true;
      queued.push(() => audio.dispatchEvent(new Event("pause")));
    });
    audio.finish();
    await settle();
    expect(playlist.currentIndex).toBe(1);
    expect(audio.paused).toBe(false);
    expect(playlist.currentStatus).toEqual({ playing: true, isBuffering: false });
    const listener = vi.fn();
    playlist.addListener("playlistStatusUpdate", listener);
    for (const dispatch of queued) dispatch();
    audio.currentTime = 2;
    audio.dispatchEvent(new Event("timeupdate"));
    expect(playlist.currentStatus).toEqual({ playing: true, isBuffering: false });
    expect(playlist.currentTime).toBe(2);
    expect(listener).not.toHaveBeenCalled();
    audio.paused = true;
    audio.dispatchEvent(new Event("pause"));
    expect(playlist.currentStatus).toEqual({ playing: false, isBuffering: false });
    playlist.destroy();
  });

  it("advances through a nonrepeating queue and stops after its final track", async () => {
    const { playlist, elements } = setup();
    playlist.add({ uri: "blob:first", name: "First" });
    playlist.add({ uri: "blob:second", name: "Second" });
    playlist.play();
    await settle();
    elements[0].finish();
    await settle();
    expect(playlist.currentIndex).toBe(1);
    elements[0].finish();
    expect(playlist.currentIndex).toBe(1);
    expect(playlist.currentStatus).toEqual({ playing: false, isBuffering: false });
    expect(elements[0].play).toHaveBeenCalledTimes(2);
    playlist.destroy();
  });

  it("publishes rejected play promises as explicit errors and allows retry", async () => {
    const { playlist, elements } = setup();
    const listener = vi.fn();
    playlist.addListener("playlistStatusUpdate", listener);
    playlist.add({ uri: "blob:first", name: "First" });
    elements[0].play.mockRejectedValueOnce(new DOMException("Autoplay blocked", "NotAllowedError"));
    playlist.play();
    await settle();
    expect(playlist.currentStatus).toMatchObject({ playing: false, isBuffering: false, error: expect.any(Error) });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ error: expect.any(Error) }));
    expect((playlist.currentStatus.error as Error).message).toContain("再生できませんでした");
    playlist.play();
    await settle();
    expect(playlist.currentStatus).toEqual({ playing: true, isBuffering: false });
    playlist.destroy();
  });

  it.each(["pause", "skip", "destroy"])("ignores an obsolete play rejection after %s", async (action) => {
    const { playlist, elements } = setup();
    playlist.add({ uri: "blob:first", name: "First" });
    playlist.add({ uri: "blob:second", name: "Second" });
    const pending = deferred();
    elements[0].play.mockReturnValueOnce(pending.promise);
    const listener = vi.fn();
    playlist.addListener("playlistStatusUpdate", listener);
    playlist.play();
    if (action === "pause") playlist.pause();
    else if (action === "skip") playlist.skipTo(1);
    else playlist.destroy();
    pending.reject(new DOMException("Old playback was interrupted", "AbortError"));
    await settle();
    expect(listener.mock.calls.some(([status]) => status.error)).toBe(false);
    playlist.destroy();
  });

  it("surfaces media decode failures and reports buffering separately from pause", async () => {
    const { playlist, elements } = setup();
    playlist.add({ uri: "blob:first", name: "First" });
    playlist.play();
    await settle();
    const audio = elements[0];
    audio.dispatchEvent(new Event("waiting"));
    expect(playlist.currentStatus).toEqual({ playing: true, isBuffering: true });
    audio.dispatchEvent(new Event("playing"));
    expect(playlist.currentStatus).toEqual({ playing: true, isBuffering: false });
    audio.dispatchEvent(new Event("error"));
    expect(playlist.currentStatus).toMatchObject({ playing: false, isBuffering: false, error: expect.any(Error) });
    expect(audio.paused).toBe(true);
    playlist.destroy();
  });

  it("does not advance on an ended event after explicit pause", async () => {
    const { playlist, elements } = setup();
    playlist.loop = "all";
    playlist.add({ uri: "blob:first", name: "First" });
    playlist.add({ uri: "blob:second", name: "Second" });
    playlist.play();
    await settle();
    playlist.pause();
    elements[0].finish();
    expect(playlist.currentIndex).toBe(0);
    expect(playlist.playing).toBe(false);
    playlist.destroy();
  });

  it("waits for metadata for a nonzero seek and clamps it to the audio duration", async () => {
    const { playlist, elements } = setup();
    playlist.add({ uri: "blob:first", name: "First" });
    const audio = elements[0];
    audio.readyState = 0;
    await playlist.seekTo(0);
    const seek = playlist.seekTo(140);
    expect(audio.currentTime).toBe(0);
    audio.readyState = 1;
    audio.dispatchEvent(new Event("loadedmetadata"));
    await seek;
    expect(audio.currentTime).toBe(90);
    await expect(playlist.seekTo(-1)).rejects.toThrow();
    playlist.destroy();
  });

  it("settles a canceled metadata seek so the next track cannot be blocked by the old file", async () => {
    const { playlist, elements } = setup();
    playlist.add({ uri: "blob:first", name: "First" });
    playlist.add({ uri: "blob:second", name: "Second" });
    elements[0].readyState = 0;
    const seek = playlist.seekTo(25);
    const rejection = expect(seek).rejects.toThrow("canceled");
    playlist.skipTo(1);
    await rejection;
    elements[0].readyState = 1;
    elements[0].dispatchEvent(new Event("loadedmetadata"));
    expect(elements[0].currentTime).toBe(0);
    await playlist.seekTo(12);
    expect(elements[0].currentTime).toBe(12);
    playlist.destroy();
  });

  it("rejects a metadata seek that never loads instead of blocking the controller indefinitely", async () => {
    vi.useFakeTimers();
    const { playlist, elements } = setup();
    playlist.add({ uri: "blob:first", name: "First" });
    elements[0].readyState = 0;
    const seek = playlist.seekTo(25);
    const rejection = expect(seek).rejects.toThrow("再生できませんでした");
    await vi.advanceTimersByTimeAsync(15000);
    await rejection;
    playlist.destroy();
  });

  it("clears sources and queue while reusing the media element for a replacement library", async () => {
    const { playlist, elements, factory } = setup();
    playlist.add({ uri: "blob:first", name: "First" });
    playlist.play();
    await settle();
    playlist.clear();
    expect(elements[0].src).toBe("");
    expect(playlist.currentIndex).toBe(-1);
    expect(playlist.currentTime).toBe(0);
    playlist.play();
    expect(elements[0].play).toHaveBeenCalledOnce();
    playlist.add({ uri: "blob:new", name: "New" });
    playlist.play();
    await settle();
    expect(elements[0].src).toBe("blob:new");
    expect(factory).toHaveBeenCalledOnce();
    playlist.destroy();
  });

  it("recreates a disposed element lazily after StrictMode cleanup without losing tracks, repeat or position", async () => {
    const { playlist, elements, factory } = setup();
    playlist.loop = "single";
    playlist.volume = 0.6;
    playlist.add({ uri: "blob:first", name: "First" });
    playlist.add({ uri: "blob:second", name: "Second" });
    playlist.skipTo(1);
    await playlist.seekTo(31);
    const oldListener = vi.fn();
    playlist.addListener("playlistStatusUpdate", oldListener);
    playlist.destroy();
    expect(elements[0].src).toBe("");
    expect(playlist.currentIndex).toBe(1);
    expect(playlist.currentTime).toBe(31);
    elements[0].dispatchEvent(new Event("error"));
    expect(oldListener).not.toHaveBeenCalled();
    const nextListener = vi.fn();
    const subscription = playlist.addListener("playlistStatusUpdate", nextListener);
    playlist.play();
    await settle();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(elements[1]).toMatchObject({ src: "blob:second", currentTime: 31, loop: true, volume: 0.6 });
    expect(playlist.playing).toBe(true);
    expect(nextListener).toHaveBeenCalled();
    subscription.remove();
    nextListener.mockClear();
    playlist.pause();
    expect(nextListener).not.toHaveBeenCalled();
    playlist.destroy();
  });
});

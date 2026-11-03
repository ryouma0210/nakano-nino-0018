import { describe, expect, it, vi } from "vitest";
import { createBrowserSessionAudio } from "./browserSessionAudio";

function setup() {
  let reject: (error: unknown) => void = () => {};
  const media = {
    src: "", preload: "", volume: 1, loop: false, currentTime: 0,
    play: vi.fn(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; })),
    pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(),
  };
  const errors = vi.fn();
  const player = createBrowserSessionAudio("blob:voice", errors, () => media as unknown as HTMLAudioElement);
  return { player, media, errors, reject: (error: unknown) => reject(error) };
}

describe("browser foreground audio", () => {
  it("handles the browser rejection caused by pausing a pending start", async () => {
    const { player, media, errors, reject } = setup();
    player.play(); player.pause(); reject(new DOMException("interrupted by pause", "AbortError"));
    await Promise.resolve();
    expect(media.pause).toHaveBeenCalledOnce();
    expect(errors).not.toHaveBeenCalled();
  });
  it("disposes the element and handles the canceled start without reviving it", async () => {
    const { player, media, errors, reject } = setup();
    player.play(); player.dispose(); reject(new DOMException("removed", "AbortError"));
    await Promise.resolve();
    player.play(); player.dispose();
    expect(media.play).toHaveBeenCalledOnce();
    expect(media.removeAttribute).toHaveBeenCalledWith("src");
    expect(media.load).toHaveBeenCalledOnce();
    expect(errors).not.toHaveBeenCalled();
  });
  it("reports an active playback abort instead of hiding it", async () => {
    const { player, errors, reject } = setup();
    const error = new DOMException("unexpected abort", "AbortError");
    player.play(); reject(error); await Promise.resolve();
    expect(errors).toHaveBeenCalledWith(error);
  });
  it("reports unsupported audio and permission errors, even after cancellation", async () => {
    for (const name of ["NotSupportedError", "NotAllowedError"]) {
      const { player, errors, reject } = setup();
      const error = new DOMException("playback failed", name);
      player.play(); player.pause(); reject(error); await Promise.resolve();
      expect(errors).toHaveBeenCalledWith(error);
    }
  });
  it("retains volume/loop settings and supports seeking", async () => {
    const { player, media } = setup();
    player.volume = 0.3; player.loop = true; await player.seekTo(4);
    expect(media).toMatchObject({ src: "blob:voice", preload: "auto", volume: 0.3, loop: true, currentTime: 4 });
    expect(player.volume).toBe(0.3);
    expect(player.loop).toBe(true);
  });
});

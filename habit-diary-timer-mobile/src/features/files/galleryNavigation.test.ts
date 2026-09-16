import { describe, expect, it } from "vitest";
import { adjacentGalleryIndex, createGallerySwipe } from "./galleryNavigation";

function start(video = false, startY = 120) {
  const swipe = createGallerySwipe();
  swipe.start({ touches: 1, startY, mediaHeight: 400, video });
  return swipe;
}

describe("file gallery navigation", () => {
  it("moves through the supplied visible order without wrapping at either end", () => {
    expect(adjacentGalleryIndex(1, 3, 1)).toBe(2);
    expect(adjacentGalleryIndex(1, 3, -1)).toBe(0);
    expect(adjacentGalleryIndex(2, 3, 1)).toBeNull();
    expect(adjacentGalleryIndex(0, 3, -1)).toBeNull();
    expect(adjacentGalleryIndex(-1, 3, 1)).toBeNull();
    expect(adjacentGalleryIndex(0, 0, 1)).toBeNull();
    expect(adjacentGalleryIndex(0, 1, 1)).toBeNull();
  });

  it.each([[-90, 1], [90, -1]] as const)("maps a horizontal drag of %i to direction %i once", (dx, direction) => {
    const swipe = start();
    expect(swipe.move({ dx, dy: 8, touches: 1 })).toBe(true);
    expect(swipe.release({ dx, dy: 8 })).toBe(direction);
    expect(swipe.release({ dx, dy: 8 })).toBeNull();
  });

  it("leaves taps, short drags and vertical gestures in the current file", () => {
    const tap = start();
    expect(tap.release({ dx: 0, dy: 0 })).toBeNull();
    const short = start();
    short.move({ dx: 20, dy: 0, touches: 1 });
    expect(short.release({ dx: 20, dy: 0 })).toBeNull();
    const vertical = start();
    expect(vertical.move({ dx: 5, dy: 30, touches: 1 })).toBe(false);
    expect(vertical.move({ dx: 100, dy: 30, touches: 1 })).toBe(false);
    expect(vertical.release({ dx: 100, dy: 30 })).toBeNull();
  });

  it("does not turn a seek-bar or video control drag into file navigation", () => {
    const controls = start(true, 350);
    expect(controls.move({ dx: -100, dy: 0, touches: 1 })).toBe(false);
    expect(controls.release({ dx: -100, dy: 0 })).toBeNull();
    const picture = start(false, 350);
    expect(picture.move({ dx: -100, dy: 0, touches: 1 })).toBe(true);
    expect(picture.release({ dx: -100, dy: 0 })).toBe(1);
  });

  it("cancels a swipe if a second finger is added, even if it is removed before release", () => {
    const swipe = start();
    swipe.move({ dx: -30, dy: 0, touches: 1 });
    expect(swipe.move({ dx: -50, dy: 0, touches: 2 })).toBe(false);
    expect(swipe.move({ dx: -100, dy: 0, touches: 1 })).toBe(false);
    expect(swipe.release({ dx: -100, dy: 0 })).toBeNull();
  });

  it("cannot navigate after responder cancellation or an unmeasured start", () => {
    const cancelled = start();
    cancelled.move({ dx: -90, dy: 0, touches: 1 });
    cancelled.cancel();
    expect(cancelled.release({ dx: -90, dy: 0 })).toBeNull();
    const unmeasured = start(false, Number.NaN);
    expect(unmeasured.move({ dx: -90, dy: 0, touches: 1 })).toBe(false);
    expect(unmeasured.release({ dx: -90, dy: 0 })).toBeNull();
  });

  it("rejects diagonal releases and allows a fresh gesture after cancellation", () => {
    const swipe = start();
    swipe.move({ dx: -30, dy: 0, touches: 1 });
    expect(swipe.release({ dx: -80, dy: 70 })).toBeNull();
    swipe.start({ touches: 1, startY: 100, mediaHeight: 400, video: true });
    swipe.move({ dx: -90, dy: 0, touches: 1 });
    expect(swipe.release({ dx: -90, dy: 0 })).toBe(1);
  });
});

export type GalleryDirection = -1 | 1;

export function adjacentGalleryIndex(index: number, length: number, direction: GalleryDirection) {
  if (!Number.isInteger(index) || !Number.isInteger(length) || index < 0 || index >= length) return null;
  const next = index + direction;
  return next >= 0 && next < length ? next : null;
}

type Movement = { dx: number; dy: number };

/** A gesture must stay horizontal and single-touch for its entire lifetime. */
export function createGallerySwipe() {
  let eligible = false;
  let claimed = false;
  const cancel = () => { eligible = false; claimed = false; };
  return {
    start({ touches, startY, mediaHeight, video }: {
      touches: number;
      startY: number;
      mediaHeight: number;
      video: boolean;
    }) {
      cancel();
      // Leave native video seek/volume/fullscreen controls to the video player.
      const bottomControls = video ? Math.max(96, mediaHeight * 0.25) : 0;
      eligible = touches === 1 && Number.isFinite(startY) && mediaHeight > 0
        && startY >= 0 && startY < mediaHeight - bottomControls;
    },
    move({ dx, dy, touches }: Movement & { touches: number }) {
      if (!eligible) return false;
      if (touches !== 1 || !Number.isFinite(dx) || !Number.isFinite(dy)
        || (Math.abs(dy) >= 16 && Math.abs(dy) >= Math.abs(dx))) {
        cancel();
        return false;
      }
      claimed ||= Math.abs(dx) >= 16 && Math.abs(dx) > Math.abs(dy) * 1.5;
      return claimed;
    },
    release({ dx, dy }: Movement): GalleryDirection | null {
      const accepted = eligible && claimed && Number.isFinite(dx) && Number.isFinite(dy)
        && Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5;
      cancel();
      return accepted ? (dx < 0 ? 1 : -1) : null;
    },
    cancel,
  };
}

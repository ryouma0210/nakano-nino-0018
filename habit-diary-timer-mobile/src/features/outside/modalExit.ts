type ModalExitOptions = {
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  canNavigate: () => boolean;
  navigate: () => void;
};

/** Separate a committed modal close from navigation, with cancellable frame callbacks. */
export function createModalExitController(options: ModalExitOptions) {
  let pending = false;
  let generation = 0;
  let frame: number | null = null;
  const isCurrent = (version: number) => pending && generation === version && options.canNavigate();

  return {
    isPending: () => pending,
    request() {
      if (pending || !options.canNavigate()) return false;
      pending = true;
      generation += 1;
      return true;
    },
    modalClosed() {
      if (!pending || frame !== null || !options.canNavigate()) return;
      const version = generation;
      // One frame lets the close commit reach native UI; the next separates the route update.
      frame = options.requestFrame(() => {
        if (!isCurrent(version)) return;
        frame = options.requestFrame(() => {
          if (!isCurrent(version)) return;
          frame = null;
          pending = false;
          generation += 1;
          // Mark consumed before navigate: its own beforeRemove event may cancel safely.
          options.navigate();
        });
      });
    },
    cancel() {
      pending = false;
      generation += 1;
      if (frame !== null) options.cancelFrame(frame);
      frame = null;
    },
  };
}

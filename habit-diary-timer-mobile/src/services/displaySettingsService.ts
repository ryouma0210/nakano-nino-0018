export type DisplayState = { zoom: number; fullScreen: boolean };

type DesktopDisplayBridge = {
  getWindowState: () => Promise<DisplayState>;
  setFullScreen: (enabled: boolean) => Promise<DisplayState>;
  setZoom: (zoom: number) => Promise<unknown>;
  onFullScreenChanged: (listener: (enabled: boolean) => void) => () => void;
  onZoomChanged: (listener: (zoom: number) => void) => () => void;
};

export type DisplayController = {
  native: boolean;
  read: () => Promise<DisplayState>;
  setFullScreen: (enabled: boolean) => Promise<unknown>;
  setZoom?: (zoom: number) => Promise<unknown>;
  subscribe: (listener: () => void) => () => void;
};

export function getDisplayController(): DisplayController | null {
  const desktop = (globalThis as typeof globalThis & { ninoDesktop?: DesktopDisplayBridge }).ninoDesktop;
  if (desktop && typeof desktop.getWindowState === "function" && typeof desktop.setFullScreen === "function") {
    return {
      native: true,
      read: () => desktop.getWindowState(),
      setFullScreen: (enabled) => desktop.setFullScreen(enabled),
      setZoom: (zoom) => desktop.setZoom(Math.max(0.75, Math.min(2, zoom))),
      subscribe: (listener) => {
        const removeFullScreen = desktop.onFullScreenChanged(listener);
        const removeZoom = desktop.onZoomChanged(listener);
        return () => { removeFullScreen(); removeZoom(); };
      },
    };
  }
  if (typeof document === "undefined" || !document.fullscreenEnabled) return null;
  return {
    native: false,
    read: async () => ({ zoom: 1, fullScreen: Boolean(document.fullscreenElement) }),
    setFullScreen: (enabled) => {
      if (enabled === Boolean(document.fullscreenElement)) return Promise.resolve();
      // Invoke the browser API directly in the click handler to retain user activation.
      return enabled ? document.documentElement.requestFullscreen() : document.exitFullscreen();
    },
    subscribe: (listener) => {
      document.addEventListener("fullscreenchange", listener);
      return () => document.removeEventListener("fullscreenchange", listener);
    },
  };
}

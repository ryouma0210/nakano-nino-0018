import { afterEach, describe, expect, it, vi } from "vitest";
import { getDisplayController } from "./displaySettingsService";

afterEach(() => { vi.unstubAllGlobals(); });

describe("display settings controller", () => {
  it("does not offer unsupported display controls during server rendering", () => {
    vi.stubGlobal("ninoDesktop", undefined);
    vi.stubGlobal("document", undefined);
    expect(getDisplayController()).toBeNull();
  });

  it("uses the native window API and removes both event subscriptions", async () => {
    const removeFullScreen = vi.fn();
    const removeZoom = vi.fn();
    const bridge = {
      getWindowState: vi.fn(async () => ({ fullScreen: true, zoom: 1.25 })),
      setFullScreen: vi.fn(async (fullScreen: boolean) => ({ fullScreen, zoom: 1.25 })),
      setZoom: vi.fn(async () => undefined),
      onFullScreenChanged: vi.fn(() => removeFullScreen),
      onZoomChanged: vi.fn(() => removeZoom),
    };
    vi.stubGlobal("ninoDesktop", bridge);
    const controller = getDisplayController()!;
    expect(controller.native).toBe(true);
    expect(await controller.read()).toEqual({ fullScreen: true, zoom: 1.25 });
    await controller.setFullScreen(false);
    expect(bridge.setFullScreen).toHaveBeenCalledWith(false);
    await controller.setZoom!(0.1);
    await controller.setZoom!(3);
    expect(bridge.setZoom.mock.calls).toEqual([[0.75], [2]]);
    const listener = vi.fn();
    controller.subscribe(listener)();
    expect(bridge.onFullScreenChanged).toHaveBeenCalledWith(listener);
    expect(bridge.onZoomChanged).toHaveBeenCalledWith(listener);
    expect(removeFullScreen).toHaveBeenCalledOnce();
    expect(removeZoom).toHaveBeenCalledOnce();
  });

  it("requests browser full screen directly during the user gesture and follows Esc changes", async () => {
    const requestFullscreen = vi.fn(async () => undefined);
    const exitFullscreen = vi.fn(async () => undefined);
    const documentMock = {
      fullscreenEnabled: true, fullscreenElement: null as object | null,
      documentElement: { requestFullscreen }, exitFullscreen,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    };
    // The exported Web preview's legacy file bridge does not control native windows.
    vi.stubGlobal("ninoDesktop", { getWindowState: async () => ({ fullScreen: false, zoom: 1 }) });
    vi.stubGlobal("document", documentMock);
    const controller = getDisplayController()!;
    expect(controller.native).toBe(false);
    expect(controller.setZoom).toBeUndefined();
    const pending = controller.setFullScreen(true);
    expect(requestFullscreen).toHaveBeenCalledOnce();
    await pending;
    documentMock.fullscreenElement = {};
    expect(await controller.read()).toEqual({ fullScreen: true, zoom: 1 });
    await controller.setFullScreen(true);
    expect(requestFullscreen).toHaveBeenCalledOnce();
    await controller.setFullScreen(false);
    expect(exitFullscreen).toHaveBeenCalledOnce();
    documentMock.fullscreenElement = null;
    expect((await controller.read()).fullScreen).toBe(false);
    const listener = vi.fn();
    controller.subscribe(listener)();
    expect(documentMock.addEventListener).toHaveBeenCalledWith("fullscreenchange", listener);
    expect(documentMock.removeEventListener).toHaveBeenCalledWith("fullscreenchange", listener);
  });

  it("propagates browser refusal and does not pretend full screen was enabled", async () => {
    const failure = new Error("Full screen denied");
    vi.stubGlobal("ninoDesktop", undefined);
    vi.stubGlobal("document", {
      fullscreenEnabled: true, fullscreenElement: null,
      documentElement: { requestFullscreen: vi.fn(async () => { throw failure; }) },
    });
    const controller = getDisplayController()!;
    await expect(controller.setFullScreen(true)).rejects.toBe(failure);
    expect((await controller.read()).fullScreen).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { attachEnduranceBeforeUnload } from "./beforeUnload";

afterEach(() => vi.unstubAllGlobals());

function browserWindow() {
  return {
    addEventListener: vi.fn<(type: string, listener: (event: BeforeUnloadEvent) => void) => void>(),
    removeEventListener: vi.fn(),
  };
}

function unloadEvent() {
  return { preventDefault: vi.fn(), returnValue: undefined } as unknown as BeforeUnloadEvent;
}

describe("endurance departure save", () => {
  it.each(["android", "ios"])("does not use browser events on %s where window is the native global", (platform) => {
    // React Native setUpGlobals assigns global.window = global without browser event methods.
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("addEventListener", undefined);
    vi.stubGlobal("removeEventListener", undefined);
    const save = vi.fn(() => true);
    expect(() => attachEnduranceBeforeUnload(platform, save)()).not.toThrow();
    expect(save).not.toHaveBeenCalled();
  });

  it("does not install native listeners even if an environment polyfills browser methods", () => {
    const target = browserWindow();
    vi.stubGlobal("window", target);
    attachEnduranceBeforeUnload("android", () => true)();
    expect(target.addEventListener).not.toHaveBeenCalled();
    expect(target.removeEventListener).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { addEventListener: vi.fn() }])("ignores a web environment without both event APIs", (target) => {
    vi.stubGlobal("window", target);
    expect(() => attachEnduranceBeforeUnload("web", () => true)()).not.toThrow();
    if (target && "addEventListener" in target) expect(target.addEventListener).not.toHaveBeenCalled();
  });

  it("saves on a browser close without preventing a successful departure", () => {
    const target = browserWindow();
    vi.stubGlobal("window", target);
    const save = vi.fn(() => true);
    const dispose = attachEnduranceBeforeUnload("web", save);
    expect(target.addEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    const handler = target.addEventListener.mock.calls[0][1];
    const event = unloadEvent();
    handler(event);
    expect(save).toHaveBeenCalledOnce();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.returnValue).toBeUndefined();
    dispose();
    expect(target.removeEventListener).toHaveBeenCalledWith("beforeunload", handler);
  });

  it("prevents a browser close after a failed save and permits it once saving succeeds", () => {
    const target = browserWindow();
    vi.stubGlobal("window", target);
    const save = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    attachEnduranceBeforeUnload("web", save);
    const handler = target.addEventListener.mock.calls[0][1];
    const failed = unloadEvent();
    handler(failed);
    expect(failed.preventDefault).toHaveBeenCalledOnce();
    expect(failed.returnValue).toBe("");
    const retried = unloadEvent();
    handler(retried);
    expect(retried.preventDefault).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("removes the original listener from the same window during cleanup", () => {
    const original = browserWindow();
    vi.stubGlobal("window", original);
    const dispose = attachEnduranceBeforeUnload("web", () => true);
    const replacement = browserWindow();
    vi.stubGlobal("window", replacement);
    dispose();
    expect(original.removeEventListener).toHaveBeenCalledWith("beforeunload", original.addEventListener.mock.calls[0][1]);
    expect(replacement.removeEventListener).not.toHaveBeenCalled();
  });
});

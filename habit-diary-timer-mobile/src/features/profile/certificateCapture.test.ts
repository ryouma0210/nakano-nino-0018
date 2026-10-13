import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { certificateCaptureSize, createCertificateCapture, createCertificateDismissal } from "./certificateCapture";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}
function create(requiresPhoto = true) {
  const options = {
    requiresPhoto,
    capture: vi.fn(async () => "file:///certificate.png"),
    afterPaint: vi.fn(async () => {}),
    release: vi.fn(async (_uri: string) => {}),
    onFinish: vi.fn(),
  };
  return { options, capture: createCertificateCapture(options) };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("native certificate capture lifecycle", () => {
  it("waits for layout, photo decode, modal presentation and paint, then captures once", async () => {
    const { options, capture } = create();
    const painted = deferred<void>();
    options.afterPaint.mockReturnValue(painted.promise);
    capture.photoLoaded();
    capture.layoutReady({ width: 794, height: 1123 });
    expect(options.capture).not.toHaveBeenCalled();
    capture.shown();
    capture.shown();
    capture.photoLoaded();
    expect(options.capture).not.toHaveBeenCalled();
    painted.resolve();
    expect(await capture.result).toBe("file:///certificate.png");
    expect(options.capture).toHaveBeenCalledExactlyOnceWith({ width: 794, height: 1123 });
    expect(options.onFinish).toHaveBeenCalledOnce();
    expect(options.release).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("needs no photo event when no photograph was supplied and ignores zero-size layout", async () => {
    const { options, capture } = create(false);
    capture.shown();
    capture.layoutReady({ width: 0, height: 0 });
    expect(options.capture).not.toHaveBeenCalled();
    capture.layoutReady({ width: 794, height: 1400 });
    await capture.result;
    expect(options.capture).toHaveBeenCalledWith({ width: 794, height: 1400 });
  });

  it("rejects on image loading failure and cannot start from a later stale readiness event", async () => {
    const { options, capture } = create();
    const error = new Error("image decode failed");
    const rejected = expect(capture.result).rejects.toBe(error);
    capture.fail(error);
    capture.shown();
    capture.layoutReady({ width: 794, height: 1123 });
    capture.photoLoaded();
    await rejected;
    expect(options.capture).not.toHaveBeenCalled();
    expect(options.onFinish).toHaveBeenCalledOnce();
  });

  it("cancels on unmount/back before paint without trying to use a released view", async () => {
    const { options, capture } = create(false);
    const painted = deferred<void>();
    options.afterPaint.mockReturnValue(painted.promise);
    const rejected = expect(capture.result).rejects.toThrow("中断");
    capture.shown();
    capture.layoutReady({ width: 794, height: 1123 });
    capture.cancel();
    painted.resolve();
    await rejected;
    await Promise.resolve();
    expect(options.capture).not.toHaveBeenCalled();
    expect(options.onFinish).toHaveBeenCalledOnce();
  });

  it("rejects on timeout even if readiness never arrives", async () => {
    const { options, capture } = create();
    const rejected = expect(capture.result).rejects.toThrow("タイムアウト");
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(options.capture).not.toHaveBeenCalled();
    expect(options.onFinish).toHaveBeenCalledOnce();
  });

  it("cleans up a native file returned after timeout instead of publishing the stale result", async () => {
    const { options, capture } = create(false);
    const encoded = deferred<string>();
    options.capture.mockReturnValue(encoded.promise);
    const rejected = expect(capture.result).rejects.toThrow("タイムアウト");
    capture.shown();
    capture.layoutReady({ width: 794, height: 1123 });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    encoded.resolve("file:///late.png");
    await vi.advanceTimersByTimeAsync(0);
    expect(options.release).toHaveBeenCalledExactlyOnceWith("file:///late.png");
    expect(options.onFinish).toHaveBeenCalledOnce();
  });

  it("propagates native capture errors and clears the pending request", async () => {
    const { options, capture } = create(false);
    const error = new Error("native capture failed");
    options.capture.mockRejectedValue(error);
    capture.shown();
    capture.layoutReady({ width: 794, height: 1123 });
    await expect(capture.result).rejects.toBe(error);
    expect(options.onFinish).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("native certificate output dimensions", () => {
  it.each([1, 2, 3])("keeps 1588 physical pixels at device scale %s and includes long content", (ratio) => {
    const layout = { width: 794, height: 1400 };
    expect(certificateCaptureSize(layout, "android", ratio)).toEqual({ width: 1588, height: 2800 });
    const ios = certificateCaptureSize(layout, "ios", ratio);
    expect(ios.width * ratio).toBe(1588);
    expect(ios.height * ratio).toBe(2800);
  });
});

describe("native certificate modal dismissal", () => {
  it("keeps export waiting for delayed onDismiss after the capture has finished", async () => {
    const dismissal = createCertificateDismissal();
    const exported = vi.fn();
    const waiting = dismissal.wait().then(exported);
    await vi.advanceTimersByTimeAsync(1000);
    expect(exported).not.toHaveBeenCalled();
    dismissal.complete();
    await waiting;
    expect(exported).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts an early onDismiss and resolves a pending wait on unmount", async () => {
    const early = createCertificateDismissal();
    early.complete();
    await early.wait();
    const unmounted = createCertificateDismissal();
    const waiting = unmounted.wait();
    unmounted.complete();
    await waiting;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects instead of opening share UI if no dismissal confirmation arrives", async () => {
    const dismissal = createCertificateDismissal();
    const rejected = expect(dismissal.wait()).rejects.toThrow("中断");
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    // A late native event must not create a second pending operation.
    dismissal.complete();
    expect(vi.getTimerCount()).toBe(0);
  });
});

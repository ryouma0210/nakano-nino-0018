export type CertificateCaptureLayout = { width: number; height: number };

/** Readiness and ownership of one native capture, independent of React rendering. */
export function createCertificateCapture({ requiresPhoto, capture, afterPaint, release, onFinish, timeoutMs = 20_000 }: {
  requiresPhoto: boolean;
  capture: (layout: CertificateCaptureLayout) => Promise<string>;
  afterPaint: () => Promise<void>;
  release: (uri: string) => void | Promise<void>;
  onFinish: () => void;
  timeoutMs?: number;
}) {
  let shown = false;
  let photoReady = !requiresPhoto;
  let layout: CertificateCaptureLayout | null = null;
  let capturing = false;
  let settled = false;
  let resolve!: (uri: string) => void;
  let reject!: (reason: unknown) => void;
  const result = new Promise<string>((success, failure) => { resolve = success; reject = failure; });
  const timeout = setTimeout(() => fail(new Error("証明書の画像作成がタイムアウトしました。")), timeoutMs);

  function finish() {
    settled = true;
    clearTimeout(timeout);
    onFinish();
  }
  function fail(error: unknown) {
    if (settled) return;
    finish();
    reject(error);
  }
  function maybeCapture() {
    if (settled || capturing || !shown || !photoReady || !layout) return;
    capturing = true;
    void (async () => {
      try {
        await afterPaint();
        if (settled || !layout) return;
        const uri = await capture(layout);
        if (settled) {
          // Timeout/navigation may win while the native bitmap is being encoded.
          await release(uri);
          return;
        }
        finish();
        resolve(uri);
      } catch (error) {
        fail(error);
      }
    })();
  }
  return {
    result,
    shown() { shown = true; maybeCapture(); },
    photoLoaded() { photoReady = true; maybeCapture(); },
    layoutReady(next: CertificateCaptureLayout) {
      if (!Number.isFinite(next.width) || !Number.isFinite(next.height) || next.width <= 0 || next.height <= 0) return;
      layout = next;
      maybeCapture();
    },
    fail,
    cancel() { fail(new Error("証明書の画像作成を中断しました。")); },
  };
}

/** Android accepts pixels; iOS UIGraphicsImageRenderer multiplies its point size by device scale. */
export function certificateCaptureSize(layout: CertificateCaptureLayout, platform: string, pixelRatio: number) {
  const scale = platform === "ios" ? pixelRatio : 1;
  return { width: 1588 / scale, height: Math.round(layout.height * 1588 / layout.width) / scale };
}

/** UIKit dismissal is asynchronous even for a Modal without animations. */
export function createCertificateDismissal(timeoutMs = 5_000) {
  let completed = false;
  let waiting: Promise<void> | undefined;
  let resolve: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return {
    wait() {
      if (completed) return Promise.resolve();
      waiting ??= new Promise<void>((success, failure) => {
        resolve = success;
        timeout = setTimeout(() => {
          timeout = undefined;
          failure(new Error("証明書の画像作成を中断しました。"));
        }, timeoutMs);
      });
      return waiting;
    },
    complete() {
      completed = true;
      if (timeout !== undefined) clearTimeout(timeout);
      timeout = undefined;
      resolve?.();
    },
  };
}

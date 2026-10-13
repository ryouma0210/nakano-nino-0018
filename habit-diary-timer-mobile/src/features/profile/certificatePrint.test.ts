import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printCertificateHtml } from "./certificatePrint";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

const print = vi.fn();
const focus = vi.fn();
const remove = vi.fn();
const appPagePrint = vi.fn();
let afterPrint: (() => void) | undefined;
let photo = deferred();
let frame: {
  title: string; srcdoc: string; style: { cssText: string }; setAttribute: ReturnType<typeof vi.fn>; remove: typeof remove;
  onload?: () => void; onerror?: () => void;
  contentWindow: { print: typeof print; focus: typeof focus; addEventListener: (name: string, callback: () => void) => void };
  contentDocument: { fonts: { ready: Promise<void> }; images: { decode: () => Promise<void> }[] };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  afterPrint = undefined;
  photo = deferred();
  frame = {
    title: "", srcdoc: "", style: { cssText: "" }, setAttribute: vi.fn(), remove,
    contentWindow: { print, focus, addEventListener: (name, callback) => { if (name === "afterprint") afterPrint = callback; } },
    contentDocument: { fonts: { ready: Promise.resolve() }, images: [{ decode: () => photo.promise }] },
  };
  vi.stubGlobal("window", { print: appPagePrint });
  vi.stubGlobal("document", { createElement: () => frame, body: { appendChild: () => frame.onload?.() } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("certificate-only browser print", () => {
  it("waits for the photo before printing the isolated document, then removes it after the print dialog", async () => {
    const pending = printCertificateHtml("<main>Certificate</main>");
    await Promise.resolve();
    expect(print).not.toHaveBeenCalled();
    expect(frame.srcdoc).toBe("<main>Certificate</main>");
    photo.resolve();
    await pending;
    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
    expect(appPagePrint).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    afterPrint?.();
    expect(remove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a loading timeout and never prints after a late photo finishes loading", async () => {
    const pending = printCertificateHtml("<main>Certificate</main>");
    const rejected = expect(pending).rejects.toThrow("印刷画面を開けませんでした。");
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(remove).toHaveBeenCalledOnce();
    photo.resolve();
    await vi.runAllTimersAsync();
    expect(print).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("cleans the iframe when printing throws and when the browser never sends afterprint", async () => {
    photo.resolve();
    print.mockImplementationOnce(() => { throw new Error("print unavailable"); });
    await expect(printCertificateHtml("<main>Certificate</main>")).rejects.toThrow("print unavailable");
    expect(remove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);

    await printCertificateHtml("<main>Certificate</main>");
    await vi.advanceTimersByTimeAsync(180_000);
    expect(remove).toHaveBeenCalledTimes(2);
  });
});

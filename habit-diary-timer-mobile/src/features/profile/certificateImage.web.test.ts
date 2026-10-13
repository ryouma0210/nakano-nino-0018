import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadCertificatePng, renderCertificatePng } from "./certificateImage.web";

const mocks = vi.hoisted(() => ({ html2pdf: vi.fn() }));
vi.mock("html2pdf.js", () => ({ default: mocks.html2pdf }));

const png = "data:image/png;base64,iVBORw0KGgo=";
let decode: ReturnType<typeof vi.fn>;
let host: { style: { cssText: string }; setAttribute: ReturnType<typeof vi.fn>; appendChild: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
let overlay: { remove: ReturnType<typeof vi.fn> };
let anchor: { style: { display: string }; href: string; download: string; click: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
let canvas: { width: number; height: number; toDataURL: ReturnType<typeof vi.fn> };
let page: { querySelectorAll: () => { decode: ReturnType<typeof vi.fn> }[]; getBoundingClientRect: () => { width: number } };
let source: { cloneNode: () => typeof page } | null;
let worker: { set: ReturnType<typeof vi.fn>; from: ReturnType<typeof vi.fn>; toContainer: ReturnType<typeof vi.fn>; toCanvas: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
let fetchImage: ReturnType<typeof vi.fn>;
let revoke: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  decode = vi.fn().mockResolvedValue(undefined);
  host = { style: { cssText: "" }, setAttribute: vi.fn(), appendChild: vi.fn(), remove: vi.fn() };
  overlay = { remove: vi.fn() };
  anchor = { style: { display: "" }, href: "", download: "", click: vi.fn(), remove: vi.fn() };
  canvas = { width: 1588, height: 2238, toDataURL: vi.fn().mockReturnValue(png) };
  page = { querySelectorAll: () => [{ decode }], getBoundingClientRect: () => ({ width: 793.6875 }) };
  source = { cloneNode: () => page };
  worker = { set: vi.fn(), from: vi.fn(), toContainer: vi.fn(), toCanvas: vi.fn(), get: vi.fn() };
  for (const method of [worker.set, worker.from, worker.toContainer, worker.toCanvas]) method.mockReturnValue(worker);
  worker.get.mockImplementation(async (key) => key === "overlay" ? overlay : canvas);
  mocks.html2pdf.mockReturnValue(worker);
  fetchImage = vi.fn().mockResolvedValue({ blob: async () => new Blob(["png"], { type: "image/png" }) });
  revoke = vi.fn();
  vi.stubGlobal("window", { devicePixelRatio: 3 });
  vi.stubGlobal("document", { body: { appendChild: vi.fn() }, fonts: { ready: Promise.resolve() }, createElement: (tag: string) => tag === "a" ? anchor : host });
  vi.stubGlobal("DOMParser", class { parseFromString() { return { querySelector: () => source, querySelectorAll: () => [] }; } });
  vi.stubGlobal("fetch", fetchImage);
  vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:certificate"), revokeObjectURL: revoke });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("certificate PNG rendering", () => {
  it("waits for photo decoding, returns lossless PNG at fixed density, and cleans its DOM", async () => {
    let ready!: () => void;
    decode.mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
    const result = renderCertificatePng("certificate HTML");
    await Promise.resolve();
    expect(mocks.html2pdf).not.toHaveBeenCalled();
    ready();
    expect(await result).toEqual({ dataUrl: png, width: 1588, height: 2238 });
    expect(worker.set).toHaveBeenCalledWith(expect.objectContaining({
      html2canvas: expect.objectContaining({ scale: 2, width: 794 }), image: { type: "png" },
    }));
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/png");
    expect(overlay.remove).toHaveBeenCalledOnce();
    expect(host.remove).toHaveBeenCalledOnce();
  });

  it("cleans its own overlay and temporary document after renderer failure", async () => {
    worker.get.mockImplementation(async (key) => {
      if (key === "overlay") return overlay;
      throw new Error("render failed");
    });
    await expect(renderCertificatePng("certificate HTML")).rejects.toThrow("render failed");
    expect(overlay.remove).toHaveBeenCalledOnce();
    expect(host.remove).toHaveBeenCalledOnce();
  });

  it("rejects missing layout, broken photos and empty canvas instead of downloading an incomplete certificate", async () => {
    source = null;
    await expect(renderCertificatePng("wrong HTML")).rejects.toThrow();
    expect(mocks.html2pdf).not.toHaveBeenCalled();
    source = { cloneNode: () => page };
    decode.mockRejectedValueOnce(new Error("corrupt photo"));
    await expect(renderCertificatePng("certificate HTML")).rejects.toThrow("corrupt photo");
    expect(host.remove).toHaveBeenCalledOnce();
    canvas.toDataURL.mockReturnValue("data:,");
    await expect(renderCertificatePng("certificate HTML")).rejects.toThrow();
    expect(overlay.remove).toHaveBeenCalledOnce();
  });
});

describe("certificate PNG download", () => {
  it("downloads through a blob URL and keeps it available for asynchronous browser downloads", async () => {
    vi.useFakeTimers();
    await downloadCertificatePng({ dataUrl: png, width: 1588, height: 2238 }, "certificate.png");
    expect(anchor.href).toBe("blob:certificate");
    expect(anchor.download).toBe("certificate.png");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:certificate");
  });

  it("rejects arbitrary URLs before fetching and cleans an unsuccessful download", async () => {
    vi.useFakeTimers();
    await expect(downloadCertificatePng({ dataUrl: "https://example.test/private.png", width: 1, height: 1 }, "photo.png")).rejects.toThrow();
    expect(fetchImage).not.toHaveBeenCalled();
    anchor.click.mockImplementation(() => { throw new Error("download blocked"); });
    await expect(downloadCertificatePng({ dataUrl: png, width: 1588, height: 2238 }, "certificate.png")).rejects.toThrow("download blocked");
    expect(anchor.remove).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect(revoke).toHaveBeenCalledOnce();
  });
});

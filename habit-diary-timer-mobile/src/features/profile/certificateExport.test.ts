import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activityCertificatePhotoDataUrl, exportActivityCertificate } from "./certificateExport";
import type { ActivityCertificateData } from "./certificate";
import type { StoredFile } from "../../services/fileStorageService";

const mocks = vi.hoisted(() => ({
  platform: { OS: "android" }, print: vi.fn(), renderNative: vi.fn(), renderWeb: vi.fn(), permissions: vi.fn(), create: vi.fn(), read: vi.fn(), write: vi.fn(),
  copy: vi.fn(), remove: vi.fn(), mkdir: vi.fn(), info: vi.fn(), available: vi.fn(), share: vi.fn(), download: vi.fn(), webPrint: vi.fn(), getBlob: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("expo-print", () => ({ printAsync: mocks.print }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: mocks.available, shareAsync: mocks.share }));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/", cacheDirectory: "file:///cache/", EncodingType: { Base64: "base64" },
  StorageAccessFramework: { requestDirectoryPermissionsAsync: mocks.permissions, createFileAsync: mocks.create },
  readAsStringAsync: mocks.read, writeAsStringAsync: mocks.write, copyAsync: mocks.copy, deleteAsync: mocks.remove, makeDirectoryAsync: mocks.mkdir,
  getInfoAsync: mocks.info,
}));
vi.mock("../../services/fileStorageService", () => ({
  fileStorageService: { getBlob: mocks.getBlob },
  mimeTypeForName: (name: string) => name.endsWith(".png") ? "image/png" : "image/svg+xml",
}));
vi.mock("./certificateImage", () => ({ downloadCertificatePng: mocks.download, renderCertificatePng: mocks.renderWeb }));
vi.mock("./certificatePrint", () => ({ printCertificateHtml: mocks.webPrint }));

const data: ActivityCertificateData = {
  name: "Test #User%", topFavorites: [], favoriteCount: 0, topWeaknesses: ["Cold weather"], weaknessCount: 7, longestActivitySeconds: null,
  erectionLengthCm: "12.50", masturbationPerWeek: "0",
  totalTimerSeconds: 0, totalEarnedPoints: 0, currentPoints: 0, issuedAt: new Date(2026, 9, 13, 0, 3, 4),
  outsidePlayerLevel: 450, outsideSuccubusLevel: 999,
};
const fileName = "活動記録証明書_2026-10-13_Test#User%.png";
const imageUri = (directory: string, name = fileName) => `${directory}${encodeURIComponent(name)}`;
const png = { dataUrl: "data:image/png;base64,iVBORw0KGgo=", width: 1588, height: 2238 };
const exportImage = (action: "save" | "share" | "print" = "save") => exportActivityCertificate(data, "ja", action, mocks.renderNative);
const photo: StoredFile = { name: "photo.png", uri: "file:///photos/photo.png", purpose: "profile", size: 8 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.platform.OS = "android";
  mocks.permissions.mockResolvedValue({ granted: true, directoryUri: "content://chosen/" });
  mocks.renderNative.mockResolvedValue("file:///cache/generated.png");
  mocks.renderWeb.mockResolvedValue(png);
  mocks.create.mockResolvedValue("content://chosen/certificate.png");
  mocks.read.mockResolvedValue("iVBORw0KGgo=");
  mocks.available.mockResolvedValue(true);
  mocks.info.mockResolvedValue({ exists: false });
});
afterEach(() => vi.unstubAllGlobals());

describe("activity certificate export", () => {
  it("saves Android PNG bytes into the chosen directory and removes only its temporary source", async () => {
    expect(await exportImage()).toEqual({ status: "saved", fileName, uri: "content://chosen/certificate.png" });
    expect(mocks.renderNative).toHaveBeenCalledWith(data, "ja");
    expect(mocks.create).toHaveBeenCalledWith("content://chosen/", fileName, "image/png");
    expect(mocks.write).toHaveBeenCalledWith("content://chosen/certificate.png", "iVBORw0KGgo=", { encoding: "base64" });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("file:///cache/generated.png", { idempotent: true });
  });

  it("treats directory-picker cancellation as cancellation without rendering or writing files", async () => {
    mocks.permissions.mockResolvedValue({ granted: false });
    expect(await exportImage()).toEqual({ status: "cancelled", fileName });
    expect(mocks.renderNative).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("cleans incomplete Android targets after write failure without hiding the original failure", async () => {
    mocks.write.mockRejectedValue(new Error("disk full"));
    await expect(exportImage()).rejects.toThrow("disk full");
    expect(mocks.remove.mock.calls.map(([uri]) => uri)).toEqual(["content://chosen/certificate.png", "file:///cache/generated.png"]);
  });

  it("returns the saved iOS document URI", async () => {
    mocks.platform.OS = "ios";
    const result = await exportImage();
    expect(result.uri).toBe(imageUri("file:///documents/"));
    expect(mocks.copy).toHaveBeenCalledWith({ from: "file:///cache/generated.png", to: result.uri });
    expect(mocks.permissions).not.toHaveBeenCalled();
  });

  it("shares a named native PNG and retains the copy for asynchronous receivers", async () => {
    const result = await exportImage("share");
    expect(result).toEqual({ status: "shared", fileName, uri: imageUri("file:///cache/activity-certificates/") });
    expect(mocks.share).toHaveBeenCalledWith(result.uri, expect.objectContaining({ mimeType: "image/png", UTI: "public.png" }));
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("file:///cache/generated.png", { idempotent: true });
  });

  it("fails unavailable sharing before creating files", async () => {
    mocks.available.mockResolvedValue(false);
    await expect(exportImage("share")).rejects.toThrow();
    expect(mocks.renderNative).not.toHaveBeenCalled();
  });

  it("uses certificate-only browser PNG and printing paths", async () => {
    mocks.platform.OS = "web";
    expect(await exportImage()).toEqual({ status: "saved", fileName });
    expect(mocks.renderWeb).toHaveBeenCalledWith(expect.stringContaining("活動記録証明書"));
    expect(mocks.renderWeb.mock.calls[0][0]).toContain("Cold weather");
    expect(mocks.renderWeb.mock.calls[0][0]).toMatch(/長さ（cm）[\s\S]*?<td[^>]*>12\.50<\/td>[\s\S]*?頻度（回\/1週間）[\s\S]*?<td[^>]*>0<\/td>/);
    expect(mocks.renderWeb.mock.calls[0][0]).toMatch(/弱点登録数[\s\S]*?<td[^>]*>7<\/td>/);
    expect(mocks.renderWeb.mock.calls[0][0]).toMatch(/あなたLv\(館の外\)[\s\S]*?<td[^>]*>450<\/td>[\s\S]*?サキュバスLv\(館の外\)[\s\S]*?<td[^>]*>999<\/td>/);
    expect(mocks.download).toHaveBeenCalledWith(png, fileName);
    expect(await exportImage("print")).toEqual({ status: "printed", fileName });
    expect(mocks.webPrint).toHaveBeenCalledWith(expect.stringContaining('class="page activity-certificate"'));
    expect(mocks.webPrint.mock.calls[0][0]).toBe(mocks.renderWeb.mock.calls[0][0]);
    expect(mocks.print).not.toHaveBeenCalled();
    expect(mocks.renderWeb).toHaveBeenCalledTimes(1);
    expect(mocks.renderNative).not.toHaveBeenCalled();
  });

  it("does not leave saved files or a success result when image capture fails", async () => {
    mocks.renderNative.mockRejectedValue(new Error("image decode failed"));
    await expect(exportImage()).rejects.toThrow("image decode failed");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it.each([
    { state: "omitted", values: {} },
    { state: "undefined", values: { erectionLengthCm: undefined, masturbationPerWeek: undefined } },
    { state: "null", values: { erectionLengthCm: null, masturbationPerWeek: null } },
    { state: "empty", values: { erectionLengthCm: "", masturbationPerWeek: "" } },
  ])("exports $state optional records through browser and Android save paths", async ({ values }) => {
    const input: Partial<ActivityCertificateData> = { ...data };
    delete input.erectionLengthCm;
    delete input.masturbationPerWeek;
    Object.assign(input, values);
    mocks.platform.OS = "web";
    await expect(exportActivityCertificate(input as ActivityCertificateData, "ja", "save")).resolves.toEqual({ status: "saved", fileName });
    const firstRow = mocks.renderWeb.mock.calls[0][0].match(/<tr>[\s\S]*?<\/tr>/)?.[0];
    expect(firstRow?.match(/<td>未設定<\/td>/g)).toHaveLength(2);
    expect(mocks.download).toHaveBeenCalledWith(png, fileName);

    mocks.platform.OS = "android";
    await expect(exportActivityCertificate(input as ActivityCertificateData, "ja", "save", mocks.renderNative)).resolves.toEqual({
      status: "saved", fileName, uri: "content://chosen/certificate.png",
    });
    expect(mocks.renderNative).toHaveBeenCalledWith(input, "ja");
    expect(mocks.write).toHaveBeenCalledWith("content://chosen/certificate.png", "iVBORw0KGgo=", { encoding: "base64" });
  });

  it("removes temporary and incomplete shared images after share failure", async () => {
    mocks.share.mockRejectedValue(new Error("share failed"));
    await expect(exportImage("share")).rejects.toThrow("share failed");
    expect(mocks.remove.mock.calls.map(([uri]) => uri)).toEqual([imageUri("file:///cache/activity-certificates/"), "file:///cache/generated.png"]);
  });

  it.each(["save", "share"] as const)("preserves an earlier image with the same name during %s, including a failed copy", async (action) => {
    mocks.platform.OS = "ios";
    const directory = action === "save" ? "file:///documents/" : "file:///cache/activity-certificates/";
    const nextName = fileName.replace(/\.png$/, "-1.png");
    mocks.info.mockImplementation(async (uri) => ({ exists: uri === imageUri(directory) }));
    const result = await exportImage(action);
    expect(result.fileName).toBe(nextName);
    expect(mocks.copy).toHaveBeenCalledWith({ from: "file:///cache/generated.png", to: imageUri(directory, nextName) });
    mocks.remove.mockClear();
    mocks.copy.mockRejectedValueOnce(new Error("copy failed"));
    await expect(exportImage(action)).rejects.toThrow("copy failed");
    expect(mocks.remove.mock.calls.map(([uri]) => uri)).not.toContain(imageUri(directory));
  });
});

describe("certificate photo conversion", () => {
  it("embeds a local native photo and rejects remote, unsupported or corrupt files", async () => {
    mocks.read.mockResolvedValue("iVBORw0KGgo=");
    expect(await activityCertificatePhotoDataUrl(photo)).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(await activityCertificatePhotoDataUrl(null)).toBeNull();
    await expect(activityCertificatePhotoDataUrl({ ...photo, uri: "https://example.test/photo.png" })).rejects.toThrow();
    await expect(activityCertificatePhotoDataUrl({ ...photo, name: "photo.svg" })).rejects.toThrow();
    mocks.read.mockResolvedValue("not valid base64");
    await expect(activityCertificatePhotoDataUrl(photo)).rejects.toThrow();
  });

  it("reads persisted browser bytes rather than a stale URL and fails a missing photo", async () => {
    mocks.platform.OS = "web";
    vi.stubGlobal("FileReader", class {
      result: string | null = null;
      onload?: () => void;
      readAsDataURL(blob: Blob) { this.result = `data:${blob.type};base64,iVBORw0KGgo=`; this.onload?.(); }
    });
    mocks.getBlob.mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    expect(await activityCertificatePhotoDataUrl({ ...photo, uri: "blob:expired" })).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.getBlob.mockResolvedValue(undefined);
    await expect(activityCertificatePhotoDataUrl(photo)).rejects.toThrow("画像を読み込めませんでした。");
    mocks.getBlob.mockResolvedValue(new Blob(["image"], { type: "image/svg+xml" }));
    await expect(activityCertificatePhotoDataUrl(photo)).rejects.toThrow();
  });
});

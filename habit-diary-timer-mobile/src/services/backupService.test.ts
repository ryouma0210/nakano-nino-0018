import { beforeEach, describe, expect, it, vi } from "vitest";
import { backupService, type BackupPayload } from "./backupService";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  setItem: vi.fn(),
  write: vi.fn(),
  share: vi.fn(),
  available: vi.fn(),
  exportFiles: vi.fn(),
  restoreFiles: vi.fn(),
  execute: vi.fn(),
  exclusive: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => mocks.storage.get(key) ?? null,
  setItem: mocks.setItem,
  getAllKeys: async () => [...mocks.storage.keys()],
  multiGet: async (keys: string[]) => keys.map((key) => [key, mocks.storage.get(key) ?? null]),
  multiRemove: async (keys: string[]) => { keys.forEach((key) => mocks.storage.delete(key)); },
  multiSet: async (entries: [string, string][]) => { entries.forEach(([key, value]) => mocks.storage.set(key, value)); },
} }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: vi.fn() }));
vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/", EncodingType: { UTF8: "utf8" }, writeAsStringAsync: mocks.write,
}));
vi.mock("expo-sharing", () => ({ isAvailableAsync: mocks.available, shareAsync: mocks.share }));
vi.mock("@/database/client", () => ({ query: () => [], execute: mocks.execute, transaction: (fn: () => void) => fn() }));
vi.mock("@/services/fileStorageService", () => ({ fileStorageService: { exportForBackup: mocks.exportFiles, restoreFromBackup: mocks.restoreFiles, withExclusiveFiles: mocks.exclusive } }));

const historyKey = "nino-room:backup-export-info";
const previous = { exportedAt: "2026-09-01T01:00:00.000Z", kind: "save" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.storage.clear();
  mocks.storage.set(historyKey, JSON.stringify(previous));
  mocks.storage.set("habit-diary-timer:settings", "{}");
  mocks.setItem.mockImplementation(async (key: string, value: string) => { mocks.storage.set(key, value); });
  mocks.write.mockResolvedValue(undefined);
  mocks.share.mockResolvedValue(undefined);
  mocks.available.mockResolvedValue(true);
  mocks.exportFiles.mockResolvedValue([]);
  mocks.restoreFiles.mockResolvedValue(undefined);
  mocks.exclusive.mockImplementation(async (operation: () => Promise<unknown>) => operation());
});

describe("backup export history", () => {
  it("records the latest export kind and time, without copying device history into the backup", async () => {
    const result = await backupService.export("complete");
    expect(result.historySaved).toBe(true);
    expect(result.info.kind).toBe("complete");
    expect(Number.isFinite(Date.parse(result.info.exportedAt))).toBe(true);
    expect(await backupService.lastExport()).toEqual(result.info);
    const payload = JSON.parse(mocks.write.mock.calls[0][1]);
    expect(payload.asyncStorage).toEqual({ "habit-diary-timer:settings": "{}" });
    expect(mocks.exportFiles).toHaveBeenCalledOnce();
  });

  it("keeps the previous history when creating the file fails", async () => {
    mocks.write.mockRejectedValue(new Error("storage full"));
    await expect(backupService.export("save")).rejects.toThrow("storage full");
    expect(await backupService.lastExport()).toEqual(previous);
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it("keeps the previous history when the export handoff fails", async () => {
    mocks.share.mockRejectedValue(new Error("sharing failed"));
    await expect(backupService.export("save")).rejects.toThrow("sharing failed");
    expect(await backupService.lastExport()).toEqual(previous);
  });

  it("reports a metadata failure separately from a completed export", async () => {
    mocks.setItem.mockRejectedValue(new Error("history unavailable"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await backupService.export("save");
      expect(result.historySaved).toBe(false);
      expect(mocks.share).toHaveBeenCalledOnce();
      expect(await backupService.lastExport()).toEqual(previous);
    } finally {
      warning.mockRestore();
    }
  });

  it("preserves the current device history when restoring an older backup", async () => {
    await backupService.export("save");
    const payload: BackupPayload = JSON.parse(mocks.write.mock.calls[0][1]);
    const current = await backupService.lastExport();
    payload.asyncStorage[historyKey] = JSON.stringify(previous);
    payload.asyncStorage["habit-diary-timer:settings"] = '{"language":"en"}';
    await backupService.restore(payload);
    expect(await backupService.lastExport()).toEqual(current);
    expect(mocks.storage.get("habit-diary-timer:settings")).toBe('{"language":"en"}');
  });

  it("handles missing or invalid old history without inventing a backup date", async () => {
    for (const raw of ["null", "invalid JSON", '{"exportedAt":"bad","kind":"save"}', '{"exportedAt":"2026-09-01","kind":"other"}']) {
      mocks.storage.set(historyKey, raw);
      expect(await backupService.lastExport()).toBeNull();
    }
    mocks.storage.delete(historyKey);
    expect(await backupService.lastExport()).toBeNull();
  });

  it("refuses a restore before changing any data when file operations are busy", async () => {
    await backupService.export("complete");
    const payload: BackupPayload = JSON.parse(mocks.write.mock.calls[0][1]);
    const currentStorage = [...mocks.storage];
    mocks.exclusive.mockRejectedValue(new Error("files busy"));
    await expect(backupService.restore(payload)).rejects.toThrow("files busy");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.restoreFiles).not.toHaveBeenCalled();
    expect([...mocks.storage]).toEqual(currentStorage);
  });
});

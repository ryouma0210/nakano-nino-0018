import { beforeEach, describe, expect, it, vi } from "vitest";
import { backupService, type BackupPayload, type PickedBackup } from "./backupService";
import { readBackupArchive, writeBackupArchive } from "./backupArchive";

const mocks = vi.hoisted(() => ({
  platform: { OS: "android" }, storage: new Map<string, string>(), sources: new Map<string, Uint8Array>(),
  chunks: [] as Uint8Array[], staged: new Map<string, Uint8Array[]>(),
  setItem: vi.fn(), multiSet: vi.fn(), write: vi.fn(), finish: vi.fn(), abort: vi.fn(),
  list: vi.fn(), prepare: vi.fn(), activate: vi.fn(), rollback: vi.fn(), finalize: vi.fn(),
  execute: vi.fn(), query: vi.fn(), exclusive: vi.fn(), pick: vi.fn(), source: vi.fn(),
  sourceRead: vi.fn(), close: vi.fn(), stage: vi.fn(), dispose: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => mocks.storage.get(key) ?? null,
  setItem: mocks.setItem,
  getAllKeys: async () => [...mocks.storage.keys()],
  multiGet: async (keys: string[]) => keys.map((key) => [key, mocks.storage.get(key) ?? null]),
  multiRemove: async (keys: string[]) => { keys.forEach((key) => mocks.storage.delete(key)); },
  multiSet: mocks.multiSet,
} }));
vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: mocks.pick }));
vi.mock("@/database/client", () => ({ query: mocks.query, execute: mocks.execute, transaction: (fn: () => void) => fn() }));
vi.mock("@/services/fileStorageService", () => ({
  mimeTypeForName: () => "video/mp4",
  fileStorageService: { list: mocks.list, prepareRestore: mocks.prepare, withExclusiveFiles: mocks.exclusive },
}));
vi.mock("./backupIO", () => ({
  invalidBackupMessage: "バックアップファイルが壊れているか、対応していない形式です。",
  openBackupSource: mocks.source,
  createBackupOutput: async () => ({ writer: { write: mocks.write }, finish: mocks.finish, abort: mocks.abort }),
  createBackupStaging: mocks.stage,
  openNativeBackupWriter: (uri: string) => ({
    close: vi.fn(),
    write: async (bytes: Uint8Array) => {
      if (bytes.length > 256 * 1024) throw new Error("unbounded native write");
      const parts = mocks.staged.get(uri) ?? [];
      parts.push(bytes.slice());
      mocks.staged.set(uri, parts);
    },
  }),
  readSmallBackup: async (source: { size: number; read: (offset: number, length: number) => Promise<Uint8Array> }, limit: number) => {
    if (source.size > limit) throw new Error("metadata limit");
    const bytes = new Uint8Array(source.size);
    for (let offset = 0; offset < source.size; offset += 256 * 1024) bytes.set(await source.read(offset, Math.min(256 * 1024, source.size - offset)), offset);
    return bytes;
  },
  copyBackupEntry: async (source: { size: number; read: (offset: number, length: number) => Promise<Uint8Array> }, target: { write: (data: Uint8Array) => Promise<void> }) => {
    for (let offset = 0; offset < source.size; offset += 256 * 1024) await target.write(await source.read(offset, Math.min(256 * 1024, source.size - offset)));
  },
  backupEntryBase64: async (source: { size: number; read: (offset: number, length: number) => Promise<Uint8Array> }) => {
    const bytes = await source.read(0, source.size);
    return Buffer.from(bytes).toString("base64");
  },
}));

const historyKey = "nino-room:backup-export-info";
const previous = { exportedAt: "2026-09-01T01:00:00.000Z", kind: "save" };
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function join(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
function reader(bytes: Uint8Array) {
  return { size: bytes.length, read: async (offset: number, length: number) => bytes.subarray(offset, offset + length) };
}
async function savePayload(): Promise<BackupPayload> {
  mocks.chunks.length = 0;
  await backupService.export("save");
  return JSON.parse(decoder.decode(join(mocks.chunks)));
}
function select(bytes: Uint8Array) {
  mocks.sources.set("file:///selected", bytes);
  mocks.pick.mockResolvedValue({ canceled: false, assets: [{ uri: "file:///selected", name: "backup.zip" }] });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.platform.OS = "android";
  mocks.storage.clear(); mocks.sources.clear(); mocks.chunks.length = 0; mocks.staged.clear();
  mocks.storage.set(historyKey, JSON.stringify(previous));
  mocks.storage.set("habit-diary-timer:settings", "{}");
  mocks.setItem.mockImplementation(async (key: string, value: string) => { mocks.storage.set(key, value); });
  mocks.multiSet.mockImplementation(async (entries: [string, string][]) => { entries.forEach(([key, value]) => mocks.storage.set(key, value)); });
  mocks.write.mockImplementation(async (bytes: Uint8Array) => {
    if (bytes.length > 256 * 1024) throw new Error("unbounded write");
    mocks.chunks.push(bytes.slice());
  });
  mocks.finish.mockResolvedValue(undefined); mocks.abort.mockResolvedValue(undefined);
  mocks.dispose.mockResolvedValue(undefined);
  mocks.list.mockResolvedValue([]); mocks.query.mockReturnValue([]);
  mocks.prepare.mockResolvedValue({ activate: mocks.activate, rollback: mocks.rollback, finalize: mocks.finalize });
  mocks.exclusive.mockImplementation(async (operation: () => Promise<unknown>) => operation());
  mocks.stage.mockResolvedValue({ uri: "file:///stage/", dispose: mocks.dispose });
  mocks.source.mockImplementation(async (uri: string) => {
    const bytes = mocks.sources.get(uri);
    if (!bytes) throw new Error("missing source");
    return { size: bytes.length, close: () => mocks.close(uri), read: async (offset: number, length: number) => {
      if (length > 256 * 1024) throw new Error("unbounded read");
      mocks.sourceRead(uri, offset, length);
      return bytes.subarray(offset, offset + length);
    } };
  });
});

describe("bounded backup export and import", () => {
  it("writes save-only JSON and records export history outside of the backup", async () => {
    const payload = await savePayload();
    expect(payload.version).toBe(1);
    expect(payload.files).toBeUndefined();
    expect(payload.asyncStorage).toEqual({ "habit-diary-timer:settings": "{}" });
    expect((await backupService.lastExport())?.kind).toBe("save");
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("streams complete backups as ZIP binary entries, with round-trip native restore staging", async () => {
    const video = Uint8Array.from({ length: 1024 * 1024 + 19 }, (_, index) => index % 251);
    mocks.sources.set("file:///video.mp4", video);
    mocks.list.mockResolvedValue([{ name: "動画.mp4", uri: "file:///video.mp4", size: video.length, purpose: "training" }]);
    await backupService.export("complete");
    const archive = join(mocks.chunks);
    const entries = await readBackupArchive(reader(archive));
    expect(entries.map((entry) => entry.name)).toEqual(["manifest.json", "files/000000"]);
    const manifest = JSON.parse(decoder.decode(await entries[0].read(0, entries[0].size)));
    expect(manifest.version).toBe(2);
    expect(manifest.files[0]).toEqual({ name: "動画.mp4", size: video.length, purpose: "training", mimeType: "video/mp4", path: "files/000000" });
    expect(mocks.sourceRead.mock.calls.every(([, , length]) => length <= 256 * 1024)).toBe(true);
    select(archive);
    const picked = await backupService.pick();
    expect(picked?.kind).toBe("complete");
    expect(picked?.files?.[0]).toMatchObject({ name: "動画.mp4", uri: "file:///stage/0" });
    expect(join(mocks.staged.get("file:///stage/0")!)).toEqual(video);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    await backupService.restore(picked!);
    expect(mocks.prepare).toHaveBeenCalledWith(picked!.files);
    expect(mocks.activate).toHaveBeenCalledOnce();
    expect(mocks.finalize).toHaveBeenCalledOnce();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it("supports the same ZIP format on Web without invoking native staging", async () => {
    mocks.sources.set("file:///video", new Uint8Array([1, 2, 3, 4]));
    mocks.list.mockResolvedValue([{ name: "clip.mp4", uri: "file:///video", size: 4, purpose: "punishment" }]);
    await backupService.export("complete");
    select(join(mocks.chunks));
    mocks.platform.OS = "web";
    const picked = await backupService.pick();
    expect(picked?.files?.[0]).toEqual({ name: "clip.mp4", size: 4, purpose: "punishment", mimeType: "video/mp4", data: "AQIDBA==" });
    expect(mocks.stage).not.toHaveBeenCalled();
  });

  it("rejects a corrupt media entry and cleans staging before modifying current data", async () => {
    mocks.sources.set("file:///video", encoder.encode("MEDIA-CONTENT-UNIQUE"));
    mocks.list.mockResolvedValue([{ name: "clip.mp4", uri: "file:///video", purpose: "training" }]);
    await backupService.export("complete");
    const archive = join(mocks.chunks);
    const offset = Buffer.from(archive).indexOf("MEDIA-CONTENT-UNIQUE");
    expect(offset).toBeGreaterThan(0);
    archive[offset] ^= 1;
    select(archive);
    await expect(backupService.pick()).rejects.toThrow();
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledWith("file:///selected");
  });

  it("rejects oversized legacy JSON after reading only its signature", async () => {
    mocks.pick.mockResolvedValue({ canceled: false, assets: [{ uri: "file:///huge", size: 1 }] });
    const read = vi.fn(async () => encoder.encode('{"fo'));
    const close = vi.fn();
    mocks.source.mockResolvedValue({ size: 134795968, read, close });
    await expect(backupService.pick()).rejects.toThrow("旧形式のバックアップが大きすぎます");
    expect(read.mock.calls).toEqual([[0, 4]]);
    expect(close).toHaveBeenCalledOnce();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("still reads legacy JSON backups and allows canceling the picker", async () => {
    const payload = await savePayload();
    payload.kind = "complete";
    payload.files = [{ name: "clip.mp4", purpose: "training", size: 3, mimeType: "video/mp4", data: "AQID" }];
    select(encoder.encode(JSON.stringify(payload)));
    const picked = await backupService.pick();
    expect(picked?.payload).toEqual(payload);
    await backupService.restore(picked!);
    expect(mocks.prepare).toHaveBeenCalledWith(payload.files);
    mocks.pick.mockResolvedValue({ canceled: true, assets: null });
    await expect(backupService.pick()).resolves.toBeNull();
  });

  it("rejects incomplete file manifests even when the ZIP itself is valid", async () => {
    const payload = await savePayload();
    const bytes = encoder.encode(JSON.stringify({ ...payload, version: 2, kind: "complete", files: [
      { name: "clip.mp4", purpose: "training", size: 3, mimeType: "video/mp4", path: "files/000000" },
    ] }));
    const chunks: Uint8Array[] = [];
    await writeBackupArchive([{ name: "manifest.json", ...reader(bytes) }], { write: async (part) => { chunks.push(part); } });
    select(join(chunks));
    await expect(backupService.pick()).rejects.toThrow();
    expect(mocks.stage).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

describe("backup failure recovery and history", () => {
  it.each(["write", "finish"] as const)("keeps previous export history and removes partial output when %s fails", async (step) => {
    mocks[step].mockRejectedValue(new Error("disk or sharing failed"));
    await expect(backupService.export("save")).rejects.toThrow("disk or sharing failed");
    expect(await backupService.lastExport()).toEqual(previous);
    expect(mocks.abort).toHaveBeenCalledOnce();
  });

  it("reports a history-write failure separately from a completed export", async () => {
    mocks.setItem.mockRejectedValue(new Error("history unavailable"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect((await backupService.export("save")).historySaved).toBe(false);
      expect(mocks.finish).toHaveBeenCalledOnce();
      expect(await backupService.lastExport()).toEqual(previous);
    } finally { warning.mockRestore(); }
  });

  it("preserves current device history on restore", async () => {
    const payload = await savePayload();
    const current = await backupService.lastExport();
    payload.asyncStorage[historyKey] = JSON.stringify(previous);
    payload.asyncStorage["habit-diary-timer:settings"] = '{"language":"en"}';
    await backupService.restore(payload);
    expect(await backupService.lastExport()).toEqual(current);
    expect(mocks.storage.get("habit-diary-timer:settings")).toBe('{"language":"en"}');
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("rolls back files and settings when the database transaction rejects", async () => {
    const payload = await savePayload();
    payload.kind = "complete"; payload.files = [];
    payload.asyncStorage["habit-diary-timer:settings"] = "changed";
    payload.asyncStorage["nino-room:new"] = "new";
    const before = [...mocks.storage];
    mocks.execute.mockImplementationOnce(() => { throw new Error("database failure"); });
    await expect(backupService.restore(payload)).rejects.toThrow("database failure");
    expect([...mocks.storage]).toEqual(before);
    expect(mocks.rollback).toHaveBeenCalledOnce();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it("rolls back a partial settings write before touching the database", async () => {
    const payload = await savePayload(); payload.kind = "complete"; payload.files = [];
    payload.asyncStorage["habit-diary-timer:settings"] = "changed";
    const before = [...mocks.storage];
    mocks.multiSet.mockImplementationOnce(async () => {
      mocks.storage.set("habit-diary-timer:settings", "partial");
      throw new Error("storage full");
    });
    await expect(backupService.restore(payload)).rejects.toThrow("storage full");
    expect([...mocks.storage]).toEqual(before);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.rollback).toHaveBeenCalledOnce();
  });

  it("disposes selected staging if preparation fails without touching live data", async () => {
    const payload = await savePayload(); payload.kind = "complete"; payload.files = [];
    const picked: PickedBackup = { kind: "complete", payload, files: [], dispose: mocks.dispose };
    mocks.prepare.mockRejectedValue(new Error("copy failed"));
    await expect(backupService.restore(picked)).rejects.toThrow("copy failed");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it("retries recoverable rollbacks after other steps have released space", async () => {
    const payload = await savePayload(); payload.kind = "complete"; payload.files = [];
    mocks.execute.mockImplementationOnce(() => { throw new Error("database failure"); });
    mocks.rollback.mockRejectedValueOnce(new Error("temporarily unavailable")).mockResolvedValue(undefined);
    await expect(backupService.restore(payload)).rejects.toThrow("database failure");
    expect(mocks.rollback).toHaveBeenCalledTimes(2);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it("reports a persistent rollback failure and keeps the previous files unfinalized", async () => {
    const payload = await savePayload(); payload.kind = "complete"; payload.files = [];
    mocks.execute.mockImplementationOnce(() => { throw new Error("database failure"); });
    mocks.rollback.mockRejectedValue(new Error("storage unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(backupService.restore(payload)).rejects.toThrow("復元前のデータに戻せませんでした");
      expect(mocks.rollback).toHaveBeenCalledTimes(2);
      expect(mocks.finalize).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it("refuses a restore before modifying data if file operations are busy", async () => {
    const payload = await savePayload();
    const before = [...mocks.storage];
    mocks.exclusive.mockRejectedValue(new Error("files busy"));
    await expect(backupService.restore(payload)).rejects.toThrow("files busy");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect([...mocks.storage]).toEqual(before);
  });

  it("handles missing or invalid history", async () => {
    for (const raw of ["null", "invalid JSON", '{"exportedAt":"bad","kind":"save"}', '{"exportedAt":"2026-09-01","kind":"other"}']) {
      mocks.storage.set(historyKey, raw);
      expect(await backupService.lastExport()).toBeNull();
    }
    mocks.storage.delete(historyKey);
    expect(await backupService.lastExport()).toBeNull();
  });
});

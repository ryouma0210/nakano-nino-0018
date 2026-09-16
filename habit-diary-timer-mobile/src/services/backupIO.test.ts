import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IO_CHUNK_SIZE,
  backupEntryBase64,
  backupEntryBlob,
  copyBackupEntry,
  createBackupOutput,
  createBackupStaging,
  invalidBackupMessage,
  openBackupSource,
  openNativeBackupWriter,
  readSmallBackup,
} from "./backupIO";
import { readBackupArchive, writeBackupArchive } from "./backupArchive";

const mocks = vi.hoisted(() => ({
  platform: { OS: "android" },
  create: vi.fn(),
  open: vi.fn(),
  removeFile: vi.fn(),
  remove: vi.fn(),
  mkdir: vi.fn(),
  share: vi.fn(),
  available: vi.fn(),
  files: new Set<string>(),
}));

vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("expo-file-system", () => ({
  FileMode: { ReadOnly: "r", Truncate: "w" },
  File: class {
    constructor(readonly uri: string) {}
    create(options: unknown) { return mocks.create(this.uri, options); }
    open(mode: unknown) { return mocks.open(this.uri, mode); }
    delete() { return mocks.removeFile(this.uri); }
  },
}));
vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  deleteAsync: mocks.remove,
  makeDirectoryAsync: mocks.mkdir,
}));
vi.mock("expo-sharing", () => ({ isAvailableAsync: mocks.available, shareAsync: mocks.share }));

type MockHandle = {
  size: number | null;
  offset: number;
  readBytes: ReturnType<typeof vi.fn<(length: number) => Uint8Array>>;
  writeBytes: ReturnType<typeof vi.fn<(bytes: Uint8Array) => void>>;
  close: ReturnType<typeof vi.fn>;
};
let handle: MockHandle;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.platform.OS = "android";
  mocks.files.clear();
  handle = {
    size: IO_CHUNK_SIZE * 2 + 17,
    offset: 0,
    readBytes: vi.fn((length: number) => new Uint8Array(length)),
    writeBytes: vi.fn(),
    close: vi.fn(),
  };
  mocks.open.mockImplementation(() => handle);
  mocks.create.mockImplementation((uri: string) => { mocks.files.add(uri); });
  mocks.removeFile.mockImplementation((uri: string) => { mocks.files.delete(uri); });
  mocks.remove.mockImplementation(async (uri: string) => { mocks.files.delete(uri); });
  mocks.mkdir.mockResolvedValue(undefined);
  mocks.available.mockResolvedValue(true);
  mocks.share.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("native backup readers", () => {
  it("seeks for each bounded read and closes its file handle", async () => {
    const offsets: number[] = [];
    handle.readBytes.mockImplementation((length) => {
      offsets.push(handle.offset);
      return new Uint8Array(length).fill(handle.offset % 251);
    });
    const source = await openBackupSource("file:///video.mp4");
    expect(mocks.open).toHaveBeenCalledWith("file:///video.mp4", "r");
    expect(source.size).toBe(handle.size);
    expect(await source.read(90, 3)).toEqual(new Uint8Array([90, 90, 90]));
    expect((await source.read(4, IO_CHUNK_SIZE)).length).toBe(IO_CHUNK_SIZE);
    expect(await source.read(source.size, 0)).toEqual(new Uint8Array());
    expect(offsets).toEqual([90, 4, source.size]);
    source.close();
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it("rejects out-of-range reads before touching native memory", async () => {
    const source = await openBackupSource("file:///backup.zip");
    for (const [offset, length] of [
      [-1, 1], [0, -1], [0.5, 1], [0, 1.5], [NaN, 1], [0, Infinity],
      [0, IO_CHUNK_SIZE + 1], [source.size, 1], [Number.MAX_SAFE_INTEGER, 1],
    ]) {
      await expect(source.read(offset, length)).rejects.toThrow(invalidBackupMessage);
    }
    expect(handle.readBytes).not.toHaveBeenCalled();
    source.close();
  });

  it.each([null, -1, NaN, Infinity, 1.5])("closes a handle with invalid size %s", async (size) => {
    handle.size = size;
    await expect(openBackupSource("file:///invalid.zip")).rejects.toThrow(invalidBackupMessage);
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it("rejects truncated native reads and leaves closing to the owner", async () => {
    const source = await openBackupSource("file:///truncated.zip");
    handle.readBytes.mockReturnValue(new Uint8Array(2));
    await expect(source.read(0, 3)).rejects.toThrow(invalidBackupMessage);
    expect(handle.close).not.toHaveBeenCalled();
    source.close();
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it("copies a virtual 129 MiB file without requesting or allocating it all at once", async () => {
    const size = 129 * 1024 * 1024 + 11;
    const buffer = new Uint8Array(IO_CHUNK_SIZE);
    let readOffset = 0;
    let written = 0;
    let reads = 0;
    const source = {
      size,
      async read(offset: number, length: number) {
        expect(offset).toBe(readOffset);
        expect(length).toBeLessThanOrEqual(IO_CHUNK_SIZE);
        readOffset += length;
        reads += 1;
        return buffer.subarray(0, length);
      },
    };
    await copyBackupEntry(source, { async write(bytes) { written += bytes.length; } });
    expect(written).toBe(size);
    expect(reads).toBe(Math.ceil(size / IO_CHUNK_SIZE));
  });

  it("rejects oversized save data before reading and detects short metadata reads", async () => {
    const read = vi.fn(async (_offset: number, length: number) => new Uint8Array(length));
    await expect(readSmallBackup({ size: 17 * 1024 * 1024, read }, 16 * 1024 * 1024))
      .rejects.toThrow("バックアップのセーブデータが大きすぎます。");
    expect(read).not.toHaveBeenCalled();
    read.mockResolvedValue(new Uint8Array(2));
    await expect(readSmallBackup({ size: 3, read }, 16 * 1024 * 1024)).rejects.toThrow(invalidBackupMessage);
  });

  it("reads small metadata in bounded chunks and preserves its byte order", async () => {
    const size = IO_CHUNK_SIZE + 19;
    const read = vi.fn(async (offset: number, length: number) =>
      Uint8Array.from({ length }, (_, index) => (offset + index) % 251));
    const actual = await readSmallBackup({ size, read }, size);
    expect(read.mock.calls).toEqual([[0, IO_CHUNK_SIZE], [IO_CHUNK_SIZE, 19]]);
    expect(actual).toEqual(Uint8Array.from({ length: size }, (_, index) => index % 251));
  });
});

describe("native backup writers", () => {
  it("writes bounded chunks and closes the handle", async () => {
    const writer = openNativeBackupWriter("file:///new.zip");
    expect(mocks.create).toHaveBeenCalledWith("file:///new.zip", { intermediates: true });
    expect(mocks.open).toHaveBeenCalledWith("file:///new.zip", "w");
    const chunk = new Uint8Array(IO_CHUNK_SIZE);
    await writer.write(chunk);
    expect(handle.writeBytes).toHaveBeenCalledWith(chunk);
    await expect(writer.write(new Uint8Array(IO_CHUNK_SIZE + 1))).rejects.toThrow("chunk limit");
    expect(handle.writeBytes).toHaveBeenCalledOnce();
    writer.close();
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it("does not open a handle or share when creating the file fails", async () => {
    mocks.create.mockImplementation(() => { throw new Error("disk full"); });
    await expect(createBackupOutput("new.zip", "application/zip")).rejects.toThrow("disk full");
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it("removes an incomplete output if opening the newly created file fails", async () => {
    mocks.open.mockImplementation(() => { throw new Error("open failed"); });
    await expect(createBackupOutput("new.zip", "application/zip")).rejects.toThrow("open failed");
    expect(mocks.files.has("file:///cache/backup-exports/new.zip")).toBe(false);
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it("checks sharing availability before creating a file", async () => {
    mocks.available.mockResolvedValue(false);
    await expect(createBackupOutput("new.zip", "application/zip")).rejects.toThrow("共有画面を開けませんでした。");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("closes before sharing and retains successful output for the recipient", async () => {
    const output = await createBackupOutput("new.zip", "application/zip");
    const events: string[] = [];
    handle.close.mockImplementation(() => { events.push("close"); });
    mocks.share.mockImplementation(async () => { events.push("share"); });
    await output.writer.write(new Uint8Array([1, 2, 3]));
    await output.finish();
    expect(events).toEqual(["close", "share"]);
    expect(mocks.share).toHaveBeenCalledWith("file:///cache/backup-exports/new.zip", {
      mimeType: "application/zip", dialogTitle: "バックアップを保存",
    });
    expect(mocks.files.has("file:///cache/backup-exports/new.zip")).toBe(true);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("cleans up failed writes without sharing and closes only once", async () => {
    const output = await createBackupOutput("partial.zip", "application/zip");
    handle.writeBytes.mockImplementation(() => { throw new Error("write failed"); });
    await expect(output.writer.write(new Uint8Array([1]))).rejects.toThrow("write failed");
    await output.abort();
    await output.abort();
    expect(handle.close).toHaveBeenCalledOnce();
    expect(mocks.files.size).toBe(0);
    expect(mocks.share).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith("file:///cache/backup-exports/partial.zip", { idempotent: true });
  });

  it("allows a failed sharing handoff to be cleaned up without closing twice", async () => {
    const output = await createBackupOutput("failed.zip", "application/zip");
    mocks.share.mockRejectedValue(new Error("share failed"));
    await expect(output.finish()).rejects.toThrow("share failed");
    await output.abort();
    expect(handle.close).toHaveBeenCalledOnce();
    expect(mocks.files.size).toBe(0);
  });

  it("creates distinct restore staging directories with disposable contents", async () => {
    const first = await createBackupStaging();
    const second = await createBackupStaging();
    expect(first.uri).not.toBe(second.uri);
    expect(first.uri).toMatch(/^file:\/\/\/cache\/backup-restore-/);
    await first.dispose();
    expect(mocks.remove).toHaveBeenCalledWith(first.uri, { idempotent: true });
    expect(mocks.remove).not.toHaveBeenCalledWith(second.uri, expect.anything());
  });
});

describe("web backup readers", () => {
  beforeEach(() => { mocks.platform.OS = "web"; });

  it.each([30, 31, 32])("decodes arbitrary base64 offsets with %s bytes and varying padding", async (size) => {
    const expected = Uint8Array.from({ length: size }, (_, index) => (index * 23) % 256);
    const source = await openBackupSource(`data:application/octet-stream;base64,${Buffer.from(expected).toString("base64")}`);
    expect(source.size).toBe(size);
    for (let offset = 0; offset <= size; offset += 1) {
      for (const length of new Set([0, Math.min(1, size - offset), Math.min(7, size - offset), size - offset])) {
        expect(await source.read(offset, length)).toEqual(expected.slice(offset, offset + length));
      }
    }
    source.close();
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("decodes across the chunk boundary and rejects reads larger than the limit", async () => {
    const expected = Uint8Array.from({ length: IO_CHUNK_SIZE + 11 }, (_, index) => index % 251);
    const source = await openBackupSource(`data:video/mp4;base64,${Buffer.from(expected).toString("base64")}`);
    expect(await source.read(1, IO_CHUNK_SIZE)).toEqual(expected.slice(1, IO_CHUNK_SIZE + 1));
    expect(await source.read(IO_CHUNK_SIZE - 2, 13)).toEqual(expected.slice(IO_CHUNK_SIZE - 2));
    await expect(source.read(0, IO_CHUNK_SIZE + 1)).rejects.toThrow(invalidBackupMessage);
  });

  it.each(["data:text/plain,abc", "data:text/plain;base64", "data:text/plain;base64,AAA"])(
    "rejects an unsupported data URL: %s", async (uri) => {
      await expect(openBackupSource(uri)).rejects.toThrow(invalidBackupMessage);
    },
  );

  it("slices a provided Blob without reading or fetching the complete file", async () => {
    const blob = new Blob([new Uint8Array([10, 20, 30, 40, 50])]);
    const wholeRead = vi.spyOn(blob, "arrayBuffer");
    const slice = vi.spyOn(blob, "slice");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const source = await openBackupSource("blob:selected", blob);
    expect(await source.read(1, 3)).toEqual(new Uint8Array([20, 30, 40]));
    expect(slice).toHaveBeenCalledWith(1, 4);
    expect(wholeRead).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    await expect(source.read(4, 2)).rejects.toThrow(invalidBackupMessage);
    expect(slice).toHaveBeenCalledOnce();
  });

  it("uses a fetched Blob when no selected Blob is provided", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const fetch = vi.fn(async () => ({ blob: async () => blob }));
    vi.stubGlobal("fetch", fetch);
    const source = await openBackupSource("blob:stored-video");
    expect(fetch).toHaveBeenCalledWith("blob:stored-video");
    expect(await source.read(1, 2)).toEqual(new Uint8Array([2, 3]));
  });

  it("restores a 7 MiB ZIP entry as a Blob slice without Base64 or a whole-file read", async () => {
    const expected = Uint8Array.from({ length: 7 * 1024 * 1024 + 13 }, (_, index) => index % 251);
    const parts: Blob[] = [];
    await writeBackupArchive([{
      name: "files/000000", size: expected.length,
      read: async (offset, length) => expected.subarray(offset, offset + length),
    }], { write: async (bytes) => { parts.push(new Blob([new Uint8Array(bytes)])); } });
    const archive = new Blob(parts, { type: "application/zip" });
    const fullRead = vi.spyOn(archive, "arrayBuffer");
    const base64 = vi.fn(() => { throw new Error("Base64 is forbidden for binary restores"); });
    vi.stubGlobal("btoa", base64);
    const source = await openBackupSource("blob:archive", archive);
    const [entry] = await readBackupArchive(source);
    await entry.verify();
    const read = vi.spyOn(entry, "read");
    const result = await backupEntryBlob(entry, "video/mp4");
    source.close();
    expect(result.size).toBe(expected.length);
    expect(result.type).toBe("video/mp4");
    expect(Buffer.compare(Buffer.from(await result.arrayBuffer()), Buffer.from(expected))).toBe(0);
    expect(fullRead).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(base64).not.toHaveBeenCalled();
  });

  it("rejects Blob slices outside the selected file before slicing", async () => {
    const blob = new Blob([new Uint8Array(IO_CHUNK_SIZE + 7)]);
    const slice = vi.spyOn(blob, "slice");
    const source = await openBackupSource("blob:archive", blob);
    expect(source.slice!(0, blob.size, "video/mp4").size).toBe(blob.size);
    expect(source.slice!(blob.size, 0).size).toBe(0);
    for (const [offset, length] of [[-1, 1], [0, -1], [0.5, 1], [0, NaN], [blob.size, 1]]) {
      expect(() => source.slice!(offset, length)).toThrow(invalidBackupMessage);
    }
    expect(slice).toHaveBeenCalledTimes(2);
  });

  it("constructs binary fallback Blobs with bounded reads and immutable chunks", async () => {
    const size = IO_CHUNK_SIZE + 19;
    const buffer = new Uint8Array(IO_CHUNK_SIZE);
    const read = vi.fn(async (offset: number, length: number) => {
      for (let index = 0; index < length; index++) buffer[index] = (offset + index) % 251;
      return buffer.subarray(0, length);
    });
    const blob = await backupEntryBlob({ size, read }, "audio/mpeg");
    buffer.fill(0);
    expect(read.mock.calls).toEqual([[0, IO_CHUNK_SIZE], [IO_CHUNK_SIZE, 19]]);
    expect(blob.type).toBe("audio/mpeg");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(Uint8Array.from({ length: size }, (_, index) => index % 251));
    const empty = await backupEntryBlob({ size: 0, read }, "image/png");
    expect(empty.size).toBe(0);
  });

  it("rejects truncated binary views and fallback reads", async () => {
    const read = vi.fn(async () => new Uint8Array(2));
    await expect(backupEntryBlob({ size: 3, read }, "video/mp4")).rejects.toThrow(invalidBackupMessage);
    read.mockClear();
    await expect(backupEntryBlob({ size: 3, read, slice: () => new Blob([new Uint8Array(2)]) }, "video/mp4"))
      .rejects.toThrow(invalidBackupMessage);
    expect(read).not.toHaveBeenCalled();
  });

  it("encodes base64 across chunk boundaries without inserting padding mid-file", async () => {
    const bytes = Uint8Array.from({ length: 192 * 1024 + 5 }, (_, index) => index % 251);
    const read = vi.fn(async (offset: number, length: number) => bytes.subarray(offset, offset + length));
    const encoded = await backupEntryBase64({ size: bytes.length, read });
    expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
    expect(read.mock.calls).toEqual([[0, 192 * 1024], [192 * 1024, 5]]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { unzipSync, zipSync } from "fflate";
import { BACKUP_ARCHIVE_CHUNK_SIZE, readBackupArchive, writeBackupArchive, type BackupArchiveSource, type RandomAccessReader } from "./backupArchive";

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder().decode(value);
const fields = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function bytesReader(bytes: Uint8Array, maximumRead = Number.POSITIVE_INFINITY): RandomAccessReader {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, offset + Math.min(length, maximumRead)),
  };
}

function source(name: string, value: string | Uint8Array, maximumRead?: number): BackupArchiveSource {
  return { name, ...bytesReader(typeof value === "string" ? encode(value) : value, maximumRead) };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function archive(entries = [source("manifest.json", "{\"version\":1}"), source("files/000000", "123456789")]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  await writeBackupArchive(entries, { write: async (chunk) => { chunks.push(chunk.slice()); } });
  return concat(chunks);
}

function directoryOffset(bytes: Uint8Array): number {
  return fields(bytes).getUint32(bytes.length - 6, true);
}

function dataOffset(bytes: Uint8Array, localOffset = 0): number {
  return localOffset + 30 + fields(bytes).getUint16(localOffset + 26, true) + fields(bytes).getUint16(localOffset + 28, true);
}

describe("streamed backup ZIP format", () => {
  it("round trips empty/binary/UTF-8 entries even when the filesystem returns short chunks", async () => {
    const original = [source("manifest.json", "{}", 1), source("files/日本語😀", new Uint8Array([0, 1, 0, 255, 20]), 2), source("files/empty", "")];
    const bytes = await archive(original);
    const entries = await readBackupArchive(bytesReader(bytes, 3));
    expect(entries.map(({ name, size }) => ({ name, size }))).toEqual(original.map(({ name, size }) => ({ name, size })));
    for (let index = 0; index < entries.length; index++) {
      await entries[index].verify();
      expect(await entries[index].read(0, entries[index].size)).toEqual(unzipSync(bytes)[entries[index].name]);
    }
    expect(decode(await entries[0].read(0, entries[0].size))).toBe("{}");
  });

  it("writes standard STORED ZIPs with the known CRC-32 test vector", async () => {
    const bytes = await archive([source("manifest.json", "123456789")]);
    expect(fields(bytes).getUint32(directoryOffset(bytes) + 16, true)).toBe(0xcbf43926);
    expect(decode(unzipSync(bytes)["manifest.json"])).toBe("123456789");
  });

  it("reads ZIP files made by an independent ZIP implementation without descriptors", async () => {
    const bytes = zipSync({ "manifest.json": encode("{}"), "files/日本語": encode("content") }, { level: 0 });
    const entries = await readBackupArchive(bytesReader(bytes, 11));
    expect(entries.map((entry) => entry.name)).toEqual(["manifest.json", "files/日本語"]);
    for (const entry of entries) await entry.verify();
    expect(decode(await entries[1].read(0, entries[1].size))).toBe("content");
  });

  it("reads descriptors without their optional signature", async () => {
    const original = await archive([source("manifest.json", "{}")]);
    const descriptorOffset = dataOffset(original) + 2;
    const bytes = concat([original.subarray(0, descriptorOffset), original.subarray(descriptorOffset + 4)]);
    fields(bytes).setUint32(bytes.length - 6, directoryOffset(original) - 4, true);
    const [entry] = await readBackupArchive(bytesReader(bytes));
    await entry.verify();
    expect(decode(await entry.read(0, 2))).toBe("{}");
  });

  it("accepts an empty ZIP", async () => {
    expect(await readBackupArchive(bytesReader(await archive([])))).toEqual([]);
  });

  it("accepts central directory entries in a different order from their local files", async () => {
    const bytes = await archive();
    const offset = directoryOffset(bytes);
    const firstLength = 46 + fields(bytes).getUint16(offset + 28, true);
    const first = bytes.slice(offset, offset + firstLength);
    const second = bytes.slice(offset + firstLength, bytes.length - 22);
    bytes.set(second, offset);
    bytes.set(first, offset + second.length);
    const entries = await readBackupArchive(bytesReader(bytes));
    expect(entries.map((entry) => entry.name)).toEqual(["files/000000", "manifest.json"]);
    for (const entry of entries) await entry.verify();
  });

  it("streams a 128 MiB attachment while retaining only small buffers", async () => {
    const size = 128 * 1024 * 1024 + 123;
    const name = "files/000000";
    const bodyStart = 30 + encode(name).length;
    const bodyEnd = bodyStart + size;
    const stored: { offset: number; bytes: Uint8Array }[] = [];
    let written = 0;
    let maximumWrite = 0;
    let maximumRead = 0;
    let sourceReads = 0;
    const pattern = (offset: number) => (offset * 17 + 51) & 255;
    await writeBackupArchive([{
      name, size,
      read: async (offset, length) => {
        maximumRead = Math.max(maximumRead, length);
        sourceReads++;
        const bytes = new Uint8Array(length);
        for (let index = 0; index < length; index++) bytes[index] = pattern(offset + index);
        return bytes;
      },
    }], {
      write: async (chunk) => {
        maximumWrite = Math.max(maximumWrite, chunk.length);
        if (written >= bodyStart && written < bodyEnd) {
          if (written + chunk.length > bodyEnd) throw new Error("payload crossed its boundary");
          for (let index = 0; index < chunk.length; index++) {
            if (chunk[index] !== pattern(written - bodyStart + index)) throw new Error("payload changed during streaming");
          }
        } else stored.push({ offset: written, bytes: chunk.slice() });
        written += chunk.length;
      },
    });
    const reader: RandomAccessReader = {
      size: written,
      read: async (offset, length) => {
        maximumRead = Math.max(maximumRead, length);
        const result = new Uint8Array(length);
        for (let index = Math.max(bodyStart, offset); index < Math.min(bodyEnd, offset + length); index++) {
          result[index - offset] = pattern(index - bodyStart);
        }
        for (const part of stored) {
          const start = Math.max(offset, part.offset);
          const end = Math.min(offset + length, part.offset + part.bytes.length);
          if (start < end) result.set(part.bytes.subarray(start - part.offset, end - part.offset), start - offset);
        }
        return result;
      },
    };
    const [entry] = await readBackupArchive(reader);
    await entry.verify();
    expect(entry.size).toBe(size);
    expect(sourceReads).toBe(Math.ceil(size / BACKUP_ARCHIVE_CHUNK_SIZE));
    expect(maximumRead).toBeLessThanOrEqual(BACKUP_ARCHIVE_CHUNK_SIZE);
    expect(maximumWrite).toBeLessThanOrEqual(BACKUP_ARCHIVE_CHUNK_SIZE);
    expect(stored.reduce((total, part) => total + part.bytes.length, 0)).toBeLessThan(1024);
    const sample = await entry.read(BACKUP_ARCHIVE_CHUNK_SIZE - 2, 10);
    expect([...sample]).toEqual(Array.from({ length: 10 }, (_, index) => pattern(BACKUP_ARCHIVE_CHUNK_SIZE - 2 + index)));
  }, 30_000);
});

describe("backup ZIP validation", () => {
  it.each(["../secret", "/absolute", "files/../x", "files/./x", "files//x", "files\\x", "C:/x", "files/x\u0000", "files/CON.txt", "files/end.", "files/end ", "files/"])("rejects unsafe writer names before writing: %j", async (name) => {
    const write = vi.fn(async () => undefined);
    await expect(writeBackupArchive([source(name, "data")], { write })).rejects.toThrow("unsafe file name");
    expect(write).not.toHaveBeenCalled();
  });

  it.each(["../secret", "/absolute", "files/../x", "files\\x", "C:/x"])("rejects unsafe names in imported archives: %j", async (name) => {
    await expect(readBackupArchive(bytesReader(zipSync({ [name]: encode("data") }, { level: 0 })))).rejects.toThrow("unsafe file name");
  });

  it("rejects duplicate writer names including case and Unicode normalization aliases", async () => {
    for (const names of [["files/x", "files/x"], ["files/X", "files/x"], ["files/é", "files/e\u0301"]]) {
      const write = vi.fn(async () => undefined);
      await expect(writeBackupArchive(names.map((name) => source(name, "")), { write })).rejects.toThrow("duplicate file name");
      expect(write).not.toHaveBeenCalled();
    }
  });

  it("rejects duplicate names in the imported directory", async () => {
    const bytes = await archive([source("files/000000", "one"), source("files/000001", "two")]);
    const directory = directoryOffset(bytes);
    const second = directory + 46 + "files/000000".length;
    bytes.set(encode("files/000000"), second + 46);
    await expect(readBackupArchive(bytesReader(bytes))).rejects.toThrow("duplicate file name");
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 0xffffffff])("rejects invalid writer sizes: %j", async (size) => {
    const write = vi.fn(async () => undefined);
    await expect(writeBackupArchive([{ name: "manifest.json", size, read: async () => new Uint8Array() }], { write })).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects total ZIP32 overflow before reading any attachment", async () => {
    const read = vi.fn(async () => new Uint8Array());
    const write = vi.fn(async () => undefined);
    await expect(writeBackupArchive([{ name: "files/000000", size: 0xfffffffe, read }], { write })).rejects.toThrow("too large");
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects overlarge directories and too many entries before writing", async () => {
    const write = vi.fn(async () => undefined);
    await expect(writeBackupArchive(Array.from({ length: 10_001 }, (_, index) => source(`files/${index}`, "")), { write })).rejects.toThrow("too many files");
    await expect(writeBackupArchive(Array.from({ length: 80 }, (_, index) => source(`files/${index}${"x".repeat(60_000)}`, "")), { write })).rejects.toThrow("too large");
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects a truncated source and a filesystem adapter returning oversized reads", async () => {
    await expect(archive([{ ...source("manifest.json", "x"), size: 10 }])).rejects.toThrow("truncated");
    await expect(archive([{ name: "manifest.json", size: 1, read: async () => new Uint8Array(2) }])).rejects.toThrow("invalid chunk");
  });

  it("propagates storage failure and stops reading additional data", async () => {
    const read = vi.fn(async () => new Uint8Array(BACKUP_ARCHIVE_CHUNK_SIZE));
    const write = vi.fn(async () => { throw new Error("disk full"); });
    await expect(writeBackupArchive([{ name: "files/000000", size: BACKUP_ARCHIVE_CHUNK_SIZE * 2, read }], { write })).rejects.toThrow("disk full");
    expect(read).not.toHaveBeenCalled();
  });

  it("detects corruption by verifying CRC instead of trusting directory metadata", async () => {
    const bytes = await archive();
    bytes[dataOffset(bytes)] ^= 0x80;
    const entries = await readBackupArchive(bytesReader(bytes));
    await expect(entries[0].verify()).rejects.toThrow("checksum");
    await entries[1].verify();
  });

  it("rejects a file that becomes truncated after its headers were read", async () => {
    const bytes = await archive();
    let truncated = false;
    const entries = await readBackupArchive({ size: bytes.length, read: async (offset, length) => truncated ? new Uint8Array() : bytes.subarray(offset, offset + length) });
    truncated = true;
    await expect(entries[0].verify()).rejects.toThrow("truncated");
  });

  it.each([0, 10, 21])("rejects a short non-ZIP file of %i bytes", async (size) => {
    await expect(readBackupArchive(bytesReader(new Uint8Array(size)))).rejects.toThrow();
  });

  it("rejects incomplete trailing records and unexplained trailing bytes", async () => {
    const bytes = await archive();
    await expect(readBackupArchive(bytesReader(bytes.subarray(0, bytes.length - 1)))).rejects.toThrow();
    await expect(readBackupArchive(bytesReader(concat([bytes, new Uint8Array(1)])))).rejects.toThrow();
  });

  it.each([
    ["compressed data", 10, 8],
    ["encryption", 8, 0x0809],
    ["unknown flags", 8, 0x4008],
    ["ZIP64 version", 6, 45],
    ["split disks", 34, 1],
  ])("rejects unsupported %s", async (_label, field, value) => {
    const bytes = await archive();
    fields(bytes).setUint16(directoryOffset(bytes) + Number(field), Number(value), true);
    await expect(readBackupArchive(bytesReader(bytes))).rejects.toThrow();
  });

  it("rejects a compressed archive made by an independent ZIP implementation", async () => {
    const bytes = zipSync({ "manifest.json": encode("repeated ".repeat(100)) }, { level: 6 });
    await expect(readBackupArchive(bytesReader(bytes))).rejects.toThrow("compression");
  });

  it("rejects symlink and directory attributes", async () => {
    for (const attributes of [0xa1ff0000, 0x10]) {
      const bytes = await archive();
      fields(bytes).setUint32(directoryOffset(bytes) + 38, attributes, true);
      await expect(readBackupArchive(bytesReader(bytes))).rejects.toThrow("regular files");
    }
  });

  it("rejects invalid UTF-8 names", async () => {
    const bytes = await archive();
    bytes[directoryOffset(bytes) + 46] = 0xc0;
    await expect(readBackupArchive(bytesReader(bytes))).rejects.toThrow("UTF-8");
  });

  it.each(["name", "flags", "crc", "size", "descriptor", "offset", "overlap"])("rejects inconsistent %s metadata", async (target) => {
    const bytes = await archive();
    const central = directoryOffset(bytes);
    if (target === "name") bytes[30] ^= 1;
    if (target === "flags") fields(bytes).setUint16(6, 0, true);
    if (target === "crc") fields(bytes).setUint32(14, 1, true);
    if (target === "size") fields(bytes).setUint32(central + 24, 0xfffffff0, true);
    if (target === "descriptor") bytes[dataOffset(bytes) + encode("{\"version\":1}").length + 4] ^= 1;
    if (target === "offset") fields(bytes).setUint32(central + 42, 0xfffffff0, true);
    if (target === "overlap") fields(bytes).setUint32(central + 46 + "manifest.json".length + 42, 0, true);
    await expect(readBackupArchive(bytesReader(bytes))).rejects.toThrow();
  });

  it.each(["entry count", "directory size", "directory position", "disk", "unlisted entry"])("rejects invalid %s before allocating an unbounded directory", async (target) => {
    const bytes = await archive();
    const end = bytes.length - 22;
    if (target === "entry count") {
      fields(bytes).setUint16(end + 8, 10_001, true);
      fields(bytes).setUint16(end + 10, 10_001, true);
    }
    if (target === "directory size") fields(bytes).setUint32(end + 12, 4 * 1024 * 1024 + 1, true);
    if (target === "directory position") fields(bytes).setUint32(end + 16, bytes.length, true);
    if (target === "disk") fields(bytes).setUint16(end + 4, 1, true);
    if (target === "unlisted entry") {
      fields(bytes).setUint16(end + 8, 1, true);
      fields(bytes).setUint16(end + 10, 1, true);
    }
    await expect(readBackupArchive(bytesReader(bytes))).rejects.toThrow();
  });

  it("prevents out-of-entry and accidental whole-file reads", async () => {
    const size = BACKUP_ARCHIVE_CHUNK_SIZE + 1;
    const [entry] = await readBackupArchive(bytesReader(await archive([source("files/000000", new Uint8Array(size))])));
    await expect(entry.read(0, size)).rejects.toThrow("bounded chunks");
    await expect(entry.read(-1, 1)).rejects.toThrow("range");
    await expect(entry.read(size, 1)).rejects.toThrow("range");
    await expect(entry.read(0, 0.5)).rejects.toThrow("range");
    expect(await entry.read(size, 0)).toEqual(new Uint8Array());
  });
});

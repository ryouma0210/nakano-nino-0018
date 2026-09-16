import { File as NativeFile, FileMode, type FileHandle } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import type { ArchiveWriter, RandomAccessReader } from "./backupArchive";

export const IO_CHUNK_SIZE = 256 * 1024;
export type BackupSource = RandomAccessReader & { close: () => void };
export const invalidBackupMessage = "バックアップファイルが壊れているか、対応していない形式です。";

function bounds(size: number, offset: number, length: number, limit = IO_CHUNK_SIZE) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0
    || length > limit || offset + length > size) throw new Error(invalidBackupMessage);
}

function cooperativeYield() {
  let bytes = 0;
  return async (length: number) => {
    bytes += length;
    if (bytes >= 1024 * 1024) {
      bytes = 0;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  };
}

export async function openBackupSource(uri: string, blob?: Blob): Promise<BackupSource> {
  const yieldAfter = cooperativeYield();
  if (Platform.OS === "web") {
    if (uri.startsWith("data:") && !blob) {
      const comma = uri.indexOf(",");
      if (comma < 0 || !uri.slice(0, comma).endsWith(";base64")) throw new Error(invalidBackupMessage);
      const start = comma + 1;
      const encodedSize = uri.length - start;
      if (encodedSize % 4 !== 0) throw new Error(invalidBackupMessage);
      const size = encodedSize / 4 * 3 - (uri.endsWith("==") ? 2 : uri.endsWith("=") ? 1 : 0);
      return {
        size, close() {},
        async read(offset, length) {
          bounds(size, offset, length);
          const first = Math.floor(offset / 3) * 4;
          const last = Math.ceil((offset + length) / 3) * 4;
          const binary = atob(uri.slice(start + first, start + last));
          const skip = offset % 3;
          const bytes = Uint8Array.from(binary.slice(skip, skip + length), (character) => character.charCodeAt(0));
          await yieldAfter(length);
          return bytes;
        },
      };
    }
    const content = blob ?? await (await fetch(uri)).blob();
    return {
      size: content.size, close() {},
      slice(offset, length, mimeType) {
        bounds(content.size, offset, length, content.size);
        return content.slice(offset, offset + length, mimeType);
      },
      async read(offset, length) {
        bounds(content.size, offset, length);
        return new Uint8Array(await content.slice(offset, offset + length).arrayBuffer());
      },
    };
  }
  const handle = new NativeFile(uri).open(FileMode.ReadOnly);
  const size = handle.size;
  if (size === null || !Number.isSafeInteger(size) || size < 0) {
    handle.close();
    throw new Error(invalidBackupMessage);
  }
  return {
    size,
    close: () => handle.close(),
    async read(offset, length) {
      bounds(size, offset, length);
      handle.offset = offset;
      const bytes = handle.readBytes(length);
      if (bytes.length !== length) throw new Error(invalidBackupMessage);
      await yieldAfter(length);
      return bytes;
    },
  };
}

export function openNativeBackupWriter(uri: string): ArchiveWriter & { close: () => void } {
  const file = new NativeFile(uri);
  file.create({ intermediates: true });
  let handle: FileHandle;
  try { handle = file.open(FileMode.Truncate); } catch (error) {
    try { file.delete(); } catch (cleanupError) { console.warn("Could not remove incomplete backup", cleanupError); }
    throw error;
  }
  const yieldAfter = cooperativeYield();
  return {
    close: () => handle.close(),
    async write(bytes) {
      if (bytes.length > IO_CHUNK_SIZE) throw new Error("Backup write exceeded the chunk limit.");
      handle.writeBytes(bytes);
      await yieldAfter(bytes.length);
    },
  };
}

export async function readSmallBackup(source: RandomAccessReader, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (source.size > limit) throw new Error("バックアップのセーブデータが大きすぎます。");
  const bytes = new Uint8Array(source.size);
  for (let offset = 0; offset < source.size; offset += IO_CHUNK_SIZE) {
    const length = Math.min(IO_CHUNK_SIZE, source.size - offset);
    const part = await source.read(offset, length);
    if (part.length !== length) throw new Error(invalidBackupMessage);
    bytes.set(part, offset);
  }
  return bytes;
}

export async function copyBackupEntry(source: RandomAccessReader, target: ArchiveWriter) {
  for (let offset = 0; offset < source.size; offset += IO_CHUNK_SIZE) {
    await target.write(await source.read(offset, Math.min(IO_CHUNK_SIZE, source.size - offset)));
  }
}

/** Keep Web attachments binary. Blob-backed archives can expose a view of the file directly. */
export async function backupEntryBlob(source: RandomAccessReader, mimeType: string): Promise<Blob> {
  if (!Number.isSafeInteger(source.size) || source.size < 0) throw new Error(invalidBackupMessage);
  if (source.slice) {
    const blob = source.slice(0, source.size, mimeType);
    if (blob.size !== source.size) throw new Error(invalidBackupMessage);
    return blob;
  }
  const parts: Blob[] = [];
  for (let offset = 0; offset < source.size; offset += IO_CHUNK_SIZE) {
    const length = Math.min(IO_CHUNK_SIZE, source.size - offset);
    const bytes = await source.read(offset, length);
    if (bytes.length !== length) throw new Error(invalidBackupMessage);
    parts.push(new Blob([new Uint8Array(bytes)]));
  }
  return new Blob(parts, { type: mimeType });
}

export async function backupEntryBase64(source: RandomAccessReader) {
  const parts: string[] = [];
  // Multiple of three, so only the final chunk receives Base64 padding.
  const chunkSize = 192 * 1024;
  for (let offset = 0; offset < source.size; offset += chunkSize) {
    const bytes = await source.read(offset, Math.min(chunkSize, source.size - offset));
    let binary = "";
    for (let start = 0; start < bytes.length; start += 8192) {
      binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
    }
    parts.push(btoa(binary));
  }
  return parts.join("");
}

export async function createBackupOutput(fileName: string, mimeType: string) {
  if (Platform.OS === "web") {
    const parts: BlobPart[] = [];
    return {
      writer: { async write(bytes: Uint8Array) { parts.push(new Uint8Array(bytes)); } },
      async finish() {
        const blob = new Blob(parts, { type: mimeType });
        parts.length = 0;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        try { link.click(); } finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
      },
      async abort() { parts.length = 0; },
    };
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error("共有画面を開けませんでした。");
  const uri = `${FileSystem.cacheDirectory}backup-exports/${fileName}`;
  const writer = openNativeBackupWriter(uri);
  let closed = false;
  function close() { if (!closed) { closed = true; writer.close(); } }
  return {
    writer,
    async finish() {
      close();
      await Sharing.shareAsync(uri, { mimeType, dialogTitle: "バックアップを保存" });
      // The receiving app may still read the URI after the share sheet closes.
      // Leave successful exports in the OS-managed cache.
    },
    async abort() {
      close();
      await FileSystem.deleteAsync(uri, { idempotent: true });
    },
  };
}

export async function createBackupStaging() {
  const uri = `${FileSystem.cacheDirectory}backup-restore-${Date.now()}-${Math.random().toString(36).slice(2)}/`;
  await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
  return { uri, dispose: () => FileSystem.deleteAsync(uri, { idempotent: true }) };
}

import type { FilePurpose, PreparedFileRestore, StoredFile } from "./fileStorageService";

export type WebMediaFile = {
  name: string;
  purpose: FilePurpose;
  size: number;
  mimeType: string;
  blob: Blob;
};

type MediaRecord = WebMediaFile & { id: string; generation: string };
type StorageState = { key: "state"; activeGeneration: string; legacyMigrated: true };

const databaseName = "nino-room-web-files-v3";
const legacyKey = "nino-room-web-files-v2";
const invalidFilesMessage = "格納ファイルのデータが不正です。";
const busyMessage = "ファイルを処理中です。完了してからもう一度お試しください。";
const objectUrls = new Map<string, string>();
let databasePromise: Promise<IDBDatabase> | null = null;
let mutationQueue: Promise<unknown> = Promise.resolve();
let activeRestore: string | null = null;
let sequence = 0;

function identifier() {
  return `${Date.now()}-${sequence++}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation);
  mutationQueue = result.catch(() => undefined);
  return result;
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available for file storage."));
      return;
    }
    const request = indexedDB.open(databaseName, 1);
    let rejected = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore("metadata", { keyPath: "key" });
      const files = database.createObjectStore("files", { keyPath: "id" });
      files.createIndex("generation", "generation");
      files.createIndex("file", ["generation", "purpose", "name"], { unique: true });
    };
    request.onerror = () => {
      rejected = true;
      reject(request.error ?? new Error("Could not open file storage."));
    };
    request.onblocked = () => {
      rejected = true;
      reject(new Error("File storage is open in another version of the app. Close the other window and retry."));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (rejected) {
        database.close();
        return;
      }
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      database.onclose = () => { databasePromise = null; };
      resolve(database);
    };
  });
  databasePromise = pending;
  void pending.catch(() => { if (databasePromise === pending) databasePromise = null; });
  return pending;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not access file storage."));
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  const current = database.transaction(["metadata", "files"], mode);
  const completed = new Promise<void>((resolve, reject) => {
    current.oncomplete = () => resolve();
    current.onabort = () => reject(current.error ?? new Error("The file storage transaction was aborted."));
  });
  // A transaction can abort while a request callback is still settling.
  void completed.catch(() => undefined);
  try {
    const result = await operation(current);
    // A successful request alone does not mean its data has been committed.
    await completed;
    return result;
  } catch (error) {
    try { current.abort(); } catch { /* Already aborted or committed. */ }
    await completed.catch(() => undefined);
    throw error;
  }
}

async function readState(current: IDBTransaction): Promise<StorageState | undefined> {
  return requestResult(current.objectStore("metadata").get("state"));
}

async function requireState(current: IDBTransaction): Promise<StorageState> {
  const state = await readState(current);
  if (!state || state.legacyMigrated !== true || typeof state.activeGeneration !== "string") {
    throw new Error("File storage has not been initialized.");
  }
  return state;
}

function validateFile(file: WebMediaFile) {
  if (!file || typeof file.name !== "string" || !file.name || file.name === "." || file.name === ".."
    || /[\\/\u0000-\u001f]/.test(file.name)
    || (file.purpose !== "training" && file.purpose !== "punishment")
    || !Number.isSafeInteger(file.size) || file.size < 0
    || typeof file.mimeType !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(file.mimeType)
    || !(file.blob instanceof Blob) || file.blob.size !== file.size) {
    throw new Error(invalidFilesMessage);
  }
}

function validateFiles(files: readonly WebMediaFile[]) {
  const keys = new Set<string>();
  for (const file of files) {
    validateFile(file);
    const key = JSON.stringify([file.purpose, file.name]);
    if (keys.has(key)) throw new Error(invalidFilesMessage);
    keys.add(key);
  }
}

function mediaRecord(file: WebMediaFile, generation: string): MediaRecord {
  return {
    ...file, id: identifier(), generation,
    // ZIP entries may arrive as untyped Blobs; object URLs need their declared
    // media type so browser playback and later backup exports remain correct.
    blob: file.blob.type === file.mimeType.toLowerCase()
      ? file.blob : file.blob.slice(0, file.blob.size, file.mimeType),
  };
}

export function base64ToBlob(data: string, mimeType: string, expectedSize?: number): Blob {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  const firstPadding = data.indexOf("=");
  const size = data.length / 4 * 3 - padding;
  if (data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(data)
    || (firstPadding >= 0 && firstPadding !== data.length - padding)
    || (expectedSize !== undefined && size !== expectedSize)) throw new Error(invalidFilesMessage);
  const parts: BlobPart[] = [];
  // Decode bounded base64 chunks instead of allocating a second full-size
  // binary string when reading a backup produced by an older app version.
  for (let offset = 0; offset < data.length; offset += 64 * 1024) {
    let decoded: string;
    try { decoded = atob(data.slice(offset, offset + 64 * 1024)); }
    catch { throw new Error(invalidFilesMessage); }
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
    parts.push(bytes);
  }
  return new Blob(parts, { type: mimeType });
}

function legacyFiles(): WebMediaFile[] {
  const source = typeof localStorage === "undefined" ? null : localStorage.getItem(legacyKey);
  if (source === null) return [];
  let records: unknown;
  try { records = JSON.parse(source); } catch { throw new Error(invalidFilesMessage); }
  if (!Array.isArray(records)) throw new Error(invalidFilesMessage);
  const files = records.map((record): WebMediaFile => {
    if (!record || typeof record !== "object" || typeof record.uri !== "string") {
      throw new Error(invalidFilesMessage);
    }
    const prefix = /^data:([^;,]*);base64,/.exec(record.uri);
    if (!prefix) throw new Error(invalidFilesMessage);
    const data = record.uri.slice(prefix[0].length);
    const mimeType = prefix[1] || "application/octet-stream";
    return {
      name: record.name, purpose: record.purpose, size: record.size, mimeType,
      blob: base64ToBlob(data, mimeType, record.size),
    };
  });
  validateFiles(files);
  return files;
}

function removeLegacyCopy() {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(legacyKey);
  } catch (error) {
    // The durable migration marker prevents reimporting a stale copy, including
    // after a reset, even if a browser extension blocks localStorage cleanup.
    console.warn("Could not remove the migrated legacy file storage copy", error);
  }
}

async function ensureMigrated() {
  const existing = await transaction("readonly", readState);
  if (existing) {
    if (existing.legacyMigrated !== true || typeof existing.activeGeneration !== "string") {
      throw new Error("File storage metadata is invalid.");
    }
    removeLegacyCopy();
    return;
  }
  const files = legacyFiles();
  const generation = identifier();
  await transaction("readwrite", async (current) => {
    // Another browser tab may have finished migration since our first read.
    if (await readState(current)) return;
    const store = current.objectStore("files");
    for (const file of files) await requestResult(store.add(mediaRecord(file, generation)));
    await requestResult(current.objectStore("metadata").put({
      key: "state", activeGeneration: generation, legacyMigrated: true,
    } satisfies StorageState));
  });
  // Never remove the only copy before the complete transaction commits.
  removeLegacyCopy();
}

function revoke(id: string) {
  const uri = objectUrls.get(id);
  if (uri) URL.revokeObjectURL(uri);
  objectUrls.delete(id);
}

function storedFile(file: MediaRecord): StoredFile {
  let uri = objectUrls.get(file.id);
  if (!uri) {
    uri = URL.createObjectURL(file.blob);
    objectUrls.set(file.id, uri);
  }
  return { name: file.name, purpose: file.purpose, size: file.size, uri };
}

function assertMutable() {
  if (activeRestore !== null) throw new Error(busyMessage);
}

async function generationRecords(current: IDBTransaction, generation: string): Promise<MediaRecord[]> {
  return requestResult(current.objectStore("files").index("generation").getAll(generation));
}

async function removeGeneration(generation: string) {
  const removed = await transaction("readwrite", async (current) => {
    const state = await requireState(current);
    if (state.activeGeneration === generation) throw new Error("Cannot remove the active file generation.");
    const store = current.objectStore("files");
    const records = await generationRecords(current, generation);
    for (const record of records) await requestResult(store.delete(record.id));
    return records.map((record) => record.id);
  });
  removed.forEach(revoke);
}

async function cleanupGeneration(generation: string) {
  try { await removeGeneration(generation); }
  catch (error) {
    // Cleanup failure leaves only unreachable old files; the completed restore
    // must not be reported as failed after its database transaction succeeded.
    console.warn("Could not clean up a previous file storage generation", error);
  }
}

export const webFileStorage = {
  ensureMigrated: () => serialized(ensureMigrated),

  list: () => serialized(async (): Promise<StoredFile[]> => {
    await ensureMigrated();
    const files = await transaction("readonly", async (current) => {
      const state = await requireState(current);
      return generationRecords(current, state.activeGeneration);
    });
    return files.map(storedFile);
  }),

  getBlob: (file: Pick<StoredFile, "name" | "purpose">) => serialized(async (): Promise<Blob> => {
    await ensureMigrated();
    const stored = await transaction("readonly", async (current): Promise<MediaRecord | undefined> => {
      const state = await requireState(current);
      return requestResult(current.objectStore("files").index("file").get([state.activeGeneration, file.purpose, file.name]));
    });
    if (!stored) throw new Error("The stored file no longer exists.");
    return stored.blob;
  }),

  put: (file: WebMediaFile) => serialized(async (): Promise<void> => {
    assertMutable();
    validateFile(file);
    await ensureMigrated();
    const replaced = await transaction("readwrite", async (current): Promise<string | undefined> => {
      const state = await requireState(current);
      const store = current.objectStore("files");
      const previous: MediaRecord | undefined = await requestResult(store.index("file").get([state.activeGeneration, file.purpose, file.name]));
      if (previous) await requestResult(store.delete(previous.id));
      await requestResult(store.add(mediaRecord(file, state.activeGeneration)));
      return previous?.id;
    });
    if (replaced) revoke(replaced);
  }),

  remove: (file: Pick<StoredFile, "name" | "purpose">) => serialized(async (): Promise<void> => {
    assertMutable();
    await ensureMigrated();
    const removed = await transaction("readwrite", async (current): Promise<string | undefined> => {
      const state = await requireState(current);
      const store = current.objectStore("files");
      const previous: MediaRecord | undefined = await requestResult(store.index("file").get([state.activeGeneration, file.purpose, file.name]));
      if (previous) await requestResult(store.delete(previous.id));
      return previous?.id;
    });
    if (removed) revoke(removed);
  }),

  clear: () => serialized(async (): Promise<void> => {
    assertMutable();
    await ensureMigrated();
    await transaction("readwrite", async (current) => {
      await requestResult(current.objectStore("files").clear());
      await requestResult(current.objectStore("metadata").put({
        key: "state", activeGeneration: identifier(), legacyMigrated: true,
      } satisfies StorageState));
    });
    [...objectUrls.keys()].forEach(revoke);
  }),

  prepareRestore: (files: readonly WebMediaFile[]) => serialized(async (): Promise<PreparedFileRestore> => {
    assertMutable();
    validateFiles(files);
    await ensureMigrated();
    const generation = identifier();
    await transaction("readwrite", async (current) => {
      const store = current.objectStore("files");
      for (const file of files) await requestResult(store.add(mediaRecord(file, generation)));
    });
    let state: "prepared" | "active" | "closed" = "prepared";
    let previousGeneration: string | null = null;
    return {
      activate: () => serialized(async () => {
        if (state !== "prepared") return;
        assertMutable();
        previousGeneration = await transaction("readwrite", async (current) => {
          const previous = await requireState(current);
          await requestResult(current.objectStore("metadata").put({ ...previous, activeGeneration: generation }));
          return previous.activeGeneration;
        });
        activeRestore = generation;
        state = "active";
      }),
      rollback: () => serialized(async () => {
        if (state === "closed") return;
        if (state === "active" && previousGeneration !== null) {
          await transaction("readwrite", async (current) => {
            const currentState = await requireState(current);
            if (currentState.activeGeneration !== generation) throw new Error("The restored files changed in another window.");
            await requestResult(current.objectStore("metadata").put({ ...currentState, activeGeneration: previousGeneration }));
          });
          activeRestore = null;
        }
        state = "closed";
        await cleanupGeneration(generation);
      }),
      finalize: () => serialized(async () => {
        if (state === "closed") return;
        if (state === "prepared") {
          // An unactivated restore is only staged data and can be discarded.
          state = "closed";
          await cleanupGeneration(generation);
          return;
        }
        state = "closed";
        activeRestore = null;
        if (previousGeneration !== null) await cleanupGeneration(previousGeneration);
      }),
    };
  }),
};

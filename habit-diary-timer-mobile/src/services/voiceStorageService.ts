import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { sameBlobContent, sameNativeFileContent } from "./fileContentComparison";
import { fingerprintVoiceBlob, fingerprintVoiceFile } from "./voiceSourceFingerprint";
import { analyzeVoiceAudio, normalizeVoiceAudio } from "./voiceLoudnessProcessing";
import { validateVoiceLoudnessTarget, type VoiceLoudnessAnalysis } from "../features/voices/loudness";
import {
  audioFileType, emptyVoiceLibrary, invalidVoiceLibraryMessage, invalidVoiceOrderMessage, moveVoice, normalizedVoiceFolderName, parseVoiceLibrary, parseVoiceLoudness, reorderVoices,
  VOICE_FILE_EXTENSIONS, VOICE_NAME_LIMIT, voiceDisplayName, voiceFolderName,
  type StoredVoice, type VoiceFolder, type VoiceLibrary, type VoiceMetadata, type VoicePlaybackMode, type VoiceScope,
} from "../features/voices/library";

export type { StoredVoice, VoiceFolder, VoicePlaybackMode, VoiceScope } from "../features/voices/library";
export type VoiceLibrarySnapshot = { voices: StoredVoice[]; mode: VoicePlaybackMode; folders: VoiceFolder[]; scope: VoiceScope };
export type VoiceImportResult = { added: number; skipped: number; failed: number; canceled: boolean };
export type VoiceDeleteResult = { removed: string[]; failed: string[] };
export type VoiceBackupFile = { id: string; uri?: string; blob?: Blob };
export type VoiceBackupSnapshot = { library: VoiceLibrary; files: VoiceBackupFile[] };
export type PreparedVoiceRestore = { activate: () => Promise<void>; rollback: () => Promise<void>; finalize: () => Promise<void> };
export type VoiceBackupAccess = {
  snapshot: () => Promise<VoiceBackupSnapshot>;
  prepareRestore: (library: VoiceLibrary, files: readonly VoiceBackupFile[]) => Promise<PreparedVoiceRestore>;
};

const databaseName = "nino-room-voice-library-v1";
const saveFailureMessage = "ボイスを保存できませんでした。";
const unavailableMessage = "この環境ではボイスを保存できません。";
const listeners = new Set<() => void>();
const objectUrls = new Map<string, string>();
const objectUrlSources = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();
let databasePromise: Promise<IDBDatabase> | null = null;
let importing = false;
let processing = false;
let backupBusy = false;
let sequence = 0;

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}

function changed() {
  for (const listener of listeners) {
    try { listener(); }
    catch (error) { console.warn("Could not notify a voice library subscriber", error); }
  }
}

function requireFolder(state: VoiceLibrary, folderId: string | null) {
  if (folderId !== null && !state.folders.some((folder) => folder.id === folderId)) {
    throw new Error("フォルダが見つかりません。");
  }
}

function requireScope(state: VoiceLibrary, scope: VoiceScope) {
  if (scope !== "all" && scope !== "unfiled") requireFolder(state, scope);
}

function requireUniqueFolderName(state: VoiceLibrary, name: string, exceptId?: string) {
  if (state.folders.some((folder) => folder.id !== exceptId && normalizedVoiceFolderName(folder.name) === normalizedVoiceFolderName(name))) {
    throw new Error("同じ名前のフォルダが既にあります。");
  }
}

function nativeDirectory(): string {
  if (!FileSystem.documentDirectory) throw new Error(unavailableMessage);
  return `${FileSystem.documentDirectory}voices/`;
}

async function nativeExists(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && !info.isDirectory;
}

async function readNativeLibrary(): Promise<VoiceLibrary> {
  const base = `${nativeDirectory()}.metadata/`;
  const source = await nativeExists(`${base}current.json`) ? `${base}current.json`
    : await nativeExists(`${base}previous.json`) ? `${base}previous.json` : null;
  if (!source) return emptyVoiceLibrary();
  let value: unknown;
  try { value = JSON.parse(await FileSystem.readAsStringAsync(source)); }
  catch { throw new Error(invalidVoiceLibraryMessage); }
  return parseVoiceLibrary(value);
}

async function cleanupNative(uri: string) {
  await FileSystem.deleteAsync(uri, { idempotent: true })
    .catch((error) => console.warn("Could not clean up an unused voice file", error));
}

async function writeNativeLibrary(state: VoiceLibrary) {
  const base = `${nativeDirectory()}.metadata/`;
  const current = `${base}current.json`;
  const previous = `${base}previous.json`;
  const pending = `${base}pending.json`;
  await FileSystem.makeDirectoryAsync(base, { intermediates: true });
  if (!await nativeExists(current) && await nativeExists(previous)) {
    await FileSystem.moveAsync({ from: previous, to: current });
  }
  await FileSystem.writeAsStringAsync(pending, JSON.stringify(parseVoiceLibrary(state)));
  const hadCurrent = await nativeExists(current);
  if (hadCurrent) {
    await FileSystem.deleteAsync(previous, { idempotent: true });
    await FileSystem.moveAsync({ from: current, to: previous });
  }
  try {
    await FileSystem.moveAsync({ from: pending, to: current });
  } catch (error) {
    await cleanupNative(current);
    if (hadCurrent) await FileSystem.moveAsync({ from: previous, to: current });
    throw error;
  }
  await cleanupNative(previous);
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error(unavailableMessage)); return; }
    const request = indexedDB.open(databaseName, 1);
    let rejected = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore("metadata");
      request.result.createObjectStore("voices");
    };
    request.onerror = () => { rejected = true; reject(request.error ?? new Error(saveFailureMessage)); };
    request.onblocked = () => { rejected = true; reject(new Error(unavailableMessage)); };
    request.onsuccess = () => {
      const database = request.result;
      if (rejected) { database.close(); return; }
      database.onversionchange = () => { database.close(); databasePromise = null; };
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
    request.onerror = () => reject(request.error ?? new Error(saveFailureMessage));
  });
}

async function webTransaction<T>(mode: IDBTransactionMode, operation: (transaction: IDBTransaction) => Promise<T>): Promise<T> {
  const database = await openDatabase();
  const current = database.transaction(["metadata", "voices"], mode);
  const completed = new Promise<void>((resolve, reject) => {
    current.oncomplete = () => resolve();
    current.onabort = () => reject(current.error ?? new Error(saveFailureMessage));
  });
  void completed.catch(() => undefined);
  try {
    const result = await operation(current);
    await completed;
    return result;
  } catch (error) {
    try { current.abort(); } catch { /* The transaction has already completed or aborted. */ }
    await completed.catch(() => undefined);
    throw error;
  }
}

async function readWebLibrary(current: IDBTransaction): Promise<VoiceLibrary> {
  const value: unknown = await requestResult(current.objectStore("metadata").get("library"));
  return value === undefined ? emptyVoiceLibrary() : parseVoiceLibrary(value);
}

function writeWebLibrary(current: IDBTransaction, state: VoiceLibrary) {
  return requestResult(current.objectStore("metadata").put(parseVoiceLibrary(state), "library"));
}

async function updateLibrary(update: (state: VoiceLibrary) => VoiceLibrary): Promise<void> {
  await serialized(async () => {
    if (Platform.OS === "web") {
      await webTransaction("readwrite", async (current) => writeWebLibrary(current, update(await readWebLibrary(current))));
    } else {
      await writeNativeLibrary(update(await readNativeLibrary()));
    }
  });
  changed();
}

function newMetadata(asset: DocumentPicker.DocumentPickerAsset, size: number, folderId: string | null): VoiceMetadata {
  const type = audioFileType(asset.name, asset.mimeType);
  if (!type) throw new Error("音声ファイルを選択してください。");
  const id = `voice-${Date.now()}-${sequence++}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  const voice = parseVoiceLibrary({ ...emptyVoiceLibrary(), voices: [{
    id, fileName: `${id}.${type.extension}`, name: voiceDisplayName(asset.name.trim().slice(0, VOICE_NAME_LIMIT)),
    originalName: asset.name, size, mimeType: type.mimeType, folderIds: [],
  }] }).voices[0];
  return { ...voice, folderIds: folderId === null ? [] : [folderId] };
}

async function storeNativeAsset(asset: DocumentPicker.DocumentPickerAsset, state: VoiceLibrary, folderId: string | null): Promise<VoiceLibrary> {
  const voice = newMetadata(asset, asset.size ?? 1, folderId);
  const destination = `${nativeDirectory()}${voice.fileName}`;
  try {
    await FileSystem.makeDirectoryAsync(nativeDirectory(), { intermediates: true });
    await FileSystem.copyAsync({ from: asset.uri, to: destination });
    const info = await FileSystem.getInfoAsync(destination);
    if (!info.exists || info.isDirectory || !Number.isSafeInteger(info.size) || info.size <= 0) throw new Error(saveFailureMessage);
    voice.size = info.size;
    const saved = { ...state, voices: [...state.voices, voice] };
    await writeNativeLibrary(saved);
    return saved;
  } catch (error) {
    await cleanupNative(destination);
    throw error;
  }
}

async function storeWebAsset(asset: DocumentPicker.DocumentPickerAsset, folderId: string | null): Promise<boolean> {
  if (!(asset.file instanceof Blob)) throw new Error(saveFailureMessage);
  const voice = newMetadata(asset, asset.file.size, folderId);
  const blob = asset.file.type === voice.mimeType ? asset.file : asset.file.slice(0, asset.file.size, voice.mimeType);
  const matching = (state: VoiceLibrary) => state.voices.filter((candidate) => candidate.originalName === asset.name
    && (candidate.size === blob.size || candidate.sourceFingerprint?.size === blob.size));
  let originalHash: string | undefined;
  // Reading Blob bytes is asynchronous and must finish outside an IndexedDB
  // transaction. Recheck candidate IDs before committing so another window's
  // imports/deletions cannot make the comparison snapshot stale.
  for (;;) {
    const candidates = await webTransaction("readonly", async (current) => {
      const state = await readWebLibrary(current);
      requireFolder(state, folderId);
      return Promise.all(matching(state).map(async (candidate) => {
        const bytes: unknown = await requestResult(current.objectStore("voices").get(candidate.id));
        if (!(bytes instanceof Blob) || bytes.size !== candidate.size) throw new Error(invalidVoiceLibraryMessage);
        return { id: candidate.id, fileName: candidate.fileName, blob: bytes, sourceFingerprint: candidate.sourceFingerprint };
      }));
    });
    let duplicate = false;
    for (const candidate of candidates) {
      if (await sameBlobContent(blob, candidate.blob)) { duplicate = true; break; }
      if (candidate.sourceFingerprint?.size === blob.size) {
        originalHash ??= (await fingerprintVoiceBlob(blob)).sha256;
        if (originalHash === candidate.sourceFingerprint.sha256) { duplicate = true; break; }
      }
    }
    const candidateIds = new Set(candidates.map((candidate) => `${candidate.id}:${candidate.fileName}`));
    const committed = await webTransaction(duplicate ? "readonly" : "readwrite", async (current) => {
      const state = await readWebLibrary(current);
      requireFolder(state, folderId);
      const latest = matching(state);
      if (latest.length !== candidateIds.size || latest.some((candidate) => !candidateIds.has(`${candidate.id}:${candidate.fileName}`))) return false;
      if (!duplicate) {
        await requestResult(current.objectStore("voices").add(blob, voice.id));
        await writeWebLibrary(current, { ...state, voices: [...state.voices, voice] });
      }
      return true;
    });
    if (committed) return !duplicate;
  }
}

async function backupSnapshot(): Promise<VoiceBackupSnapshot> {
  if (Platform.OS === "web") {
    return webTransaction("readonly", async (current) => {
      const library = await readWebLibrary(current);
      const files = await Promise.all(library.voices.map(async (voice) => {
        const blob: unknown = await requestResult(current.objectStore("voices").get(voice.id));
        if (!(blob instanceof Blob) || blob.size !== voice.size) throw new Error(invalidVoiceLibraryMessage);
        return { id: voice.id, blob };
      }));
      return { library, files };
    });
  }
  const library = await readNativeLibrary();
  const files = [];
  for (const voice of library.voices) {
    const uri = `${nativeDirectory()}${voice.fileName}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || info.size !== voice.size) throw new Error(invalidVoiceLibraryMessage);
    files.push({ id: voice.id, uri });
  }
  return { library, files };
}

function releaseObjectUrls() {
  objectUrls.forEach((uri) => URL.revokeObjectURL(uri));
  objectUrls.clear();
  objectUrlSources.clear();
}

async function prepareVoiceRestore(input: VoiceLibrary, files: readonly VoiceBackupFile[]): Promise<PreparedVoiceRestore> {
  const library = parseVoiceLibrary(input);
  if (!Array.isArray(files) || files.length !== library.voices.length || new Set(files.map((file) => file?.id)).size !== files.length) {
    throw new Error(invalidVoiceLibraryMessage);
  }
  const byId = new Map(files.map((file) => [file?.id, file]));
  if (library.voices.some((voice) => !byId.has(voice.id))) throw new Error(invalidVoiceLibraryMessage);
  if (Platform.OS === "web") {
    const incoming = library.voices.map((voice) => {
      const blob = byId.get(voice.id)?.blob;
      if (!(blob instanceof Blob) || blob.size !== voice.size) throw new Error(invalidVoiceLibraryMessage);
      return { id: voice.id, blob: blob.slice(0, blob.size, voice.mimeType) };
    });
    const previous = await webTransaction("readonly", async (current) => {
      const raw: unknown = await requestResult(current.objectStore("metadata").get("library"));
      const keys = await requestResult(current.objectStore("voices").getAllKeys());
      const blobs = await requestResult(current.objectStore("voices").getAll());
      return { raw, keys, blobs };
    });
    let active = false;
    let closed = false;
    return {
      async activate() {
        if (active || closed) return;
        await webTransaction("readwrite", async (current) => {
          const store = current.objectStore("voices");
          await requestResult(store.clear());
          for (const file of incoming) await requestResult(store.put(file.blob, file.id));
          await writeWebLibrary(current, library);
        });
        active = true;
      },
      async rollback() {
        if (closed) return;
        if (active) await webTransaction("readwrite", async (current) => {
          const store = current.objectStore("voices");
          await requestResult(store.clear());
          for (const [index, key] of previous.keys.entries()) await requestResult(store.put(previous.blobs[index], key));
          const metadata = current.objectStore("metadata");
          if (previous.raw === undefined) await requestResult(metadata.delete("library"));
          else await requestResult(metadata.put(previous.raw, "library"));
        });
        closed = true;
      },
      async finalize() {
        if (closed) return;
        closed = true;
        if (active) { releaseObjectUrls(); changed(); }
      },
    };
  }

  const token = `${Date.now()}-${sequence++}-${Math.random().toString(36).slice(2)}`;
  const live = nativeDirectory();
  const stage = `${FileSystem.documentDirectory}voices-restore-${token}/`;
  const previous = `${FileSystem.documentDirectory}voices-previous-${token}/`;
  try {
    await FileSystem.makeDirectoryAsync(`${stage}.metadata/`, { intermediates: true });
    for (const voice of library.voices) {
      const source = byId.get(voice.id)?.uri;
      if (typeof source !== "string" || !source.startsWith("file://")) throw new Error(invalidVoiceLibraryMessage);
      const destination = `${stage}${voice.fileName}`;
      await FileSystem.copyAsync({ from: source, to: destination });
      const info = await FileSystem.getInfoAsync(destination);
      if (!info.exists || info.isDirectory || info.size !== voice.size) throw new Error(invalidVoiceLibraryMessage);
    }
    await FileSystem.writeAsStringAsync(`${stage}.metadata/current.json`, JSON.stringify(library));
  } catch (error) {
    await cleanupNative(stage);
    throw error;
  }
  let state: "prepared" | "active" | "recovering" | "closed" = "prepared";
  let previousMoved = false;
  let installationAttempted = false;
  const rollback = async () => {
    if (state === "closed") return;
    state = "recovering";
    if (previousMoved) {
      const info = await FileSystem.getInfoAsync(previous);
      if (!info.exists || !info.isDirectory) throw new Error(invalidVoiceLibraryMessage);
      await FileSystem.deleteAsync(live, { idempotent: true });
      await FileSystem.moveAsync({ from: previous, to: live });
      previousMoved = false;
    } else if (installationAttempted) {
      await FileSystem.deleteAsync(live, { idempotent: true });
    }
    installationAttempted = false;
    state = "closed";
    await cleanupNative(stage);
  };
  return {
    async activate() {
      if (state !== "prepared") return;
      try {
        const info = await FileSystem.getInfoAsync(live);
        if (info.exists) {
          if (!info.isDirectory) throw new Error(invalidVoiceLibraryMessage);
          await FileSystem.moveAsync({ from: live, to: previous });
          previousMoved = true;
        }
        installationAttempted = true;
        await FileSystem.moveAsync({ from: stage, to: live });
        state = "active";
      } catch (error) {
        try { await rollback(); } catch (rollbackError) { console.warn("Could not roll back a voice restore", rollbackError); }
        throw error;
      }
    },
    rollback,
    async finalize() {
      if (state === "closed" || state === "recovering") return;
      const active = state === "active";
      if (active) await cleanupNative(previous);
      state = "closed";
      await cleanupNative(stage);
      if (active) changed();
    },
  };
}

/** Caller owns the operation queue; each item commits independently for retries. */
async function removeStoredVoice(id: string): Promise<void> {
  if (Platform.OS === "web") {
    await webTransaction("readwrite", async (current) => {
      const state = await readWebLibrary(current);
      if (!state.voices.some((voice) => voice.id === id)) throw new Error("ボイスが見つかりません。");
      await requestResult(current.objectStore("voices").delete(id));
      await writeWebLibrary(current, { ...state, voices: state.voices.filter((voice) => voice.id !== id) });
    });
    const uri = objectUrls.get(id);
    if (uri) { URL.revokeObjectURL(uri); objectUrls.delete(id); }
    objectUrlSources.delete(id);
  } else {
    const state = await readNativeLibrary();
    const voice = state.voices.find((item) => item.id === id);
    if (!voice) throw new Error("ボイスが見つかりません。");
    await writeNativeLibrary({ ...state, voices: state.voices.filter((item) => item.id !== id) });
    // Commit removal before cleanup so a failed metadata write never loses audio.
    await cleanupNative(`${nativeDirectory()}${voice.fileName}`);
  }
}

async function processStoredVoice(id: string, targetLufs?: number, signal?: AbortSignal): Promise<VoiceLoudnessAnalysis> {
  if (importing || processing || backupBusy) throw new Error("ボイスを処理中です。完了してからもう一度お試しください。");
  if (targetLufs !== undefined) validateVoiceLoudnessTarget(targetLufs);
  processing = true;
  try {
    const result = await serialized(async () => {
      const web = Platform.OS === "web";
      const state = web ? await webTransaction("readonly", readWebLibrary) : await readNativeLibrary();
      const voice = state.voices.find((item) => item.id === id);
      if (!voice) throw new Error("ボイスが見つかりません。");
      let originalBlob: Blob | undefined;
      if (web) {
        const bytes: unknown = await webTransaction("readonly", (current) => requestResult(current.objectStore("voices").get(id)));
        if (!(bytes instanceof Blob) || bytes.size !== voice.size) throw new Error(invalidVoiceLibraryMessage);
        originalBlob = bytes;
      }
      const sourceUri = originalBlob ? URL.createObjectURL(originalBlob) : `${nativeDirectory()}${voice.fileName}`;
      let output: { uri?: string; blob?: Blob; format: "m4a"; analysis: VoiceLoudnessAnalysis } | undefined;
      let destination: string | undefined;
      let committed = false;
      try {
        if (signal?.aborted) throw new Error("音量の処理をキャンセルしました。");
        // No decoder or native job is created until this explicit operation.
        let fingerprint = voice.sourceFingerprint;
        let analysis: VoiceLoudnessAnalysis;
        if (targetLufs === undefined) analysis = await analyzeVoiceAudio(sourceUri, signal);
        else {
          fingerprint ??= originalBlob ? await fingerprintVoiceBlob(originalBlob) : await fingerprintVoiceFile(sourceUri);
          output = await normalizeVoiceAudio(sourceUri, targetLufs, signal);
          // Old native binaries must never have their WAV output relabeled as M4A.
          if (output.format !== "m4a") throw new Error(saveFailureMessage);
          analysis = output.analysis;
        }
        const loudness = parseVoiceLoudness({ analysis, targetLufs: targetLufs ?? voice.loudness?.targetLufs });
        if (signal?.aborted) throw new Error("音量の処理をキャンセルしました。");
        const fileName = targetLufs === undefined ? voice.fileName : `${voice.id}.loudness-${Date.now()}-${sequence++}.m4a`;
        const update = (latest: VoiceLibrary, size: number) => {
          if (signal?.aborted) throw new Error("音量の処理をキャンセルしました。");
          const live = latest.voices.find((item) => item.id === id);
          if (!live || live.fileName !== voice.fileName || live.size !== voice.size) {
            throw new Error("ボイスが変更されました。詳細を開き直してください。");
          }
          return { ...latest, voices: latest.voices.map((item) => item.id !== id ? item : {
            ...item, loudness, ...(output ? { fileName, size, mimeType: "audio/mp4", sourceFingerprint: fingerprint } : {}),
          }) };
        };
        if (web) {
          if (output && (!(output.blob instanceof Blob) || output.blob.type !== "audio/mp4" || output.blob.size <= 44)) throw new Error(saveFailureMessage);
          await webTransaction("readwrite", async (current) => {
            const latest = await readWebLibrary(current);
            const next = update(latest, output?.blob?.size ?? voice.size);
            if (output?.blob) await requestResult(current.objectStore("voices").put(output.blob, id));
            await writeWebLibrary(current, next);
          });
          committed = true;
          if (output) {
            const old = objectUrls.get(id);
            if (old) URL.revokeObjectURL(old);
            objectUrls.delete(id);
            objectUrlSources.delete(id);
          }
        } else {
          let size = voice.size;
          if (output) {
            if (!output.uri || !output.uri.startsWith("file://") || output.uri === sourceUri) throw new Error(saveFailureMessage);
            destination = `${nativeDirectory()}${fileName}`;
            await FileSystem.copyAsync({ from: output.uri, to: destination });
            const info = await FileSystem.getInfoAsync(destination);
            if (!info.exists || info.isDirectory || !Number.isSafeInteger(info.size) || info.size <= 44) throw new Error(saveFailureMessage);
            size = info.size;
          }
          // A unique destination keeps the old audio intact until metadata commits.
          await writeNativeLibrary(update(await readNativeLibrary(), size));
          committed = true;
          if (output) await cleanupNative(sourceUri);
        }
        return loudness.analysis;
      } finally {
        if (originalBlob) URL.revokeObjectURL(sourceUri);
        if (!committed && destination) await cleanupNative(destination);
        if (output?.uri && output.uri !== sourceUri && FileSystem.cacheDirectory && output.uri.startsWith(FileSystem.cacheDirectory)) {
          await cleanupNative(output.uri);
        }
      }
    });
    changed();
    return result;
  } finally { processing = false; }
}

export const voiceStorageService = {
  analyzeLoudness(id: string, signal?: AbortSignal): Promise<VoiceLoudnessAnalysis> {
    return processStoredVoice(id, undefined, signal);
  },
  normalizeLoudness(id: string, targetLufs: number, signal?: AbortSignal): Promise<VoiceLoudnessAnalysis> {
    return processStoredVoice(id, targetLufs, signal);
  },
  /** Hold the existing operation queue through the whole backup/restore transaction. */
  async withExclusiveBackup<T>(operation: (access: VoiceBackupAccess) => Promise<T>): Promise<T> {
    if (importing || processing || backupBusy) throw new Error("ボイスを処理中です。完了してからもう一度お試しください。");
    backupBusy = true;
    try { return await serialized(() => operation({ snapshot: backupSnapshot, prepareRestore: prepareVoiceRestore })); }
    finally { backupBusy = false; }
  },
  load(): Promise<VoiceLibrarySnapshot> {
    return serialized(async () => {
      if (Platform.OS !== "web") {
        const state = await readNativeLibrary();
        return { mode: state.mode, folders: state.folders, scope: state.scope, voices: state.voices.map(({ id, name, originalName, size, fileName, folderIds, loudness }) => ({
          id, name, originalName, size, folderIds, uri: `${nativeDirectory()}${fileName}`, ...(loudness ? { loudness } : {}),
        })) };
      }
      const { state, blobs } = await webTransaction("readonly", async (current) => {
        const state = await readWebLibrary(current);
        const blobs = await Promise.all(state.voices.map(async (voice) => {
          const blob: unknown = await requestResult(current.objectStore("voices").get(voice.id));
          if (!(blob instanceof Blob) || blob.size !== voice.size) throw new Error(invalidVoiceLibraryMessage);
          return blob;
        }));
        return { state, blobs };
      });
      return { mode: state.mode, folders: state.folders, scope: state.scope, voices: state.voices.map(({ id, name, originalName, size, fileName, folderIds, loudness }, index) => {
        let uri = objectUrls.get(id);
        const identity = `${fileName}:${size}`;
        if (uri && objectUrlSources.get(id) !== identity) { URL.revokeObjectURL(uri); uri = undefined; }
        if (!uri) { uri = URL.createObjectURL(blobs[index]); objectUrls.set(id, uri); objectUrlSources.set(id, identity); }
        return { id, name, originalName, size, folderIds, uri, ...(loudness ? { loudness } : {}) };
      }) };
    });
  },

  async importVoices(folderId: string | null = null): Promise<VoiceImportResult> {
    if (importing || processing || backupBusy) throw new Error("ボイスを処理中です。完了してからもう一度お試しください。");
    importing = true;
    let assets: DocumentPicker.DocumentPickerAsset[] = [];
    try {
      // Open the picker before any queued work to preserve browser user activation.
      const selected = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === "web" ? ["audio/*", ...VOICE_FILE_EXTENSIONS] : ["audio/*", "application/ogg", "application/octet-stream"],
        multiple: true, copyToCacheDirectory: true, base64: false,
      });
      if (selected.canceled || !selected.assets.length) return { added: 0, skipped: 0, failed: 0, canceled: true };
      assets = selected.assets;
      const result = await serialized(async () => {
        const web = Platform.OS === "web";
        // Reject corrupt library metadata before attempting any file writes.
        let state = web ? await webTransaction("readonly", readWebLibrary) : await readNativeLibrary();
        requireFolder(state, folderId);
        const result: VoiceImportResult = { added: 0, skipped: 0, failed: 0, canceled: false };
        for (const asset of assets) {
          try {
            if (!audioFileType(asset.name, asset.mimeType)) throw new Error("音声ファイルを選択してください。");
            if (web) {
              if (await storeWebAsset(asset, folderId)) result.added++;
              else result.skipped++;
            } else {
              let duplicate = false;
              let fingerprint: Awaited<ReturnType<typeof fingerprintVoiceFile>> | undefined;
              for (const candidate of state.voices.filter((voice) => voice.originalName === asset.name)) {
                if (await sameNativeFileContent(asset.uri, `${nativeDirectory()}${candidate.fileName}`)) { duplicate = true; break; }
                if (candidate.sourceFingerprint) {
                  fingerprint ??= await fingerprintVoiceFile(asset.uri);
                  if (fingerprint.size === candidate.sourceFingerprint.size && fingerprint.sha256 === candidate.sourceFingerprint.sha256) {
                    duplicate = true; break;
                  }
                }
              }
              if (duplicate) result.skipped++;
              else { state = await storeNativeAsset(asset, state, folderId); result.added++; }
            }
          } catch { result.failed++; }
        }
        return result;
      });
      if (result.added) changed();
      return result;
    } finally {
      if (Platform.OS === "web") for (const asset of assets) {
        if (asset.uri.startsWith("blob:")) URL.revokeObjectURL(asset.uri);
      }
      importing = false;
    }
  },

  async rename(id: string, input: string): Promise<void> {
    const name = voiceDisplayName(input);
    await updateLibrary((state) => {
      if (!state.voices.some((voice) => voice.id === id)) throw new Error("ボイスが見つかりません。");
      return { ...state, voices: state.voices.map((voice) => voice.id === id ? { ...voice, name } : voice) };
    });
  },

  move(id: string, direction: -1 | 1, scope: VoiceScope = "all"): Promise<void> {
    return updateLibrary((state) => {
      requireScope(state, scope);
      return { ...state, voices: moveVoice(state.voices, id, direction, scope) };
    });
  },

  async reorder(orderedIds: string[], scope: VoiceScope = "all"): Promise<void> {
    if (!Array.isArray(orderedIds)) throw new Error(invalidVoiceOrderMessage);
    const ids = [...orderedIds];
    return updateLibrary((state) => {
      requireScope(state, scope);
      return { ...state, voices: reorderVoices(state.voices, ids, scope) };
    });
  },

  async createFolder(input: string): Promise<VoiceFolder> {
    const name = voiceFolderName(input);
    const folder = { id: `folder-${Date.now()}-${sequence++}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`, name };
    await updateLibrary((state) => {
      requireUniqueFolderName(state, name);
      return { ...state, folders: [...state.folders, folder] };
    });
    return folder;
  },

  async renameFolder(id: string, input: string): Promise<void> {
    const name = voiceFolderName(input);
    await updateLibrary((state) => {
      requireFolder(state, id);
      requireUniqueFolderName(state, name, id);
      return { ...state, folders: state.folders.map((folder) => folder.id === id ? { ...folder, name } : folder) };
    });
  },

  removeFolder(id: string): Promise<void> {
    return updateLibrary((state) => {
      requireFolder(state, id);
      return { ...state, folders: state.folders.filter((folder) => folder.id !== id),
        voices: state.voices.map((voice) => voice.folderIds.includes(id) ? { ...voice, folderIds: voice.folderIds.filter((folderId) => folderId !== id) } : voice),
        scope: state.scope === id ? "unfiled" : state.scope };
    });
  },

  async setVoiceFolders(id: string, folderIds: string[]): Promise<void> {
    if (!Array.isArray(folderIds)) throw new Error(invalidVoiceLibraryMessage);
    const memberships = [...folderIds];
    if (memberships.some((folderId) => typeof folderId !== "string")
      || new Set(memberships).size !== memberships.length) throw new Error(invalidVoiceLibraryMessage);
    return updateLibrary((state) => {
      for (const folderId of memberships) requireFolder(state, folderId);
      if (!state.voices.some((voice) => voice.id === id)) throw new Error("ボイスが見つかりません。");
      return { ...state, voices: state.voices.map((voice) => voice.id === id ? { ...voice, folderIds: memberships } : voice) };
    });
  },

  setScope(scope: VoiceScope): Promise<void> {
    return updateLibrary((state) => {
      requireScope(state, scope);
      return { ...state, scope };
    });
  },

  async remove(id: string): Promise<void> {
    await serialized(() => removeStoredVoice(id));
    changed();
  },

  async removeMany(ids: readonly string[]): Promise<VoiceDeleteResult> {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id.length === 0)) throw new Error(invalidVoiceLibraryMessage);
    const targets = [...new Set(ids)];
    const result = await serialized(async () => {
      const result: VoiceDeleteResult = { removed: [], failed: [] };
      for (const id of targets) {
        try { await removeStoredVoice(id); result.removed.push(id); }
        catch { result.failed.push(id); }
      }
      return result;
    });
    if (result.removed.length > 0) changed();
    return result;
  },

  setMode(mode: VoicePlaybackMode): Promise<void> {
    return updateLibrary((state) => parseVoiceLibrary({ ...state, mode }));
  },

  async clear(): Promise<void> {
    if (importing) throw new Error("ボイスを処理中です。完了してからもう一度お試しください。");
    await serialized(async () => {
      if (Platform.OS === "web") {
        await webTransaction("readwrite", async (current) => {
          await requestResult(current.objectStore("voices").clear());
          await requestResult(current.objectStore("metadata").clear());
        });
        objectUrls.forEach((uri) => URL.revokeObjectURL(uri));
        objectUrls.clear();
      } else {
        await FileSystem.deleteAsync(nativeDirectory(), { idempotent: true });
      }
    });
    changed();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import {
  audioFileType, emptyVoiceLibrary, invalidVoiceLibraryMessage, moveVoice, normalizedVoiceFolderName, parseVoiceLibrary,
  VOICE_FILE_EXTENSIONS, VOICE_NAME_LIMIT, voiceDisplayName, voiceFolderName,
  type StoredVoice, type VoiceFolder, type VoiceLibrary, type VoiceMetadata, type VoicePlaybackMode, type VoiceScope,
} from "../features/voices/library";

export type { StoredVoice, VoiceFolder, VoicePlaybackMode, VoiceScope } from "../features/voices/library";
export type VoiceLibrarySnapshot = { voices: StoredVoice[]; mode: VoicePlaybackMode; folders: VoiceFolder[]; scope: VoiceScope };
export type VoiceImportResult = { added: number; failed: number; canceled: boolean };

const databaseName = "nino-room-voice-library-v1";
const saveFailureMessage = "ボイスを保存できませんでした。";
const unavailableMessage = "この環境ではボイスを保存できません。";
const listeners = new Set<() => void>();
const objectUrls = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();
let databasePromise: Promise<IDBDatabase> | null = null;
let importing = false;
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
    originalName: asset.name, size, mimeType: type.mimeType, folderId: null,
  }] }).voices[0];
  return { ...voice, folderId };
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

async function storeWebAsset(asset: DocumentPicker.DocumentPickerAsset, folderId: string | null) {
  if (!(asset.file instanceof Blob)) throw new Error(saveFailureMessage);
  const voice = newMetadata(asset, asset.file.size, folderId);
  const blob = asset.file.type === voice.mimeType ? asset.file : asset.file.slice(0, asset.file.size, voice.mimeType);
  await webTransaction("readwrite", async (current) => {
    const state = await readWebLibrary(current);
    requireFolder(state, folderId);
    await requestResult(current.objectStore("voices").add(blob, voice.id));
    await writeWebLibrary(current, { ...state, voices: [...state.voices, voice] });
  });
}

export const voiceStorageService = {
  load(): Promise<VoiceLibrarySnapshot> {
    return serialized(async () => {
      if (Platform.OS !== "web") {
        const state = await readNativeLibrary();
        return { mode: state.mode, folders: state.folders, scope: state.scope, voices: state.voices.map(({ id, name, originalName, size, fileName, folderId }) => ({
          id, name, originalName, size, folderId, uri: `${nativeDirectory()}${fileName}`,
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
      return { mode: state.mode, folders: state.folders, scope: state.scope, voices: state.voices.map(({ id, name, originalName, size, folderId }, index) => {
        let uri = objectUrls.get(id);
        if (!uri) { uri = URL.createObjectURL(blobs[index]); objectUrls.set(id, uri); }
        return { id, name, originalName, size, folderId, uri };
      }) };
    });
  },

  async importVoices(folderId: string | null = null): Promise<VoiceImportResult> {
    if (importing) throw new Error("ボイスを処理中です。完了してからもう一度お試しください。");
    importing = true;
    let assets: DocumentPicker.DocumentPickerAsset[] = [];
    try {
      // Open the picker before any queued work to preserve browser user activation.
      const selected = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === "web" ? ["audio/*", ...VOICE_FILE_EXTENSIONS] : ["audio/*", "application/ogg", "application/octet-stream"],
        multiple: true, copyToCacheDirectory: true, base64: false,
      });
      if (selected.canceled || !selected.assets.length) return { added: 0, failed: 0, canceled: true };
      assets = selected.assets;
      const result = await serialized(async () => {
        const web = Platform.OS === "web";
        // Reject corrupt library metadata before attempting any file writes.
        let state = web ? await webTransaction("readonly", readWebLibrary) : await readNativeLibrary();
        requireFolder(state, folderId);
        const result: VoiceImportResult = { added: 0, failed: 0, canceled: false };
        for (const asset of assets) {
          try {
            if (web) await storeWebAsset(asset, folderId);
            else state = await storeNativeAsset(asset, state, folderId);
            result.added++;
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
        voices: state.voices.map((voice) => voice.folderId === id ? { ...voice, folderId: null } : voice),
        scope: state.scope === id ? "unfiled" : state.scope };
    });
  },

  setVoiceFolder(id: string, folderId: string | null): Promise<void> {
    return updateLibrary((state) => {
      requireFolder(state, folderId);
      if (!state.voices.some((voice) => voice.id === id)) throw new Error("ボイスが見つかりません。");
      return { ...state, voices: state.voices.map((voice) => voice.id === id ? { ...voice, folderId } : voice) };
    });
  },

  setScope(scope: VoiceScope): Promise<void> {
    return updateLibrary((state) => {
      requireScope(state, scope);
      return { ...state, scope };
    });
  },

  async remove(id: string): Promise<void> {
    await serialized(async () => {
      if (Platform.OS === "web") {
        await webTransaction("readwrite", async (current) => {
          const state = await readWebLibrary(current);
          if (!state.voices.some((voice) => voice.id === id)) throw new Error("ボイスが見つかりません。");
          await requestResult(current.objectStore("voices").delete(id));
          await writeWebLibrary(current, { ...state, voices: state.voices.filter((voice) => voice.id !== id) });
        });
        const uri = objectUrls.get(id);
        if (uri) { URL.revokeObjectURL(uri); objectUrls.delete(id); }
      } else {
        const state = await readNativeLibrary();
        const voice = state.voices.find((item) => item.id === id);
        if (!voice) throw new Error("ボイスが見つかりません。");
        await writeNativeLibrary({ ...state, voices: state.voices.filter((item) => item.id !== id) });
        // Commit removal before cleanup so a failed metadata write never loses audio.
        await cleanupNative(`${nativeDirectory()}${voice.fileName}`);
      }
    });
    changed();
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

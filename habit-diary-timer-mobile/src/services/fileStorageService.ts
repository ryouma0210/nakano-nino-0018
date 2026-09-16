import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { base64ToBlob, webFileStorage } from "./webFileStorage";

const uploadDirectory = `${FileSystem.documentDirectory}private-room-files/`;
export type FilePurpose = "training" | "punishment";

function purposeDirectory(purpose: FilePurpose) {
  return `${uploadDirectory}${purpose}/`;
}

async function ensureDirectory() {
  const info = await FileSystem.getInfoAsync(uploadDirectory);
  if (!info.exists) await FileSystem.makeDirectoryAsync(uploadDirectory, { intermediates: true });
}

async function ensurePurposeDirectory(purpose: FilePurpose) {
  await ensureDirectory();
  const directory = purposeDirectory(purpose);
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
}

export type StoredFile = { name: string; uri: string; size: number; purpose: FilePurpose };
export type BackupStoredFile = { name: string; size: number; purpose: FilePurpose; mimeType: string; data: string };
export type RestoreStoredFile = Omit<BackupStoredFile, "data"> & (
  { uri: string; data?: never; blob?: never }
  | { data: string; uri?: never; blob?: never }
  | { blob: Blob; uri?: never; data?: never }
);
export type PreparedFileRestore = {
  activate: () => Promise<void>;
  rollback: () => Promise<void>;
  finalize: () => Promise<void>;
};
export type FileImportResult = { stored: number; failed: string[] };
export type FileImportProgress = { completed: number; total: number };
export type FileDeleteResult = { removed: StoredFile[]; failed: StoredFile[] };
type ProgressHandler = (progress: FileImportProgress) => void;
type FileImportState = { importing: boolean; progress: FileImportProgress | null; result: FileImportResult | null };
type FileDeleteState = { deleting: boolean; progress: FileImportProgress | null; result: FileDeleteResult | null };
let importState: FileImportState = { importing: false, progress: null, result: null };
let deleteState: FileDeleteState = { deleting: false, progress: null, result: null };
const importListeners = new Set<() => void>();
const deleteListeners = new Set<() => void>();
let maintenanceState = { active: false, revision: 0 };
const maintenanceListeners = new Set<() => void>();
const filesBusyMessage = "ファイルを処理中です。完了してからもう一度お試しください。";

function updateImportState(update: Partial<FileImportState>) {
  importState = { ...importState, ...update };
  importListeners.forEach((listener) => listener());
}

function updateDeleteState(update: Partial<FileDeleteState>) {
  deleteState = { ...deleteState, ...update };
  deleteListeners.forEach((listener) => listener());
}

function updateMaintenanceState(active: boolean) {
  maintenanceState = { active, revision: maintenanceState.revision + (active ? 0 : 1) };
  maintenanceListeners.forEach((listener) => listener());
}

let importSequence = 0;

function storedFileName(name: string) {
  const safeName = name.replace(/[\\/:*?"<>|]/g, "_");
  return `${Date.now()}_${importSequence++}_${safeName}`;
}

async function storeSelectedFiles<T extends { name: string }>(
  files: readonly T[],
  storeFile: (file: T) => Promise<void>,
  onProgress?: ProgressHandler,
): Promise<FileImportResult> {
  const result: FileImportResult = { stored: 0, failed: [] };
  onProgress?.({ completed: 0, total: files.length });
  // Copy one at a time to avoid loading several large videos into memory.
  for (const [index, file] of files.entries()) {
    try {
      await storeFile(file);
      result.stored++;
    } catch {
      result.failed.push(file.name);
    }
    onProgress?.({ completed: index + 1, total: files.length });
  }
  return result;
}

export function mimeTypeForName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg",
    pdf: "application/pdf",
  };
  return types[extension ?? ""] ?? "application/octet-stream";
}

function webAvailable() {
  return Platform.OS === "web";
}

function webPickFiles(purpose: FilePurpose, onProgress?: ProgressHandler): Promise<FileImportResult | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*,audio/*";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;
    function finish(value: FileImportResult | null) {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    }

    input.addEventListener("cancel", () => finish(null), { once: true });
    input.addEventListener("change", async () => {
      const selectedFiles = Array.from(input.files ?? []);
      if (selectedFiles.length === 0) {
        finish(null);
        return;
      }
      const result = await storeSelectedFiles(selectedFiles, async (file) => {
        await webFileStorage.put({
          name: storedFileName(file.name),
          blob: file,
          mimeType: file.type || mimeTypeForName(file.name),
          size: file.size,
          purpose,
        });
      }, onProgress);
      finish(result);
    }, { once: true });

    // Keep the picker within the button's user activation on the web.
    try {
      input.click();
    } catch (error) {
      input.remove();
      reject(error);
    }
  });
}

async function readFiles(directory: string, purpose: FilePurpose) {
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) return [];
  const names = await FileSystem.readDirectoryAsync(directory);
  const files = await Promise.all(names.map(async (name) => {
    const uri = `${directory}${encodeURIComponent(name)}`;
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (fileInfo.exists && fileInfo.isDirectory) return null;
    return { name, uri, purpose, size: fileInfo.exists && "size" in fileInfo ? fileInfo.size : 0 };
  }));
  return files.filter((file): file is StoredFile => file !== null);
}

let restoreSequence = 0;
const invalidRestoreFilesMessage = "格納ファイルのデータが不正です。";

function validateRestoreFiles(files: readonly RestoreStoredFile[]) {
  const names = new Set<string>();
  for (const file of files) {
    // Preserve names verbatim. Replacing separators can merge two unrelated files.
    if (!file || typeof file.name !== "string" || !file.name || file.name === "." || file.name === ".."
      || /[\\/\u0000-\u001f]/.test(file.name)
      || !["training", "punishment"].includes(file.purpose)
      || !Number.isSafeInteger(file.size) || file.size < 0
      || typeof file.mimeType !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(file.mimeType)
      || [typeof file.data === "string", typeof file.uri === "string", typeof Blob !== "undefined" && file.blob instanceof Blob].filter(Boolean).length !== 1
      || (file.blob !== undefined && (!webAvailable() || file.blob.size !== file.size))
      || (typeof file.uri === "string" && !file.uri.startsWith("file://") && !file.uri.startsWith("content://"))) {
      throw new Error(invalidRestoreFilesMessage);
    }
    const key = `${file.purpose}:${file.name}`;
    if (names.has(key)) throw new Error(invalidRestoreFilesMessage);
    names.add(key);
    // Legacy backups contain base64. Reject invalid or truncated data before touching live files.
    if (typeof file.data === "string") {
      const padding = file.data.endsWith("==") ? 2 : file.data.endsWith("=") ? 1 : 0;
      const firstPadding = file.data.indexOf("=");
      if (file.data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(file.data)
        || (firstPadding >= 0 && firstPadding !== file.data.length - padding)
        || file.data.length / 4 * 3 - padding !== file.size) throw new Error(invalidRestoreFilesMessage);
    }
  }
}

async function cleanupRestoreDirectory(uri: string) {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    // Cleanup failure must not turn a completed restoration into a reported failure.
    console.warn("Could not clean up a file restore directory", error);
  }
}

async function prepareRestore(files: readonly RestoreStoredFile[]): Promise<PreparedFileRestore> {
  validateRestoreFiles(files);
  if (webAvailable()) {
    const restored = files.map((file) => {
      const blob = file.blob ?? (typeof file.data === "string" ? base64ToBlob(file.data, file.mimeType, file.size) : undefined);
      if (!blob) throw new Error(invalidRestoreFilesMessage);
      return { name: file.name, size: file.size, purpose: file.purpose, mimeType: file.mimeType, blob };
    });
    return webFileStorage.prepareRestore(restored);
  }

  const token = `${Date.now()}-${restoreSequence++}-${Math.random().toString(36).slice(2)}`;
  const stageDirectory = `${FileSystem.documentDirectory}private-room-files-restore-${token}/`;
  const previousDirectory = `${FileSystem.documentDirectory}private-room-files-previous-${token}/`;
  try {
    await FileSystem.makeDirectoryAsync(stageDirectory, { intermediates: true });
    for (const purpose of ["training", "punishment"] as const) {
      await FileSystem.makeDirectoryAsync(`${stageDirectory}${purpose}/`, { intermediates: true });
    }
    for (const file of files) {
      // Encoding one path segment also preserves literal %, #, and ? in legacy names.
      const destination = `${stageDirectory}${file.purpose}/${encodeURIComponent(file.name)}`;
      if (typeof file.uri === "string") {
        await FileSystem.copyAsync({ from: file.uri, to: destination });
      } else if (typeof file.data === "string") {
        await FileSystem.writeAsStringAsync(destination, file.data, { encoding: FileSystem.EncodingType.Base64 });
      } else {
        throw new Error(invalidRestoreFilesMessage);
      }
      const info = await FileSystem.getInfoAsync(destination);
      if (!info.exists || info.isDirectory || info.size !== file.size) throw new Error(invalidRestoreFilesMessage);
    }
  } catch (error) {
    await cleanupRestoreDirectory(stageDirectory);
    throw error;
  }

  let state: "prepared" | "active" | "recovering" | "closed" = "prepared";
  let previousMoved = false;
  let installed = false;
  let installationAttempted = false;

  async function rollback() {
    if (state === "closed") return;
    state = "recovering";
    if (previousMoved) {
      // Never delete the original directory if rollback itself fails. It remains recoverable.
      const previousInfo = await FileSystem.getInfoAsync(previousDirectory);
      if (!previousInfo.exists || !previousInfo.isDirectory) throw new Error(invalidRestoreFilesMessage);
      await FileSystem.deleteAsync(uploadDirectory, { idempotent: true });
      await FileSystem.moveAsync({ from: previousDirectory, to: uploadDirectory });
      previousMoved = false;
    } else if (installed || installationAttempted) {
      await FileSystem.deleteAsync(uploadDirectory, { idempotent: true });
    }
    installed = false;
    installationAttempted = false;
    state = "closed";
    await cleanupRestoreDirectory(stageDirectory);
  }

  return {
    async activate() {
      if (state !== "prepared") return;
      try {
        const liveInfo = await FileSystem.getInfoAsync(uploadDirectory);
        if (liveInfo.exists) {
          if (!liveInfo.isDirectory) throw new Error(invalidRestoreFilesMessage);
          await FileSystem.moveAsync({ from: uploadDirectory, to: previousDirectory });
          previousMoved = true;
        }
        installationAttempted = true;
        await FileSystem.moveAsync({ from: stageDirectory, to: uploadDirectory });
        installed = true;
        state = "active";
      } catch (error) {
        try {
          await rollback();
        } catch (rollbackError) {
          // Retain both the original backup directory and this handle for a retry.
          console.warn("Could not roll back a file restore", rollbackError);
        }
        throw error;
      }
    },
    rollback,
    async finalize() {
      if (state === "closed" || state === "recovering") return;
      if (state === "active") await cleanupRestoreDirectory(previousDirectory);
      // A failed activation with an unfinished rollback must keep the original files.
      if (state === "prepared" && previousMoved) return;
      state = "closed";
      await cleanupRestoreDirectory(stageDirectory);
    },
  };
}

export const fileStorageService = {
  getImportState: () => importState,
  getDeleteState: () => deleteState,
  getMaintenanceState: () => maintenanceState,

  subscribeImports(listener: () => void) {
    importListeners.add(listener);
    return () => { importListeners.delete(listener); };
  },

  subscribeDeletes(listener: () => void) {
    deleteListeners.add(listener);
    return () => { deleteListeners.delete(listener); };
  },

  subscribeMaintenance(listener: () => void) {
    maintenanceListeners.add(listener);
    return () => { maintenanceListeners.delete(listener); };
  },

  async withExclusiveFiles<T>(operation: () => Promise<T>): Promise<T> {
    if (importState.importing || deleteState.deleting || maintenanceState.active) throw new Error(filesBusyMessage);
    updateMaintenanceState(true);
    try {
      return await operation();
    } finally {
      updateMaintenanceState(false);
    }
  },

  async list(purpose?: FilePurpose): Promise<StoredFile[]> {
    if (webAvailable()) {
      return (await webFileStorage.list())
        .filter((file) => !purpose || file.purpose === purpose)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    await ensureDirectory();
    const legacyFiles = await readFiles(uploadDirectory, "training");
    const trainingFiles = await readFiles(purposeDirectory("training"), "training");
    const punishmentFiles = await readFiles(purposeDirectory("punishment"), "punishment");
    return [...legacyFiles, ...trainingFiles, ...punishmentFiles]
      .filter((file) => !purpose || file.purpose === purpose)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async getBlob(file: Pick<StoredFile, "name" | "purpose">): Promise<Blob | undefined> {
    return webAvailable() ? webFileStorage.getBlob(file) : undefined;
  },

  async pickAndStore(purpose: FilePurpose = "training", onProgress?: ProgressHandler): Promise<FileImportResult | null> {
    // The import can outlive its screen when the user switches footer sections.
    if (maintenanceState.active) throw new Error(filesBusyMessage);
    if (importState.importing || deleteState.deleting) return null;
    updateImportState({ importing: true, progress: null, result: null });
    const reportProgress: ProgressHandler = (progress) => {
      updateImportState({ progress });
      onProgress?.(progress);
    };
    try {
      let stored: FileImportResult | null;
      if (webAvailable()) {
        stored = await webPickFiles(purpose, reportProgress);
      } else {
        const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
        if (result.canceled) return null;
        await ensurePurposeDirectory(purpose);
        stored = await storeSelectedFiles(result.assets, async (asset) => {
          const destination = `${purposeDirectory(purpose)}${storedFileName(asset.name)}`;
          try {
            await FileSystem.copyAsync({ from: asset.uri, to: destination });
          } catch (error) {
            // Remove a partial copy without affecting any successfully stored files.
            await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => {});
            throw error;
          }
        }, reportProgress);
      }
      updateImportState({ result: stored });
      return stored;
    } finally {
      updateImportState({ importing: false, progress: null });
    }
  },

  async remove(file: StoredFile) {
    if (webAvailable()) {
      await webFileStorage.remove(file);
      return;
    }
    await FileSystem.deleteAsync(file.uri, { idempotent: true });
  },

  async removeMany(files: readonly StoredFile[]): Promise<FileDeleteResult | null> {
    if (maintenanceState.active) throw new Error(filesBusyMessage);
    if (importState.importing || deleteState.deleting) return null;
    const result: FileDeleteResult = { removed: [], failed: [] };
    const uniqueFiles = [...new Map(files.map((file) => [`${file.purpose}:${file.name}`, file])).values()];
    updateDeleteState({ deleting: true, progress: { completed: 0, total: uniqueFiles.length }, result: null });
    try {
      for (const [index, file] of uniqueFiles.entries()) {
        try {
          await this.remove(file);
          result.removed.push(file);
        } catch {
          result.failed.push(file);
        }
        updateDeleteState({ progress: { completed: index + 1, total: uniqueFiles.length } });
      }
      updateDeleteState({ result });
      return result;
    } finally {
      updateDeleteState({ deleting: false, progress: null });
    }
  },

  async clear() {
    if (webAvailable()) {
      await webFileStorage.clear();
      return;
    }
    await FileSystem.deleteAsync(uploadDirectory, { idempotent: true });
    await ensureDirectory();
  },

  async totalSize() {
    return (await this.list()).reduce((sum, file) => sum + file.size, 0);
  },

  prepareRestore,

  async restoreFromBackup(files: BackupStoredFile[]) {
    const prepared = await prepareRestore(files);
    try {
      await prepared.activate();
    } catch (error) {
      await prepared.rollback();
      throw error;
    }
    await prepared.finalize();
  },
};

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const uploadDirectory = `${FileSystem.documentDirectory}private-room-files/`;
const webStorageKey = "nino-room-web-files-v2";
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

function mimeTypeForName(name: string) {
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
  return Platform.OS === "web" && typeof document !== "undefined" && typeof localStorage !== "undefined";
}

function webReadFiles(): StoredFile[] {
  try {
    return JSON.parse(localStorage.getItem(webStorageKey) ?? "[]") as StoredFile[];
  } catch {
    return [];
  }
}

function webWriteFiles(files: StoredFile[]) {
  // Quota errors must reach the caller; an unsuccessful write is not a save.
  localStorage.setItem(webStorageKey, JSON.stringify(files));
}

function readWebFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("ファイルを読み込めませんでした。"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("ファイルを読み込めませんでした。"));
    reader.onabort = () => reject(new Error("ファイルを読み込めませんでした。"));
    reader.readAsDataURL(file);
  });
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
        const uri = await readWebFile(file);
        const files = webReadFiles();
        files.push({
          name: storedFileName(file.name),
          uri,
          size: file.size,
          purpose,
        });
        webWriteFiles(files);
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
    const uri = `${directory}${name}`;
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (fileInfo.exists && fileInfo.isDirectory) return null;
    return { name, uri, purpose, size: fileInfo.exists && "size" in fileInfo ? fileInfo.size : 0 };
  }));
  return files.filter((file): file is StoredFile => file !== null);
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
      return webReadFiles()
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
      // Identical file contents share a data URL, but are separate stored entries.
      webWriteFiles(webReadFiles().filter((entry) => entry.name !== file.name || entry.purpose !== file.purpose));
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
      webWriteFiles([]);
      return;
    }
    await FileSystem.deleteAsync(uploadDirectory, { idempotent: true });
    await ensureDirectory();
  },

  async totalSize() {
    return (await this.list()).reduce((sum, file) => sum + file.size, 0);
  },

  async exportForBackup(): Promise<BackupStoredFile[]> {
    const files = await this.list();
    return Promise.all(files.map(async (file) => {
      const dataUrl = webAvailable() ? file.uri.match(/^data:([^;]+);base64,(.*)$/s) : null;
      return {
        name: file.name,
        size: file.size,
        purpose: file.purpose,
        mimeType: dataUrl?.[1] ?? mimeTypeForName(file.name),
        data: dataUrl?.[2] ?? await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 }),
      };
    }));
  },

  async restoreFromBackup(files: BackupStoredFile[]) {
    await this.clear();
    if (webAvailable()) {
      webWriteFiles(files.map((file) => ({
        name: file.name,
        size: file.size,
        purpose: file.purpose,
        uri: `data:${file.mimeType};base64,${file.data}`,
      })));
      return;
    }
    for (const file of files) {
      await ensurePurposeDirectory(file.purpose);
      const safeName = file.name.replace(/[\\/:*?"<>|]/g, "_");
      await FileSystem.writeAsStringAsync(`${purposeDirectory(file.purpose)}${safeName}`, file.data, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
  },
};

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

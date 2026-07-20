import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

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
  async list(purpose?: FilePurpose): Promise<StoredFile[]> {
    await ensureDirectory();
    const legacyFiles = await readFiles(uploadDirectory, "training");
    const trainingFiles = await readFiles(purposeDirectory("training"), "training");
    const punishmentFiles = await readFiles(purposeDirectory("punishment"), "punishment");
    return [...legacyFiles, ...trainingFiles, ...punishmentFiles]
      .filter((file) => !purpose || file.purpose === purpose)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async pickAndStore(purpose: FilePurpose = "training") {
    await ensurePurposeDirectory(purpose);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return false;
    const asset = result.assets[0];
    const safeName = asset.name.replace(/[\\/:*?"<>|]/g, "_");
    await FileSystem.copyAsync({ from: asset.uri, to: `${purposeDirectory(purpose)}${Date.now()}_${safeName}` });
    return true;
  },

  async remove(uri: string) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  },

  async clear() {
    await FileSystem.deleteAsync(uploadDirectory, { idempotent: true });
    await ensureDirectory();
  },

  async totalSize() {
    return (await this.list()).reduce((sum, file) => sum + file.size, 0);
  },
};

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

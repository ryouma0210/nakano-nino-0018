import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

const uploadDirectory = `${FileSystem.documentDirectory}private-room-files/`;

async function ensureDirectory() {
  const info = await FileSystem.getInfoAsync(uploadDirectory);
  if (!info.exists) await FileSystem.makeDirectoryAsync(uploadDirectory, { intermediates: true });
}

export type StoredFile = { name: string; uri: string; size: number };

export const fileStorageService = {
  async list(): Promise<StoredFile[]> {
    await ensureDirectory();
    const names = await FileSystem.readDirectoryAsync(uploadDirectory);
    const files = await Promise.all(names.map(async (name) => {
      const uri = `${uploadDirectory}${name}`;
      const info = await FileSystem.getInfoAsync(uri);
      return { name, uri, size: info.exists && "size" in info ? info.size : 0 };
    }));
    return files.sort((a, b) => a.name.localeCompare(b.name));
  },

  async pickAndStore() {
    await ensureDirectory();
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return false;
    const asset = result.assets[0];
    const safeName = asset.name.replace(/[\\/:*?"<>|]/g, "_");
    await FileSystem.copyAsync({ from: asset.uri, to: `${uploadDirectory}${Date.now()}_${safeName}` });
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

import type { FileSortOrder } from "./fileList";
import { FILE_USAGES, type FileUsage } from "./usages";

export const FILE_LIST_PREFERENCES_KEY = "file-list-preferences:v1";
export type FileListPreferences = {
  purpose: "all" | FileUsage;
  sort: FileSortOrder;
  columns: 1 | 2 | 3;
};
export const DEFAULT_FILE_LIST_PREFERENCES: FileListPreferences = {
  purpose: "all", sort: "newest", columns: 3,
};

export function parseFileListPreferences(raw: string | null): FileListPreferences {
  let value: unknown;
  try { value = raw === null ? null : JSON.parse(raw); } catch { value = null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_FILE_LIST_PREFERENCES };
  const saved = value as Record<string, unknown>;
  if (saved.version !== 1) return { ...DEFAULT_FILE_LIST_PREFERENCES };
  return {
    purpose: saved.purpose === "all" || FILE_USAGES.includes(saved.purpose as FileUsage)
      ? saved.purpose as FileListPreferences["purpose"] : DEFAULT_FILE_LIST_PREFERENCES.purpose,
    sort: ["newest", "oldest", "name", "size"].includes(saved.sort as string)
      ? saved.sort as FileSortOrder : DEFAULT_FILE_LIST_PREFERENCES.sort,
    columns: saved.columns === 1 || saved.columns === 2 || saved.columns === 3
      ? saved.columns : DEFAULT_FILE_LIST_PREFERENCES.columns,
  };
}

type PreferenceStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

export function createFileListPreferenceStore(storage: PreferenceStorage) {
  let pending: Promise<unknown> = Promise.resolve();
  return {
    async load() {
      // Reopening the screen must not read an older value while its last save is pending.
      await pending;
      return parseFileListPreferences(await storage.getItem(FILE_LIST_PREFERENCES_KEY));
    },
    save(preferences: FileListPreferences) {
      const payload = JSON.stringify({ version: 1, ...preferences });
      const operation = pending.then(() => storage.setItem(FILE_LIST_PREFERENCES_KEY, payload));
      // A failed write must not prevent later changes or retries from being saved.
      pending = operation.catch(() => undefined);
      return operation;
    },
  };
}

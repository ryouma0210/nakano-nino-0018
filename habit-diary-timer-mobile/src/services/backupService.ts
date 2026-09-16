import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";
import appConfig from "../../app.json";
import { execute, query, transaction } from "@/database/client";
import { fileStorageService, mimeTypeForName, type BackupStoredFile, type RestoreStoredFile } from "@/services/fileStorageService";
import { readBackupArchive, writeBackupArchive, type RandomAccessReader } from "./backupArchive";
import { backupEntryBlob, copyBackupEntry, createBackupOutput, createBackupStaging, invalidBackupMessage, openBackupSource, openNativeBackupWriter, readSmallBackup, type BackupSource } from "./backupIO";

const BACKUP_FORMAT = "nino-room-backup";
const BACKUP_VERSION = 1;
const ARCHIVE_VERSION = 2;
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_NATIVE_LEGACY_BYTES = 16 * 1024 * 1024;
const BACKUP_HISTORY_KEY = "nino-room:backup-export-info";
const storagePrefixes = ["habit-diary-timer:", "nino-room:"];
const tables = [
  "habits", "habit_schedules", "habit_records", "journals", "tags", "journal_tags",
  "timer_presets", "timer_histories", "app_settings", "preparation_records",
  "management_cycles", "management_daily_tasks", "reward_redemptions", "point_transactions",
  "tribute_records", "tribute_income_records",
] as const;
const deleteOrder = [...tables].reverse();

type BackupKind = "save" | "complete";
type BackupExportInfo = { exportedAt: string; kind: BackupKind };
type BackupPayload = {
  format: typeof BACKUP_FORMAT;
  version: number;
  kind: BackupKind;
  createdAt: string;
  appVersion: string;
  database: Record<string, Record<string, unknown>[]>;
  asyncStorage: Record<string, string>;
  files?: BackupStoredFile[];
};
type PickedBackup = { kind: BackupKind; payload: BackupPayload; files?: RestoreStoredFile[]; dispose: () => Promise<void> };
type ArchiveFile = Omit<BackupStoredFile, "data"> & { path: string };

function safeFileDate() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function collectStorage() {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key !== BACKUP_HISTORY_KEY && storagePrefixes.some((prefix) => key.startsWith(prefix)));
  const entries = await AsyncStorage.multiGet(keys);
  return Object.fromEntries(entries.filter((entry): entry is [string, string] => entry[1] !== null));
}

async function createPayload(kind: BackupKind): Promise<BackupPayload> {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kind,
    createdAt: new Date().toISOString(),
    appVersion: appConfig.expo.version,
    database: Object.fromEntries(tables.map((table) => [table, query<Record<string, unknown>>(`SELECT * FROM ${table}`)])),
    asyncStorage: await collectStorage(),
    ...(kind === "complete" ? { files: [] } : {}),
  };
}

function metadataBytes(value: unknown) {
  const text = JSON.stringify(value);
  if (text.length > MAX_MANIFEST_BYTES) throw new Error("バックアップのセーブデータが大きすぎます。");
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > MAX_MANIFEST_BYTES) throw new Error("バックアップのセーブデータが大きすぎます。");
  return bytes;
}

function memorySource(bytes: Uint8Array): RandomAccessReader {
  return { size: bytes.length, read: async (offset, length) => bytes.subarray(offset, offset + length) };
}

async function exportFile(kind: BackupKind) {
  const payload = await createPayload(kind);
  const files = kind === "complete" ? await fileStorageService.list() : [];
  const manifestFiles: ArchiveFile[] = [];
  for (const [index, file] of files.entries()) {
    const blob = await fileStorageService.getBlob(file);
    const source = await openBackupSource(file.uri, blob);
    try {
      manifestFiles.push({ name: file.name, purpose: file.purpose, size: source.size,
        mimeType: blob?.type || (file.uri.startsWith("data:") ? file.uri.slice(5, file.uri.indexOf(";")) : mimeTypeForName(file.name)),
        path: `files/${String(index).padStart(6, "0")}` });
    } finally { source.close(); }
  }
  if (kind === "complete") validateArchiveFiles(manifestFiles);
  const metadata = metadataBytes(kind === "complete" ? { ...payload, version: ARCHIVE_VERSION, files: manifestFiles } : payload);
  const output = await createBackupOutput(`nino-room-${kind}-${safeFileDate()}.${kind === "complete" ? "zip" : "json"}`,
    kind === "complete" ? "application/zip" : "application/json");
  let current: BackupSource | null = null;
  let currentIndex = -1;
  function closeCurrent() { current?.close(); current = null; }
  try {
    if (kind === "save") {
      await copyBackupEntry(memorySource(metadata), output.writer);
    } else {
      await writeBackupArchive([
        { name: "manifest.json", ...memorySource(metadata) },
        ...manifestFiles.map((file, index) => ({
          name: file.path, size: file.size,
          async read(offset: number, length: number) {
            if (currentIndex !== index) {
              closeCurrent();
              current = await openBackupSource(files[index].uri, await fileStorageService.getBlob(files[index]));
              currentIndex = index;
              if (current.size !== file.size) throw new Error(invalidBackupMessage);
            }
            return current!.read(offset, length);
          },
        })),
      ], output.writer);
    }
    closeCurrent();
    await output.finish();
  } catch (error) {
    await output.abort().catch((cleanupError) => console.warn("Could not remove incomplete backup", cleanupError));
    throw error;
  } finally { closeCurrent(); }
}

function validatePayload(value: unknown): BackupPayload {
  if (!value || typeof value !== "object") throw new Error("バックアップファイルの形式が正しくありません。");
  const payload = value as Partial<BackupPayload>;
  if (payload.format !== BACKUP_FORMAT || payload.version !== BACKUP_VERSION) {
    throw new Error("対応していないバックアップ形式またはバージョンです。");
  }
  if (payload.kind !== "save" && payload.kind !== "complete") throw new Error("バックアップの種類が不明です。");
  if (!payload.database || typeof payload.database !== "object" || Array.isArray(payload.database)
    || !payload.asyncStorage || typeof payload.asyncStorage !== "object" || Array.isArray(payload.asyncStorage)
    || Object.entries(payload.asyncStorage).some(([key, item]) => typeof item !== "string" || !storagePrefixes.some((prefix) => key.startsWith(prefix)))) {
    throw new Error("バックアップデータが不足しています。");
  }
  if (payload.kind === "complete" && !Array.isArray(payload.files)) throw new Error("格納ファイルのデータがありません。");
  for (const table of tables) {
    const rows = payload.database[table];
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row)
      || Object.entries(row).some(([column, item]) => !/^[a-zA-Z0-9_]+$/.test(column)
        || !(item === null || typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item)))))) {
      throw new Error(`${table}のデータが不正です。`);
    }
  }
  if (payload.files?.some((file) => !file || typeof file.name !== "string" || !["training", "punishment"].includes(file.purpose)
    || typeof file.mimeType !== "string" || typeof file.data !== "string" || typeof file.size !== "number")) {
    throw new Error("格納ファイルのデータが不正です。");
  }
  return payload as BackupPayload;
}

function validateArchiveFiles(value: unknown): asserts value is ArchiveFile[] {
  if (!Array.isArray(value) || value.length > 9999) throw new Error(invalidBackupMessage);
  const names = new Set<string>();
  for (const [index, file] of value.entries()) {
    if (!file || typeof file !== "object" || typeof file.name !== "string" || !file.name
      || file.name === "." || file.name === ".." || /[\\/\x00-\x1f\x7f]/.test(file.name)
      || !["training", "punishment"].includes(file.purpose) || typeof file.mimeType !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(file.mimeType)
      || !Number.isSafeInteger(file.size) || file.size < 0 || file.path !== `files/${String(index).padStart(6, "0")}`
      || names.has(`${file.purpose}/${file.name}`)) throw new Error(invalidBackupMessage);
    names.add(`${file.purpose}/${file.name}`);
  }
}

async function readArchive(source: BackupSource): Promise<PickedBackup> {
  const entries = await readBackupArchive(source);
  const manifestEntry = entries.find((entry) => entry.name === "manifest.json");
  if (!manifestEntry || manifestEntry.size > MAX_MANIFEST_BYTES) throw new Error(invalidBackupMessage);
  await manifestEntry.verify();
  const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readSmallBackup(manifestEntry, MAX_MANIFEST_BYTES)));
  if (!manifest || manifest.version !== ARCHIVE_VERSION || manifest.kind !== "complete") throw new Error(invalidBackupMessage);
  validateArchiveFiles(manifest.files);
  const payload = validatePayload({ ...manifest, version: BACKUP_VERSION, files: [] });
  if (entries.length !== manifest.files.length + 1) throw new Error(invalidBackupMessage);
  const archiveFiles = manifest.files as ArchiveFile[];
  const entryMap = new Map(entries.map((entry) => [entry.name, entry]));
  for (const file of archiveFiles) {
    if (entryMap.get(file.path)?.size !== file.size) throw new Error(invalidBackupMessage);
  }
  const stage = Platform.OS === "web" ? null : await createBackupStaging();
  const restored: RestoreStoredFile[] = [];
  try {
    for (const [index, file] of archiveFiles.entries()) {
      const entry = entryMap.get(file.path)!;
      await entry.verify();
      const { path: _path, ...metadata } = file;
      if (stage) {
        const uri = `${stage.uri}${index}`;
        const output = openNativeBackupWriter(uri);
        try { await copyBackupEntry(entry, output); } finally { output.close(); }
        restored.push({ ...metadata, uri });
      } else {
        restored.push({ ...metadata, blob: await backupEntryBlob(entry, file.mimeType) });
      }
    }
    return { kind: payload.kind, payload, files: restored, dispose: stage?.dispose ?? (async () => {}) };
  } catch (error) {
    await stage?.dispose().catch((cleanupError) => console.warn("Could not discard backup staging", cleanupError));
    throw error;
  }
}

async function readPickedBackup(): Promise<PickedBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "application/zip", "application/x-zip-compressed", "application/octet-stream"], copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const source = await openBackupSource(asset.uri, asset.file);
  try {
    const signature = await source.read(0, Math.min(4, source.size));
    if (signature[0] === 0x50 && signature[1] === 0x4b) return await readArchive(source);
    if (Platform.OS !== "web" && source.size > MAX_NATIVE_LEGACY_BYTES) {
      throw new Error("旧形式のバックアップが大きすぎます。この端末では読み込めません。元の端末で新しい完全バックアップを作成してください。");
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await readSmallBackup(source,
      Platform.OS === "web" ? 128 * 1024 * 1024 : MAX_NATIVE_LEGACY_BYTES));
    const payload = validatePayload(JSON.parse(text));
    return { kind: payload.kind, payload, dispose: async () => {} };
  } finally { source.close(); }
}

async function replaceStorage(storage: BackupPayload["asyncStorage"]) {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key !== BACKUP_HISTORY_KEY && storagePrefixes.some((prefix) => key.startsWith(prefix)));
  const entries = Object.entries(storage).filter(([key]) => key !== BACKUP_HISTORY_KEY);
  const removing = keys.filter((key) => !Object.hasOwn(storage, key));
  if (removing.length) await AsyncStorage.multiRemove(removing);
  if (entries.length) await AsyncStorage.multiSet(entries);
}

function restoreDatabase(database: BackupPayload["database"]) {
  transaction(() => {
    for (const table of deleteOrder) execute(`DELETE FROM ${table}`);
    for (const table of tables) {
      for (const row of database[table]) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        execute(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
          columns.map((column) => row[column] as string | number | null),
        );
      }
    }
  });
}

export const backupService = {
  async lastExport(): Promise<BackupExportInfo | null> {
    const raw = await AsyncStorage.getItem(BACKUP_HISTORY_KEY);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<BackupExportInfo> | null;
      if (!value || typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt))
        || (value.kind !== "save" && value.kind !== "complete")) return null;
      return { exportedAt: value.exportedAt, kind: value.kind };
    } catch {
      return null;
    }
  },

  async export(kind: BackupKind) {
    await fileStorageService.withExclusiveFiles(() => exportFile(kind));
    const info: BackupExportInfo = { exportedAt: new Date().toISOString(), kind };
    try {
      await AsyncStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(info));
      return { info, historySaved: true };
    } catch (error) {
      console.warn("Could not record backup export time", error);
      return { info, historySaved: false };
    }
  },

  pick: () => fileStorageService.withExclusiveFiles(readPickedBackup),

  async restore(backup: BackupPayload | PickedBackup) {
    const picked = "payload" in backup ? backup : null;
    try {
      const payload = validatePayload(picked ? picked.payload : backup);
      return await fileStorageService.withExclusiveFiles(async () => {
        const previous = await createPayload("save");
        const prepared = payload.kind === "complete" ? await fileStorageService.prepareRestore(picked?.files ?? payload.files ?? []) : null;
        let changingStorage = false;
        let databaseChanged = false;
        try {
          await prepared?.activate();
          changingStorage = true;
          await replaceStorage(payload.asyncStorage);
          databaseChanged = true;
          restoreDatabase(payload.database);
          await prepared?.finalize();
          return payload.kind;
        } catch (error) {
          const rollbackErrors: unknown[] = [];
          const retry: (() => Promise<void>)[] = [];
          // Settings and save data share localStorage's quota on Web. Free
          // changed settings before restoring the database and media pointer.
          for (const rollback of [
            async () => { if (changingStorage) await replaceStorage(previous.asyncStorage); },
            async () => { if (databaseChanged) restoreDatabase(previous.database); },
            async () => { await prepared?.rollback(); },
          ]) {
            try { await rollback(); } catch { retry.push(rollback); }
          }
          // Another rollback may have freed the space needed by a failed step.
          for (const rollback of retry) {
            try { await rollback(); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
          }
          if (rollbackErrors.length) {
            console.error("Backup restore rollback failed", { error, rollbackErrors });
            throw new Error("復元前のデータに戻せませんでした。アプリを閉じず、バックアップを保管してください。");
          }
          throw error;
        }
      });
    } finally {
      await picked?.dispose().catch((error) => console.warn("Could not remove restored backup staging", error));
    }
  },
};

export type { BackupKind, BackupPayload, BackupExportInfo, PickedBackup };

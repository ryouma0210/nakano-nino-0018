import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { execute, query, transaction } from "@/database/client";
import { fileStorageService, type BackupStoredFile } from "@/services/fileStorageService";

const BACKUP_FORMAT = "nino-room-backup";
const BACKUP_VERSION = 1;
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
    appVersion: "1.0.0",
    database: Object.fromEntries(tables.map((table) => [table, query<Record<string, unknown>>(`SELECT * FROM ${table}`)])),
    asyncStorage: await collectStorage(),
    ...(kind === "complete" ? { files: await fileStorageService.exportForBackup() } : {}),
  };
}

async function saveText(text: string, fileName: string) {
  if (Platform.OS === "web") {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error("共有画面を開けませんでした。");
  await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "バックアップを保存" });
}

function validatePayload(value: unknown): BackupPayload {
  if (!value || typeof value !== "object") throw new Error("バックアップファイルの形式が正しくありません。");
  const payload = value as Partial<BackupPayload>;
  if (payload.format !== BACKUP_FORMAT || payload.version !== BACKUP_VERSION) {
    throw new Error("対応していないバックアップ形式またはバージョンです。");
  }
  if (payload.kind !== "save" && payload.kind !== "complete") throw new Error("バックアップの種類が不明です。");
  if (!payload.database || typeof payload.database !== "object" || !payload.asyncStorage || typeof payload.asyncStorage !== "object") {
    throw new Error("バックアップデータが不足しています。");
  }
  if (payload.kind === "complete" && !Array.isArray(payload.files)) throw new Error("格納ファイルのデータがありません。");
  for (const table of tables) {
    const rows = payload.database[table];
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row)
      || Object.keys(row).some((column) => !/^[a-zA-Z0-9_]+$/.test(column)))) {
      throw new Error(`${table}のデータが不正です。`);
    }
  }
  if (payload.files?.some((file) => !file || typeof file.name !== "string" || !["training", "punishment"].includes(file.purpose)
    || typeof file.mimeType !== "string" || typeof file.data !== "string" || typeof file.size !== "number")) {
    throw new Error("格納ファイルのデータが不正です。");
  }
  return payload as BackupPayload;
}

async function readPickedBackup(): Promise<BackupPayload | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const text = Platform.OS === "web"
    ? await (await fetch(asset.uri)).text()
    : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
  return validatePayload(JSON.parse(text));
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
    const payload = await fileStorageService.withExclusiveFiles(() => createPayload(kind));
    const suffix = kind === "complete" ? "complete" : "save";
    await saveText(JSON.stringify(payload), `nino-room-${suffix}-${safeFileDate()}.json`);
    const info: BackupExportInfo = { exportedAt: new Date().toISOString(), kind };
    try {
      await AsyncStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(info));
      return { info, historySaved: true };
    } catch (error) {
      console.warn("Could not record backup export time", error);
      return { info, historySaved: false };
    }
  },

  pick: readPickedBackup,

  async restore(payload: BackupPayload) {
    return fileStorageService.withExclusiveFiles(async () => {
      restoreDatabase(payload.database);
      const existingKeys = (await AsyncStorage.getAllKeys()).filter((key) => key !== BACKUP_HISTORY_KEY && storagePrefixes.some((prefix) => key.startsWith(prefix)));
      if (existingKeys.length) await AsyncStorage.multiRemove(existingKeys);
      // Export history belongs to this device, so restoring an older backup must not replace it.
      const entries = Object.entries(payload.asyncStorage).filter(([key]) => key !== BACKUP_HISTORY_KEY);
      if (entries.length) await AsyncStorage.multiSet(entries);
      if (payload.kind === "complete") await fileStorageService.restoreFromBackup(payload.files ?? []);
      return payload.kind;
    });
  },
};

export type { BackupKind, BackupPayload, BackupExportInfo };

import AsyncStorage from "@react-native-async-storage/async-storage";
import { fileStorageService, type StoredFile } from "./fileStorageService";

import { CHASTITY_STORAGE_KEY, CHASTITY_MAX_NOTE_LENGTH, CHASTITY_STATUSES, isCalendarDate, parseChastityHistory,
  type ChastityCalendarDisplay, type ChastityDailyDetails, type ChastityRecord, type ChastityRecordInput, type SavedHistory } from "./chastityHistoryStorage";
export { CHASTITY_STORAGE_KEY, CHASTITY_MAX_NOTE_LENGTH, CHASTITY_STATUSES, CHASTITY_STATUS_LABELS, CHASTITY_STATUS_ICONS, parseChastityHistory } from "./chastityHistoryStorage";
export type { ChastityCalendarDisplay, ChastityDailyDetails, ChastityStatus, ChastityRecord, ChastityRecordInput } from "./chastityHistoryStorage";
export type ChastityHistorySnapshot = {
  records: ChastityRecord[];
  photos: Record<string, StoredFile>;
  dailyDetails: Record<string, ChastityDailyDetails>;
  calendarDisplay: ChastityCalendarDisplay;
};

let pendingOperation: Promise<void> = Promise.resolve();
let idSequence = 0;

function queueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingOperation.then(operation);
  pendingOperation = result.then(() => undefined, () => undefined);
  return result;
}

function validateInputDate(value: string) {
  const date = new Date();
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (!isCalendarDate(value) || value > today) throw new Error("日付は今日以前の正しい日付を指定してください。");
}

function snapshotInput(input: ChastityRecordInput): Required<ChastityRecordInput> {
  const { recordDate, status, note = "" } = input;
  validateInputDate(recordDate);
  if (!CHASTITY_STATUSES.includes(status)) throw new Error("状態を選択してください。");
  if (typeof note !== "string" || note.length > CHASTITY_MAX_NOTE_LENGTH) throw new Error("内容は4000文字以内で入力してください。");
  return { recordDate, status, note: note.trim() };
}

async function readHistory() {
  return parseChastityHistory(await AsyncStorage.getItem(CHASTITY_STORAGE_KEY));
}

function snapshot(data: SavedHistory, files: readonly StoredFile[]): ChastityHistorySnapshot {
  const byName = new Map(files.filter((file) => file.purpose === "chastity").map((file) => [file.name, file]));
  // Missing attachments (for example after a save-only restore) fall back to status icons.
  // Keep their names in storage so a later complete restore can recover the images.
  const photos: Record<string, StoredFile> = {};
  for (const [date, name] of Object.entries(data.photos)) {
    const file = byName.get(name);
    if (file) photos[date] = file;
  }
  return {
    records: [...data.records].sort((a, b) => b.recordDate.localeCompare(a.recordDate) || b.createdAt.localeCompare(a.createdAt)),
    photos,
    dailyDetails: data.dailyDetails,
    calendarDisplay: data.calendarDisplay,
  };
}

async function writeHistory(data: SavedHistory, files: readonly StoredFile[]) {
  await AsyncStorage.setItem(CHASTITY_STORAGE_KEY, JSON.stringify(data));
  return snapshot(data, files);
}

async function discardReplacedPhoto(file: StoredFile | undefined) {
  if (!file) return;
  try { await fileStorageService.remove(file); }
  catch (error) {
    // The new pointer already committed. Do not roll it back or delete the new photo.
    console.warn("Could not remove a previous daily photo", error);
  }
}

function mutateRecords(change: (records: ChastityRecord[]) => ChastityRecord[]) {
  return queueOperation(() => fileStorageService.withExclusiveFiles(async () => {
    const data = await readHistory();
    const files = await fileStorageService.list("chastity");
    return writeHistory({ ...data, records: change(data.records) }, files);
  }));
}

export const chastityHistoryService = {
  load(): Promise<ChastityHistorySnapshot> {
    return queueOperation(async () => snapshot(await readHistory(), await fileStorageService.list("chastity")));
  },

  async saveDailyDetails(recordDate: string, input: ChastityDailyDetails): Promise<ChastityHistorySnapshot> {
    validateInputDate(recordDate);
    // Read caller values before entering the queue, since forms may change while a write waits.
    const { limitLevel, limitState, feelings } = input;
    if (limitLevel !== null && (typeof limitLevel !== "number" || !Number.isInteger(limitLevel)
      || limitLevel < 1 || limitLevel > 100)) throw new Error("限界度合いは1〜100の整数で入力してください。");
    if (limitState !== undefined && (limitState !== "help" || limitLevel !== 100)) {
      throw new Error("状態を選択してください。");
    }
    if (typeof feelings !== "string" || feelings.length > CHASTITY_MAX_NOTE_LENGTH) {
      throw new Error("内容は4000文字以内で入力してください。");
    }
    const value: ChastityDailyDetails = { limitLevel, ...(limitState === "help" ? { limitState } : {}), feelings: feelings.trim() };
    return queueOperation(() => fileStorageService.withExclusiveFiles(async () => {
      const data = await readHistory();
      const files = await fileStorageService.list("chastity");
      const dailyDetails = { ...data.dailyDetails };
      if (value.limitLevel === null && !value.feelings) delete dailyDetails[recordDate];
      else dailyDetails[recordDate] = value;
      return writeHistory({ ...data, dailyDetails }, files);
    }));
  },

  async setCalendarDisplay(calendarDisplay: ChastityCalendarDisplay): Promise<ChastityHistorySnapshot> {
    if (calendarDisplay !== "icons" && calendarDisplay !== "photos") throw new Error("カレンダーの表示を選択してください。");
    return queueOperation(() => fileStorageService.withExclusiveFiles(async () => {
      const data = await readHistory();
      const files = await fileStorageService.list("chastity");
      return writeHistory({ ...data, calendarDisplay }, files);
    }));
  },

  async add(input: ChastityRecordInput): Promise<ChastityHistorySnapshot> {
    const value = snapshotInput(input);
    return mutateRecords((records) => {
      const timestamp = new Date().toISOString();
      let id: string;
      do { id = `${timestamp}-${++idSequence}-${Math.random().toString(36).slice(2, 10)}`; }
      while (records.some((record) => record.id === id));
      return [{ id, ...value, createdAt: timestamp, updatedAt: timestamp }, ...records];
    });
  },

  async update(id: string, input: ChastityRecordInput): Promise<ChastityHistorySnapshot> {
    const value = snapshotInput(input);
    return mutateRecords((records) => {
      if (!records.some((record) => record.id === id)) throw new Error("変更する記録が見つかりませんでした。");
      return records.map((record) => record.id === id ? { ...record, ...value, updatedAt: new Date().toISOString() } : record);
    });
  },

  remove(id: string): Promise<ChastityHistorySnapshot> {
    return mutateRecords((records) => {
      if (!records.some((record) => record.id === id)) throw new Error("削除する記録が見つかりませんでした。");
      // Images belong to dates, not individual records. Keep the day's shared attachment.
      return records.filter((record) => record.id !== id);
    });
  },

  async pickPhoto(recordDate: string): Promise<ChastityHistorySnapshot | null> {
    validateInputDate(recordDate);
    // Start the browser chooser synchronously within the button's user activation.
    return fileStorageService.pickImageAndStore("chastity", (file) => queueOperation(async () => {
      const data = await readHistory();
      const files = await fileStorageService.list("chastity");
      const previous = files.find((entry) => entry.name === data.photos[recordDate]);
      const next = await writeHistory({ ...data, photos: { ...data.photos, [recordDate]: file.name } }, files);
      await discardReplacedPhoto(previous);
      return next;
    }));
  },

  async removePhoto(recordDate: string): Promise<ChastityHistorySnapshot> {
    validateInputDate(recordDate);
    return queueOperation(() => fileStorageService.withExclusiveFiles(async () => {
      const data = await readHistory();
      const files = await fileStorageService.list("chastity");
      const previous = files.find((entry) => entry.name === data.photos[recordDate]);
      const photos = { ...data.photos };
      delete photos[recordDate];
      const next = await writeHistory({ ...data, photos }, files);
      await discardReplacedPhoto(previous);
      return next;
    }));
  },

  /** Called by settings reset while it holds fileStorageService.withExclusiveFiles. */
  clear(): Promise<void> {
    return queueOperation(async () => {
      const files = await fileStorageService.list("chastity");
      await AsyncStorage.removeItem(CHASTITY_STORAGE_KEY);
      // Also removes leftovers from an interrupted or failed previous attachment cleanup.
      for (const file of files) await fileStorageService.remove(file);
    });
  },
};

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "nino-room:disposal-history:v1";
export const DISPOSAL_MAX_COUNT = 9999;
export const DISPOSAL_MAX_NOTE_LENGTH = 4000;

export type DisposalRecord = {
  id: string;
  recordDate: string;
  count: number;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type DisposalRecordInput = Pick<DisposalRecord, "recordDate" | "count"> & { note?: string };

let pendingOperation: Promise<void> = Promise.resolve();
let idSequence = 0;

function queueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingOperation.then(operation);
  pendingOperation = result.then(() => undefined, () => undefined);
  return result;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return false;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function todayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= DISPOSAL_MAX_COUNT;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function isRecord(value: unknown): value is DisposalRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && record.id.length > 0
    && isCalendarDate(record.recordDate) && validCount(record.count)
    && typeof record.note === "string" && record.note.length <= DISPOSAL_MAX_NOTE_LENGTH
    && isTimestamp(record.createdAt) && isTimestamp(record.updatedAt);
}

function ordered(records: DisposalRecord[]): DisposalRecord[] {
  return records.sort((a, b) => b.recordDate.localeCompare(a.recordDate) || b.createdAt.localeCompare(a.createdAt));
}

async function readRecords(): Promise<DisposalRecord[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  let saved: unknown;
  try {
    saved = JSON.parse(raw);
  } catch {
    throw new Error("廃棄履歴の保存データを読み込めませんでした。");
  }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
    throw new Error("廃棄履歴の保存データを読み込めませんでした。");
  }
  const data = saved as Record<string, unknown>;
  if (data.version !== 1 || !Array.isArray(data.records) || !data.records.every(isRecord)
    || new Set(data.records.map((record) => record.id)).size !== data.records.length) {
    // Preserve corrupt storage so adding a new record cannot erase older history.
    throw new Error("廃棄履歴の保存データを読み込めませんでした。");
  }
  return ordered(data.records);
}

function snapshotInput(input: DisposalRecordInput): Required<DisposalRecordInput> {
  const { recordDate, count, note = "" } = input;
  if (!isCalendarDate(recordDate) || recordDate > todayKey()) {
    throw new Error("日付は今日以前の正しい日付を指定してください。");
  }
  if (!validCount(count)) throw new Error("回数は1〜9999の整数で入力してください。");
  if (typeof note !== "string" || note.length > DISPOSAL_MAX_NOTE_LENGTH) {
    throw new Error("内容は4000文字以内で入力してください。");
  }
  return { recordDate, count, note: note.trim() };
}

async function writeRecords(records: DisposalRecord[]): Promise<DisposalRecord[]> {
  const next = ordered(records);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, records: next }));
  return next;
}

export function getDailyDisposalCounts(records: readonly DisposalRecord[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const record of records) totals[record.recordDate] = (totals[record.recordDate] ?? 0) + record.count;
  return totals;
}

export const disposalHistoryService = {
  load(): Promise<DisposalRecord[]> {
    return queueOperation(readRecords);
  },

  async add(input: DisposalRecordInput): Promise<DisposalRecord[]> {
    // Capture the caller's values before waiting for any earlier write.
    const snapshot = snapshotInput(input);
    return queueOperation(async () => {
      const records = await readRecords();
      const timestamp = new Date().toISOString();
      let id: string;
      do {
        id = `${timestamp}-${++idSequence}-${Math.random().toString(36).slice(2, 10)}`;
      } while (records.some((record) => record.id === id));
      return writeRecords([{ id, ...snapshot, createdAt: timestamp, updatedAt: timestamp }, ...records]);
    });
  },

  async update(id: string, input: DisposalRecordInput): Promise<DisposalRecord[]> {
    const snapshot = snapshotInput(input);
    return queueOperation(async () => {
      const records = await readRecords();
      if (!records.some((record) => record.id === id)) throw new Error("変更する記録が見つかりませんでした。");
      return writeRecords(records.map((record) => record.id === id
        ? { ...record, ...snapshot, updatedAt: new Date().toISOString() }
        : record));
    });
  },

  remove(id: string): Promise<DisposalRecord[]> {
    return queueOperation(async () => {
      const records = await readRecords();
      if (!records.some((record) => record.id === id)) throw new Error("削除する記録が見つかりませんでした。");
      return writeRecords(records.filter((record) => record.id !== id));
    });
  },

  clear(): Promise<void> {
    return queueOperation(() => AsyncStorage.removeItem(STORAGE_KEY));
  },
};

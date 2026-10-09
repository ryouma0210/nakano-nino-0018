export const CHASTITY_STORAGE_KEY = "nino-room:chastity-history:v1";
export const CHASTITY_MAX_NOTE_LENGTH = 4000;
export const CHASTITY_STATUSES = ["locked", "wetDream", "ejaculation", "washing"] as const;
export type ChastityStatus = typeof CHASTITY_STATUSES[number];
export const CHASTITY_STATUS_LABELS: Record<ChastityStatus, string> = {
  locked: "ロック済", wetDream: "夢精", ejaculation: "射精", washing: "洗浄",
};
export const CHASTITY_STATUS_ICONS: Record<ChastityStatus, string> = {
  locked: "🔒", wetDream: "💦", ejaculation: "×", washing: "🚿",
};
export type ChastityRecord = {
  id: string;
  recordDate: string;
  status: ChastityStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
};
export type ChastityRecordInput = Pick<ChastityRecord, "recordDate" | "status"> & { note?: string };
export type ChastityDailyDetails = { limitLevel: number | null; limitState?: "help"; feelings: string };
export type ChastityCalendarDisplay = "icons" | "photos";
export type SavedHistory = {
  version: 1;
  records: ChastityRecord[];
  photos: Record<string, string>;
  dailyDetails: Record<string, ChastityDailyDetails>;
  calendarDisplay: ChastityCalendarDisplay;
};

const invalidHistoryMessage = "貞操帯管理記録の保存データを読み込めませんでした。";

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return false;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function isRecord(value: unknown): value is ChastityRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && record.id.length > 0 && isCalendarDate(record.recordDate)
    && CHASTITY_STATUSES.includes(record.status as ChastityStatus)
    && typeof record.note === "string" && record.note.length <= CHASTITY_MAX_NOTE_LENGTH
    && isTimestamp(record.createdAt) && isTimestamp(record.updatedAt);
}

function isDailyDetails(value: unknown): value is ChastityDailyDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const details = value as Record<string, unknown>;
  return (details.limitLevel === null || (typeof details.limitLevel === "number"
    && Number.isInteger(details.limitLevel) && details.limitLevel >= 1 && details.limitLevel <= 100))
    && (!Object.hasOwn(details, "limitState") || (details.limitState === "help" && details.limitLevel === 100))
    && typeof details.feelings === "string" && details.feelings.length <= CHASTITY_MAX_NOTE_LENGTH;
}

/** Validate before restoring a backup, without touching records or image files. */
export function parseChastityHistory(raw: string | null): SavedHistory {
  if (raw === null) return { version: 1, records: [], photos: {}, dailyDetails: {}, calendarDisplay: "icons" };
  let saved: unknown;
  try { saved = JSON.parse(raw); } catch { throw new Error(invalidHistoryMessage); }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error(invalidHistoryMessage);
  const data = saved as Record<string, unknown>;
  // Version 1 histories created before daily details remain valid without this field.
  const dailyDetails = Object.hasOwn(data, "dailyDetails") ? data.dailyDetails : {};
  if (data.version !== 1 || !Array.isArray(data.records) || !data.records.every(isRecord)
    || (data.calendarDisplay !== "icons" && data.calendarDisplay !== "photos")
    || new Set(data.records.map((record) => record.id)).size !== data.records.length
    || !data.photos || typeof data.photos !== "object" || Array.isArray(data.photos)
    || Object.entries(data.photos).some(([date, name]) => !isCalendarDate(date) || typeof name !== "string"
      || !name || name === "." || name === ".." || /[\\/\u0000-\u001f\u007f]/.test(name))
    || new Set(Object.values(data.photos)).size !== Object.keys(data.photos).length
    || !dailyDetails || typeof dailyDetails !== "object" || Array.isArray(dailyDetails)
    || Object.entries(dailyDetails).some(([date, details]) => !isCalendarDate(date) || !isDailyDetails(details))) {
    throw new Error(invalidHistoryMessage);
  }
  return {
    version: 1, records: data.records, photos: data.photos as Record<string, string>,
    dailyDetails: dailyDetails as Record<string, ChastityDailyDetails>, calendarDisplay: data.calendarDisplay,
  };
}

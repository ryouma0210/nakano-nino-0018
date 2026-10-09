import type { ChastityRecord, ChastityStatus } from "../../services/chastityHistoryService";
import { CHASTITY_STATUSES } from "../../services/chastityHistoryStorage";
import { hasRecordFilters, matchesRecordDate, recordFilterError, type RecordFilters } from "../records/filters";

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase();

export function selectChastityRecords(
  records: readonly ChastityRecord[],
  selectedDate: string,
  keyword: string,
  statusNames: Readonly<Record<ChastityStatus, readonly string[]>>,
  filters: Partial<RecordFilters> = {},
): ChastityRecord[] {
  if (recordFilterError(filters)) return [];
  const tokens = normalize(keyword).trim().split(/\s+/).filter(Boolean);
  const searching = hasRecordFilters({ ...filters, keyword });
  return records.filter((record) => {
    if (!matchesRecordDate(record.recordDate, filters) || (filters.recordType && record.status !== filters.recordType)) return false;
    if (!searching) return record.recordDate === selectedDate;
    const [year, month, day] = record.recordDate.split("-").map(Number);
    const fields = [
      record.note, record.status, ...statusNames[record.status], record.recordDate,
      record.recordDate.replaceAll("-", "/"), `${year}/${month}/${day}`, `${year}年${month}月${day}日`,
    ].map(normalize);
    return tokens.every((token) => fields.some((field) => field.includes(token)));
  }).sort((a, b) => b.recordDate.localeCompare(a.recordDate)
    || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export function getDailyChastityStatuses(records: readonly ChastityRecord[]): Record<string, ChastityStatus[]> {
  const days: Record<string, ChastityStatus[]> = {};
  for (const record of records) {
    const statuses = days[record.recordDate] ?? (days[record.recordDate] = []);
    if (!statuses.includes(record.status)) statuses.push(record.status);
  }
  for (const date of Object.keys(days)) {
    days[date] = CHASTITY_STATUSES.filter((status) => days[date].includes(status));
  }
  return days;
}

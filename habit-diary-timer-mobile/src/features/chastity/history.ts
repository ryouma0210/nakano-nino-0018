import type { ChastityRecord, ChastityStatus } from "../../services/chastityHistoryService";

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase();

export function selectChastityRecords(
  records: readonly ChastityRecord[],
  selectedDate: string,
  keyword: string,
  statusNames: Readonly<Record<ChastityStatus, readonly string[]>>,
): ChastityRecord[] {
  const tokens = normalize(keyword).trim().split(/\s+/).filter(Boolean);
  return records.filter((record) => {
    if (tokens.length === 0) return record.recordDate === selectedDate;
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
  return days;
}

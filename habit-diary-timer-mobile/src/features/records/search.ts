import type { Journal } from "../../types/models";
import type { DisposalRecord } from "../../services/disposalHistoryService";
import type { TributeRecord } from "../../repositories/tributeRepository";
import { hasRecordFilters, matchesRecordDate, matchesRecordTags, normalizeRecordSearch, recordFilterError, type RecordFilters } from "./filters";

function journalPriority(journal: Journal) {
  if (journal.tags?.includes("敗北部屋")) return 0;
  if (journal.tags?.includes("洗脳部屋")) return 1;
  if (journal.tags?.includes("準備部屋")) return 2;
  if (journal.tags?.includes("本日の命令")) return 3;
  if (journal.tags?.includes("射精管理")) return 4;
  if (journal.tags?.includes("調教") || journal.tags?.includes("射精記録")) return 5;
  if (journal.tags?.includes("お仕置き")) return 6;
  return 7;
}

/** The repository supplies keyword matches; searching must retain every date. */
export function selectJournalRecords(journals: readonly Journal[], selectedDate: string, keyword: string, filters: Partial<RecordFilters> = {}): Journal[] {
  if (recordFilterError(filters)) return [];
  const matching = journals.filter((journal) => matchesRecordDate(journal.record_date, filters)
    && (!filters.recordType || journal.record_type === filters.recordType) && matchesRecordTags(journal.tags, filters.tags));
  if (hasRecordFilters({ ...filters, keyword })) {
    return matching.sort((a, b) => b.record_date.localeCompare(a.record_date)
      || b.record_time.localeCompare(a.record_time) || b.id - a.id);
  }
  return matching.filter((journal) => journal.record_date === selectedDate).sort((a, b) => journalPriority(a) - journalPriority(b)
    || a.record_time.localeCompare(b.record_time) || a.id - b.id);
}

export function selectDisposalRecords(records: readonly DisposalRecord[], selectedDate: string, keyword: string, filters: Partial<RecordFilters> = {}): DisposalRecord[] {
  if (recordFilterError(filters)) return [];
  const tokens = normalizeRecordSearch(keyword).trim().split(/\s+/).filter(Boolean);
  const searching = hasRecordFilters({ ...filters, keyword });
  return records.filter((record) => {
    if (!matchesRecordDate(record.recordDate, filters)) return false;
    if (!searching) return record.recordDate === selectedDate;
    const [year, month, day] = record.recordDate.split("-").map(Number);
    const fields = [
      record.note, record.recordDate, record.recordDate.replaceAll("-", "/"),
      `${year}/${month}/${day}`, `${year}年${month}月${day}日`,
      String(record.count), `${record.count}回`, `${record.count} times`, `${record.count}회`, `${record.count}次`,
    ].map(normalizeRecordSearch);
    return tokens.every((token) => fields.some((field) => field.includes(token)));
  }).sort((a, b) => b.recordDate.localeCompare(a.recordDate) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export function selectTributeRecords(records: readonly TributeRecord[], selectedMonth: string,
  filters: RecordFilters, kind: "income" | "expense"): TributeRecord[] {
  if (recordFilterError(filters) || (filters.recordType && filters.recordType !== kind)) return [];
  const tokens = normalizeRecordSearch(filters.keyword).trim().split(/\s+/).filter(Boolean);
  const searching = hasRecordFilters(filters);
  return records.filter((record) => {
    if (!matchesRecordDate(record.record_date, filters)) return false;
    if (!searching && !record.record_date.startsWith(`${selectedMonth}-`)) return false;
    const [year, month, day] = record.record_date.split("-").map(Number);
    const fields = [record.comment ?? "", String(record.amount), record.amount.toLocaleString("ja-JP"),
      record.record_date, record.record_date.replaceAll("-", "/"), `${year}/${month}/${day}`, `${year}年${month}月${day}日`,
      ...(kind === "income" ? ["income", "追加収入"] : ["expense", "支出"])].map(normalizeRecordSearch);
    return tokens.every((token) => fields.some((field) => field.includes(token)));
  }).sort((a, b) => b.record_date.localeCompare(a.record_date) || b.id - a.id);
}

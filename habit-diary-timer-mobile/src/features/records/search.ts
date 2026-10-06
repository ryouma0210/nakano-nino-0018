import type { Journal } from "../../types/models";
import type { DisposalRecord } from "../../services/disposalHistoryService";

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
export function selectJournalRecords(journals: readonly Journal[], selectedDate: string, keyword: string): Journal[] {
  if (keyword.trim()) {
    return [...journals].sort((a, b) => b.record_date.localeCompare(a.record_date)
      || b.record_time.localeCompare(a.record_time) || b.id - a.id);
  }
  return journals.filter((journal) => journal.record_date === selectedDate).sort((a, b) => journalPriority(a) - journalPriority(b)
    || a.record_time.localeCompare(b.record_time) || a.id - b.id);
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

export function selectDisposalRecords(records: readonly DisposalRecord[], selectedDate: string, keyword: string): DisposalRecord[] {
  const tokens = normalize(keyword).trim().split(/\s+/).filter(Boolean);
  return records.filter((record) => {
    if (tokens.length === 0) return record.recordDate === selectedDate;
    const [year, month, day] = record.recordDate.split("-").map(Number);
    const fields = [
      record.note, record.recordDate, record.recordDate.replaceAll("-", "/"),
      `${year}/${month}/${day}`, `${year}年${month}月${day}日`,
      String(record.count), `${record.count}回`, `${record.count} times`, `${record.count}회`, `${record.count}次`,
    ].map(normalize);
    return tokens.every((token) => fields.some((field) => field.includes(token)));
  }).sort((a, b) => b.recordDate.localeCompare(a.recordDate) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

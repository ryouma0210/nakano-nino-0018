import { isDateKey } from "@nino/shared/date";
import { normalizeSearchText } from "@nino/shared/search";

export type RecordFilters = {
  keyword: string;
  fromDate: string;
  toDate: string;
  recordType: string;
  tags: string;
};

export const emptyRecordFilters: RecordFilters = {
  keyword: "", fromDate: "", toDate: "", recordType: "", tags: "",
};

export const journalFilterTypes = [
  { value: "diary", label: "日記" }, { value: "memo", label: "メモ" },
  { value: "review", label: "振り返り" }, { value: "goal", label: "目標" },
  { value: "health", label: "体調" }, { value: "free", label: "自由記録" },
] as const;
export const journalFilterTypeValues = journalFilterTypes.map((item) => item.value);
export const tributeFilterTypes = [
  { value: "expense", label: "支出" }, { value: "income", label: "追加収入" },
] as const;
export const tributeFilterTypeValues = tributeFilterTypes.map((item) => item.value);

export const isRecordFilterDate = isDateKey;

export function recordFilterError(filters: Partial<RecordFilters>): string {
  if ((filters.fromDate && !isRecordFilterDate(filters.fromDate)) || (filters.toDate && !isRecordFilterDate(filters.toDate))) {
    return "開始日・終了日は実在する日付をYYYY-MM-DD形式で入力してください。";
  }
  if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
    return "終了日は開始日以降の日付を指定してください。";
  }
  return "";
}

export function hasRecordFilters(filters: Partial<RecordFilters>): boolean {
  return Object.values(filters).some((value) => typeof value === "string" && value.trim().length > 0);
}

export function matchesRecordDate(date: string, filters: Partial<RecordFilters>): boolean {
  return (!filters.fromDate || date >= filters.fromDate) && (!filters.toDate || date <= filters.toDate);
}

export const normalizeRecordSearch = normalizeSearchText;

export function matchesRecordTags(tags: string | null, query = ""): boolean {
  const actual = new Set((tags ?? "").split(/[,、]/).map((tag) => normalizeRecordSearch(tag.trim())).filter(Boolean));
  return query.split(/[,、]/).map((tag) => normalizeRecordSearch(tag.trim())).filter(Boolean).every((tag) => actual.has(tag));
}

export function sanitizeRecordFilters(value: unknown, allowedTypes: readonly string[], supportsTags: boolean): RecordFilters {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const read = (key: keyof RecordFilters) => typeof input[key] === "string" ? input[key] as string : "";
  return {
    keyword: read("keyword"), fromDate: read("fromDate"), toDate: read("toDate"),
    recordType: allowedTypes.includes(read("recordType")) ? read("recordType") : "",
    tags: supportsTags ? read("tags") : "",
  };
}

export function recordFiltersFromParams(params: Record<string, string | string[] | undefined>): Partial<RecordFilters> | null {
  const filters: Partial<RecordFilters> = {};
  for (const key of Object.keys(emptyRecordFilters) as (keyof RecordFilters)[]) {
    const value = params[key];
    if (value !== undefined) filters[key] = Array.isArray(value) ? value[0] ?? "" : value;
  }
  return Object.keys(filters).length > 0 ? filters : null;
}

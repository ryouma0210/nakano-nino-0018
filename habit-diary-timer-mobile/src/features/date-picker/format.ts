import { isDateKey, isMonthKey } from "@nino/shared/date";
import type { AppLanguage } from "@/i18n";
import type { DatePickerMode } from "./model";

const locales = { ja: "ja-JP", en: "en-US", ko: "ko-KR", zh: "zh-CN" } as const;

export function pickerDateFormatter(language: AppLanguage, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locales[language], { ...options, timeZone: "UTC" });
}

export function formatPickerValue(value: string, mode: DatePickerMode, language: AppLanguage, compact = false): string | undefined {
  if (!(mode === "month" ? isMonthKey(value) : isDateKey(value))) return undefined;
  return pickerDateFormatter(language, { year: "numeric", month: compact ? "numeric" : "long", ...(mode === "day" ? { day: "numeric" } as const : {}) })
    .format(new Date(`${value}${mode === "month" ? "-01" : ""}T12:00:00Z`));
}

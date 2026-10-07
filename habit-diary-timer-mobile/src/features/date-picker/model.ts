import { isDateKey, isMonthKey, toDateKey } from "@nino/shared/date";

export type DatePickerMode = "day" | "month";
export type PickerBounds = { minimum?: string; maximum?: string };
export type PickerLimits = { minimum: string; maximum: string; valid: boolean };

const FIRST_MONTH = "0001-01";
const LAST_MONTH = "9999-12";
const FIRST_DAY = `${FIRST_MONTH}-01`;
const LAST_DAY = `${LAST_MONTH}-31`;

function localTodayKey(): string {
  const today = new Date();
  if (today.getFullYear() < 1) return FIRST_DAY;
  if (today.getFullYear() > 9999) return LAST_DAY;
  return toDateKey(today).padStart(10, "0");
}

export function getPickerLimits(mode: DatePickerMode, bounds: PickerBounds = {}): PickerLimits {
  const validKey = mode === "month" ? isMonthKey : isDateKey;
  const minimum = bounds.minimum && validKey(bounds.minimum)
    ? bounds.minimum : mode === "month" ? FIRST_MONTH : FIRST_DAY;
  const maximum = bounds.maximum && validKey(bounds.maximum)
    ? bounds.maximum : mode === "month" ? LAST_MONTH : LAST_DAY;
  // An inverted range has no selectable values; never silently swap its limits.
  return { minimum, maximum, valid: minimum <= maximum };
}

export function isPickerValueSelectable(value: string, mode: DatePickerMode, bounds: PickerBounds = {}): boolean {
  const { minimum, maximum, valid } = getPickerLimits(mode, bounds);
  return valid && (mode === "month" ? isMonthKey(value) : isDateKey(value))
    && value >= minimum && value <= maximum;
}

/** Focus the current valid key, or local today, then keep it inside the selectable range. */
export function getPickerFocus(value: string, mode: DatePickerMode, bounds: PickerBounds = {}, today = localTodayKey()): string {
  const validKey = mode === "month" ? isMonthKey : isDateKey;
  const localToday = isDateKey(today) ? today : localTodayKey();
  const todayKey = mode === "month" ? localToday.slice(0, 7) : localToday;
  const candidate = validKey(value) ? value : todayKey;
  const { minimum, maximum, valid } = getPickerLimits(mode, bounds);
  if (!valid) return minimum;
  return candidate < minimum ? minimum : candidate > maximum ? maximum : candidate;
}

function monthParts(month: string): { year: number; month: number } {
  if (!isMonthKey(month)) throw new RangeError("Expected a valid YYYY-MM month.");
  return { year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) };
}

export function daysInCalendarMonth(month: string): number {
  const { year, month: number } = monthParts(month);
  if (number === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(number) ? 30 : 31;
}

/** Six Sunday-first weeks. Empty cells stay null instead of leaking adjacent month dates. */
export function calendarMonthGrid(month: string): (string | null)[] {
  const parts = monthParts(month);
  const first = new Date(0);
  first.setUTCFullYear(parts.year, parts.month - 1, 1);
  first.setUTCHours(0, 0, 0, 0);
  const leading = first.getUTCDay();
  const days = daysInCalendarMonth(month);
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - leading + 1;
    return day >= 1 && day <= days ? `${month}-${String(day).padStart(2, "0")}` : null;
  });
}

/** Step by calendar months, saturating at year 1 and 9999 without Date's 0–99-year remap. */
export function stepCalendarMonth(month: string, delta: number): string {
  const parts = monthParts(month);
  const increment = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  const index = Math.min(9999 * 12 - 1, Math.max(0, (parts.year - 1) * 12 + parts.month - 1 + increment));
  return `${String(Math.floor(index / 12) + 1).padStart(4, "0")}-${String(index % 12 + 1).padStart(2, "0")}`;
}

/** Used when browsing day calendars: a partial month remains available if any day fits. */
export function monthHasSelectableDay(month: string, bounds: PickerBounds = {}): boolean {
  if (!isMonthKey(month)) return false;
  const { minimum, maximum, valid } = getPickerLimits("day", bounds);
  if (!valid) return false;
  const first = `${month}-01`;
  const last = `${month}-${String(daysInCalendarMonth(month)).padStart(2, "0")}`;
  return first <= maximum && last >= minimum;
}

/** Consecutive year blocks never include year zero or years after 9999. */
export function yearBlock(year: number, size = 12): number[] {
  const blockSize = Number.isFinite(size) ? Math.max(1, Math.min(9999, Math.trunc(size))) : 12;
  const selected = Number.isFinite(year) ? Math.max(1, Math.min(9999, Math.trunc(year))) : 1;
  const first = Math.floor((selected - 1) / blockSize) * blockSize + 1;
  return Array.from({ length: Math.min(blockSize, 10000 - first) }, (_, index) => first + index);
}

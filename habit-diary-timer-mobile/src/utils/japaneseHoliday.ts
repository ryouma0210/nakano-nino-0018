function nthMonday(year: number, month: number, nth: number) {
  const first = new Date(year, month - 1, 1).getDay();
  return 1 + ((8 - first) % 7) + (nth - 1) * 7;
}

function equinoxDay(year: number, autumn: boolean) {
  const base = autumn ? 23.2488 : 20.8431;
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function baseHolidays(year: number) {
  const days = new Set<string>();
  const add = (month: number, day: number) =>
    days.add(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  add(1, 1);
  add(1, nthMonday(year, 1, 2));
  add(2, 11);
  if (year >= 2020) add(2, 23);
  add(3, equinoxDay(year, false));
  add(4, 29);
  add(5, 3);
  add(5, 4);
  add(5, 5);
  add(7, nthMonday(year, 7, 3));
  add(8, 11);
  add(9, nthMonday(year, 9, 3));
  add(9, equinoxDay(year, true));
  add(10, nthMonday(year, 10, 2));
  add(11, 3);
  add(11, 23);
  return days;
}

export function isJapaneseHoliday(dateKey: string) {
  const year = Number(dateKey.slice(0, 4));
  const holidays = baseHolidays(year);
  // 祝日に挟まれた平日は「国民の休日」。
  for (let month = 1; month <= 12; month += 1) {
    const last = new Date(year, month, 0).getDate();
    for (let day = 2; day < last; day += 1) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const previous = toKey(new Date(year, month - 1, day - 1));
      const next = toKey(new Date(year, month - 1, day + 1));
      if (!holidays.has(key) && holidays.has(previous) && holidays.has(next)) holidays.add(key);
    }
  }
  // 日曜の祝日以降、最初の平日を振替休日にする。
  [...holidays].sort().forEach((key) => {
    const date = new Date(`${key}T12:00:00`);
    if (date.getDay() !== 0) return;
    do date.setDate(date.getDate() + 1);
    while (holidays.has(toKey(date)));
    holidays.add(toKey(date));
  });
  return holidays.has(dateKey);
}

function toKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

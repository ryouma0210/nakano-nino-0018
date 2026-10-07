import { isDateKey, isMonthKey, toDateKey } from "@nino/shared/date";

export type ReportPeriod = { startDate: string; endDate: string };
export type ReportComparisonPeriod = { current: ReportPeriod; previous: ReportPeriod };

export const reportDateKey = toDateKey;

export function validReportDate(value: string): boolean {
  return isDateKey(value) && Number(value.slice(0, 4)) >= 1900;
}

export function validReportMonth(value: string): boolean {
  return isMonthKey(value) && Number(value.slice(0, 4)) >= 1900;
}

export function shiftReportDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return reportDateKey(new Date(year, month - 1, day + days, 12));
}

export function shiftReportMonth(value: string, months: number) {
  const [year, month] = value.split("-").map(Number);
  return reportDateKey(new Date(year, month - 1 + months, 1, 12)).slice(0, 7);
}

function monthEnd(month: string) {
  return shiftReportDate(`${shiftReportMonth(month, 1)}-01`, -1);
}

export function dailyComparison(date: string): ReportComparisonPeriod {
  if (!validReportDate(date)) throw new Error("日付を確認してください。");
  const previous = shiftReportDate(date, -1);
  return { current: { startDate: date, endDate: date }, previous: { startDate: previous, endDate: previous } };
}

export function weeklyComparison(endDate = reportDateKey(new Date())): ReportComparisonPeriod {
  if (!validReportDate(endDate)) throw new Error("日付を確認してください。");
  return {
    current: { startDate: shiftReportDate(endDate, -6), endDate },
    previous: { startDate: shiftReportDate(endDate, -13), endDate: shiftReportDate(endDate, -7) },
  };
}

export function monthlyComparison(month: string, today = reportDateKey(new Date())): ReportComparisonPeriod {
  if (!validReportMonth(month) || !validReportDate(today) || month > today.slice(0, 7)) {
    throw new Error("今月以前の月を指定してください。");
  }
  const previousMonth = shiftReportMonth(month, -1);
  const inProgress = month === today.slice(0, 7) && today !== monthEnd(month);
  return {
    current: { startDate: `${month}-01`, endDate: inProgress ? today : monthEnd(month) },
    previous: {
      startDate: `${previousMonth}-01`,
      endDate: inProgress ? [`${previousMonth}-${today.slice(-2)}`, monthEnd(previousMonth)].sort()[0] : monthEnd(previousMonth),
    },
  };
}

export function validReportPeriod(period: ReportPeriod) {
  // Comparisons may cross the UI's 1900 selection boundary into the prior period.
  return isDateKey(period.startDate) && isDateKey(period.endDate) && period.startDate <= period.endDate;
}

export function reportPeriodLabel(period: ReportPeriod) {
  return period.startDate === period.endDate ? period.startDate : `${period.startDate} ～ ${period.endDate}`;
}

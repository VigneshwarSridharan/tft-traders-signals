const DEFAULT_WINDOW_DAYS = 30;

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function diffUtcDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export interface DateRange {
  dateFrom: Date;
  dateTo: Date;
}

/** Defaults to the trailing 30 days (inclusive) when either bound is omitted. */
export function resolvePeriod(dateFrom?: Date, dateTo?: Date): DateRange {
  const to = dateTo ? startOfUtcDay(dateTo) : startOfUtcDay(new Date());
  const from = dateFrom
    ? startOfUtcDay(dateFrom)
    : addUtcDays(to, -(DEFAULT_WINDOW_DAYS - 1));
  return { dateFrom: from, dateTo: to };
}

/** The N days immediately preceding `dateFrom`, where N is the current period's length — for period-over-period comparison. */
export function previousPeriod(range: DateRange): DateRange {
  const periodDays = diffUtcDays(range.dateFrom, range.dateTo) + 1;
  const dateTo = addUtcDays(range.dateFrom, -1);
  const dateFrom = addUtcDays(dateTo, -(periodDays - 1));
  return { dateFrom, dateTo };
}

export function toDateOnlyString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

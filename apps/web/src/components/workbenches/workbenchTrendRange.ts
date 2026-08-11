export type TrendRange = 'sevenDays' | 'month';

const TREND_RANGE_DAY_COUNT: Record<TrendRange, number> = {
  sevenDays: 7,
  month: 30,
};

export function filterTrendDataByRange<T extends { date: string }>(items: T[], range: TrendRange): T[] {
  const dates = Array.from(new Set(items.map((item) => item.date)));
  const visibleDates = new Set(dates.slice(-TREND_RANGE_DAY_COUNT[range]));
  return items.filter((item) => visibleDates.has(item.date));
}

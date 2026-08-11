import { describe, expect, it } from 'vitest';
import {
  fillWeeklyReportDays,
  getIsoWeekInfo,
  getWeeklyReportPeriod,
  summarizeWeeklyReportDays,
} from './weeklyReport.js';

describe('weekly report calendar aggregation', () => {
  it('uses stable seven-calendar-day boundaries', () => {
    const period = getWeeklyReportPeriod(new Date('2026-08-11T16:45:00+08:00'));
    expect(period).toMatchObject({ start: '2026-08-05', end: '2026-08-11', week: 33, weekYear: 2026 });

    const previousWeek = getWeeklyReportPeriod(new Date('2026-08-10T05:00:00+08:00'), 1);
    expect(previousWeek).toMatchObject({ start: '2026-08-03', end: '2026-08-09' });
  });

  it('calculates ISO week years across calendar year boundaries', () => {
    expect(getIsoWeekInfo(new Date('2027-01-01T12:00:00+08:00'))).toEqual({ week: 53, weekYear: 2026 });
  });

  it('fills sparse rows and derives activity and best day', () => {
    const period = getWeeklyReportPeriod(new Date('2026-08-11T12:00:00+08:00'));
    const days = fillWeeklyReportDays(period, [
      { day: '2026-08-06', notes: 2, exp: 30 },
      { day: '2026-08-10', bookmarks: 1, files: 3, exp: 42, checkins: 1 },
    ]);
    const summary = summarizeWeeklyReportDays(days);

    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ day: '2026-08-05', total: 0 });
    expect(summary).toMatchObject({ bookmarks: 1, notes: 2, files: 3, exp: 72, checkinDays: 1, activeDays: 2 });
    expect(summary.bestDay).toMatchObject({ day: '2026-08-10', total: 4 });
  });

  it('does not invent a best day for an empty report', () => {
    const period = getWeeklyReportPeriod(new Date('2026-08-11T12:00:00+08:00'));
    expect(summarizeWeeklyReportDays(fillWeeklyReportDays(period, [])).bestDay).toBeNull();
  });
});

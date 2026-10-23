import { describe, expect, it } from 'vitest';
import { isoWeekOf, normalizeWeeklyReport, weeklyReportMilestone, weeklyReportTheme } from './weeklyReport';

const currentWeek = {
  bookmarks: 1,
  notes: 2,
  files: 5,
  todos: 3,
  organized: 1,
  exp: 126,
  checkinDays: 5,
  activeDays: 4,
  level: 15,
  levelName: '文圣',
  period: {
    kind: 'current' as const,
    start: '2026-10-12',
    end: '2026-10-18',
    dataEnd: '2026-10-16',
    elapsedDays: 5,
    inProgress: true,
    week: 42,
    weekYear: 2026,
    compareStart: '2026-10-05',
    compareEnd: '2026-10-09',
  },
  days: [
    { day: '2026-10-12', notes: 1, todos: 1, total: 2, checkins: 1 },
    { day: '2026-10-13', files: 3, notes: 1, total: 4, checkins: 1 },
    { day: '2026-10-14', bookmarks: 1, todos: 2, total: 3, checkins: 1 },
    { day: '2026-10-15', total: 0, checkins: 1 },
    { day: '2026-10-16', files: 2, organized: 1, total: 3, checkins: 1 },
    { day: '2026-10-17', total: 0, future: true },
    { day: '2026-10-18', total: 0, future: true },
  ],
  prev: { bookmarks: 1, notes: 0, files: 0, todos: 4, organized: 1, exp: 40 },
  items: [{ type: 'file' as const, id: '7', title: 'Q4 路线图.pdf', day: '2026-10-16' }],
};

describe('weekly report normalization', () => {
  it('keeps natural-week period facts and marks today and future days', () => {
    const report = normalizeWeeklyReport(currentWeek)!;
    expect(report).toMatchObject({
      kind: 'current',
      inProgress: true,
      elapsedDays: 5,
      total: 12,
      prevTotal: 6,
      created: 8,
      completed: 4,
      activeDays: 4,
      checkinDays: 5,
      week: 42,
      blank: false,
    });
    expect(report.days[4]).toMatchObject({ isToday: true, future: false, total: 3 });
    expect(report.days[5]).toMatchObject({ future: true, total: 0, checkedIn: false });
    expect(report.items).toHaveLength(1);
  });

  it('recomputes legacy rolling snapshots with record-only active days', () => {
    const legacy = normalizeWeeklyReport({
      notes: 4,
      checkinDays: 6,
      activeDays: 6,
      generatedAt: '2026-10-12',
      period: { start: '2026-10-05', end: '2026-10-11', week: 41, weekYear: 2026 },
      days: [
        { day: '2026-10-05', notes: 2, checkins: 1 },
        { day: '2026-10-06', checkins: 1 },
        { day: '2026-10-07', notes: 2, checkins: 1 },
        { day: '2026-10-08' },
        { day: '2026-10-09', checkins: 1 },
        { day: '2026-10-10', checkins: 1 },
        { day: '2026-10-11', checkins: 1 },
      ],
      prev: { notes: 1 },
    })!;
    expect(legacy).toMatchObject({ kind: null, inProgress: false, activeDays: 2, checkinDays: 6, total: 4 });
    expect(legacy.items).toBeNull();
    expect(legacy.days.every((day) => !day.future && !day.isToday)).toBe(true);
  });

  it('flags a report with no records, check-ins or EXP as blank', () => {
    const empty = normalizeWeeklyReport({
      period: { kind: 'current', start: '2026-10-12', elapsedDays: 1, inProgress: true },
      days: Array.from({ length: 7 }, (_, index) => ({ day: `2026-10-${12 + index}`, future: index > 0 })),
      prev: {},
      items: [],
    })!;
    expect(empty.blank).toBe(true);
    expect(weeklyReportMilestone(empty)).toBe('newWeek');
  });

  it('returns null for missing payloads', () => {
    expect(normalizeWeeklyReport(null)).toBeNull();
  });

  it('preserves negative experience adjustments in current reports and historical snapshots', () => {
    expect(normalizeWeeklyReport({ ...currentWeek, exp: -9283 })?.exp).toBe(-9283);
    expect(normalizeWeeklyReport({ exp: -9283 })?.blank).toBe(false);
    expect(normalizeWeeklyReport({ exp: Number.NaN })?.exp).toBe(0);
  });
});

describe('weekly report titles and theme', () => {
  const base = normalizeWeeklyReport({
    ...currentWeek,
    period: { ...currentWeek.period, kind: 'last', inProgress: false },
  })!;

  it('picks the title from record structure', () => {
    expect(weeklyReportMilestone(base)).toBe('momentum');
    expect(weeklyReportMilestone({ ...base, counts: { ...base.counts, todos: 7 } })).toBe('doer');
    expect(weeklyReportMilestone({ ...base, activeDays: 7 })).toBe('fullAttendance');
    expect(weeklyReportMilestone({ ...base, total: 0 })).toBe('pause');
    expect(weeklyReportMilestone({ ...base, total: 3, counts: { ...base.counts, files: 1 } })).toBe('seed');
  });

  it('keeps level-based poster themes and ISO weeks', () => {
    expect([1, 4, 7, 10, 15].map(weeklyReportTheme)).toEqual(['slate', 'ocean', 'violet', 'gold', 'coral']);
    expect(isoWeekOf('2027-01-01')).toEqual({ week: 53, weekYear: 2026 });
  });
});

import { describe, expect, it } from 'vitest';
import {
  ANNUAL_BATCH_THRESHOLD,
  bookmarkDomain,
  classifyAnnualTier,
  getAnnualReportRange,
  longestCheckinStreak,
  longestStreak,
  markBatchRecords,
  parseLocalTime,
  peakTimeSegment,
  resolveAnnualTitle,
  selectAnnualChapters,
  summarizeAnnualRecords,
  weeklyBuckets,
} from './rules.js';
import { noteDisplayLength } from './noteText.js';

const shanghai = { utcOffsetMinutes: 480, shiftMinutes: 0 };
const at = (text) => parseLocalTime(text);

function record(type, text, extra = {}) {
  return { type, id: `${type}-${text}`, time: at(text), ...extra };
}

describe('annual report range', () => {
  it('stops at yesterday during the preview and uses account-local SQL bounds', () => {
    const range = getAnnualReportRange({ year: 2026, now: new Date('2026-12-15T10:00:00+08:00'), calendar: shanghai });
    expect(range).toMatchObject({
      phase: 'preview',
      start: '2026-01-01',
      dataEnd: '2026-12-14',
      elapsedDays: 348,
      startSql: '2026-01-01 00:00:00',
      nextSql: '2026-12-15 00:00:00',
      startKey: '20260101',
      endKey: '20261214',
    });
  });

  it('finalizes once the account-local date reaches next year', () => {
    const lateEve = getAnnualReportRange({
      year: 2026,
      now: new Date('2026-12-31T23:30:00+08:00'),
      calendar: shanghai,
    });
    expect(lateEve).toMatchObject({ phase: 'preview', dataEnd: '2026-12-30' });
    const newYear = getAnnualReportRange({
      year: 2026,
      now: new Date('2027-01-01T00:10:00+08:00'),
      calendar: shanghai,
    });
    expect(newYear).toMatchObject({
      phase: 'final',
      dataEnd: '2026-12-31',
      elapsedDays: 365,
      nextSql: '2027-01-01 00:00:00',
    });
  });

  it('shifts SQL bounds for accounts outside the server time zone', () => {
    // 纽约账号（UTC-5）与上海服务器相差 -780 分钟：账号 0 点 = 服务器当天 13 点。
    const range = getAnnualReportRange({
      year: 2026,
      now: new Date('2027-01-01T04:00:00Z'),
      calendar: { utcOffsetMinutes: -300, shiftMinutes: -780 },
    });
    expect(range.phase).toBe('preview');
    expect(range.dataEnd).toBe('2026-12-30');
    expect(range.startSql).toBe('2026-01-01 13:00:00');
  });

  it('has no data on the first day of the year', () => {
    const range = getAnnualReportRange({ year: 2026, now: new Date('2026-01-01T09:00:00+08:00'), calendar: shanghai });
    expect(range.elapsedDays).toBe(0);
    expect(range.dataEnd).toBeNull();
  });
});

describe('batch detection', () => {
  const burst = (type, count, startMinute = 0, stepSeconds = 10) =>
    Array.from({ length: count }, (_, index) => {
      const seconds = startMinute * 60 + index * stepSeconds;
      const minute = String(Math.floor(seconds / 60)).padStart(2, '0');
      const second = String(seconds % 60).padStart(2, '0');
      return { type, id: `${type}-${index}`, time: at(`2026-03-01 10:${minute}:${second}`) };
    });

  it('keeps 29 quick records and marks the 30-record window', () => {
    expect(markBatchRecords(burst('bookmark', ANNUAL_BATCH_THRESHOLD - 1)).some((item) => item.batch)).toBe(false);
    const marked = markBatchRecords(burst('bookmark', ANNUAL_BATCH_THRESHOLD));
    expect(marked.every((item) => item.batch)).toBe(true);
  });

  it('does not combine different types into one batch', () => {
    const mixed = [...burst('bookmark', 20), ...burst('note', 20)];
    expect(markBatchRecords(mixed).some((item) => item.batch)).toBe(false);
  });

  it('only marks records inside the dense window', () => {
    // 30 条每 19 秒一条（约 9 分 11 秒内）为批量；之后 20 分钟才出现的一条不受影响。
    const list = [...burst('file', 30, 0, 19), { type: 'file', id: 'later', time: at('2026-03-01 10:40:00') }];
    const marked = markBatchRecords(list);
    expect(marked.filter((item) => item.batch)).toHaveLength(30);
    expect(marked.find((item) => item.id === 'later').batch).toBe(false);
  });

  it('treats records spread wider than ten minutes as normal use', () => {
    // 30 条每 21 秒一条，跨度超过 10 分钟，任一窗口都不到 30 条。
    expect(markBatchRecords(burst('note', 30, 0, 21)).some((item) => item.batch)).toBe(false);
  });
});

describe('annual summary', () => {
  const range = getAnnualReportRange({ year: 2026, now: new Date('2026-12-15T10:00:00+08:00'), calendar: shanghai });

  it('aggregates counted records only and reports excluded batch volume', () => {
    const records = markBatchRecords([
      record('bookmark', '2026-01-03 22:10:00'),
      record('note', '2026-01-04 23:05:00'),
      record('note', '2026-01-05 08:00:00'),
      record('todo', '2026-01-10 12:00:00'),
      ...Array.from({ length: 30 }, (_, index) =>
        record('bookmark', `2026-02-01 09:00:${String(index).padStart(2, '0')}`, { id: `import-${index}` }),
      ),
    ]);
    const summary = summarizeAnnualRecords(records, range);
    expect(summary.total).toBe(4);
    expect(summary.byType).toMatchObject({ bookmark: 1, note: 2, todo: 1 });
    expect(summary.batchExcluded).toBe(30);
    expect(summary.activeDays).toBe(4);
    expect(summary.days).toHaveLength(348);
    expect(summary.days.slice(2, 5)).toEqual([1, 1, 1]);
    expect(summary.months[0]).toBe(4);
    expect(summary.months[1]).toBe(0);
    expect(summary.longestStreak).toEqual({ days: 3, start: '2026-01-03', end: '2026-01-05' });
    expect(summary.first.id).toBe('bookmark-2026-01-03 22:10:00');
    expect(summary.nightShare).toBe(0.5);
  });

  it('picks the earliest streak and busiest day on ties', () => {
    expect(longestStreak(['2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06'])).toEqual({
      days: 2,
      start: '2026-01-01',
      end: '2026-01-02',
    });
    expect(longestCheckinStreak(['20260707', '20260708', '20260709', '20260709', 'bad'])).toBe(3);
  });
});

describe('tiers, chapters and titles', () => {
  const base = { activeDays: 30, total: 200, byType: { bookmark: 80, note: 60, file: 30, todo: 20, organize: 10 } };

  it('classifies light and empty accounts', () => {
    expect(classifyAnnualTier({ total: 0, activeDays: 0 })).toBe('empty');
    expect(classifyAnnualTier({ total: 40, activeDays: 6 })).toBe('light');
    expect(classifyAnnualTier({ total: 9, activeDays: 9 })).toBe('light');
    expect(classifyAnnualTier({ total: 10, activeDays: 7 })).toBe('full');
  });

  it('skips chapters below their thresholds', () => {
    expect(selectAnnualChapters('light')).toEqual(['cover', 'overview', 'poster']);
    expect(selectAnnualChapters('empty')).toEqual([]);
    expect(
      selectAnnualChapters('full', { activeDays: 8, notes: 2, bookmarks: 5, keywordTags: 2, total: 29, todos: 0 }),
    ).toEqual(['cover', 'overview', 'rhythm', 'bookmarks', 'poster']);
    expect(
      selectAnnualChapters('full', {
        activeDays: 8,
        notes: 3,
        bookmarks: 5,
        keywordTags: 3,
        total: 30,
        checkinDays: 1,
      }),
    ).toEqual(['cover', 'overview', 'rhythm', 'notes', 'bookmarks', 'keywords', 'time', 'action', 'poster']);
  });

  it('combines the dominant type with the first matching time trait', () => {
    const summary = (overrides) => ({
      ...base,
      nightShare: 0,
      morningShare: 0,
      weekendShare: 0,
      longestStreak: { days: 3 },
      ...overrides,
    });
    expect(resolveAnnualTitle('full', summary({ nightShare: 0.38, morningShare: 0.3 }))).toEqual({
      key: 'combined',
      noun: 'bookmark',
      modifier: 'night',
      basis: 38,
    });
    expect(resolveAnnualTitle('full', summary({ morningShare: 0.25 })).modifier).toBe('morning');
    expect(resolveAnnualTitle('full', summary({ weekendShare: 0.5 })).modifier).toBe('weekend');
    expect(resolveAnnualTitle('full', summary({ longestStreak: { days: 14 } }))).toMatchObject({
      modifier: 'steady',
      basis: 14,
    });
    expect(resolveAnnualTitle('full', summary({}))).toMatchObject({ modifier: null, basis: 40 });
    expect(resolveAnnualTitle('light', summary({}))).toMatchObject({ key: 'starter' });
  });

  it('breaks noun ties by the fixed type order', () => {
    const tie = {
      ...base,
      byType: { bookmark: 5, note: 5, file: 0, todo: 0, organize: 0 },
      total: 10,
      nightShare: 0,
      morningShare: 0,
      weekendShare: 0,
      longestStreak: { days: 1 },
    };
    expect(resolveAnnualTitle('full', tie).noun).toBe('bookmark');
  });
});

describe('time, weeks and domains', () => {
  it('finds the busiest time segment', () => {
    const hours = Array(24).fill(0);
    hours[22] = 6;
    hours[10] = 3;
    expect(peakTimeSegment(hours)).toEqual({ key: 'night', from: 21, to: 24, share: 67 });
    expect(peakTimeSegment(Array(24).fill(0))).toBeNull();
  });

  it('counts weeks since joining for new accounts and recent weeks otherwise', () => {
    const range = getAnnualReportRange({ year: 2026, now: new Date('2026-12-15T10:00:00+08:00'), calendar: shanghai });
    const records = [record('note', '2026-11-02 10:00:00'), record('note', '2026-12-09 10:00:00')];
    const sinceJoin = weeklyBuckets(records, range, '2026-11-02');
    expect(sinceJoin.from).toBe('join');
    expect(sinceJoin.weeks).toEqual([1, 0, 0, 0, 0, 1, 0]);
    const recent = weeklyBuckets(records, range, '2025-06-01');
    expect(recent.from).toBe('recent');
    expect(recent.weeks).toHaveLength(12);
    expect(recent.weeks.reduce((sum, value) => sum + value, 0)).toBe(2);
  });

  it('normalizes bookmark hosts', () => {
    expect(bookmarkDomain('https://www.GitHub.com/a/b')).toBe('github.com');
    expect(bookmarkDomain('not a url')).toBeNull();
  });
});

describe('note display length', () => {
  it('counts rendered text the same way the editor does', () => {
    expect(noteDisplayLength('# 标题\n\n**加粗** 文字', 'markdown')).toBe('标题 加粗 文字'.length);
    expect(noteDisplayLength('<p>你好<b>世界</b></p><p> a </p>', 'html')).toBe('你好世界 a'.length);
    expect(noteDisplayLength('{"elements":[1,2,3]}', 'drawing')).toBe(0);
    expect(noteDisplayLength('', 'markdown')).toBe(0);
  });
});

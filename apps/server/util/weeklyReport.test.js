import { describe, expect, it } from 'vitest';
import {
  fillWeeklyReportDays,
  getIsoWeekInfo,
  getWeeklyReportPeriod,
  mergeWeeklyReportItems,
  summarizeWeeklyReportDays,
} from './weeklyReport.js';

const shanghai = { utcOffsetMinutes: 480, shiftMinutes: 0 };

describe('weekly report calendar aggregation', () => {
  it('uses the account-local natural week and compares the same elapsed span', () => {
    const current = getWeeklyReportPeriod({ now: new Date('2026-10-16T16:45:00+08:00'), calendar: shanghai });
    expect(current).toMatchObject({
      kind: 'current',
      start: '2026-10-12',
      end: '2026-10-18',
      dataEnd: '2026-10-16',
      elapsedDays: 5,
      inProgress: true,
      week: 42,
      weekYear: 2026,
      compareStart: '2026-10-05',
      compareEnd: '2026-10-09',
      startSql: '2026-10-12 00:00:00',
      nextSql: '2026-10-17 00:00:00',
      compareStartSql: '2026-10-05 00:00:00',
      compareNextSql: '2026-10-10 00:00:00',
      startKey: '20261012',
      endKey: '20261016',
    });

    const last = getWeeklyReportPeriod({
      now: new Date('2026-10-12T05:00:00+08:00'),
      calendar: shanghai,
      period: 'last',
    });
    expect(last).toMatchObject({
      kind: 'last',
      start: '2026-10-05',
      end: '2026-10-11',
      dataEnd: '2026-10-11',
      elapsedDays: 7,
      inProgress: false,
      week: 41,
      compareStart: '2026-09-28',
      compareEnd: '2026-10-04',
      nextSql: '2026-10-12 00:00:00',
    });
  });

  it('treats Sunday as the last day of the current week', () => {
    const period = getWeeklyReportPeriod({ now: new Date('2026-10-18T23:30:00+08:00'), calendar: shanghai });
    expect(period).toMatchObject({ start: '2026-10-12', dataEnd: '2026-10-18', elapsedDays: 7 });
  });

  it('converts account-local midnight to server-local SQL bounds', () => {
    // 账号在 UTC+9，服务器在 UTC+8：账号的 0 点是服务器的前一天 23 点。
    const tokyo = getWeeklyReportPeriod({
      now: new Date('2026-10-12T00:30:00+09:00'),
      calendar: { utcOffsetMinutes: 540, shiftMinutes: 60 },
    });
    expect(tokyo).toMatchObject({ start: '2026-10-12', elapsedDays: 1, startSql: '2026-10-11 23:00:00' });
    // 同一瞬间在上海仍是周日，本周还没切换。
    expect(getWeeklyReportPeriod({ now: new Date('2026-10-12T00:30:00+09:00'), calendar: shanghai })).toMatchObject({
      start: '2026-10-05',
      elapsedDays: 7,
    });
  });

  it('calculates ISO week years across calendar year boundaries', () => {
    expect(getIsoWeekInfo(new Date('2027-01-01T12:00:00Z'))).toEqual({ week: 53, weekYear: 2026 });
  });

  it('fills sparse rows, marks future days and counts active days by records only', () => {
    const period = getWeeklyReportPeriod({ now: new Date('2026-10-16T12:00:00+08:00'), calendar: shanghai });
    const days = fillWeeklyReportDays(period, [
      { day: '20261012', notes: 1, todos: 1, exp: 20, checkins: 1 },
      { day: '20261015', exp: 5, checkins: 1 },
      { day: '20261016', files: 2, organized: 1, exp: 30, checkins: 1 },
      { day: '20261017', notes: 9 },
    ]);
    const summary = summarizeWeeklyReportDays(days);

    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ day: '2026-10-12', total: 2, checkins: 1, future: false });
    expect(days[3]).toMatchObject({ day: '2026-10-15', total: 0, checkins: 1 });
    expect(days[5]).toMatchObject({ day: '2026-10-17', total: 0, future: true });
    expect(summary).toMatchObject({
      notes: 1,
      files: 2,
      todos: 1,
      organized: 1,
      exp: 55,
      checkinDays: 3,
      activeDays: 2,
    });
  });

  it('merges recent items across resource types by creation time', () => {
    const items = mergeWeeklyReportItems(
      {
        bookmark: [{ id: 'b1', title: '书签', createTime: '2026-10-14 09:00:00', reportDay: '20261014' }],
        note: [{ id: 'n1', title: ' 笔记 ', createTime: '2026-10-16 08:00:00', reportDay: '20261016' }],
        file: [{ id: 7, title: '', createTime: '2026-10-15 10:00:00', reportDay: '20261015' }],
      },
      2,
    );
    expect(items).toEqual([
      { type: 'note', id: 'n1', title: '笔记', day: '2026-10-16' },
      { type: 'file', id: '7', title: '', day: '2026-10-15' },
    ]);
  });
});

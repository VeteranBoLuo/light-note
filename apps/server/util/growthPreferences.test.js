import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: { query: vi.fn() } }));

import {
  dayKeyAtOffset,
  getGrowthCalendarContext,
  getGrowthPreferences,
  updateGrowthPreferences,
  weekKeyAtOffset,
} from './growthPreferences.js';

describe('growthPreferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('按账号偏移跨日，不使用服务器本地日期', () => {
    const instant = new Date('2026-08-11T16:30:00.000Z');
    expect(dayKeyAtOffset(instant, 480)).toBe('20260812');
    expect(dayKeyAtOffset(instant, -480)).toBe('20260811');
  });

  it('周一重置并正确处理 ISO 跨年周', () => {
    expect(weekKeyAtOffset(new Date('2025-12-29T12:00:00.000Z'), 0)).toBe('202601');
    expect(weekKeyAtOffset(new Date('2026-01-04T12:00:00.000Z'), 0)).toBe('202601');
    expect(weekKeyAtOffset(new Date('2026-01-05T12:00:00.000Z'), 0)).toBe('202602');
  });

  it('日历上下文同时返回账号日、周和与服务器的查询偏移', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              weeklyActiveTarget: 5,
              streakReminderEnabled: 1,
              celebrationEnabled: 1,
              lowPressureMode: 0,
              timezone: 'America/Los_Angeles',
              utcOffsetMinutes: -420,
            },
          ],
        ])
        .mockResolvedValueOnce([[{ serverOffset: 480 }]]),
    };

    const result = await getGrowthCalendarContext('user-1', {
      db,
      now: new Date('2026-08-12T02:00:00.000Z'),
    });

    expect(result).toMatchObject({
      timezone: 'America/Los_Angeles',
      utcOffsetMinutes: -420,
      serverOffsetMinutes: 480,
      shiftMinutes: -900,
      dayKey: '20260811',
      weekKey: '202633',
    });
  });

  it('IANA 时区会随夏令时动态变化，不依赖过期的持久化偏移', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              weeklyActiveTarget: 5,
              streakReminderEnabled: 1,
              celebrationEnabled: 1,
              lowPressureMode: 0,
              timezone: 'America/Los_Angeles',
              utcOffsetMinutes: -420,
            },
          ],
        ])
        .mockResolvedValueOnce([[{ serverOffset: 0 }]]),
    };

    const result = await getGrowthCalendarContext('user-1', { db, now: new Date('2026-01-15T12:00:00.000Z') });

    expect(result.utcOffsetMinutes).toBe(-480);
    expect(result.shiftMinutes).toBe(-480);
  });

  it('拒绝字符串布尔值和非法时区，校验失败不访问数据库', async () => {
    const db = { query: vi.fn() };
    await expect(updateGrowthPreferences('user-1', { lowPressureMode: 'false' }, { db })).resolves.toEqual({
      ok: false,
      reason: 'invalid_lowPressureMode',
    });
    await expect(updateGrowthPreferences('user-1', { timezone: '../../etc/passwd' }, { db })).resolves.toEqual({
      ok: false,
      reason: 'invalid_timezone',
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('保存合法偏好并保留未提供字段', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              weeklyActiveTarget: 5,
              streakReminderEnabled: 1,
              celebrationEnabled: 1,
              lowPressureMode: 0,
              timezone: 'Asia/Shanghai',
              utcOffsetMinutes: 480,
            },
          ],
        ])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    await expect(
      updateGrowthPreferences(
        'user-1',
        { weeklyActiveTarget: 3, lowPressureMode: true, timezone: 'Asia/Singapore', utcOffsetMinutes: 480 },
        { db },
      ),
    ).resolves.toMatchObject({
      ok: true,
      weeklyActiveTarget: 3,
      streakReminderEnabled: true,
      celebrationEnabled: true,
      lowPressureMode: true,
      timezone: 'Asia/Singapore',
      utcOffsetMinutes: 480,
    });
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('兼容数据库驱动返回的字符串布尔字段', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              weeklyActiveTarget: '5',
              streakReminderEnabled: '0',
              celebrationEnabled: '1',
              lowPressureMode: '0',
              timezone: 'Asia/Shanghai',
              utcOffsetMinutes: '480',
            },
          ],
        ]),
    };

    await expect(getGrowthPreferences('user-1', { db })).resolves.toMatchObject({
      streakReminderEnabled: false,
      celebrationEnabled: true,
      lowPressureMode: false,
    });
  });
});

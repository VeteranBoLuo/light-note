import { describe, expect, it } from 'vitest';
import { calculateNextSchedule, notificationQuietUntil } from './todoReminder.js';

describe('todoReminder', () => {
  it('跳过已经错过的周期，只返回未来最近一次', () => {
    const next = calculateNextSchedule(
      '2026-07-15 09:00:00',
      60,
      '2026-07-15 18:00:00',
      new Date('2026-07-15T12:20:00'),
    );
    expect(next?.getHours()).toBe(13);
    expect(next?.getMinutes()).toBe(0);
  });

  it('下一次超过结束时间时结束周期', () => {
    expect(
      calculateNextSchedule('2026-07-15 17:00:00', 60, '2026-07-15 17:30:00', new Date('2026-07-15T17:05:00')),
    ).toBeNull();
  });

  it('失败重试后仍以计划起点计算下一次，不让周期时间逐次漂移', () => {
    const next = calculateNextSchedule(
      '2026-07-15 09:00:00',
      60,
      '2026-07-15 18:00:00',
      new Date('2026-07-15T09:05:00'),
    );
    expect(next?.getHours()).toBe(10);
    expect(next?.getMinutes()).toBe(0);
  });

  it('跨午夜免打扰按用户保存的时区延迟到结束时刻', () => {
    const now = new Date('2026-07-30T15:30:00.000Z'); // UTC+8 23:30
    const quietUntil = notificationQuietUntil(
      {
        notificationsDnd: true,
        notificationsDndStart: '22:00',
        notificationsDndEnd: '08:00',
        notificationsTimezoneOffset: -480,
      },
      now,
    );
    expect(quietUntil?.toISOString()).toBe('2026-07-31T00:00:00.000Z');
  });

  it('免打扰区间外不延迟通知，同起止时间视为关闭', () => {
    const now = new Date('2026-07-30T04:00:00.000Z'); // UTC+8 12:00
    expect(
      notificationQuietUntil(
        {
          notificationsDnd: true,
          notificationsDndStart: '22:00',
          notificationsDndEnd: '08:00',
          notificationsTimezoneOffset: -480,
        },
        now,
      ),
    ).toBeNull();
    expect(
      notificationQuietUntil(
        {
          notificationsDnd: true,
          notificationsDndStart: '08:00',
          notificationsDndEnd: '08:00',
        },
        now,
      ),
    ).toBeNull();
  });
});

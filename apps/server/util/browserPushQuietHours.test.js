import { describe, it, expect } from 'vitest';
import { browserPushQuietUntil } from './browserPushQuietHours.js';
describe('browser push quiet hours', () => {
  it('跨午夜免打扰按用户保存的时区延迟到结束时刻', () => {
    const now = new Date('2026-07-30T15:30:00.000Z'); // UTC+8 23:30
    const quietUntil = browserPushQuietUntil(
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
      browserPushQuietUntil(
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
      browserPushQuietUntil(
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

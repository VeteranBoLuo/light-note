import { describe, expect, it } from 'vitest';
import { calculateNextSchedule } from './todoReminder.js';

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
});

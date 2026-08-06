import { describe, expect, it } from 'vitest';
import { dueForTodoGroup, formatTodoDateTime, todoGroupKey, todoSnoozeAt, toTodoLocalInput } from './todoPlanning';

describe('todoPlanning', () => {
  const now = new Date(2026, 6, 30, 16, 30);

  it('同一天已经过期的时间归入逾期，而不是今天', () => {
    expect(todoGroupKey({ status: 'pending', dueAt: '2026-07-30 09:00:00' } as any, now)).toBe('overdue');
    expect(todoGroupKey({ status: 'pending', dueAt: '2026-07-30 18:00:00' } as any, now)).toBe('today');
  });

  it('按今天、即将到来、以后、无日期和完成状态准确分组', () => {
    expect(todoGroupKey({ status: 'pending', dueAt: '2026-07-31 09:00:00' } as any, now)).toBe('upcoming');
    expect(todoGroupKey({ status: 'pending', dueAt: '2026-08-20 09:00:00' } as any, now)).toBe('later');
    expect(todoGroupKey({ status: 'pending', dueAt: null } as any, now)).toBe('noDate');
    expect(todoGroupKey({ status: 'completed', dueAt: null } as any, now)).toBe('completed');
  });

  it('深夜拖到今天时仍尽量落在当天，不意外滚到明天', () => {
    const late = new Date(2026, 6, 30, 23, 30);
    expect(dueForTodoGroup('today', late)).toBe('2026-07-30T23:59');
  });

  it('稍后提醒使用稳定的本地时间', () => {
    expect(todoSnoozeAt('tenMinutes', now)).toBe('2026-07-30T16:40');
    expect(todoSnoozeAt('oneHour', now)).toBe('2026-07-30T17:30');
    expect(todoSnoozeAt('threeHours', now)).toBe('2026-07-30T19:30');
    expect(todoSnoozeAt('oneDay', now)).toBe('2026-07-31T16:30');
    // 今日工作台仍使用旧的“明天上午 9 点”语义，继续保持兼容。
    expect(todoSnoozeAt('tomorrow', now)).toBe('2026-07-31T09:00');
  });

  it('编辑服务端 DATETIME 时保持原墙上时间，不重复叠加时区偏移', () => {
    expect(toTodoLocalInput('2026-07-30 18:25:00')).toBe('2026-07-30T18:25');
    expect(toTodoLocalInput('2026-07-30T18:25')).toBe('2026-07-30T18:25');
  });

  it('待办列表使用今天、明天和同年日期的日常格式', () => {
    const labels = { today: '今天', tomorrow: '明天' };
    expect(formatTodoDateTime('2026-07-30 09:00:00', 'zh-CN', { relative: true, now, relativeLabels: labels })).toBe(
      '今天 09:00',
    );
    expect(
      formatTodoDateTime('2026-07-31 09:00:00', 'zh-CN', { relative: true, now, relativeLabels: labels }),
    ).toBe('明天 09:00');
    expect(formatTodoDateTime('2026-08-02 09:00:00', 'zh-CN', { relative: true, includeYear: false, now })).toBe(
      '8月2日（周日）09:00',
    );
  });

  it('英文格式与邮件使用同样的常见写法', () => {
    expect(formatTodoDateTime('2026-08-02 09:00:00', 'en-US', { now })).toBe('Sun, Aug 2, 2026, 9:00 AM');
  });
});

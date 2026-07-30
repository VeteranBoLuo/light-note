import { describe, expect, it } from 'vitest';
import { dueForTodoGroup, quickTodoDueAt, todoGroupKey, todoSnoozeAt, toTodoLocalInput } from './todoPlanning';

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

  it('快速创建和稍后提醒使用稳定的本地时间', () => {
    expect(quickTodoDueAt('today', now)).toBe('2026-07-30T17:00');
    expect(quickTodoDueAt('tomorrow', now)).toBe('2026-07-31T09:00');
    expect(quickTodoDueAt('none', now)).toBeNull();
    expect(todoSnoozeAt('tenMinutes', now)).toBe('2026-07-30T16:40');
    expect(todoSnoozeAt('tomorrow', now)).toBe('2026-07-31T09:00');
  });

  it('编辑服务端 DATETIME 时保持原墙上时间，不重复叠加时区偏移', () => {
    expect(toTodoLocalInput('2026-07-30 18:25:00')).toBe('2026-07-30T18:25');
    expect(toTodoLocalInput('2026-07-30T18:25')).toBe('2026-07-30T18:25');
  });
});

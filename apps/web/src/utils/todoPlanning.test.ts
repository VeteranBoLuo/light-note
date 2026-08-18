import { describe, expect, it } from 'vitest';
import {
  dueForTodoGroup,
  formatTodoDateTime,
  normalizeTodoDateOnly,
  todoActionAt,
  todoConfiguredReminderAt,
  todoGroupKey,
  todoPastReminderAt,
  todoScheduleAt,
  todoSnoozeAt,
  toTodoLocalInput,
} from './todoPlanning';

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
    expect(formatTodoDateTime('2026-07-31 09:00:00', 'zh-CN', { relative: true, now, relativeLabels: labels })).toBe(
      '明天 09:00',
    );
    expect(formatTodoDateTime('2026-08-02 09:00:00', 'zh-CN', { relative: true, includeYear: false, now })).toBe(
      '8月2日（周日）09:00',
    );
  });

  it('英文格式与邮件使用同样的常见写法', () => {
    expect(formatTodoDateTime('2026-08-02 09:00:00', 'en-US', { now })).toBe('Sun, Aug 2, 2026, 9:00 AM');
  });

  it('DATE、ISO 与 Date 实例统一成没有时区语义的计划日期', () => {
    expect(normalizeTodoDateOnly('2026-08-18')).toBe('2026-08-18');
    expect(normalizeTodoDateOnly('2026-08-18T00:00:00.000Z')).toBe('2026-08-18');
    expect(todoScheduleAt({ startAt: null, dueAt: null, occurrenceDate: '2026-08-18T00:00:00.000Z' })).toBe(
      '2026-08-18T00:00:00',
    );
  });

  it('下一步时间取提醒、开始、截止和计划日期中最早者，暂停提醒不参与', () => {
    expect(
      todoActionAt({
        actionAt: null,
        reminderAt: null,
        reminder: { mode: 'once', channels: ['in_app'], startAt: '2026-08-01 09:00:00' },
        startAt: '2026-08-02 09:00:00',
        dueAt: '2026-08-03 18:00:00',
        occurrenceDate: '2026-08-02',
      } as any),
    ).toBe('2026-08-01 09:00:00');
    expect(
      todoActionAt({
        actionAt: null,
        reminderAt: null,
        reminder: { version: 1, mode: 'once', channels: ['in_app'], paused: true, nextAt: '2026-08-01 09:00:00' },
        startAt: '2026-08-02 09:00:00',
        dueAt: null,
        occurrenceDate: '2026-08-02',
      } as any),
    ).toBe('2026-08-02 09:00:00');
  });

  it('提醒 Job 已投递后仍能从实例规则还原已过提醒时间，但不把它冒充截止时间', () => {
    const item = {
      status: 'pending',
      startAt: null,
      dueAt: null,
      occurrenceDate: '2026-08-18',
      reminderAt: null,
      reminder: {
        mode: 'once_per_instance',
        trigger: { type: 'fixed_time', fixedTime: '10:30' },
        channels: ['in_app'],
        nextAt: null,
        remainingCount: 0,
      },
    } as any;

    expect(todoConfiguredReminderAt(item)).toBe('2026-08-18T10:30:00');
    expect(todoPastReminderAt(item, new Date('2026-08-18T12:00:00'))).toBe('2026-08-18T10:30:00');
    expect(todoPastReminderAt(item, new Date('2026-08-18T10:00:00'))).toBe('');
  });

  it('暂停、已完成或仍有未来提醒的待办不显示已过提醒', () => {
    const base = {
      status: 'pending',
      startAt: null,
      dueAt: null,
      occurrenceDate: '2026-08-18',
      reminderAt: null,
      reminder: {
        mode: 'once_per_instance',
        trigger: { type: 'fixed_time', fixedTime: '10:30' },
        channels: ['in_app'],
        nextAt: '2026-08-18T13:00:00',
      },
    } as any;

    expect(todoPastReminderAt(base, new Date('2026-08-18T12:00:00'))).toBe('');
    expect(todoPastReminderAt({ ...base, status: 'completed' }, new Date('2026-08-18T14:00:00'))).toBe('');
    expect(
      todoPastReminderAt(
        { ...base, reminder: { ...base.reminder, nextAt: null, paused: true } },
        new Date('2026-08-18T14:00:00'),
      ),
    ).toBe('');
  });

  it('没有时间的重复实例按计划日期分组，不再落入无日期', () => {
    expect(
      todoGroupKey(
        { status: 'pending', dueAt: null, startAt: null, occurrenceDate: '2026-07-31T00:00:00.000Z' } as any,
        now,
      ),
    ).toBe('upcoming');
  });

  it('纯计划日期可隐藏午夜时间', () => {
    expect(
      formatTodoDateTime('2026-07-31 00:00:00', 'zh-CN', {
        relative: true,
        includeTime: false,
        now,
        relativeLabels: { today: '今天', tomorrow: '明天' },
      }),
    ).toBe('明天');
  });
});

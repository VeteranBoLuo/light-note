import { describe, expect, it } from 'vitest';
import { buildTodoReminderEmail, calculateNextSchedule, notificationQuietUntil } from './todoReminder.js';

describe('todoReminder', () => {
  it('中文邮件使用大众化截止时间，不泄漏 Date 默认时区字符串', () => {
    const email = buildTodoReminderEmail(
      {
        locale: 'zh-CN',
        todoId: 'todo-1',
        todo: {
          title: '测试的标题',
          description: '测试说明',
          dueAt: '2026-07-30 09:00:00',
        },
      },
      'https://example.com',
    );

    expect(email.subject).toBe('轻笺待办提醒：测试的标题');
    expect(email.text).toContain('截止时间：2026年7月30日（周四）09:00');
    expect(email.text).not.toContain('GMT+');
    expect(email.text).toContain('https://example.com/inbox?tab=todo&todoId=todo-1');
  });

  it('英文邮件按用户语言同步标题、正文和截止时间', () => {
    const email = buildTodoReminderEmail(
      {
        locale: 'en-US',
        todoId: 'todo-2',
        todo: { title: 'Review the plan', dueAt: '2026-07-30 18:05:00' },
      },
      'https://example.com/',
    );

    expect(email.subject).toBe('Light Note todo reminder: Review the plan');
    expect(email.text).toContain('Due: Thu, Jul 30, 2026, 6:05 PM');
    expect(email.text).toContain('Open Light Note “Inbox” to handle it: https://example.com/inbox?tab=todo&todoId=todo-2');
  });

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

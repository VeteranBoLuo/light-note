import { describe, expect, it } from 'vitest';
import type { TodoItem } from '@/api/todoApi';
import {
  normalizeCurrentTodoPlanDraft,
  normalizeQuickTodoInitial,
  normalizeTodoCreateDraft,
  todoTodayInTimezone,
  type TodoCreateDraftV3,
} from './todoDraftNormalizer';

function scheduledDraft(startAt: string, dueAt: string): TodoCreateDraftV3 {
  return {
    task: {
      title: '每日学习',
      description: '',
      priority: 1,
      checklist: [],
      contextRefs: [],
    },
    timing: { startAt, dueAt, timezone: 'Asia/Shanghai' },
    reminder: { version: 1, mode: 'none', channels: [] },
    independentTasks: {
      enabled: true,
      plan: {
        type: 'scheduled',
        frequency: 'daily',
        interval: 1,
        end: { mode: 'until', untilDate: dueAt.slice(0, 10) },
      },
      reminder: { mode: 'none', channels: [] },
    },
  };
}

describe('todoDraftNormalizer', () => {
  it('快捷每日提醒使用用户选择的时间，并让旧版固定预设继续回退到 09:00', () => {
    const customized = normalizeQuickTodoInitial({
      title: '查看运营数据',
      quickReminderPreset: 'daily',
      quickReminderTime: '14:30',
    });
    const legacy = normalizeQuickTodoInitial({ title: '兼容旧草稿', quickReminderPreset: 'daily_0900' });

    expect(customized.singleTaskReminder).toMatchObject({
      mode: 'repeat',
      repeat: { startAt: expect.stringMatching(/ 14:30$/), intervalMinutes: 1440 },
    });
    expect(legacy.singleTaskReminder).toMatchObject({
      mode: 'repeat',
      repeat: { startAt: expect.stringMatching(/ 09:00$/), intervalMinutes: 1440 },
    });
  });

  it('高级重复任务的两个时间都留空时只补计划时区当天，不补开始或截止时刻', () => {
    const draft = scheduledDraft('', '');
    draft.independentTasks.plan.end = { mode: 'count', count: 3 };

    const normalized = normalizeTodoCreateDraft(draft);

    expect(normalized.timing).toEqual({
      timezone: 'Asia/Shanghai',
      anchorDate: todoTodayInTimezone('Asia/Shanghai'),
      startTime: null,
      dueTime: null,
      dueDayOffset: 0,
    });
  });

  it('计划当天按所选时区计算，而不是直接沿用浏览器本地日期', () => {
    const nearBeijingMidnight = new Date('2026-08-05T16:30:00.000Z');

    expect(todoTodayInTimezone('Asia/Shanghai', nearBeijingMidnight)).toBe('2026-08-06');
    expect(todoTodayInTimezone('America/New_York', nearBeijingMidnight)).toBe('2026-08-05');
  });

  it('按日期结束时把截止日期作为计划末日，截止时刻应用到每一项', () => {
    const normalized = normalizeTodoCreateDraft(scheduledDraft('2026-08-07 09:15', '2026-08-24 18:30'));

    expect(normalized.plan.end).toEqual({ mode: 'until', untilDate: '2026-08-24' });
    expect(normalized.timing).toMatchObject({
      anchorDate: '2026-08-07',
      startTime: '09:15',
      dueTime: '18:30',
      dueDayOffset: 0,
    });
  });

  it('未填开始时间时从计划时区当天生成，而不是把计划结束日期误当成首项日期', () => {
    const draft = scheduledDraft('', '2026-08-24 18:30');

    const normalized = normalizeTodoCreateDraft(draft);

    expect(normalized.plan.end).toEqual({ mode: 'until', untilDate: '2026-08-24' });
    expect(normalized.timing).toMatchObject({
      anchorDate: todoTodayInTimezone('Asia/Shanghai'),
      startTime: null,
      dueTime: '18:30',
      dueDayOffset: 0,
    });
  });

  it('按日期结束只认页面上的截止日期，不保留隐藏的旧结束日期', () => {
    const draft = scheduledDraft('', '');
    draft.independentTasks.plan.end = { mode: 'until', untilDate: '2026-09-30' };

    expect(normalizeTodoCreateDraft(draft).plan.end).toEqual({ mode: 'until', untilDate: null });
  });

  it('每项截止时刻早于开始时刻时保留跨夜语义', () => {
    const normalized = normalizeTodoCreateDraft(scheduledDraft('2026-08-07 22:00', '2026-08-24 06:00'));

    expect(normalized.timing.dueDayOffset).toBe(1);
  });

  it('普通待办保留超过 30 天的开始与截止日期跨度', () => {
    const draft = scheduledDraft('2026-08-07 09:15', '2027-08-07 18:30');
    draft.independentTasks.enabled = false;
    draft.independentTasks.plan = { type: 'once' };

    const normalized = normalizeTodoCreateDraft(draft);

    expect(normalized.timing.dueDayOffset).toBe(365);
  });

  it('普通无日期待办不会被高级计划的默认日期影响', () => {
    const draft = scheduledDraft('', '');
    draft.independentTasks.enabled = false;
    draft.independentTasks.plan = { type: 'once' };

    expect(normalizeTodoCreateDraft(draft).timing.anchorDate).toBeNull();
  });

  it('v2 单任务快捷顺延时保留内容、资料与版本化提醒，只替换截止时间', () => {
    const item = {
      id: 'todo-v2',
      title: '测试',
      description: '说明',
      checklist: [{ id: 'check-1', text: '步骤', done: false }],
      priority: 2,
      status: 'pending',
      startAt: '2026-08-09 10:00:00',
      dueAt: '2026-08-09 13:35:00',
      reminder: {
        version: 1,
        mode: 'once',
        once: { type: 'before_due', offsetMinutes: 30 },
        channels: ['in_app'],
      },
      planVersion: 2,
      seriesId: null,
      instanceTimezone: 'Asia/Shanghai',
      createdAt: '2026-08-09 09:00:00',
      updatedAt: '2026-08-09 09:00:00',
      resourceRefs: [{ type: 'note', id: 'note-1', title: '资料', snapshotTitle: '资料', available: true }],
    } satisfies TodoItem;

    const normalized = normalizeCurrentTodoPlanDraft(item, { dueAt: '2026-08-10T09:00' });

    expect(normalized).toMatchObject({
      title: '测试',
      description: '说明',
      priority: 2,
      checklist: [{ id: 'check-1', text: '步骤', done: false }],
      resourceRefs: [{ type: 'note', id: 'note-1' }],
      taskMode: 'single',
      plan: { type: 'once' },
      timing: {
        timezone: 'Asia/Shanghai',
        anchorDate: '2026-08-09',
        startTime: '10:00',
        dueTime: '09:00',
        dueDayOffset: 1,
      },
      singleTaskReminder: {
        version: 1,
        mode: 'once',
        once: { type: 'before_due', offsetMinutes: 30 },
      },
    });
  });
});

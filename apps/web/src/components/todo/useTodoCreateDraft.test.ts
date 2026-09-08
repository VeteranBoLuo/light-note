import { describe, expect, it } from 'vitest';
import type { TodoItem } from '@/api/todoApi';
import { normalizeTodoCreateDraft } from './todoDraftNormalizer';
import { useTodoCreateDraft } from './useTodoCreateDraft';

describe('useTodoCreateDraft', () => {
  it('编辑稍后提醒的 v2 单任务时保留 Job 投影的绝对日期', () => {
    const item = {
      id: 'todo-1',
      title: '买芥菜做泡菜',
      description: '',
      checklist: [],
      priority: 2,
      status: 'pending',
      startAt: null,
      dueAt: null,
      reminder: {
        version: 1,
        mode: 'once',
        once: { type: 'fixed_at', fixedAt: '2026-09-04 18:40:00' },
        channels: ['in_app'],
        nextAt: '2026-09-04 18:40:00',
      },
      planVersion: 2,
      seriesId: null,
      instanceTimezone: 'Asia/Shanghai',
      createdAt: '2026-09-03 10:00:00',
      updatedAt: '2026-09-03 18:40:00',
      resourceRefs: [],
    } satisfies TodoItem;
    const { draft, reset } = useTodoCreateDraft();

    reset(item);

    expect(draft.reminder).toMatchObject({
      version: 1,
      mode: 'once',
      once: { type: 'fixed_at', fixedAt: '2026-09-04 18:40:00' },
      nextAt: '2026-09-04 18:40:00',
    });
    expect(normalizeTodoCreateDraft(draft).singleTaskReminder).toMatchObject({
      version: 1,
      mode: 'once',
      once: { type: 'fixed_at', fixedAt: '2026-09-04 18:40:00' },
    });
  });
});

it('普通和高级时间、提醒草稿独立保存，切换不覆盖公共清单和标签', () => {
  const { draft, reset } = useTodoCreateDraft();
  reset(null, { title: '两个草稿', listId: 'list', tagIds: ['tag'] });
  draft.timing.dueAt = '2026-09-09 18:00';
  draft.reminder = { version: 1, mode: 'once', once: { type: 'at_due' }, channels: ['in_app'] };
  draft.independentTasks.timing = {
    timezone: 'Asia/Shanghai',
    anchorDate: '2026-09-10',
    startTime: '22:00',
    dueTime: '06:00',
    dueDayOffset: 1,
  };
  draft.independentTasks.plan.end = { mode: 'count', count: 3 };
  for (let i = 0; i < 3; i++) {
    draft.independentTasks.enabled = true;
    expect(normalizeTodoCreateDraft(draft)).toMatchObject({
      listId: 'list',
      tagIds: ['tag'],
      timing: { anchorDate: '2026-09-10', dueDayOffset: 1 },
      plan: { end: { mode: 'count', count: 3 } },
    });
    draft.independentTasks.enabled = false;
    expect(normalizeTodoCreateDraft(draft)).toMatchObject({
      timing: { anchorDate: '2026-09-09', dueTime: '18:00' },
      singleTaskReminder: { mode: 'once', once: { type: 'at_due' } },
    });
  }
});

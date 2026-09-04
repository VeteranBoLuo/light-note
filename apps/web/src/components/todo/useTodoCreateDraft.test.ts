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

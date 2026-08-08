import { describe, expect, it } from 'vitest';
import { normalizeTodoCreateDraft, type TodoCreateDraftV3 } from './todoDraftNormalizer';

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
});

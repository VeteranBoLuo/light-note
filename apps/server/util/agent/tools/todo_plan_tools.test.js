import { describe, expect, it } from 'vitest';
import previewTodoPlan from './preview_todo_plan.js';
import { normalizeTodoPlanToolArgs, todoPlanPreviewCard } from '../todoPlanToolShared.js';

describe('Agent 待办计划工具', () => {
  const input = {
    title: 'PPT 网课学习',
    timing: {
      timezone: 'Asia/Shanghai',
      anchorDate: '2026-08-06',
      startTime: '14:00',
      dueTime: '17:30',
    },
    plan: {
      type: 'scheduled',
      frequency: 'daily',
      interval: 1,
      end: { mode: 'count', count: 30 },
      pastPolicy: 'keep_overdue',
    },
    reminder: {
      mode: 'once_per_instance',
      trigger: { type: 'at_start' },
      channels: ['in_app', 'email'],
      targetEmail: 'owner@example.com',
    },
  };

  it('规范化工具参数并由确定性计算器给出 30 项 / 60 次投递', async () => {
    const normalized = normalizeTodoPlanToolArgs(input);
    const preview = await previewTodoPlan.execute(normalized);
    expect(preview.occurrenceCount).toBe(30);
    expect(preview.reminderJobCount).toBe(60);
    expect(preview.occurrences).toHaveLength(12);
    expect(preview.lastOccurrence.occurrenceDate).toBe('2026-09-04');
  });

  it('确认卡同时展示实例与提醒 Job 数，不把两者混为一谈', async () => {
    const preview = await previewTodoPlan.execute(normalizeTodoPlanToolArgs(input));
    expect(todoPlanPreviewCard(preview)).toMatchObject({
      title: '创建任务计划',
      details: expect.arrayContaining([
        { key: 'instances', value: '30' },
        { key: 'reminderJobs', value: '60' },
      ]),
    });
  });

  it('确认后的工具参数再次规范化时保留清单 ID，保证同一确认可幂等重放', () => {
    const prepared = normalizeTodoPlanToolArgs({ ...input, checklist: ['第一课', '第二课'] });
    const replayed = normalizeTodoPlanToolArgs(prepared);

    expect(replayed.checklist).toEqual(prepared.checklist);
  });
});

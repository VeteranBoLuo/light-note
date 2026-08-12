import { describe, expect, it } from 'vitest';
import {
  ADMIN_WORK_ITEM_POLICY_VERSION,
  enrichAdminWorkItem,
  resolveAdminWorkItemSlaMinutes,
  summarizeAdminWorkItems,
} from './adminWorkItemPolicy.js';

describe('adminWorkItemPolicy', () => {
  const now = new Date('2026-08-12T04:00:00.000Z');

  it('按来源和风险级别给人工事项分配 SLA', () => {
    const item = enrichAdminWorkItem(
      {
        source: 'security',
        status: 'pending',
        severity: 'critical',
        createdAt: '2026-08-12T02:30:00.000Z',
      },
      { now },
    );
    expect(ADMIN_WORK_ITEM_POLICY_VERSION).toMatch(/^2026-/u);
    expect(resolveAdminWorkItemSlaMinutes(item)).toBe(60);
    expect(item).toMatchObject({ ownerTeam: '安全与合规', slaState: 'overdue', overdueMinutes: 30 });
  });

  it('待投递提醒从计划时间起算，不会在到点前被误判超时', () => {
    const item = enrichAdminWorkItem(
      {
        source: 'todo_reminder',
        status: 'waiting',
        createdAt: '2026-08-01T00:00:00.000Z',
        scheduledAtUtc: '2026-08-12T05:00:00.000Z',
      },
      { now },
    );
    expect(item).toMatchObject({ slaMinutes: 10, slaState: 'within_sla', ageMinutes: 0 });
    expect(item.dueAt).toBe('2026-08-12T05:10:00.000Z');
  });

  it('未知来源明确返回口径不可用，汇总不将其当作 0', () => {
    const unknown = enrichAdminWorkItem({ source: 'unknown', createdAt: '2026-08-01' }, { now });
    const healthy = enrichAdminWorkItem(
      { source: 'opinion', status: 'pending', severity: 'normal', createdAt: '2026-08-11T12:00:00.000Z' },
      { now },
    );
    expect(unknown.slaState).toBe('unavailable');
    expect(summarizeAdminWorkItems([unknown, healthy])).toMatchObject({ slaUnavailable: 1, withinSla: 1 });
  });
});

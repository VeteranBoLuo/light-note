import { describe, expect, it } from 'vitest';
import {
  growthClaimBreakdownEntries,
  growthClaimBreakdownTotal,
  resolveClaimableBreakdown,
  resolveClaimedBreakdown,
} from './growthClaimFeedback';

describe('growthClaimFeedback', () => {
  it('按 claimable 的四类分组生成领取前构成，并忽略非法计数', () => {
    const breakdown = resolveClaimableBreakdown({
      daily: { count: 1 },
      growthTasks: { count: -1 },
      achievements: { count: '4' },
      weekly: { count: Number.NaN },
    });

    expect(breakdown).toEqual({ daily: 1, growthTasks: 0, achievements: 4, weekly: 0 });
    expect(growthClaimBreakdownTotal(breakdown)).toBe(5);
    expect(growthClaimBreakdownEntries(breakdown)).toEqual([
      { source: 'daily', count: 1 },
      { source: 'achievements', count: 4 },
    ]);
  });

  it('领取后只统计 claimed 回执，并保持任务与成就来源分离', () => {
    expect(
      resolveClaimedBreakdown([
        { type: 'daily', status: 'claimed' },
        { type: 'growthTask', status: 'already' },
        { type: 'growthTask', status: 'claimed' },
        { type: 'achievement', status: 'claimed' },
        { type: 'achievement', status: 'claimed' },
        { type: 'weekly', status: 'incomplete' },
        { type: 'unknown', status: 'claimed' },
      ]),
    ).toEqual({ daily: 1, growthTasks: 1, achievements: 2, weekly: 0 });
  });
});

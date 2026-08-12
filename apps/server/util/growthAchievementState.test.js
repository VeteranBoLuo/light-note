import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: { query: vi.fn() } }));
vi.mock('./growth.js', () => ({
  ACHIEVEMENTS: [
    { key: 'todo_20', metric: 'completedTodoCount', target: 20 },
    { key: 'todo_100', metric: 'completedTodoCount', target: 100 },
  ],
  meetsAchievementRequirement: (achievement, metrics) =>
    Number(metrics[achievement.metric] || 0) >= Number(achievement.target || 0),
}));

import { persistAchievementUnlocksForMetrics } from './growthAchievementState.js';

describe('growthAchievementState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('达标时只追加永久解锁状态，不覆盖既有领取时间', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };

    await expect(
      persistAchievementUnlocksForMetrics('user-1', { completedTodoCount: 20, level: 2 }, { db }),
    ).resolves.toEqual(['todo_20']);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT IGNORE INTO user_achievements'),
      ['user-1', 'todo_20'],
    );
    expect(String(db.query.mock.calls[0][0])).not.toContain('UPDATE');
  });

  it('指标回落后不删除或重置永久解锁状态', async () => {
    const db = { query: vi.fn() };

    await expect(
      persistAchievementUnlocksForMetrics('user-1', { completedTodoCount: 19, level: 2 }, { db }),
    ).resolves.toEqual([]);

    expect(db.query).not.toHaveBeenCalled();
  });
});

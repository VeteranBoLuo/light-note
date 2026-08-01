import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
import { GROWTH_TASK_DEFINITIONS } from './growthTaskCatalog.js';
import { ensureGrowthTaskSchema } from './growthTaskSchema.js';

describe('growthTaskSchema', () => {
  it('定义四个可完成任务，且启动初始化会创建表、幂等种子并禁用退役任务', async () => {
    expect(GROWTH_TASK_DEFINITIONS).toHaveLength(4);
    expect(GROWTH_TASK_DEFINITIONS.map((task) => task.taskKey)).toEqual([
      'profile_avatar',
      'first_note',
      'first_bookmark',
      'first_todo',
    ]);
    expect(GROWTH_TASK_DEFINITIONS.map((task) => task.rewardExp)).toEqual([50, 50, 30, 30]);

    pool.query
      .mockResolvedValueOnce([[{ tableCount: 1 }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ columnCount: 0 }], []])
      .mockResolvedValue([[], []]);
    await ensureGrowthTaskSchema();

    expect(pool.query).toHaveBeenCalledTimes(9);
    expect(pool.query.mock.calls[0][0]).toContain('information_schema.tables');
    expect(pool.query.mock.calls[1][0]).toContain('CREATE TABLE IF NOT EXISTS growth_tasks');
    expect(pool.query.mock.calls[2][0]).toContain('CREATE TABLE IF NOT EXISTS user_growth_tasks');
    expect(pool.query.mock.calls[2][0]).toContain('claimed_at DATETIME');
    expect(pool.query.mock.calls[3][0]).toContain('information_schema.columns');
    expect(pool.query.mock.calls[4][0]).toContain('ADD COLUMN claimed_at');
    expect(pool.query.mock.calls[5][0]).toContain('SET claimed_at = COALESCE');
    expect(pool.query.mock.calls[6][0]).toContain('ON DUPLICATE KEY UPDATE');
    expect(pool.query.mock.calls[6][1]).not.toContain('growth.tasks.firstReview.title');
    expect(pool.query.mock.calls[7]).toEqual([
      expect.stringContaining('UPDATE growth_tasks SET enabled = 0'),
      ['first_review'],
    ]);
    expect(pool.query.mock.calls[8][0]).toContain('INSERT IGNORE INTO user_growth_tasks');
    expect(pool.query.mock.calls[8][0]).toContain('claimed_at');
    expect(pool.query.mock.calls[8][0]).toContain("'profile_avatar' AS task_key");
    expect(pool.query.mock.calls[8][0]).toContain("COALESCE(TRIM(u.head_picture), '') <> ''");
    expect(pool.query.mock.calls[8][0]).not.toContain('u.update_time');
    expect(pool.query.mock.calls[8][0]).not.toContain("source = 'profile_done'");
    expect(pool.query.mock.calls[8][0]).toContain('FROM note');
    expect(pool.query.mock.calls[8][0]).toContain('FROM bookmark');
    expect(pool.query.mock.calls[8][0]).toContain('onboarding_seed_resources');
  });
});

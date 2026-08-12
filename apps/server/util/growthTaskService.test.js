import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));
vi.mock('./growthTaskSchema.js', () => ({ ensureGrowthTaskSchema: vi.fn() }));

import pool from '../db/index.js';
import { ensureGrowthTaskSchema } from './growthTaskSchema.js';
import { getGrowthTasks } from './growthTaskService.js';

describe('growthTaskService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('返回启用任务、用户状态和汇总计数', async () => {
    pool.query.mockResolvedValueOnce([
      [
        {
          taskKey: 'profile_avatar',
          titleKey: 'growth.tasks.profileAvatar.title',
          descriptionKey: 'growth.tasks.profileAvatar.description',
          rewardExp: 50,
          status: 'completed',
          completedAt: '2026-08-01 10:00:00',
          claimedAt: null,
        },
        {
          taskKey: 'first_note',
          titleKey: 'growth.tasks.firstNote.title',
          descriptionKey: 'growth.tasks.firstNote.description',
          rewardExp: 50,
          status: 'pending',
          completedAt: null,
          claimedAt: null,
        },
      ],
      [],
    ]);

    await expect(getGrowthTasks('user-1')).resolves.toEqual({
      tasks: [
        {
          taskKey: 'profile_avatar',
          titleKey: 'growth.tasks.profileAvatar.title',
          descriptionKey: 'growth.tasks.profileAvatar.description',
          rewardExp: 50,
          status: 'completed',
          completed: true,
          claimed: false,
          claimable: true,
          completedAt: '2026-08-01 10:00:00',
          claimedAt: null,
        },
        {
          taskKey: 'first_note',
          titleKey: 'growth.tasks.firstNote.title',
          descriptionKey: 'growth.tasks.firstNote.description',
          rewardExp: 50,
          status: 'pending',
          completed: false,
          claimed: false,
          claimable: false,
          completedAt: null,
          claimedAt: null,
        },
      ],
      completedTasks: [],
      allTasks: [
        {
          taskKey: 'profile_avatar',
          titleKey: 'growth.tasks.profileAvatar.title',
          descriptionKey: 'growth.tasks.profileAvatar.description',
          rewardExp: 50,
          status: 'completed',
          completed: true,
          claimed: false,
          claimable: true,
          completedAt: '2026-08-01 10:00:00',
          claimedAt: null,
        },
        {
          taskKey: 'first_note',
          titleKey: 'growth.tasks.firstNote.title',
          descriptionKey: 'growth.tasks.firstNote.description',
          rewardExp: 50,
          status: 'pending',
          completed: false,
          claimed: false,
          claimable: false,
          completedAt: null,
          claimedAt: null,
        },
      ],
      totalCount: 2,
      completedCount: 1,
      claimedCount: 0,
      claimableCount: 1,
      remainingCount: 1,
      activeCount: 2,
    });
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN user_growth_tasks'), ['user-1']);
    expect(pool.query.mock.calls[0][0]).toContain('WHERE gt.enabled = 1');
    expect(ensureGrowthTaskSchema).not.toHaveBeenCalled();
  });

  it('游客预览使用空 subject id，不读取共享游客账号历史状态', async () => {
    pool.query.mockResolvedValueOnce([[], []]);

    await expect(getGrowthTasks('visitor')).resolves.toEqual({
      tasks: [],
      completedTasks: [],
      allTasks: [],
      totalCount: 0,
      completedCount: 0,
      claimedCount: 0,
      claimableCount: 0,
      remainingCount: 0,
      activeCount: 0,
    });
    expect(pool.query.mock.calls[0][1]).toEqual([null]);
    expect(ensureGrowthTaskSchema).not.toHaveBeenCalled();
  });
});

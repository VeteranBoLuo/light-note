import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  getGrowth: vi.fn(),
  getGrowthDashboard: vi.fn(),
  grantExp: vi.fn(),
  earnPoints: vi.fn(),
  getAchievementFrameByKey: vi.fn(),
  getGrowthTasks: vi.fn(),
  getWeeklyChallenges: vi.fn(),
  getGrowthCalendarContext: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { getConnection: mocks.getConnection } }));
vi.mock('./growth.js', () => ({
  DAILY_QUEST_STAGES: [
    { key: 'bronze', required: 1, exp: 10, points: 5, source: 'daily_quest_1' },
    { key: 'silver', required: 2, exp: 15, points: 10, source: 'daily_quest_2' },
    { key: 'gold', required: 3, exp: 25, points: 15, source: 'daily_quest_3' },
  ],
  getGrowth: mocks.getGrowth,
  getGrowthDashboard: mocks.getGrowthDashboard,
  grantExp: mocks.grantExp,
}));
vi.mock('./points.js', () => ({
  earnPoints: mocks.earnPoints,
  getAchievementFrameByKey: mocks.getAchievementFrameByKey,
}));
vi.mock('./growthTaskService.js', () => ({ getGrowthTasks: mocks.getGrowthTasks }));
vi.mock('./weeklyChallenge.js', () => ({ getWeeklyChallenges: mocks.getWeeklyChallenges }));
vi.mock('./growthPreferences.js', () => ({ getGrowthCalendarContext: mocks.getGrowthCalendarContext }));

import { claimGrowthRewards, getGrowthClaimableSnapshot } from './growthClaimService.js';

const calendar = {
  dayKey: '20260812',
  weekKey: '202633',
  timezone: 'Asia/Shanghai',
  utcOffsetMinutes: 480,
  shiftMinutes: 0,
};

function dashboard(overrides = {}) {
  return {
    quests: [{ key: 'create', done: false, cur: 0, target: 1 }],
    questBonus: { completedCount: 0, total: 3, stages: [] },
    achievements: [],
    stats: { pendingResourceCount: 0, bookmarkCount: 0, noteCount: 0, fileCount: 0 },
    ...overrides,
  };
}

function tasks(overrides = {}) {
  return { tasks: [], completedTasks: [], allTasks: [], ...overrides };
}

function weekly(overrides = {}) {
  return { weekKey: '202633', challenges: [], ...overrides };
}

function connection() {
  return {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getGrowthCalendarContext.mockResolvedValue(calendar);
  mocks.getGrowthDashboard.mockResolvedValue(dashboard());
  mocks.getGrowthTasks.mockResolvedValue(tasks());
  mocks.getWeeklyChallenges.mockResolvedValue(weekly());
  mocks.getGrowth.mockResolvedValue({ exp: 100, points: 20 });
  mocks.earnPoints.mockResolvedValue(true);
  mocks.grantExp.mockResolvedValue({ granted: 10, duplicated: false, leveledUp: false });
});

describe('growthClaimService', () => {
  it('显式无效领取范围直接拒绝，不能误退化成领取全部', async () => {
    await expect(claimGrowthRewards('user-1', { scopes: ['weekly', 'unsafe'] })).resolves.toMatchObject({
      ok: false,
      reason: 'invalid_scope',
      claimed: 0,
      receipts: [],
    });
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });

  it('重复的合法领取范围按同一范围幂等处理', async () => {
    const conn = connection();
    mocks.getConnection.mockResolvedValueOnce(conn);

    await expect(
      claimGrowthRewards('user-1', { scopes: ['weekly', 'weekly'] }, { userRole: 'user' }),
    ).resolves.toMatchObject({ ok: true, claimed: 0, receipts: [] });

    expect(mocks.getWeeklyChallenges).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalledOnce();
  });

  it('下一步建议扫描完整新手路线，不受最多展示三项限制', async () => {
    const firstThree = ['profile_avatar', 'first_note', 'first_bookmark'].map((taskKey) => ({
      taskKey,
      completed: true,
      claimed: false,
      claimable: true,
    }));
    mocks.getGrowthTasks.mockResolvedValueOnce(
      tasks({
        tasks: firstThree,
        allTasks: [...firstThree, { taskKey: 'first_file', completed: false, claimed: false, claimable: false }],
      }),
    );

    const result = await getGrowthClaimableSnapshot('user-1', { userRole: 'user' });

    expect(result.nextAction).toMatchObject({ type: 'growth_task', key: 'first_file', action: 'upload_file' });
  });

  it('没有待整理资源时不推荐空收件箱，改为下一个当下可执行行动', async () => {
    mocks.getGrowthTasks.mockResolvedValueOnce(
      tasks({
        allTasks: [
          { taskKey: 'first_organize', rewardExp: 40, completed: false, claimed: false, claimable: false },
        ],
      }),
    );

    const result = await getGrowthClaimableSnapshot('user-1', { userRole: 'user' });

    expect(result.nextAction).toMatchObject({ type: 'daily_quest', key: 'create', action: 'create_note' });
  });

  it('有可整理资源时推荐首次整理，直接披露可领取经验而不再显示无信息量的 0/1', async () => {
    mocks.getGrowthDashboard.mockResolvedValueOnce(
      dashboard({ stats: { pendingResourceCount: 2, bookmarkCount: 1, noteCount: 0, fileCount: 0 } }),
    );
    mocks.getGrowthTasks.mockResolvedValueOnce(
      tasks({
        allTasks: [
          { taskKey: 'first_organize', rewardExp: 40, completed: false, claimed: false, claimable: false },
        ],
      }),
    );

    const result = await getGrowthClaimableSnapshot('user-1', { userRole: 'user' });

    expect(result.nextAction).toEqual({
      type: 'growth_task',
      key: 'first_organize',
      action: 'open_inbox',
      progress: null,
      reward: { exp: 40, points: 0 },
    });
  });

  it('奖励已写入但最终成长快照失败时整笔回滚', async () => {
    const conn = connection();
    mocks.getConnection.mockResolvedValueOnce(conn);
    mocks.getWeeklyChallenges.mockResolvedValueOnce(
      weekly({ challenges: [{ key: 'todo_5', metric: 'todo', claimable: true, claimed: false, reward: 30 }] }),
    );
    mocks.getGrowth.mockRejectedValueOnce(new Error('snapshot failed'));

    await expect(claimGrowthRewards('user-1', { scopes: ['weekly'] }, { userRole: 'user' })).rejects.toThrow(
      'snapshot failed',
    );

    expect(mocks.earnPoints).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.release).toHaveBeenCalledOnce();
  });

  it('同一周挑战重复请求只在第一次到账并返回逐项回执', async () => {
    const firstConnection = connection();
    const secondConnection = connection();
    mocks.getConnection.mockResolvedValueOnce(firstConnection).mockResolvedValueOnce(secondConnection);
    mocks.getWeeklyChallenges.mockResolvedValue(
      weekly({ challenges: [{ key: 'todo_5', metric: 'todo', claimable: true, claimed: false, reward: 30 }] }),
    );
    mocks.earnPoints.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const first = await claimGrowthRewards('user-1', { scopes: ['weekly'] }, { userRole: 'user' });
    const retry = await claimGrowthRewards('user-1', { scopes: ['weekly'] }, { userRole: 'user' });

    expect(first).toMatchObject({
      ok: true,
      claimed: 1,
      points: 30,
      receipts: [{ type: 'weekly', key: 'todo_5', status: 'claimed', reward: { points: 30, exp: 0 } }],
    });
    expect(retry).toMatchObject({
      ok: true,
      claimed: 0,
      points: 0,
      receipts: [{ type: 'weekly', key: 'todo_5', status: 'already', reward: {} }],
    });
    expect(firstConnection.commit).toHaveBeenCalledOnce();
    expect(secondConnection.commit).toHaveBeenCalledOnce();
  });
});

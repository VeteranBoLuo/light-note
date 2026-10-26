import { PUBLIC_RESOURCE_ACHIEVEMENTS, PUBLIC_RESOURCE_FRAMES } from './publicResources/achievements.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  taskRewardStates: vi.fn(),
  claimTaskRewards: vi.fn(),
  getGrowth: vi.fn(),
  getGrowthDashboard: vi.fn(),
  grantExp: vi.fn(),
  lockGrowthAccount: vi.fn(),
  earnPoints: vi.fn(),
  getAchievementFrameByKey: vi.fn(),
  getGrowthTasks: vi.fn(),
  getWeeklyChallenges: vi.fn(),
  getGrowthCalendarContext: vi.fn(),
}));

vi.mock('./communityFeed/taskRewards.js', () => ({ taskRewardStates: mocks.taskRewardStates, claimTaskRewards: mocks.claimTaskRewards }));
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
  lockGrowthAccount: mocks.lockGrowthAccount,
}));
vi.mock('./points.js', () => ({
  earnPoints: mocks.earnPoints,
  getAchievementFrameByKey: mocks.getAchievementFrameByKey,
}));
vi.mock('./growthTaskService.js', () => ({ getGrowthTasks: mocks.getGrowthTasks }));
vi.mock('./weeklyChallenge.js', () => ({ getWeeklyChallenges: mocks.getWeeklyChallenges }));
vi.mock('./growthPreferences.js', () => ({ getGrowthCalendarContext: mocks.getGrowthCalendarContext }));

import { claimGrowthRewards, getGrowthClaimableSnapshot } from './growthClaimService.js';
import { POINTS_EARNING_C8_POLICY_VERSION, resolveDailyQuestStages } from './pointsEarningPolicy.js';

afterEach(() => vi.unstubAllEnvs());

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
  mocks.taskRewardStates.mockResolvedValue([]);
  mocks.claimTaskRewards.mockResolvedValue([]);
  mocks.getGrowthCalendarContext.mockResolvedValue(calendar);
  mocks.getGrowthDashboard.mockResolvedValue(dashboard());
  mocks.getGrowthTasks.mockResolvedValue(tasks());
  mocks.getWeeklyChallenges.mockResolvedValue(weekly());
  mocks.getGrowth.mockResolvedValue({ exp: 100, points: 20 });
  mocks.earnPoints.mockResolvedValue(true);
  mocks.grantExp.mockResolvedValue({ granted: 10, duplicated: false, leveledUp: false });
});

describe('growthClaimService', () => {
  it('claims the five contribution tiers and three frames together, then skips claimed tiers', async () => {
    const conn = connection();
    mocks.getConnection.mockResolvedValue(conn);
    mocks.getAchievementFrameByKey.mockImplementation((key) => PUBLIC_RESOURCE_FRAMES.find((f) => f.achievementKey === key));
    const achievements = PUBLIC_RESOURCE_ACHIEVEMENTS.map((a) => ({ ...a, unlocked: true, claimed: false }));
    mocks.getGrowthDashboard.mockResolvedValue(dashboard({ achievements }));
    const result = await claimGrowthRewards('contributor', { scopes: ['achievements'] });
    expect(result).toMatchObject({ ok: true, points: 570, claimed: 5, frames: PUBLIC_RESOURCE_FRAMES.map((f) => f.id) });
    expect(conn.query.mock.calls.filter(([sql]) => sql.includes('INSERT IGNORE INTO user_cosmetics'))).toHaveLength(3);
    expect(conn.commit).toHaveBeenCalledOnce();
    mocks.getGrowthDashboard.mockResolvedValue(dashboard({ achievements: achievements.map((a) => ({ ...a, claimed: true })) }));
    mocks.earnPoints.mockClear();
    expect(await claimGrowthRewards('contributor', { scopes: ['achievements'] })).toMatchObject({ ok: true, points: 0, claimed: 0 });
    expect(mocks.earnPoints).not.toHaveBeenCalled();
    mocks.getAchievementFrameByKey.mockReset();
  });
  it('rolls back contribution points if the matching frame cannot be saved', async () => {
    const conn = connection();
    mocks.getConnection.mockResolvedValue(conn);
    mocks.getGrowthDashboard.mockResolvedValue(dashboard({ achievements: [{ ...PUBLIC_RESOURCE_ACHIEVEMENTS[2], unlocked: true }] }));
    mocks.getAchievementFrameByKey.mockReturnValue(PUBLIC_RESOURCE_FRAMES[0]);
    conn.query.mockImplementation(async (sql) => {
      if (sql.includes('INSERT IGNORE INTO user_cosmetics')) throw new Error('cosmetic fixture failure');
      return [{ affectedRows: 1 }];
    });
    await expect(claimGrowthRewards('contributor', { scopes: ['achievements'] })).rejects.toThrow('cosmetic fixture failure');
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
    mocks.getAchievementFrameByKey.mockReset();
  });
  it('C8 单项和一键领取共用阶段与旧成就快照，未来成就使用减半奖励', async () => {
    vi.stubEnv('POINTS_EARNING_C5_ENABLED', 'true');
    vi.stubEnv('POINTS_EARNING_C8_ENABLED', 'true');
    const conn = connection();
    mocks.getConnection.mockResolvedValueOnce(conn);
    mocks.getGrowthDashboard.mockResolvedValueOnce(
      dashboard({
        questBonus: {
          policyVersion: POINTS_EARNING_C8_POLICY_VERSION,
          stages: resolveDailyQuestStages(POINTS_EARNING_C8_POLICY_VERSION).map((stage) => ({
            ...stage,
            claimable: true,
          })),
        },
        achievements: [
          {
            key: 'bookmark_500',
            unlocked: true,
            reward: 200,
            policyVersion: POINTS_EARNING_C8_POLICY_VERSION,
            rewardSnapshot: { points: 400, frameId: 'frame_bookmark_archive', policyVersion: 'points-earning-c6' },
          },
          { key: 'file_500', unlocked: true, reward: 250, policyVersion: POINTS_EARNING_C8_POLICY_VERSION },
        ],
      }),
    );
    vi.stubEnv('POINTS_EARNING_C6_ENABLED', 'false');
    const result = await claimGrowthRewards('user-1', { scopes: ['daily', 'achievements'] }, { userRole: 'user' });
    expect(result).toMatchObject({ ok: true, points: 665, claimed: 4, frames: ['frame_bookmark_archive'] });
    expect(mocks.earnPoints.mock.calls.map(([, points]) => points)).toEqual([5, 10, 400, 250]);
    expect(mocks.earnPoints.mock.calls[2][5]).toMatchObject({ policyVersion: 'points-earning-c6' });
    expect(mocks.earnPoints.mock.calls[3][5]).toMatchObject({ policyVersion: POINTS_EARNING_C8_POLICY_VERSION });
    expect(mocks.grantExp.mock.calls.map(([, , options]) => options.amount)).toEqual([5, 10]);
    expect(conn.commit).toHaveBeenCalledOnce();
  });

  it('C8 暂停时单独领取新成就也失败关闭，不绕过日常奖励写闸', async () => {
    vi.stubEnv('POINTS_EARNING_C5_ENABLED', 'true');
    vi.stubEnv('POINTS_EARNING_C8_ENABLED', 'false');
    const conn = connection();
    mocks.getConnection.mockResolvedValueOnce(conn);
    mocks.getGrowthDashboard.mockResolvedValueOnce(
      dashboard({
        achievements: [
          { key: 'file_500', unlocked: true, reward: 250, policyVersion: POINTS_EARNING_C8_POLICY_VERSION },
        ],
      }),
    );
    expect(await claimGrowthRewards('user-1', { scopes: ['achievements'] })).toMatchObject({
      ok: false,
      reason: 'earning_paused',
    });
    expect(mocks.earnPoints).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('所有路线完成并领取后保留周报与任务入口，不让建议消失', async () => {
    mocks.getGrowthDashboard.mockResolvedValueOnce(dashboard({ quests: [{ key: 'daily_note', done: true }] }));
    mocks.getGrowthTasks.mockResolvedValueOnce(
      tasks({ allTasks: [{ taskKey: 'first_file', completed: true, claimed: true }] }),
    );
    mocks.getWeeklyChallenges.mockResolvedValueOnce(
      weekly({ challenges: [{ key: 'wk_note', metric: 'note', done: true, claimed: true }] }),
    );
    const result = await getGrowthClaimableSnapshot('user-1', { userRole: 'user' });
    expect(result.nextAction).toMatchObject({ key: 'weekly_report', action: 'open_weekly_report' });
    expect(result.nextActions).toMatchObject([
      { key: 'weekly_report', action: 'open_weekly_report' },
      { key: 'task_center', action: 'open_growth_tasks' },
    ]);
  });
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

    expect(mocks.lockGrowthAccount).toHaveBeenCalledWith(conn, 'user-1');
    expect(mocks.lockGrowthAccount.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getGrowthCalendarContext.mock.invocationCallOrder[0],
    );
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
    expect(result.nextActions).toMatchObject([
      { type: 'growth_task', key: 'first_file', action: 'upload_file' },
      { type: 'daily_quest', key: 'create', action: 'create_note' },
    ]);
  });

  it('没有待整理资源时不推荐空收件箱，改为下一个当下可执行行动', async () => {
    mocks.getGrowthTasks.mockResolvedValueOnce(
      tasks({
        allTasks: [{ taskKey: 'first_organize', rewardExp: 40, completed: false, claimed: false, claimable: false }],
      }),
    );

    const result = await getGrowthClaimableSnapshot('user-1', { userRole: 'user' });

    expect(result.nextAction).toMatchObject({ type: 'daily_quest', key: 'create', action: 'create_note' });
    expect(result.nextActions).toMatchObject([
      { type: 'daily_quest', key: 'create', action: 'create_note' },
      { type: 'growth_review', key: 'weekly_report', action: 'open_weekly_report' },
    ]);
  });

  it('有可整理资源时推荐首次整理，直接披露可领取经验而不再显示无信息量的 0/1', async () => {
    mocks.getGrowthDashboard.mockResolvedValueOnce(
      dashboard({ stats: { pendingResourceCount: 2, bookmarkCount: 1, noteCount: 0, fileCount: 0 } }),
    );
    mocks.getGrowthTasks.mockResolvedValueOnce(
      tasks({
        allTasks: [{ taskKey: 'first_organize', rewardExp: 40, completed: false, claimed: false, claimable: false }],
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

it('community awards join the shared count and default claim-all, with explicit topic filtering', async () => {
  mocks.taskRewardStates.mockResolvedValue([{key:'autumn',state:'claimable',exp:20,points:50}]);
  const snapshot=await getGrowthClaimableSnapshot('user-1',{userRole:'user'});
  expect(snapshot.count).toBe(1);
  expect(snapshot.community.count).toBe(1);
  const conn=connection(); mocks.getConnection.mockResolvedValue(conn);
  mocks.claimTaskRewards.mockResolvedValue([{type:'community',key:'autumn',status:'claimed',reward:{exp:20,points:50}}]);
  const result=await claimGrowthRewards('user-1',{}, {userRole:'user'});
  expect(result).toMatchObject({claimed:1,exp:20,points:50});
  expect(mocks.claimTaskRewards.mock.calls[0][2]).toBeNull();
  await claimGrowthRewards('user-1',{scopes:['community'],keys:{community:['autumn']}},{userRole:'user'});
  expect([...mocks.claimTaskRewards.mock.calls[1][2]]).toEqual(['autumn']);
});

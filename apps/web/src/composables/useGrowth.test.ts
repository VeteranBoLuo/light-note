import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-a' },
  getMyGrowth: vi.fn(),
  getGrowthTasks: vi.fn(),
  claimGrowthTask: vi.fn(),
  getDashboard: vi.fn(),
  getClaimable: vi.fn(),
  claimAll: vi.fn(),
}));

vi.mock('@/store', () => ({
  useUserStore: () => mocks.user,
}));

vi.mock('@/api/growthApi.ts', () => ({
  default: {
    getMyGrowth: mocks.getMyGrowth,
    getGrowthTasks: mocks.getGrowthTasks,
    claimGrowthTask: mocks.claimGrowthTask,
    getDashboard: mocks.getDashboard,
    getClaimable: mocks.getClaimable,
    claimAll: mocks.claimAll,
  },
}));

import { resetGrowth, useGrowth, type Growth } from './useGrowth';

function growth(level: number): Growth {
  return {
    exp: level * 100,
    level,
    name: `Lv.${level}`,
    spaceMb: 512,
    aiTokenDaily: 1000,
    streak: 0,
    checkedInToday: false,
    levelStartExp: 0,
    nextLevelExp: null,
    expToNext: 0,
    progress: 0,
    isMax: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useGrowth load', () => {
  beforeEach(() => {
    resetGrowth();
    mocks.user.id = 'user-a';
    mocks.getMyGrowth.mockReset();
    mocks.getGrowthTasks.mockReset();
    mocks.claimGrowthTask.mockReset();
    mocks.getDashboard.mockReset();
    mocks.getClaimable.mockReset();
    mocks.claimAll.mockReset();
    mocks.getClaimable.mockResolvedValue({
      status: 200,
      data: {
        count: 0,
        daily: { count: 0, items: [] },
        growthTasks: { count: 0, items: [] },
        achievements: { count: 0, items: [] },
        weekly: { count: 0, items: [] },
      },
    });
  });

  it('合并同一账号同时发起的成长请求', async () => {
    const response = deferred<{ status: number; data: Growth }>();
    mocks.getMyGrowth.mockReturnValue(response.promise);

    const first = useGrowth().load();
    const second = useGrowth().load();

    await Promise.resolve();
    expect(mocks.getMyGrowth).toHaveBeenCalledTimes(1);

    const data = growth(3);
    response.resolve({ status: 200, data });

    await expect(first).resolves.toEqual(data);
    await expect(second).resolves.toEqual(data);
    expect(useGrowth().growth.value).toEqual(data);
    expect(useGrowth().loading.value).toBe(false);
  });

  it('账号切换后忽略旧账号的迟到响应', async () => {
    const oldResponse = deferred<{ status: number; data: Growth }>();
    const newResponse = deferred<{ status: number; data: Growth }>();
    mocks.getMyGrowth.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(newResponse.promise);

    const oldRequest = useGrowth().load();
    mocks.user.id = 'user-b';
    const newRequest = useGrowth().load();

    const newData = growth(6);
    newResponse.resolve({ status: 200, data: newData });
    await expect(newRequest).resolves.toEqual(newData);

    oldResponse.resolve({ status: 200, data: growth(2) });
    await expect(oldRequest).resolves.toBeNull();

    expect(mocks.getMyGrowth).toHaveBeenCalledTimes(2);
    expect(useGrowth().growth.value).toEqual(newData);
    expect(useGrowth().loading.value).toBe(false);
  });

  it('账号切换后看板等模块缓存也不会被旧请求覆盖', async () => {
    mocks.getMyGrowth.mockResolvedValueOnce({ status: 200, data: growth(2) }).mockResolvedValueOnce({
      status: 200,
      data: growth(6),
    });
    await useGrowth().load();
    const oldDashboard = deferred<{ status: number; data: any }>();
    const newDashboard = deferred<{ status: number; data: any }>();
    mocks.getDashboard.mockReturnValueOnce(oldDashboard.promise).mockReturnValueOnce(newDashboard.promise);

    const oldRequest = useGrowth().loadDashboard();
    mocks.user.id = 'user-b';
    await useGrowth().load();
    const newRequest = useGrowth().loadDashboard();

    const newData = { stats: { noteCount: 8 }, achievements: [], quests: [], timeline: [] };
    newDashboard.resolve({ status: 200, data: newData });
    await expect(newRequest).resolves.toEqual(newData);
    oldDashboard.resolve({ status: 200, data: { stats: { noteCount: 1 } } });
    await expect(oldRequest).resolves.toBeNull();

    expect(useGrowth().dashboard.value).toEqual(newData);
    expect(useGrowth().dashboardLoading.value).toBe(false);
  });

  it('账号切换后忽略旧账号统一领取的成长快照', async () => {
    const oldClaim = deferred<{ status: number; data: any }>();
    mocks.getMyGrowth.mockResolvedValueOnce({ status: 200, data: growth(2) }).mockResolvedValueOnce({
      status: 200,
      data: growth(6),
    });
    await useGrowth().load();
    mocks.claimAll.mockReturnValueOnce(oldClaim.promise);

    const claimRequest = useGrowth().claimAllRewards();
    mocks.user.id = 'user-b';
    await useGrowth().load();

    oldClaim.resolve({ status: 200, data: { ok: true, claimed: 1, growth: growth(9) } });
    await expect(claimRequest).resolves.toMatchObject({ status: 200 });

    expect(useGrowth().growth.value).toEqual(growth(6));
    expect(useGrowth().claimingRewards.value).toBe(false);
    expect(mocks.getDashboard).not.toHaveBeenCalled();
  });

  it('请求同步失败后清理在途状态并允许重试', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const retryData = growth(4);
    mocks.getMyGrowth
      .mockImplementationOnce(() => {
        throw new Error('request setup failed');
      })
      .mockResolvedValueOnce({ status: 200, data: retryData });

    await expect(useGrowth().load()).resolves.toBeNull();
    expect(useGrowth().loading.value).toBe(false);
    await expect(useGrowth().load()).resolves.toEqual(retryData);

    expect(mocks.getMyGrowth).toHaveBeenCalledTimes(2);
    expect(useGrowth().growth.value).toEqual(retryData);
    warn.mockRestore();
  });

  it('缓存重置后同账号的旧响应也不能覆盖新请求', async () => {
    const oldResponse = deferred<{ status: number; data: Growth }>();
    const newResponse = deferred<{ status: number; data: Growth }>();
    mocks.getMyGrowth.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(newResponse.promise);

    const oldRequest = useGrowth().load();
    resetGrowth();
    const newRequest = useGrowth().load();

    const newData = growth(7);
    newResponse.resolve({ status: 200, data: newData });
    await expect(newRequest).resolves.toEqual(newData);

    oldResponse.resolve({ status: 200, data: growth(1) });
    await expect(oldRequest).resolves.toBeNull();
    expect(useGrowth().growth.value).toEqual(newData);
  });

  it('达成但未领取的成长任务保持可领取，并兼容旧接口已自动发奖的数据', async () => {
    mocks.getGrowthTasks.mockResolvedValueOnce({
      status: 200,
      data: {
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
            status: 'completed',
            completed: true,
            completedAt: '2026-08-01 09:00:00',
          },
        ],
      },
    });

    const tasks = await useGrowth().loadGrowthTasks(true);

    expect(tasks?.tasks[0]).toMatchObject({ claimed: false, claimable: true });
    expect(tasks?.tasks[1]).toMatchObject({ claimed: true, claimable: false });
    expect(tasks).toMatchObject({ completedCount: 2, claimedCount: 1, claimableCount: 1, activeCount: 1 });
  });

  it('手动领取后刷新任务状态与成长快照', async () => {
    const claimedGrowth = growth(5);
    mocks.claimGrowthTask.mockResolvedValueOnce({ status: 200, data: { ok: true, growth: claimedGrowth } });
    mocks.getGrowthTasks.mockResolvedValueOnce({
      status: 200,
      data: {
        tasks: [
          {
            taskKey: 'profile_avatar',
            titleKey: 'growth.tasks.profileAvatar.title',
            descriptionKey: 'growth.tasks.profileAvatar.description',
            rewardExp: 50,
            status: 'completed',
            completed: true,
            claimed: true,
            claimable: false,
            completedAt: '2026-08-01 10:00:00',
            claimedAt: '2026-08-01 10:01:00',
          },
        ],
      },
    });

    await useGrowth().claimGrowthTask('profile_avatar');

    expect(mocks.claimGrowthTask).toHaveBeenCalledWith('profile_avatar');
    expect(mocks.getGrowthTasks).toHaveBeenCalledTimes(1);
    expect(useGrowth().growth.value).toEqual(claimedGrowth);
    expect(useGrowth().growthTasks.value?.activeCount).toBe(0);
  });
});

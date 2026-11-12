import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-a' },
  getShop: vi.fn(),
  buyShopItem: vi.fn(),
  equipBackground: vi.fn(),
  getMyGrowth: vi.fn(),
  getRanks: vi.fn(),
  getGrowthTasks: vi.fn(),
  claimGrowthTask: vi.fn(),
  checkin: vi.fn(),
  useProtectCard: vi.fn(),
  getInventory: vi.fn(),
  getDashboard: vi.fn(),
  getClaimable: vi.fn(),
  claimAll: vi.fn(),
  getWeekly: vi.fn(),
}));

vi.mock('@/store', () => ({
  useUserStore: () => mocks.user,
}));

vi.mock('@/api/growthApi.ts', () => ({
  default: {
    getMyGrowth: mocks.getMyGrowth,
    getRanks: mocks.getRanks,
    getShop: mocks.getShop,
    buyShopItem: mocks.buyShopItem,
    equipBackground: mocks.equipBackground,
    getGrowthTasks: mocks.getGrowthTasks,
    claimGrowthTask: mocks.claimGrowthTask,
    checkin: mocks.checkin,
    useProtectCard: mocks.useProtectCard,
    getInventory: mocks.getInventory,
    getDashboard: mocks.getDashboard,
    getClaimable: mocks.getClaimable,
    claimAll: mocks.claimAll,
    getWeekly: mocks.getWeekly,
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
    mocks.getRanks.mockReset();
    mocks.getGrowthTasks.mockReset();
    mocks.claimGrowthTask.mockReset();
    mocks.checkin.mockReset();
    mocks.getInventory.mockReset();
    mocks.getDashboard.mockReset();
    mocks.getClaimable.mockReset();
    mocks.claimAll.mockReset();
    mocks.getWeekly.mockReset();
    mocks.getInventory.mockResolvedValue({ status: 200, data: { items: [] } });
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

  it('不同账号的赠礼段位表隔离缓存，忽略旧账号晚到的表', async () => {
    const pending = deferred<any>();
    mocks.getRanks.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ status: 200, data: [{ level: 1, aiLevelGift: { tokens: 200000 } }] });
    const store = useGrowth();
    const first = store.loadRanks();
    mocks.user.id = 'user-b';
    await store.loadRanks();
    pending.resolve({ status: 200, data: [{ level: 1, aiLevelGift: { tokens: 120000 } }] });
    await first;
    expect(store.ranks.value[0].aiLevelGift?.tokens).toBe(200000);
    expect(mocks.getRanks).toHaveBeenCalledTimes(2);
  });

  it('计费模式变化后刷新已经缓存的段位表，回退可恢复日额度说明', async () => {
    const store = useGrowth();
    mocks.getMyGrowth.mockResolvedValueOnce({ status: 200, data: { ...growth(1), billingMode: 'permanent_only' } });
    mocks.getRanks.mockResolvedValueOnce({ status: 200, data: [{ level: 1, billingMode: 'permanent_only', aiTokenDaily: 0 }] });
    await store.load();await store.loadRanks();
    mocks.getMyGrowth.mockResolvedValueOnce({ status: 200, data: { ...growth(1), billingMode: 'daily_and_permanent' } });
    mocks.getRanks.mockResolvedValueOnce({ status: 200, data: [{ level: 1, billingMode: 'daily_and_permanent', aiTokenDaily: 100000 }] });
    await store.load(true);
    await vi.waitFor(() => expect(store.ranks.value[0]).toMatchObject({ billingMode: 'daily_and_permanent', aiTokenDaily: 100000 }));
    expect(mocks.getRanks).toHaveBeenCalledTimes(2);
  });

  it('任务页与周挑战面板同时加载时合并请求，完成后允许刷新', async () => {
    const pending = deferred<any>();
    mocks.getWeekly.mockReturnValueOnce(pending.promise);
    const first = useGrowth().loadWeekly();
    const second = useGrowth().loadWeekly();
    expect(first).toBe(second);
    expect(mocks.getWeekly).toHaveBeenCalledTimes(1);
    pending.resolve({ status: 200, data: { challenges: [{ done: true }] } });
    await first;
    expect(useGrowth().weekly.value?.challenges).toHaveLength(1);
    mocks.getWeekly.mockResolvedValueOnce({ status: 200, data: { challenges: [] } });
    await useGrowth().loadWeekly();
    expect(mocks.getWeekly).toHaveBeenCalledTimes(2);
  });

  it('切换账号不复用旧周挑战请求，晚到旧响应不能覆盖新账号', async () => {
    const old = deferred<any>();
    mocks.getWeekly.mockReturnValueOnce(old.promise);
    const request = useGrowth().loadWeekly();
    mocks.user.id = 'user-b';
    mocks.getWeekly.mockResolvedValueOnce({ status: 200, data: { challenges: [{ key: 'new' }] } });
    await useGrowth().loadWeekly();
    old.resolve({ status: 200, data: { challenges: [{ key: 'old' }] } });
    expect(await request).toBeNull();
    expect(useGrowth().weekly.value?.challenges[0].key).toBe('new');
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

  it('同一账号并发刷新看板时只接受最后发起的请求', async () => {
    const oldDashboard = deferred<{ status: number; data: any }>();
    const newDashboard = deferred<{ status: number; data: any }>();
    mocks.getDashboard.mockReturnValueOnce(oldDashboard.promise).mockReturnValueOnce(newDashboard.promise);

    const oldRequest = useGrowth().loadDashboard();
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

  it('签到响应缺少功能开关时保留成长中心 V2，避免今日成长区块被卸载', async () => {
    const initialGrowth = { ...growth(4), features: { growthCenterV2: true } };
    mocks.getMyGrowth.mockResolvedValueOnce({ status: 200, data: initialGrowth });
    await useGrowth().load();
    mocks.checkin.mockResolvedValueOnce({
      status: 200,
      data: { growth: { ...growth(4), checkedInToday: true } },
    });

    await useGrowth().doCheckin();

    expect(useGrowth().growth.value).toMatchObject({
      checkedInToday: true,
      features: { growthCenterV2: true },
    });
  });

  it('写操作快照会作废更早发出的成长读取，避免迟到响应回滚签到状态', async () => {
    const oldResponse = deferred<{ status: number; data: Growth }>();
    mocks.getMyGrowth.mockReturnValueOnce(oldResponse.promise);
    const oldRequest = useGrowth().load();
    mocks.checkin.mockResolvedValueOnce({
      status: 200,
      data: { growth: { ...growth(4), checkedInToday: true } },
    });

    await useGrowth().doCheckin();
    oldResponse.resolve({ status: 200, data: growth(3) });
    await expect(oldRequest).resolves.toBeNull();

    expect(useGrowth().growth.value).toMatchObject({ level: 4, checkedInToday: true });
    expect(useGrowth().loading.value).toBe(false);
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

  it('补签成功后同步已加载商店库存，满仓兑换按钮可恢复', async () => {
    resetGrowth();
    const api = useGrowth();
    mocks.getMyGrowth.mockResolvedValue({ status: 200, data: { ...growth(7), points: 600, protectCards: 3 } });
    await api.load(true);
    api.shop.value = { points: 600, protectCards: 3 } as NonNullable<typeof api.shop.value>;
    mocks.useProtectCard.mockResolvedValue({
      status: 200,
      data: { growth: { ...growth(7), points: 600, protectCards: 2 } },
    });
    mocks.getInventory.mockResolvedValue({ status: 200, data: { items: [] } });
    await api.useProtectCard('20261009');
    expect(api.shop.value?.protectCards).toBe(2);
    expect(api.growth.value?.protectCards).toBe(2);
  });
});

describe('个人背景兑换与使用的请求边界', () => {
  beforeEach(() => {
    resetGrowth();
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.user.id = 'background-user';
    mocks.getMyGrowth.mockResolvedValue({ status: 200, data: growth(2) });
    mocks.getInventory.mockResolvedValue({ status: 200, data: { items: [], assets: {} } });
    mocks.getShop.mockReset();
    mocks.getShop.mockResolvedValue({
      status: 200,
      data: {
        economyVersion: 'points-economy-c9',
        points: 2000,
        items: [{ id: 'background_mountains', effect: 'background', cost: 600, owned: false, canBuy: true }],
      },
    });
  });
  it('按用户确认时的报价提交，不把旧预览悄悄替换成新报价', async () => {
    await useGrowth().loadShop();
    mocks.buyShopItem.mockResolvedValueOnce({ status: 409, data: { refresh: true } });
    await useGrowth().buyItem('background_mountains', { economyVersion: 'points-economy-old', expectedCost: 500 });
    expect(mocks.buyShopItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'background_mountains',
        economyVersion: 'points-economy-old',
        expectedCost: 500,
      }),
    );
  });
  it('已确认购买后即使刷新失败，也保留永久持有事实和正确余额', async () => {
    mocks.getMyGrowth.mockResolvedValueOnce({ status: 200, data: { ...growth(2), points: 2000 } });
    await useGrowth().load(true);
    await useGrowth().loadShop();
    mocks.getMyGrowth.mockRejectedValueOnce(new Error('fixture-offline'));
    mocks.getShop.mockRejectedValueOnce(new Error('fixture-offline'));
    mocks.buyShopItem.mockResolvedValueOnce({
      status: 200,
      data: { ok: true, itemId: 'background_mountains', points: 1400, effect: { type: 'background' } },
    });
    await useGrowth().buyItem('background_mountains');
    expect(useGrowth().shop.value?.items[0]).toMatchObject({ owned: true, canBuy: false });
    expect(useGrowth().shop.value?.points).toBe(1400);
    expect(useGrowth().growth.value?.points).toBe(1400);
  });
  it('更换账号后忽略旧账号晚到的使用回执', async () => {
    await useGrowth().loadShop();
    const pending = deferred<{ status: number; data: any }>();
    mocks.equipBackground.mockReturnValueOnce(pending.promise);
    const request = useGrowth().equipBackground('background_mountains');
    mocks.user.id = 'new-background-user';
    pending.resolve({ status: 200, data: { ok: true, equipped: 'background_mountains' } });
    await expect(request).resolves.toBeNull();
    expect(mocks.getShop).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-a' },
  getMyGrowth: vi.fn(),
}));

vi.mock('@/store', () => ({
  useUserStore: () => mocks.user,
}));

vi.mock('@/api/growthApi.ts', () => ({
  default: {
    getMyGrowth: mocks.getMyGrowth,
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
});

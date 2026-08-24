import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiBasePost: vi.fn(),
  user: {
    id: 'user-1',
    role: 'user',
    adminContext: null as null | { subjectUserId: string; mode: string },
  },
}));

vi.mock('@/http/request', () => ({ apiBasePost: mocks.apiBasePost }));
vi.mock('@/store', async () => {
  const { reactive } = await import('vue');
  mocks.user = reactive(mocks.user);
  return { useUserStore: () => mocks.user };
});

import { resetAiQuotaStatusCacheForTest, useAiQuotaStatus } from './useAiQuotaStatus';

describe('useAiQuotaStatus', () => {
  beforeEach(() => {
    resetAiQuotaStatusCacheForTest();
    mocks.apiBasePost.mockReset();
    mocks.user.id = 'user-1';
    mocks.user.role = 'user';
    mocks.user.adminContext = null;
  });

  it('同一身份的并发读取只请求一次统一额度接口', async () => {
    mocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: { used: 25_000, quota: 100_000, remaining: 75_000 },
    });
    const first = useAiQuotaStatus({ autoLoad: false });
    const second = useAiQuotaStatus({ autoLoad: false });

    await Promise.all([first.load(), second.load()]);

    expect(mocks.apiBasePost).toHaveBeenCalledTimes(1);
    expect(mocks.apiBasePost).toHaveBeenCalledWith('/api/chat/aiQuota', {}, { silent: true });
    expect(first.status.value).toMatchObject({ used: 25_000, remaining: 75_000 });
    expect(first.remainingPercent.value).toBe(75);
  });

  it('账号切换后不显示上一身份的额度并重新读取', async () => {
    mocks.apiBasePost
      .mockResolvedValueOnce({ status: 200, data: { used: 10, quota: 100, remaining: 90 } })
      .mockResolvedValueOnce({ status: 200, data: { used: 60, quota: 100, remaining: 40 } });
    const quota = useAiQuotaStatus({ autoLoad: false });

    await quota.load();
    mocks.user.id = 'user-2';
    await nextTick();

    expect(quota.status.value).toBeNull();
    await vi.waitFor(() => expect(mocks.apiBasePost).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(quota.status.value?.remaining).toBe(40));
    expect(quota.status.value?.remaining).toBe(40);
  });

  it('额度响应不可用时进入稳定错误态而不伪装成零额度', async () => {
    mocks.apiBasePost.mockResolvedValue({ status: 200, data: { unavailable: true } });
    const quota = useAiQuotaStatus({ autoLoad: false });

    await expect(quota.load()).resolves.toBeNull();
    expect(quota.status.value).toBeNull();
    expect(quota.unavailable.value).toBe(true);
  });

  it('把每日额度和永久余额分开保留，进度只按每日额度计算', async () => {
    mocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: {
        used: 20,
        quota: 1_100,
        remaining: 1_080,
        dailyQuota: 100,
        dailyUsed: 20,
        dailyRemaining: 80,
        bonusTokens: 1_000,
      },
    });
    const quota = useAiQuotaStatus({ autoLoad: false });

    await quota.load();

    expect(quota.status.value).toMatchObject({ dailyRemaining: 80, bonusTokens: 1_000, remaining: 1_080 });
    expect(quota.remainingPercent.value).toBe(80);
  });

  it('字段缺失或为空时不把异常响应伪装成零额度', async () => {
    mocks.apiBasePost.mockResolvedValue({ status: 200, data: { used: null, quota: 100, remaining: 100 } });
    const quota = useAiQuotaStatus({ autoLoad: false });

    await expect(quota.load()).resolves.toBeNull();
    expect(quota.status.value).toBeNull();
    expect(quota.unavailable.value).toBe(true);
  });
});

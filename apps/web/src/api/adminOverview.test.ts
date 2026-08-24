import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));

const { apiBasePost } = await import('@/http/request');
const { adminOverviewRequestInternals, getAdminOverviewSnapshot } = await import('./adminOverview');

describe('adminOverview 快照请求合并', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminOverviewRequestInternals.reset();
  });

  it('管理壳与总览同时挂载时复用同一个在途请求', async () => {
    let resolveRequest: (value: any) => void = () => undefined;
    apiBasePost.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const shellRequest = getAdminOverviewSnapshot(true);
    const overviewRequest = getAdminOverviewSnapshot(true);
    expect(shellRequest).toBe(overviewRequest);
    expect(apiBasePost).toHaveBeenCalledTimes(1);
    expect(apiBasePost).toHaveBeenCalledWith(
      '/api/common/getAdminOverviewSnapshot',
      { hideInternal: true },
      { silent: true },
    );

    resolveRequest({ status: 200, data: { generatedAt: '2026-08-24 15:24' } });
    await expect(shellRequest).resolves.toMatchObject({ status: 200 });
  });

  it('短暂复用已完成快照，但手动刷新会跳过缓存', async () => {
    apiBasePost
      .mockResolvedValueOnce({ status: 200, data: { version: 1 } })
      .mockResolvedValueOnce({ status: 200, data: { version: 2 } });

    await expect(getAdminOverviewSnapshot(true)).resolves.toMatchObject({ data: { version: 1 } });
    await expect(getAdminOverviewSnapshot(true)).resolves.toMatchObject({ data: { version: 1 } });
    await expect(getAdminOverviewSnapshot(true, { force: true })).resolves.toMatchObject({ data: { version: 2 } });
    expect(apiBasePost).toHaveBeenCalledTimes(2);
  });

  it('包含内部账号与隐藏内部账号使用独立请求范围', async () => {
    apiBasePost.mockResolvedValue({ status: 200, data: {} });
    await Promise.all([getAdminOverviewSnapshot(true), getAdminOverviewSnapshot(false)]);
    expect(apiBasePost).toHaveBeenCalledTimes(2);
  });
});

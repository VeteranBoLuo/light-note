import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiBaseGet: vi.fn(),
  apiBasePost: vi.fn(),
}));

vi.mock('@/http/request', () => ({
  apiBaseGet: mocks.apiBaseGet,
  apiBasePost: mocks.apiBasePost,
}));

import { createLocalSupportCatalogPreview, getEntitlementStoreState, getSupportCatalog } from './supportApi';

describe('权益商店开发环境只读目录', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('严格复用共享正式目录展示全部 AI、空间和组合容量，并关闭结算', () => {
    const preview = createLocalSupportCatalogPreview();

    expect(preview).toMatchObject({
      catalogVersion: 'support-packages-v3',
      catalogEnabled: true,
      checkoutEnabled: false,
      grantEnabled: false,
      campaignsEnabled: false,
      previewMode: true,
    });
    expect(preview.packages).toHaveLength(12);
    expect(
      preview.packages
        .filter((item) => item.category === 'storage')
        .map(({ amount, base, firstPurchase }) => ({ amount, base: base.storageMb, first: firstPurchase.storageMb })),
    ).toEqual([
      { amount: 6, base: 128, first: 160 },
      { amount: 18, base: 512, first: 640 },
      { amount: 50, base: 1_536, first: 2_048 },
      { amount: 100, base: 3_072, first: 4_096 },
    ]);
  });

  it('本地后端目录缺失或关闭时回退只读预览，不把结算误开放', async () => {
    mocks.apiBaseGet.mockResolvedValueOnce({ status: 404, data: null });
    await expect(getSupportCatalog({ allowLocalPreview: true })).resolves.toMatchObject({
      previewMode: true,
      checkoutEnabled: false,
    });

    mocks.apiBaseGet.mockResolvedValueOnce({
      status: 200,
      data: {
        catalogVersion: 'support-packages-v3',
        catalogEnabled: false,
        checkoutEnabled: false,
        grantEnabled: false,
        campaignsEnabled: false,
        packages: [],
        campaigns: [],
      },
    });
    await expect(getSupportCatalog({ allowLocalPreview: true })).resolves.toMatchObject({
      previewMode: true,
      checkoutEnabled: false,
      packages: expect.arrayContaining([expect.objectContaining({ skuId: 'storage-100' })]),
    });
  });

  it('生产口径在目录接口缺失时失败关闭，服务端关闭目录时保持隐藏', async () => {
    mocks.apiBaseGet.mockResolvedValueOnce({ status: 404, data: null });
    await expect(getSupportCatalog({ allowLocalPreview: false })).rejects.toThrow('SUPPORT_CATALOG_UNAVAILABLE');

    mocks.apiBaseGet.mockResolvedValueOnce({
      status: 200,
      data: {
        catalogVersion: 'support-packages-v3',
        catalogEnabled: false,
        checkoutEnabled: false,
        grantEnabled: false,
        campaignsEnabled: false,
        packages: [],
        campaigns: [],
      },
    });
    const catalog = await getSupportCatalog({ allowLocalPreview: false });
    expect(catalog).toMatchObject({ catalogEnabled: false, packages: [] });
    expect(catalog.previewMode).toBeUndefined();
  });

  it('权益商店订单摘要从独立接口读取，不复用赞助状态', async () => {
    mocks.apiBaseGet.mockResolvedValueOnce({
      status: 200,
      data: { authenticated: true, orderCount: 2, totalAmount: '94.00', grantedTokens: 7_100_000 },
    });
    await expect(getEntitlementStoreState()).resolves.toMatchObject({
      authenticated: true,
      orderCount: 2,
      totalAmount: '94.00',
      grantedTokens: 7_100_000,
      grantedStorageMb: 0,
      recentOrders: [],
    });
    expect(mocks.apiBaseGet).toHaveBeenCalledWith('/api/support/store/state', undefined, { silent: true });
  });
});

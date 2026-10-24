import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiBaseGet: vi.fn(),
  apiBasePost: vi.fn(),
}));

vi.mock('@/http/request', () => ({
  apiBaseGet: mocks.apiBaseGet,
  apiBasePost: mocks.apiBasePost,
}));

import {
  createLocalSupportCatalogPreview,
  getEntitlementStoreState,
  getSupportCatalog,
  getCampaignPresentation,
  createCheckoutIntent,
  queryCheckoutIntent,
} from './supportApi';

describe('权益商店开发环境只读目录', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('隐藏详情不回退为示例目录，创建与查询原单使用独立端点', async () => {
    mocks.apiBaseGet.mockResolvedValueOnce({ status: 404, data: null });
    await expect(getCampaignPresentation('hidden')).rejects.toThrow('CAMPAIGN_HIDDEN');
    mocks.apiBasePost.mockResolvedValueOnce({ status: 200, data: { intentId: 'safe-id', url: 'https://afdian.com/' } });
    await expect(createCheckoutIntent('sku', 'version', 'flow')).resolves.toMatchObject({ intentId: 'safe-id' });
    expect(mocks.apiBasePost).toHaveBeenCalledWith('/api/support/checkout-intents', {
      skuId: 'sku',
      catalogVersion: 'version',
      flowId: 'flow',
    });
    mocks.apiBaseGet.mockResolvedValueOnce({ status: 200, data: { status: 'pending' } });
    await queryCheckoutIntent('safe-id');
    expect(mocks.apiBaseGet).toHaveBeenLastCalledWith('/api/support/checkout-intents/safe-id', undefined, {
      silent: true,
    });
  });

  it('严格复用共享正式目录展示全部 AI、空间和组合容量，并关闭结算', () => {
    const preview = createLocalSupportCatalogPreview();

    expect(preview).toMatchObject({
      catalogVersion: 'support-packages-v5',
      catalogEnabled: true,
      checkoutEnabled: false,
      grantEnabled: false,
      campaignsEnabled: false,
      previewMode: true,
    });
    expect(preview.packages).toHaveLength(12);
    for (const category of ['ai', 'combo']) {
      expect(
        preview.packages
          .filter((item) => item.category === category)
          .map(({ amount, base, firstPurchase }) => ({ amount, base: base.aiTokens, first: firstPurchase.aiTokens })),
      ).toEqual([
        { amount: category === 'ai' ? 6 : 10, base: 300_000, first: 300_000 },
        { amount: category === 'ai' ? 18 : 30, base: 900_000, first: 900_000 },
        { amount: category === 'ai' ? 50 : 88, base: 2_500_000, first: 2_500_000 },
        { amount: category === 'ai' ? 100 : 168, base: 5_000_000, first: 5_000_000 },
      ]);
    }
    expect(
      preview.packages
        .filter((item) => item.category === 'storage')
        .map(({ amount, base, firstPurchase }) => ({ amount, base: base.storageMb, first: firstPurchase.storageMb })),
    ).toEqual([
      { amount: 6, base: 256, first: 256 },
      { amount: 18, base: 768, first: 768 },
      { amount: 50, base: 2_048, first: 2_048 },
      { amount: 100, base: 4_096, first: 4_096 },
    ]);
    expect(
      preview.packages.every(
        (item) => item.firstPurchaseScope === 'none' && item.firstPurchaseStatus === 'not_applicable',
      ),
    ).toBe(true);
  });

  it('本地旧版本后端目录不开放结算，回退为新版固定权益预览', async () => {
    mocks.apiBaseGet.mockResolvedValueOnce({
      status: 200,
      data: { catalogVersion: 'support-packages-v4', catalogEnabled: true, checkoutEnabled: true },
    });
    const catalog = await getSupportCatalog({ allowLocalPreview: true });
    expect(catalog).toMatchObject({
      catalogVersion: 'support-packages-v5',
      previewMode: true,
      checkoutEnabled: false,
    });
    expect(catalog.packages.find((item) => item.skuId === 'storage-6')).toMatchObject({
      base: { storageMb: 256 },
      firstPurchaseStatus: 'not_applicable',
    });
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
        catalogVersion: 'support-packages-v5',
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
        catalogVersion: 'support-packages-v5',
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

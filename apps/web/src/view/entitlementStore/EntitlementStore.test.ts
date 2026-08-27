import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { SUPPORT_PACKAGE_CATALOG } from '@lightnote/shared';
import zhCN from '@/i18n/locales/zh-CN';

const routeState = vi.hoisted(() => ({ query: {} as Record<string, string> }));
const mocks = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  getState: vi.fn(),
  openCheckout: vi.fn(() => true),
  recordOperation: vi.fn(() => Promise.resolve()),
  routerBack: vi.fn(),
  routerPush: vi.fn(() => Promise.resolve()),
  routerReplace: vi.fn(() => Promise.resolve()),
  messageWarning: vi.fn(),
}));

vi.mock('@/config/support', () => ({ openTrackedEntitlementCheckout: mocks.openCheckout }));
vi.mock('@/api/supportApi', () => ({
  getEntitlementStoreCatalog: mocks.getCatalog,
  getEntitlementStoreState: mocks.getState,
}));
vi.mock('@/api/commonApi', () => ({ recordOperation: mocks.recordOperation }));
vi.mock('@/store', () => ({
  bookmarkStore: () => ({ isMobile: false }),
  useUserStore: () => ({ id: 'light-note-user-1', alias: '菠萝', userName: 'root' }),
}));
vi.mock('vue-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('vue-router')>();
  return {
    ...original,
    useRouter: () => ({
      back: mocks.routerBack,
      push: mocks.routerPush,
      replace: mocks.routerReplace,
    }),
    useRoute: () => routeState,
  };
});
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { warning: mocks.messageWarning },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));
vi.mock('@/composables/useMobileTopBar', () => ({
  useMobileTopBar: vi.fn(),
  getMobileTopBarBinding: vi.fn(() => null),
}));

import EntitlementStore from './EntitlementStore.vue';

const state = {
  authenticated: true,
  orderSyncAvailable: true,
  orderCount: 2,
  totalAmount: '94.00',
  grantedTokens: 7_100_000,
  grantedStorageMb: 2_048,
  lastPurchaseAt: '2026-08-25 12:00:00',
  recentOrders: [
    {
      id: 'purchase-1',
      amount: '88.00',
      month: 1,
      productType: 0,
      optionKey: null,
      orderPurpose: 'entitlement_purchase',
      ownershipSource: 'checkout',
      confirmedAt: '2026-08-25 12:00:00',
      rewardStatus: 'credited',
      rewardReasonCode: null,
      rewardTokens: 6_500_000,
      grantedTokens: 6_500_000,
      rewardStorageMb: 2_048,
      grantedStorageMb: 2_048,
      intentType: 'permanent',
      skuId: 'combo-88',
      firstPurchaseApplied: true,
    },
  ],
};
const comboPackage = {
  skuId: 'combo-10',
  category: 'combo',
  amount: 10,
  base: { aiTokens: 600_000, storageMb: 128 },
  firstPurchase: { aiTokens: 780_000, storageMb: 160 },
  comboSavings: 2,
  firstPurchaseStatus: 'available',
};
const campaign = {
  campaignId: '11111111-1111-4111-8111-111111111111',
  campaignKey: 'anniversary',
  campaignVersion: 2,
  catalogVersion: 'campaign:11111111-1111-4111-8111-111111111111:v2',
  campaignTitle: '周年加量季',
  description: '独立活动权益',
  startsAt: '2026-08-01 00:00:00',
  endsAt: '2026-09-01 00:00:00',
  campaignSkuId: '22222222-2222-4222-8222-222222222222',
  skuId: 'anniversary-combo',
  title: '周年组合包',
  category: 'combo',
  amount: 30,
  benefit: { aiTokens: 2_500_000, storageMb: 640 },
  perUserLimit: 1,
  completedCount: 0,
  remainingPurchases: 1,
  limitReached: false,
  hasActiveCheckout: false,
};

let cleanup: (() => void) | undefined;

async function mountStore() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(EntitlementStore);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await vi.waitFor(() => expect(mocks.getCatalog).toHaveBeenCalled());
  await nextTick();
  return host;
}

describe('独立资源商店', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeState.query = { category: 'combo' };
    mocks.getState.mockResolvedValue(state);
    mocks.getCatalog.mockResolvedValue({
      catalogVersion: 'support-packages-v2',
      catalogEnabled: true,
      checkoutEnabled: true,
      grantEnabled: true,
      campaignsEnabled: true,
      packages: [comboPackage],
      campaigns: [campaign],
    });
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('用普通用户能理解的文案说明按需购买、账号预计到账和活动套餐', async () => {
    const host = await mountStore();
    await vi.waitFor(() => expect(host.textContent).toContain('周年组合包'));
    expect(host.querySelector('h1')?.textContent).toBe('资源商店');
    expect(host.textContent).toContain('日常使用通常不需要购买');
    expect(host.textContent).toContain('AI 日额度和云空间容量都会随等级提升');
    expect(host.textContent).toContain('超高强度使用');
    expect(host.textContent).toContain('付款前再次核验首购资格');
    expect(host.textContent).toContain('先看基础到账，再看当前账号对这个套餐的预计到账');
    expect(host.textContent).toContain('AI 与空间都偶尔不够');
    expect(host.textContent).not.toContain('额外扩展');
    expect(host.textContent).not.toContain('不赠送');
    expect(host.textContent).toContain('预计可享首购加量');
    expect(host.textContent).toContain('比同档分别购买节省 ¥2');
    expect(host.textContent).toContain('250万 AI 额度 + 640 MB 云空间');
    expect(host.textContent).toContain('还可购买 1 次');
    expect(host.textContent).toContain('最近购买');
    expect(host.textContent).toContain('650万 AI 额度 + 2 GB 云空间');
    expect(host.querySelector('.package-card.is-campaign')?.textContent).not.toContain('首购');
    expect(host.textContent).not.toMatch(/SKU|权益账本|结算快照|幂等/);

    const actionWraps = host.querySelectorAll<HTMLElement>('.package-card__action-wrap');
    const actions = host.querySelectorAll<HTMLButtonElement>('.package-card__action');
    expect(actionWraps).toHaveLength(2);
    expect(actions).toHaveLength(2);
    expect([...actionWraps].every((wrapper) => wrapper.querySelector('.package-card__action'))).toBe(true);
    actions[0]?.click();
    await nextTick();
    expect(mocks.openCheckout).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('确认购买');
    expect(document.body.textContent).toContain('周年组合包');
    expect(document.body.textContent).toContain('到账账号菠萝');
    document.body.querySelector<HTMLButtonElement>('.checkout-modal__confirm')?.click();
    expect(mocks.openCheckout).toHaveBeenNthCalledWith(1, campaign.campaignSkuId, campaign.catalogVersion);

    actions[1]?.click();
    await nextTick();
    expect(document.body.textContent).toContain('AI + 云空间 · 轻量补充');
    expect(document.body.textContent).toContain('本次预计到账78万 AI 额度 + 160 MB 云空间');
    expect(document.body.textContent).toContain('当前预计到账包含本套餐的首购加量');
    document.body.querySelector<HTMLButtonElement>('.checkout-modal__confirm')?.click();
    expect(mocks.openCheckout).toHaveBeenNthCalledWith(1, campaign.campaignSkuId, campaign.catalogVersion);
    expect(mocks.openCheckout).toHaveBeenNthCalledWith(2, 'combo-10', 'support-packages-v2');
  });

  it('本地只读目录完整显示云空间套餐并保持结算关闭', async () => {
    routeState.query = { category: 'storage' };
    mocks.getCatalog.mockResolvedValueOnce({
      catalogVersion: 'support-packages-v2',
      catalogEnabled: true,
      checkoutEnabled: false,
      grantEnabled: false,
      campaignsEnabled: false,
      previewMode: true,
      packages: SUPPORT_PACKAGE_CATALOG.map((item) => ({
        ...item,
        base: { ...item.base },
        firstPurchase: { ...item.firstPurchase },
        firstPurchaseStatus: 'login_required',
      })),
      campaigns: [],
    });
    const host = await mountStore();
    await vi.waitFor(() => expect(host.textContent).toContain('当前仅供查看'));
    const cards = host.querySelectorAll<HTMLElement>('.package-card:not(.is-campaign)');
    expect(cards).toHaveLength(4);
    expect([...cards].map((card) => card.textContent)).toEqual([
      expect.stringContaining('128 MB'),
      expect.stringContaining('512 MB'),
      expect.stringContaining('1.5 GB'),
      expect.stringContaining('3 GB'),
    ]);
    expect(
      [...host.querySelectorAll<HTMLButtonElement>('.package-card__action')].every((button) => button.disabled),
    ).toBe(true);
  });

  it('未登录时仍可浏览目录，但不能创建购买订单', async () => {
    mocks.getState.mockResolvedValueOnce({
      authenticated: false,
      orderSyncAvailable: true,
      orderCount: 0,
      totalAmount: '0.00',
      grantedTokens: 0,
      grantedStorageMb: 0,
      recentOrders: [],
    });
    const host = await mountStore();
    await vi.waitFor(() => expect(host.textContent).toContain('登录后购买'));
    expect(
      [...host.querySelectorAll<HTMLButtonElement>('.package-card__action')].every((button) => button.disabled),
    ).toBe(true);
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });

  it('购买状态读取失败时明确报错并失败关闭，不把登录用户误报成未登录', async () => {
    mocks.getState.mockRejectedValueOnce(new Error('state unavailable'));
    const host = await mountStore();
    await vi.waitFor(() => expect(host.textContent).toContain('账号与购买状态暂时无法读取'));
    expect(host.textContent).toContain('账号状态暂不可用');
    expect(host.textContent).not.toContain('登录后购买');
    expect(
      [...host.querySelectorAll<HTMLButtonElement>('.package-card__action')].every((button) => button.disabled),
    ).toBe(true);
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });

  it('后台恢复重新核验账号时暂停结算，不沿用旧的已登录状态继续下单', async () => {
    const baseTime = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseTime);
    try {
      const host = await mountStore();
      await vi.waitFor(() => expect(host.textContent).toContain('购买 ¥10'));
      host.querySelectorAll<HTMLButtonElement>('.package-card__action')[1]?.click();
      await nextTick();
      expect(document.body.querySelector<HTMLButtonElement>('.checkout-modal__confirm')?.disabled).toBe(false);
      mocks.getCatalog.mockResolvedValueOnce({
        catalogVersion: 'support-packages-v2',
        catalogEnabled: true,
        checkoutEnabled: true,
        grantEnabled: true,
        campaignsEnabled: true,
        packages: [{ ...comboPackage, firstPurchaseStatus: 'used' }],
        campaigns: [campaign],
      });

      let finishRefresh: ((value: typeof state) => void) | undefined;
      mocks.getState.mockImplementationOnce(
        () =>
          new Promise<typeof state>((resolve) => {
            finishRefresh = resolve;
          }),
      );
      nowSpy.mockReturnValue(baseTime + 31_000);
      window.dispatchEvent(new Event('focus'));

      await vi.waitFor(() => expect(mocks.getState).toHaveBeenCalledTimes(2));
      await nextTick();
      expect(host.textContent).toContain('正在确认购买资格');
      expect(
        [...host.querySelectorAll<HTMLButtonElement>('.package-card__action')].every((button) => button.disabled),
      ).toBe(true);
      expect(document.body.querySelector<HTMLButtonElement>('.checkout-modal__confirm')?.disabled).toBe(true);
      document.body.querySelector<HTMLButtonElement>('.checkout-modal__confirm')?.click();
      expect(mocks.openCheckout).not.toHaveBeenCalled();

      finishRefresh?.(state);
      await vi.waitFor(() => expect(host.textContent).toContain('购买 ¥10'));
      expect(document.body.querySelector<HTMLButtonElement>('.checkout-modal__confirm')?.disabled).toBe(false);
      expect(document.body.textContent).toContain('本次预计到账60万 AI 额度 + 128 MB 云空间');
      expect(document.body.textContent).toContain('本套餐的首购加量已使用');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('首购加量已用时，确认弹窗只按基础权益给出预计到账', async () => {
    mocks.getCatalog.mockResolvedValueOnce({
      catalogVersion: 'support-packages-v2',
      catalogEnabled: true,
      checkoutEnabled: true,
      grantEnabled: true,
      campaignsEnabled: false,
      packages: [{ ...comboPackage, firstPurchaseStatus: 'used' }],
      campaigns: [],
    });
    const host = await mountStore();
    await vi.waitFor(() => expect(host.textContent).toContain('首购加量已用'));
    host.querySelector<HTMLButtonElement>('.package-card__action')?.click();
    await nextTick();
    expect(document.body.textContent).toContain('本次预计到账60万 AI 额度 + 128 MB 云空间');
    expect(document.body.textContent).toContain('本套餐的首购加量已使用');
    expect(document.body.textContent).not.toContain('本次预计到账78万 AI 额度 + 160 MB 云空间');
  });
});

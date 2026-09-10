import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { SUPPORT_PACKAGE_CATALOG } from '@lightnote/shared';
import zhCN from '@/i18n/locales/zh-CN';

const routeState = vi.hoisted(() => ({ query: {} as Record<string, string> }));
const mocks = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  getState: vi.fn(),
  createIntent: vi.fn(async () => ({
    intentId: '11111111-1111-4111-8111-111111111111',
    url: 'https://afdian.com/a/lightnote',
  })),
  queryIntent: vi.fn(async () => ({
    intentId: '11111111-1111-4111-8111-111111111111',
    status: 'pending',
    amount: 10,
    benefit: { aiTokens: 720000, storageMb: 128 },
  })),
  openCheckout: vi.fn(() => true),
  recordOperation: vi.fn(() => Promise.resolve()),
  routerBack: vi.fn(),
  routerPush: vi.fn(() => Promise.resolve()),
  routerReplace: vi.fn(() => Promise.resolve()),
  messageWarning: vi.fn(),
}));

vi.mock('@/config/support', () => ({ openAfdianSupportPage: mocks.openCheckout }));
vi.mock('@/utils/mobileOverlayHistory', () => ({
  closeCurrentMobileOverlayThen: async (close: () => void, next: () => void) => {
    close();
    await nextTick();
    return next();
  },
}));
vi.mock('@/api/supportApi', () => ({
  getEntitlementStoreCatalog: mocks.getCatalog,
  getEntitlementStoreState: mocks.getState,
  getCampaignEntry: vi.fn(async () => null),
  createCheckoutIntent: mocks.createIntent,
  queryCheckoutIntent: mocks.queryIntent,
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
  firstPurchaseScope: 'ai_account',
  amount: 10,
  base: { aiTokens: 600_000, storageMb: 128 },
  firstPurchase: { aiTokens: 720_000, storageMb: 128 },
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
      catalogVersion: 'support-packages-v3',
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

  it('常驻套餐核对后创建可查询的原单，活动不再内嵌为第二个商城', async () => {
    const host = await mountStore();
    expect(host.textContent).toContain('永久有效');
    expect(host.textContent).not.toContain('周年组合包');
    const action = host.querySelector<HTMLButtonElement>('.package-card__action');
    action?.click();
    await nextTick();
    expect(document.body.textContent).toContain('到账账号菠萝');
    expect(document.body.textContent).toContain('本次预计到账72万 AI 额度 + 128 MB 云空间');
    expect(mocks.createIntent).not.toHaveBeenCalled();
    document.body.querySelector<HTMLButtonElement>('.checkout-modal__confirm')?.click();
    await vi.waitFor(() =>
      expect(mocks.createIntent).toHaveBeenCalledWith('combo-10', 'support-packages-v3', undefined),
    );
    expect(mocks.openCheckout).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(document.body.textContent).toContain('前往爱发电付款'));
  });

  it('本地只读目录完整显示云空间套餐并保持结算关闭', async () => {
    routeState.query = { category: 'storage' };
    mocks.getCatalog.mockResolvedValueOnce({
      catalogVersion: 'support-packages-v3',
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
    await vi.waitFor(() => expect(host.textContent).toContain('当前环境关闭支付'));
    expect(host.textContent).not.toContain('套餐预览');
    const cards = host.querySelectorAll<HTMLElement>('.package-card:not(.is-campaign)');
    expect(cards).toHaveLength(4);
    expect(host.querySelector('.package-card__choice')).toBeNull();
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
      host.querySelectorAll<HTMLButtonElement>('.package-card__action')[0]?.click();
      await nextTick();
      expect(document.body.querySelector<HTMLButtonElement>('.checkout-modal__confirm')?.disabled).toBe(false);
      mocks.getCatalog.mockResolvedValueOnce({
        catalogVersion: 'support-packages-v3',
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
      expect(document.body.textContent).toContain('本账号对应的首购加量已使用');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('首购加量已用时，确认弹窗只按基础权益给出预计到账', async () => {
    mocks.getCatalog.mockResolvedValueOnce({
      catalogVersion: 'support-packages-v3',
      catalogEnabled: true,
      checkoutEnabled: true,
      grantEnabled: true,
      campaignsEnabled: false,
      packages: [{ ...comboPackage, firstPurchaseStatus: 'used' }],
      campaigns: [],
    });
    const host = await mountStore();
    await vi.waitFor(() => expect(host.textContent).toContain('首购加量已用'));
    expect(host.querySelector('.package-card__benefit-row--primary')).toBeNull();
    expect(host.querySelectorAll('.package-card__benefit-row')).toHaveLength(1);
    expect(host.querySelector('.package-card__benefit-row--base')?.textContent).toContain(
      '基础到账60万 AI 额度 + 128 MB 云空间',
    );
    host.querySelector<HTMLButtonElement>('.package-card__action')?.click();
    await nextTick();
    expect(document.body.textContent).toContain('本次预计到账60万 AI 额度 + 128 MB 云空间');
    expect(document.body.textContent).toContain('本账号对应的首购加量已使用');
    expect(document.body.textContent).not.toContain('本次预计到账72万 AI 额度 + 128 MB 云空间');
  });
});

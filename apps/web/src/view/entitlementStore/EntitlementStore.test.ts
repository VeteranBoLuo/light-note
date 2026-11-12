import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { SUPPORT_PACKAGE_CATALOG, SUPPORT_PACKAGE_CATALOG_VERSION } from '@lightnote/shared';
import zhCN from '@/i18n/locales/zh-CN';

const routeState = vi.hoisted(() => ({ name: 'entitlementStore', query: {} as Record<string, string> }));
const mocks = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  getState: vi.fn(),
  getOrders: vi.fn(),
  createIntent: vi.fn(async () => ({
    intentId: '11111111-1111-4111-8111-111111111111',
    url: `https://ifdian.net/order/create?${new URLSearchParams({
      product_type: '1',
      plan_id: 'a'.repeat(32),
      sku: JSON.stringify([{ sku_id: 'b'.repeat(32), count: 1 }]),
      custom_order_id: 'c'.repeat(43),
    })}`,
  })),
  queryIntent: vi.fn(async () => ({
    intentId: '11111111-1111-4111-8111-111111111111',
    status: 'pending',
    amount: 10,
    benefit: { aiTokens: 720000, storageMb: 256 },
  })),
  openCheckout: vi.fn(() => true),
  recordOperation: vi.fn(() => Promise.resolve()),
  routerBack: vi.fn(),
  routerPush: vi.fn(() => Promise.resolve()),
  routerReplace: vi.fn(() => Promise.resolve()),
  messageWarning: vi.fn(),
}));

vi.mock('@/config/support', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/support')>()),
  openAfdianPackageCheckout: mocks.openCheckout,
}));
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
  getEntitlementOrders: mocks.getOrders,
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
  base: { aiTokens: 600_000, storageMb: 256 },
  firstPurchase: { aiTokens: 720_000, storageMb: 256 },
  comboSavings: 2,
  firstPurchaseStatus: 'available',
  checkoutAvailable: true,
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
  checkoutAvailable: true,
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
    mocks.getOrders.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    mocks.getCatalog.mockResolvedValue({
      catalogVersion: 'support-packages-v4',
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

  it('旧 v4 目录仍展示原首购快照，核对后创建可查询原单', async () => {
    const host = await mountStore();
    expect(host.textContent).toContain('永久有效');
    expect(host.textContent).not.toContain('周年组合包');
    const action = host.querySelector<HTMLButtonElement>('.package-card__action');
    action?.click();
    await nextTick();
    expect(document.body.textContent).toContain('到账账号菠萝');
    expect(document.body.textContent).toContain('本次预计到账72万 AI 额度 + 256 MB 云空间');
    expect(mocks.createIntent).not.toHaveBeenCalled();
    document.body.querySelector<HTMLButtonElement>('.checkout-modal__confirm')?.click();
    await vi.waitFor(() =>
      expect(mocks.createIntent).toHaveBeenCalledWith('combo-10', 'support-packages-v4', undefined),
    );
    expect(mocks.openCheckout).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(document.body.textContent).toContain('前往爱发电付款'));
  });

  it('本地只读目录完整显示云空间套餐并保持结算关闭', async () => {
    routeState.query = { category: 'storage' };
    mocks.getCatalog.mockResolvedValueOnce({
      catalogVersion: SUPPORT_PACKAGE_CATALOG_VERSION,
      catalogEnabled: true,
      checkoutEnabled: false,
      grantEnabled: false,
      campaignsEnabled: false,
      previewMode: true,
      packages: SUPPORT_PACKAGE_CATALOG.map((item) => ({
        ...item,
        base: { ...item.base },
        firstPurchase: { ...item.firstPurchase },
        firstPurchaseStatus: item.firstPurchaseScope === 'none' ? 'not_applicable' : 'login_required',
      })),
      campaigns: [],
    });
    const host = await mountStore();
    await vi.waitFor(() => expect(host.textContent).toContain('当前环境关闭支付'));
    expect(host.textContent).not.toContain('套餐预览');
    const cards = host.querySelectorAll<HTMLElement>('[role="tabpanel"][aria-hidden="false"] .package-card');
    expect(cards).toHaveLength(4);
    expect(host.querySelector('.package-card__choice')).toBeNull();
    expect([...cards].map((card) => card.textContent)).toEqual([
      expect.stringContaining('256 MB'),
      expect.stringContaining('768 MB'),
      expect.stringContaining('2 GB'),
      expect.stringContaining('4 GB'),
    ]);
    for (const card of cards) {
      expect(card.querySelectorAll('.package-card__benefit-row')).toHaveLength(1);
      expect(card.textContent).not.toContain('首购');
    }
    expect(
      [...host.querySelectorAll<HTMLButtonElement>('.package-card__action')].every((button) => button.disabled),
    ).toBe(true);
  });

  it('固定空间只确认一次容量，不提示首购资格，按新版目录创建订单', async () => {
    routeState.query = { category: 'storage' };
    const definition = SUPPORT_PACKAGE_CATALOG.find((item) => item.skuId === 'storage-6')!;
    mocks.getCatalog.mockResolvedValueOnce({
      catalogVersion: SUPPORT_PACKAGE_CATALOG_VERSION,
      catalogEnabled: true,
      checkoutEnabled: true,
      grantEnabled: true,
      campaignsEnabled: false,
      packages: [{ ...definition, firstPurchaseStatus: 'not_applicable', checkoutAvailable: true }],
      campaigns: [],
    });
    const host = await mountStore();
    await vi.waitFor(() => expect(host.textContent).toContain('购买套餐'));
    expect(host.querySelector('.package-card__benefits')?.textContent).toContain('每次购买到账256 MB');
    expect(host.textContent).toContain('一次购买，按标示容量永久扩容');
    host.querySelector<HTMLButtonElement>('.package-card__action')?.click();
    await nextTick();
    const modal = document.body.querySelector('.checkout-modal')!;
    expect(modal.textContent).toContain('付款确认后，资源自动加入当前轻笺账号');
    expect(modal.textContent).not.toContain('首购');
    expect(modal.textContent).not.toContain('基础到账');
    expect(modal.querySelectorAll('.checkout-modal__facts .is-emphasis')).toHaveLength(1);
    expect(modal.textContent?.match(/256 MB 云空间/g)).toHaveLength(1);
    expect(modal.textContent?.replace(/\s/g, '').split('¥6')).toHaveLength(2);
    expect(modal.querySelector('.checkout-modal__confirm')?.textContent?.trim()).toBe('前往付款');
    expect(modal.textContent).toContain('购买数量1 份');
    expect(modal.textContent).not.toContain('1 个月');
    modal.querySelector<HTMLButtonElement>('.checkout-modal__confirm')?.click();
    await vi.waitFor(() =>
      expect(mocks.createIntent).toHaveBeenCalledWith('storage-6', SUPPORT_PACKAGE_CATALOG_VERSION, undefined),
    );
  });

  it.each(['ai', 'combo'])('%s 固定显示四档 AI 额度，取消首购展示并按 v5 目录创建订单', async (category) => {
    routeState.query = { category };
    mocks.getCatalog.mockResolvedValueOnce({
      catalogVersion: SUPPORT_PACKAGE_CATALOG_VERSION,
      catalogEnabled: true,
      checkoutEnabled: true,
      grantEnabled: true,
      campaignsEnabled: false,
      packages: SUPPORT_PACKAGE_CATALOG.map((item) => ({
        ...item,
        firstPurchaseStatus: 'not_applicable',
        checkoutAvailable: true,
      })),
      campaigns: [],
    });
    const host = await mountStore();
    await vi.waitFor(() => expect(host.textContent).toContain('购买套餐'));
    const cards = [...host.querySelectorAll<HTMLElement>('[role="tabpanel"][aria-hidden="false"] .package-card')];
    expect(cards).toHaveLength(4);
    const quotaLabels = ['30万', '90万', '250万', '500万'];
    const prices = category === 'ai' ? [6, 18, 50, 100] : [10, 30, 88, 168];
    cards.forEach((card, index) => {
      expect(card.querySelector('.package-card__benefits')?.textContent?.replace(/\s+/g, '')).toContain(
        `${quotaLabels[index]}AI额度`,
      );
      expect(card.querySelector('.package-card__price')?.textContent).toBe(`¥${prices[index]}`);
      expect(card.querySelectorAll('.package-card__benefit-row')).toHaveLength(1);
      expect(card.querySelector('.package-card__action')?.textContent?.trim()).toBe('购买套餐');
      expect(card.textContent?.replace(/\s/g, '').split('¥' + prices[index])).toHaveLength(2);
      expect(card.textContent).not.toContain('首购');
    });
    // 历史已到账订单继续展示原发放事实，不被当前目录额度覆盖。
    expect(host.textContent).toContain('650万 AI 额度');
    cards[0]?.querySelector<HTMLButtonElement>('.package-card__action')?.click();
    await nextTick();
    const modal = document.body.querySelector('.checkout-modal')!;
    expect(modal.textContent).toContain('购买数量1 份');
    expect(modal.textContent).toContain('本次预计到账30万 AI 额度');
    expect(modal.textContent).not.toContain('首购');
    expect(modal.textContent).not.toContain('基础到账');
    expect(modal.querySelectorAll('.checkout-modal__facts .is-emphasis')).toHaveLength(1);
    if (category === 'combo') expect(modal.textContent).toContain('256 MB 云空间');
    modal.querySelector<HTMLButtonElement>('.checkout-modal__confirm')?.click();
    await vi.waitFor(() =>
      expect(mocks.createIntent).toHaveBeenCalledWith(
        category === 'ai' ? 'ai-6' : 'combo-10',
        SUPPORT_PACKAGE_CATALOG_VERSION,
        undefined,
      ),
    );
  });

  it('分类切换保留原卡片，仅开放当前分类的浏览与购买', async () => {
    mocks.getCatalog.mockResolvedValueOnce({
      catalogVersion: SUPPORT_PACKAGE_CATALOG_VERSION,
      catalogEnabled: true,
      checkoutEnabled: true,
      grantEnabled: true,
      campaignsEnabled: false,
      packages: SUPPORT_PACKAGE_CATALOG.map((item) => ({
        ...item,
        firstPurchaseStatus: 'not_applicable',
        checkoutAvailable: true,
      })),
      campaigns: [],
    });
    const host = await mountStore();
    await vi.waitFor(() => expect(host.querySelectorAll('.package-card')).toHaveLength(12));
    const originalCards = [...host.querySelectorAll('.package-card')];
    const tabs = [...host.querySelectorAll<HTMLElement>('[role="tab"]')];
    for (const [index, label] of ['AI 额度', '云空间', '组合套餐'].entries()) {
      tabs[index]?.click();
      await nextTick();
      const panels = [...host.querySelectorAll('[role="tabpanel"]')];
      expect(panels.filter((panel) => panel.getAttribute('aria-hidden') === 'false')).toHaveLength(1);
      const activePanel = panels[index]!;
      expect(activePanel.getAttribute('aria-label')).toBe(label);
      expect(activePanel.hasAttribute('inert')).toBe(false);
      expect(activePanel.querySelectorAll('.package-card')).toHaveLength(4);
      for (const panel of panels.filter((panel) => panel !== activePanel))
        expect(panel.hasAttribute('inert')).toBe(true);
      expect([...host.querySelectorAll('.package-card')]).toEqual(originalCards);
    }
    host.querySelector<HTMLButtonElement>('[role="tabpanel"][aria-hidden="false"] .package-card__action')?.click();
    await nextTick();
    expect(document.body.querySelector('.checkout-modal')?.textContent).toContain(
      '本次预计到账30万 AI 额度 + 256 MB 云空间',
    );
    expect(mocks.getCatalog).toHaveBeenCalledTimes(1);
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });

  it('订单记录链接只读取资源购买，不再出现历史赞助', async () => {
    routeState.query = { records: 'purchase' };
    await mountStore();
    await vi.waitFor(() => expect(mocks.getOrders).toHaveBeenLastCalledWith(1));
    expect(mocks.routerReplace).toHaveBeenCalledWith({ query: {} });
    expect(document.body.textContent).not.toContain('历史赞助');
    expect(document.querySelector('[role="tab"][aria-selected]')?.textContent ?? '').not.toContain('资源购买');
  });

  it('旧的历史赞助与爱发电回跳参数只清理地址，不打开订单记录', async () => {
    routeState.query = { records: 'history', afdian: 'bound' };
    await mountStore();
    await vi.waitFor(() => expect(mocks.routerReplace).toHaveBeenCalledWith({ query: {} }));
    expect(mocks.getOrders).not.toHaveBeenCalled();
  });

  it('旧后端目录没有固定商品绑定时禁止购买', async () => {
    mocks.getCatalog.mockResolvedValueOnce({
      catalogVersion: SUPPORT_PACKAGE_CATALOG_VERSION,
      catalogEnabled: true,
      checkoutEnabled: true,
      grantEnabled: true,
      campaignsEnabled: false,
      packages: [{ ...comboPackage, checkoutAvailable: undefined }],
      campaigns: [],
    });
    const host = await mountStore();
    await vi.waitFor(() => expect(host.textContent).toContain('暂不可购买'));
    expect(host.querySelector<HTMLButtonElement>('.package-card__action')?.disabled).toBe(true);
    expect(mocks.createIntent).not.toHaveBeenCalled();
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
    await vi.waitFor(() => expect(host.textContent).toContain('订单记录暂时无法读取'));
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
      await vi.waitFor(() => expect(host.textContent).toContain('购买套餐'));
      host.querySelectorAll<HTMLButtonElement>('.package-card__action')[0]?.click();
      await nextTick();
      expect(document.body.querySelector<HTMLButtonElement>('.checkout-modal__confirm')?.disabled).toBe(false);
      mocks.getCatalog.mockResolvedValueOnce({
        catalogVersion: 'support-packages-v4',
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
      await vi.waitFor(() => expect(host.textContent).toContain('购买套餐'));
      expect(document.body.querySelector<HTMLButtonElement>('.checkout-modal__confirm')?.disabled).toBe(false);
      expect(document.body.textContent).toContain('本次预计到账60万 AI 额度 + 256 MB 云空间');
      expect(document.body.textContent).toContain('本账号对应的首购加量已使用');
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('旧 v4 首购加量已用时，确认弹窗仍按旧基础权益给出预计到账', async () => {
    mocks.getCatalog.mockResolvedValueOnce({
      catalogVersion: 'support-packages-v4',
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
      '基础到账60万 AI 额度 + 256 MB 云空间',
    );
    host.querySelector<HTMLButtonElement>('.package-card__action')?.click();
    await nextTick();
    expect(document.body.textContent).toContain('本次预计到账60万 AI 额度 + 256 MB 云空间');
    expect(document.body.textContent).toContain('本账号对应的首购加量已使用');
    expect(document.body.textContent).not.toContain('本次预计到账72万 AI 额度 + 256 MB 云空间');
  });
});

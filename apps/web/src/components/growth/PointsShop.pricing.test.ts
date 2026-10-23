import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shop, ShopItem } from '@/composables/useGrowth';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';

const mocks = vi.hoisted(() => ({ model: null as any, alert: vi.fn() }));
vi.mock('@/composables/useGrowth.ts', () => ({ useGrowth: () => mocks.model }));
vi.mock('@/store', () => ({
  useUserStore: () => ({ id: 'pricing-test', headPicture: '', adminContext: null }),
  bookmarkStore: () => ({ isMobile: false }),
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => h('span') } }));
vi.mock('./AvatarFramePreview.vue', () => ({ default: { render: () => h('span') } }));
vi.mock('./ProfileBackgroundShop.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: mocks.alert } }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/api/entitlementEvents', () => ({ recordEntitlementEvent: vi.fn() }));
import PointsShop from './PointsShop.vue';

let app: ReturnType<typeof createApp>;
let host: HTMLDivElement;
const frame = (): ShopItem => ({
  id: 'frame_dragon',
  type: 'cosmetic',
  effect: 'frame',
  rarity: 'legendary',
  name: '龙曜',
  desc: '',
  cost: 12000,
  minLevel: 5,
  bonusTokens: 0,
  acquisition: 'shop',
  owned: false,
  equipped: false,
  canBuy: true,
});
const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};
async function mount(locale = 'zh-CN', props = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/store', component: { render: () => null } },
    ],
  });
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(PointsShop, props);
  app.use(router).use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
  app.directive('click-log', {});
  await router.push('/');
  await router.isReady();
  app.mount(host);
  await flush();
}
const card = () => host.querySelector<HTMLElement>('[data-shop-item-id="frame_dragon"]')!;
const price = () => card().querySelector('.ps-item-cost')?.textContent?.trim();
const action = () => card().querySelector<HTMLButtonElement>('button')!;
beforeEach(() => {
  vi.clearAllMocks();
  const shop = ref<Shop>({
    economyVersion: 'points-economy-c9',
    points: 20000,
    level: 7,
    purchaseEnabled: true,
    equippedTitle: null,
    equippedFrame: null,
    protectCards: 0,
    isVisitor: false,
    items: [],
    frames: [frame()],
  });
  mocks.model = {
    shop,
    dashboard: ref({ achievements: [] }),
    shopLoading: ref(false),
    shopError: ref(false),
    loadShop: vi.fn().mockResolvedValue(null),
    buyItem: vi.fn(),
    equipFrame: vi.fn(),
    claimAchievement: vi.fn(),
  };
});
afterEach(() => {
  app?.unmount();
  host?.remove();
});

describe('积分头像框价格与持有状态', () => {
  it.each([
    ['zh-CN', false, false],
    ['zh-CN', true, false],
    ['zh-CN', true, true],
    ['en-US', false, false],
    ['en-US', true, false],
    ['en-US', true, true],
  ] as const)('%s：owned=%s equipped=%s 时保留格式化价格与正确操作', async (locale, owned, equipped) => {
    Object.assign(mocks.model.shop.value.frames[0], { owned, equipped });
    await mount(locale);
    const labels = (locale === 'zh-CN' ? zh : en).growth;
    expect(price()).toBe('12,000');
    expect(card().querySelector('.ps-item-owned')?.textContent).toBe(owned ? labels.shopOwned : undefined);
    expect(action().textContent?.trim()).toBe(
      equipped ? labels.shopUnequip : owned ? labels.shopEquip : labels.shopBuy,
    );
    expect(action().disabled).toBe(false);
    expect(mocks.model.buyItem).not.toHaveBeenCalled();
  });
  it('兑换成功后价格仍然显示，操作切换为佩戴，不再重复购买', async () => {
    mocks.model.buyItem.mockImplementation(async () => {
      mocks.model.shop.value.points -= 12000;
      mocks.model.shop.value.frames[0].owned = true;
      return { status: 200, data: { ok: true } };
    });
    await mount();
    action().click();
    expect(mocks.alert).toHaveBeenCalledOnce();
    expect(mocks.alert.mock.calls[0][0].content).toContain('12000');
    expect(mocks.model.buyItem).not.toHaveBeenCalled();
    await mocks.alert.mock.calls[0][0].onOk();
    await flush();
    expect(mocks.model.buyItem).toHaveBeenCalledExactlyOnceWith('frame_dragon');
    expect(price()).toBe('12,000');
    expect(card().querySelector('.ps-item-owned')?.textContent).toBe(zh.growth.shopOwned);
    expect(action().textContent?.trim()).toBe(zh.growth.shopEquip);
    action().click();
    await flush();
    expect(mocks.model.equipFrame).toHaveBeenCalledExactlyOnceWith('frame_dragon');
    expect(mocks.model.buyItem).toHaveBeenCalledOnce();
  });
  it.each([false, true])('成就头像框 owned=%s 时不显示积分价格或兑换按钮', async (owned) => {
    Object.assign(mocks.model.shop.value.frames[0], {
      acquisition: 'achievement',
      achievementKey: 'first_bookmark',
      cost: null,
      owned,
    });
    mocks.model.dashboard.value.achievements = [
      { key: 'first_bookmark', cur: 1, target: 1, claimable: !owned, claimed: owned },
    ];
    await mount();
    expect(card().querySelector('.ps-purchase-meta')).toBeNull();
    expect(card().textContent).not.toContain('12,000');
    expect(action().textContent?.trim()).toBe(owned ? zh.growth.shopEquip : zh.growth.frameAchievementClaim);
    expect(mocks.model.buyItem).not.toHaveBeenCalled();
  });
  it.each(['insufficient', 'readonly'] as const)('%s 仍显示价格并禁用对应操作', async (state) => {
    if (state === 'insufficient') mocks.model.shop.value.points = 11999;
    else mocks.model.shop.value.frames[0].owned = true;
    await mount('zh-CN', { readOnly: state === 'readonly' });
    expect(price()).toBe('12,000');
    expect(action().disabled).toBe(true);
    action().click();
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(mocks.model.buyItem).not.toHaveBeenCalled();
    expect(mocks.model.equipFrame).not.toHaveBeenCalled();
  });
});

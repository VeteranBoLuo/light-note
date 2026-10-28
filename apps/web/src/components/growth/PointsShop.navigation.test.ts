import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/i18n/locales/zh-CN';
const state = vi.hoisted(() => ({ model: null as any, target: 'storage_2g' }));
vi.mock('@/composables/useGrowth.ts', () => ({ useGrowth: () => state.model }));
vi.mock('@/store', () => ({
  useUserStore: () => ({ id: 'qa', headPicture: '', adminContext: null }),
  bookmarkStore: () => ({ isMobile: false }),
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => h('span') } }));
vi.mock('./AvatarFramePreview.vue', () => ({ default: { render: () => h('span') } }));
vi.mock('./ProfileBackgroundShop.vue', () => ({
  default: { render: () => h('article', { 'data-shop-item-id': 'background_mountains', tabindex: -1 }, '背景') },
}));
vi.mock('./PointsGoal.vue', () => ({
  default: {
    emits: ['redeem'],
    setup:
      (_: unknown, { emit }: any) =>
      () =>
        h('button', { onClick: () => emit('redeem', state.target) }, '定位目标'),
  },
}));
import PointsShop from './PointsShop.vue';
import { scrollIntoContainer } from '@/utils/scrolling';
vi.mock('@/utils/scrolling', () => ({
  findVerticalScrollContainer: () => document.documentElement,
  scrollIntoContainer: vi.fn(),
}));
let app: ReturnType<typeof createApp>;
let host: HTMLDivElement;
async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    await nextTick();
  }
}
async function mount(props = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/store', component: { render: () => null } },
    ],
  });
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(PointsShop, { showGoal: true, ...props });
  app.use(router).use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.directive('click-log', {});
  await router.push('/');
  await router.isReady();
  app.mount(host);
  await flush();
}
const item = (id: string, rarity?: string) => ({
  id,
  rarity,
  type: rarity ? 'cosmetic' : 'consumable',
  effect: rarity ? 'frame' : 'storage',
  name: id,
  desc: '',
  cost: 200,
  minLevel: 0,
  owned: false,
  canBuy: true,
});
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  vi.mocked(scrollIntoContainer).mockClear();
  state.target = 'storage_2g';
  state.model = {
    shop: ref({
      items: [item('storage_2g')],
      frames: [item('frame_mint', 'basic'), item('frame_rose', 'rare')],
      points: 6000,
      level: 7,
      purchaseEnabled: true,
      protectCards: 0,
    }),
    dashboard: ref(null),
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
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});
function locate() {
  [...host.querySelectorAll('button')].find((button) => button.textContent === '定位目标')!.click();
}
describe('积分目标商品定位', () => {
  it.each(['storage', 'ai', 'makeup_card', 'unknown', ''])(
    '锚点 %s 只滚动到对应资产，不高亮或触发购买',
    async (scrollTarget) => {
      state.model.shop.value.items.push(item('ai_pack_small'), item('makeup_card'));
      await mount({ scrollTarget });
      const expectedId =
        scrollTarget === 'storage'
          ? 'storage_2g'
          : scrollTarget === 'ai'
            ? 'ai_pack_small'
            : scrollTarget === 'makeup_card'
              ? 'makeup_card'
              : null;
      expect(scrollIntoContainer).toHaveBeenCalledTimes(expectedId ? 1 : 0);
      if (expectedId) expect(vi.mocked(scrollIntoContainer).mock.calls[0][1].dataset.shopItemId).toBe(expectedId);
      expect(host.querySelector('.is-focused')).toBeNull();
      expect(document.activeElement?.hasAttribute('data-shop-item-id')).toBe(false);
      expect(state.model.buyItem).not.toHaveBeenCalled();
    },
  );

  it('资源商店使用可访问的导航链接，保留当前资产分类', async () => {
    await mount({ scrollTarget: 'storage' });
    expect(host.querySelector<HTMLAnchorElement>('.ps-store-bridge__action')?.getAttribute('href')).toBe(
      '/store?category=storage',
    );
    expect(host.querySelector('.ps-store-bridge__action')?.textContent).toContain(zh.growth.shopStoreAction);
  });
  it('去兑换只定位目标商品，不发起兑换或扣积分', async () => {
    await mount();
    locate();
    await flush();
    expect(vi.mocked(scrollIntoContainer).mock.calls.at(-1)?.[1].dataset.shopItemId).toBe('storage_2g');
    expect(document.activeElement?.hasAttribute('data-shop-item-id')).toBe(false);
    expect(state.model.buyItem).not.toHaveBeenCalled();
  });
  it('头像框目标被筛选隐藏时，恢复全部并定位精确商品', async () => {
    await mount();
    const basicTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) =>
      tab.textContent?.includes('基础'),
    )!;
    basicTab.click();
    await flush();
    expect(host.querySelector('[data-shop-item-id="frame_rose"]')).toBeNull();
    state.target = 'frame_rose';
    locate();
    await flush();
    expect(vi.mocked(scrollIntoContainer).mock.calls.at(-1)?.[1].dataset.shopItemId).toBe('frame_rose');
    expect(document.activeElement?.hasAttribute('data-shop-item-id')).toBe(false);
    expect(state.model.buyItem).not.toHaveBeenCalled();
  });
  it('个人背景目标也使用同一定位入口', async () => {
    await mount();
    state.target = 'background_mountains';
    state.model.shop.value.items.push(item('background_mountains'));
    locate();
    await flush();
    expect(vi.mocked(scrollIntoContainer).mock.calls.at(-1)?.[1].dataset.shopItemId).toBe('background_mountains');
    expect(document.activeElement?.hasAttribute('data-shop-item-id')).toBe(false);
    expect(state.model.buyItem).not.toHaveBeenCalled();
  });
  it('管理员只读上下文不会执行目标定位处理', async () => {
    await mount({ readOnly: true });
    locate();
    await flush();
    expect(scrollIntoContainer).not.toHaveBeenCalled();
    expect(state.model.buyItem).not.toHaveBeenCalled();
  });
});

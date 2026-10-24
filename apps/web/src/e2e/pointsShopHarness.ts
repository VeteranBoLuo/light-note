import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import request from '@/http/request';
import { bookmarkStore, useUserStore } from '@/store';
import type { Shop, ShopItem } from '@/composables/useGrowth';
import { applyUiDensity } from '@/composables/useUiDensity';
import { isMobileViewport } from '@/config/responsive';
import GrowthPage from '@/view/growth/GrowthPage.vue';
import globalDirect from '@/config/globalDirect';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// 全部请求仅在内存中处理，复用真实成长页、积分目录展示与确认交互，不访问后端。
const params = new URLSearchParams(location.search);
const state = params.get('state') || 'active';
const mobile = params.get('renderProfile') === 'mobile' || isMobileViewport(window.innerWidth);
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  mobile,
);
document.body.style.display = 'block';
Object.assign(document.getElementById('app')!.style, { height: '100%', width: '100%', overflow: 'hidden' });
const utility = (
  id: string,
  name: string,
  cost: number,
  effect: string,
  desc: string,
  purchaseLimit?: number,
): ShopItem => ({
  id,
  name,
  cost,
  effect,
  desc,
  purchaseLimit,
  type: 'consumable',
  minLevel: 0,
  bonusTokens: 0,
  owned: false,
  equipped: false,
  canBuy: true,
  repeatable: !purchaseLimit,
});
const fixture: Shop = {
  economyVersion: 'points-economy-c9',
  points: ['reached', 'frame', 'background', 'level', 'maintenance', 'unavailable', 'readonly'].includes(state)
    ? 5320
    : 3817,
  level: 7,
  equippedTitle: null,
  equippedFrame: null,
  equippedBackground: null,
  protectCards: 2,
  purchaseEnabled: state !== 'maintenance',
  isVisitor: state === 'visitor',
  items: [
    utility('ai_pack_small', 'AI 轻量加油包', 240, 'ai_pack', '+30 万 tokens · 永久有效'),
    utility('ai_pack', 'AI 加油包', 420, 'ai_pack', '+60 万 tokens · 永久有效'),
    utility('storage_128', '扩容包 128MB', 500, 'storage', '云空间永久 +128MB', 1),
    utility('storage_512', '扩容包 512MB', 1600, 'storage', '云空间永久 +512MB', 1),
    utility('storage_2g', '扩容包 2GB', 5200, 'storage', '云空间永久 +2GB', 1),
    { ...utility('background_mountains', '远山叠翠', 600, 'background', ''), type: 'cosmetic', repeatable: false },
  ],
  frames: [
    { ...utility('frame_mint', '薄荷清风', 80, 'frame', ''), type: 'cosmetic', rarity: 'basic', repeatable: false },
    { ...utility('frame_rose', '玫瑰轻语', 160, 'frame', ''), type: 'cosmetic', rarity: 'rare', repeatable: false },
  ],
};
if (state === 'unavailable') fixture.items.find((item) => item.id === 'storage_2g')!.limitReached = true;
if (state === 'level') fixture.items.find((item) => item.id === 'storage_2g')!.minLevel = 10;
const preference = {
  enabled: state !== 'empty',
  itemId: state === 'frame' ? 'frame_mint' : state === 'background' ? 'background_mountains' : 'storage_2g',
};
const growth = () => ({
  points: fixture.points,
  level: fixture.level,
  name: '探花',
  exp: 5000,
  streak: 7,
  protectCards: 2,
  checkedInToday: true,
  levelStartExp: 4000,
  nextLevelExp: 6000,
  expToNext: 1000,
  progress: 50,
  isMax: false,
  spaceMb: 512,
  aiTokenDaily: 340000,
  dailyExp: 10,
  dailyCap: 50,
  features: { growthCenterV2: true, pointsCenter: true },
});
function summary() {
  const items = [...fixture.items, ...(fixture.frames || [])];
  const item = items.find((item) => item.id === preference.itemId)!;
  const price = Number(item.cost);
  return {
    balance: fixture.points,
    lowPressureMode: state === 'low-pressure',
    goal: {
      enabled: preference.enabled,
      itemId: preference.itemId,
      item: { id: item.id, name: item.name, cost: item.cost, effect: item.effect },
      balance: fixture.points,
      price,
      shortfall: Math.max(0, price - fixture.points),
      progress: Math.min(100, Math.round((fixture.points / price) * 100)),
      estimate: fixture.points < price ? { minDays: 34, maxDays: 46 } : null,
    },
    goalOptions: items.map(({ id, name, cost, effect }) => ({ id, name, cost, effect })),
  };
}
let summaryFailed = false;
let saveFailed = false;
request.defaults.adapter = async (config) => {
  const path = String(config.url || '').split('?')[0];
  const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  let data: unknown = {};
  let status = 200;
  if (path.endsWith('/growth/shop')) {
    for (const item of [...fixture.items, ...(fixture.frames || [])]) {
      item.canBuy =
        fixture.purchaseEnabled &&
        !fixture.isVisitor &&
        !item.owned &&
        !item.limitReached &&
        fixture.points >= Number(item.cost) &&
        fixture.level >= item.minLevel;
    }
    data = structuredClone(fixture);
  } else if (path.endsWith('/growth/points/summary')) {
    if (state === 'loading') return new Promise<never>(() => {});
    if (state === 'error' && !summaryFailed) {
      summaryFailed = true;
      throw new Error('Fixture summary error');
    }
    data = summary();
  } else if (path.endsWith('/preferences/points-goal')) {
    if (state === 'save-error' && !saveFailed) {
      saveFailed = true;
      status = 400;
    } else {
      preference.itemId = payload.itemId;
      preference.enabled = payload.enabled;
      data = { ok: true };
    }
  } else if (path.endsWith('/growth/shop/buy')) {
    const item = [...fixture.items, ...(fixture.frames || [])].find((item) => item.id === payload.itemId);
    if (item?.canBuy) {
      fixture.points -= Number(item.cost);
      if (item.purchaseLimit) {
        item.limitReached = true;
        item.purchaseCount = 1;
      }
      if (item.type === 'cosmetic') item.owned = true;
      data = { ok: true, points: fixture.points };
    } else data = { ok: false };
  } else if (path.endsWith('/growth/me')) data = growth();
  else if (path.endsWith('/growth/dashboard'))
    data = { stats: {}, achievements: [], quests: [], timeline: [], questBonus: {}, streakMilestones: [] };
  else if (path.endsWith('/growth/preferences')) data = { lowPressureMode: state === 'low-pressure' };
  else if (path.endsWith('/growth/lottery')) data = { freeRemaining: 0 };
  else if (path.endsWith('/growth/ranks')) data = [];
  else if (path.endsWith('/growth/inventory')) data = { items: [], assets: { points: fixture.points } };
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status, data } };
};
const pinia = createPinia();
const user = useUserStore(pinia);
user.id = state === 'visitor' ? 'visitor' : 'points-shop-qa';
user.role = state === 'visitor' ? 'visitor' : 'user';
user.alias = '兑换页验收';
if (state === 'readonly')
  user.$patch({ adminContext: { id: 'qa-readonly', mode: 'readonly', userId: 'points-shop-qa' } } as any);
bookmarkStore(pinia).screenWidth = window.innerWidth;
window.addEventListener('resize', () => {
  bookmarkStore(pinia).screenWidth = window.innerWidth;
});
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/growth', component: GrowthPage },
    {
      path: '/store',
      component: {
        render: () =>
          h(
            'main',
            { style: { color: 'var(--text-color)', padding: 'var(--ui-space-24, 24px)' } },
            '资源商店 · 本地导航验证',
          ),
      },
    },
  ],
});
const app = createApp({ render: () => h(RouterView) });
app
  .use(pinia)
  .use(router)
  .use(
    createI18n({
      legacy: false,
      locale: params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN',
      messages: { 'zh-CN': zhCN, 'en-US': enUS },
    }),
  );
globalDirect(app);
await router.push('/growth?section=rewards&reward=shop');
await router.isReady();
app.mount('#app');

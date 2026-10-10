import { createApp } from 'vue';
import { applyUiDensity } from '@/composables/useUiDensity';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import growthApi from '@/api/growthApi';
import type { Shop, ShopItem } from '@/composables/useGrowth';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';
import PointsShopLimitsHarness from './PointsShopLimitsHarness.vue';

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const state = params.get('state') || 'mixed';

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle(
  'light-note-mobile-rendering',
  params.get('renderProfile') === 'mobile' || window.innerWidth < 768,
);
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  window.innerWidth < 768,
);

function shopItem(item: Partial<ShopItem> & Pick<ShopItem, 'id' | 'name' | 'desc' | 'cost'>): ShopItem {
  return {
    type: 'consumable',
    minLevel: 0,
    bonusTokens: 0,
    owned: false,
    equipped: false,
    canBuy: true,
    acquisition: 'shop',
    unavailableReasons: [],
    ...item,
  };
}

const fixture: Shop = {
  economyVersion: 'points-economy-c7',
  purchaseEnabled: true,
  points: state === 'insufficient' ? 299 : 2000,
  level: 8,
  equippedTitle: null,
  equippedFrame: null,
  protectCards: state === 'full' ? 3 : state === 'one-slot' ? 2 : 0,
  isVisitor: false,
  frames: [],
  items: [
    shopItem({ id: 'makeup_card', name: '补签卡', desc: '', cost: 300, effect: 'makeup_card', repeatable: true }),
    shopItem({
      id: 'ai_pack_starter',
      name: 'AI 入门包',
      desc: '+5 万 tokens · 永久有效，每账号限兑一次',
      cost: 60,
      effect: 'ai_pack',
      bonusTokens: 50000,
      purchaseLimit: 1,
      purchaseCount: state === 'redeemed' ? 1 : 0,
      limitReached: state === 'redeemed',
    }),
    shopItem({
      id: 'ai_pack_small',
      effect: 'ai_pack',
      name: 'AI 轻量加油包',
      desc: '+30 万 tokens · 永久有效，每日等级额度用完后自动使用',
      cost: 240,
      bonusTokens: 300_000,
      repeatable: true,
    }),
    shopItem({
      id: 'ai_pack',
      effect: 'ai_pack',
      name: 'AI 加油包',
      desc: '+60 万 tokens · 永久有效，每日等级额度用完后自动使用',
      cost: 420,
      bonusTokens: 600_000,
      repeatable: true,
    }),
    shopItem({
      id: 'storage_128',
      effect: 'storage',
      name: '扩容包 128MB',
      desc: '云空间永久 +128MB，低门槛扩容',
      cost: 500,
      purchaseLimit: 1,
      purchaseCount: 0,
      limitReached: false,
      repeatable: false,
    }),
    shopItem({
      id: 'storage_512',
      effect: 'storage',
      name: '扩容包 512MB',
      desc: '云空间永久 +512MB，叠加在等级容量之上',
      cost: 1600,
      purchaseLimit: 1,
      purchaseCount: 1,
      limitReached: true,
      repeatable: false,
      canBuy: false,
      unavailableReasons: ['purchase_limit'],
    }),
    shopItem({
      id: 'storage_2g',
      effect: 'storage',
      name: '扩容包 2GB',
      desc: '云空间永久 +2GB，大文件用户长期扩容',
      cost: 5200,
      purchaseLimit: 1,
      purchaseCount: 0,
      limitReached: false,
      repeatable: false,
      canBuy: false,
      pointsShortfall: 3200,
      unavailableReasons: ['points'],
    }),
  ],
};

if (state === 'loading') {
  growthApi.getShop = () => new Promise<never>(() => {});
} else if (state === 'error') {
  growthApi.getShop = async () => {
    throw new Error('VISUAL_FIXTURE_SHOP_LOAD_FAILED');
  };
} else {
  growthApi.getShop = async () =>
    ({ status: 200, data: structuredClone(fixture) }) as Awaited<ReturnType<typeof growthApi.getShop>>;
}

// 所有资产操作只更新内存夹具；禁止透传真实后端。
const reply = (data: unknown) => ({ status: 200, data }) as Awaited<ReturnType<typeof growthApi.getMyGrowth>>;
growthApi.getMyGrowth = async () =>
  reply({
    exp: 6351,
    level: 7,
    name: '探花',
    points: fixture.points,
    protectCards: fixture.protectCards,
    streak: 67,
    spaceMb: 1024,
    aiTokenDaily: 1000000,
    checkedInToday: true,
    levelStartExp: 6000,
    nextLevelExp: 9000,
    expToNext: 2649,
    progress: 12,
    isMax: false,
    dailyExp: 10,
    dailyCap: 200,
  });
growthApi.getRanks = async () => reply([]);
growthApi.getGrowthPreferences = async () => reply({ celebrationEnabled: false });
growthApi.getInventory = async () =>
  reply({ items: [{ id: 'makeup_card', qty: fixture.protectCards }], assets: { points: fixture.points } });
growthApi.buyShopItem = async (payload) => {
  if (payload.itemId !== 'makeup_card')
    return reply({ ok: false, msg: 'Only make-up cards are enabled in this fixture' });
  if (fixture.protectCards >= 3) return reply({ ok: false, reason: 'card_max' });
  if (fixture.points < 300) return reply({ ok: false, reason: 'insufficient' });
  fixture.points -= 300;
  fixture.protectCards += 1;
  return reply({ ok: true, points: fixture.points });
};

const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: PointsShopLimitsHarness },
    { path: '/store', component: PointsShopLimitsHarness },
  ],
});

createApp(PointsShopLimitsHarness).use(createPinia()).use(i18n).use(router).directive('click-log', {}).mount('#app');

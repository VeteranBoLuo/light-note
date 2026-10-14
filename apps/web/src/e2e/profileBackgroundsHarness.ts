import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { PROFILE_BACKGROUND_IDS } from '@lightnote/shared/profile-backgrounds';
import growthApi from '@/api/growthApi';
import request from '@/http/request';
import type { Shop } from '@/composables/useGrowth';
import { useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
import Harness from './ProfileBackgroundsHarness.vue';
const params = new URLSearchParams(location.search);
const state = params.get('state');
const mobile = params.get('renderProfile') === 'mobile' || window.innerWidth < 768;
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  mobile,
);
const fixture: Shop = {
  economyVersion: 'points-economy-c9',
  points: state === 'insufficient' ? 100 : 5000,
  level: 7,
  equippedTitle: null,
  equippedFrame: 'frame_mint',
  equippedBackground: state === 'default' ? null : `background_${params.get('art') || 'mountains'}`,
  protectCards: 0,
  purchaseEnabled: state !== 'maintenance',
  isVisitor: state === 'visitor',
  frames: [],
  items: PROFILE_BACKGROUND_IDS.map((id, index) => ({
    id,
    effect: 'background',
    type: 'cosmetic',
    name: id,
    desc: '',
    cost: [600, 800, 1000, 1500][index],
    minLevel: 0,
    bonusTokens: 0,
    owned: state === 'owned',
    equipped: false,
    canBuy: true,
  })),
};
function update() {
  for (const item of fixture.items) {
    item.equipped = item.id === fixture.equippedBackground;
    item.owned ||= item.equipped;
    item.canBuy = fixture.purchaseEnabled && !fixture.isVisitor && !item.owned && fixture.points >= Number(item.cost);
  }
}
const reply = (data: unknown) => ({ status: 200, data }) as Awaited<ReturnType<typeof growthApi.getShop>>;
growthApi.getShop = async () => {
  if (state === 'loading') return new Promise<never>(() => {});
  if (state === 'error') throw new Error('Fixture error');
  update();
  return reply(structuredClone(fixture));
};
growthApi.getMyGrowth = async () =>
  reply({
    name: '探花',
    level: 7,
    points: fixture.points,
    equippedFrame: fixture.equippedFrame,
    equippedBackground: fixture.equippedBackground,
  });
growthApi.getRanks = async () => reply([]);
growthApi.getInventory = async () => reply({ items: [], assets: { points: fixture.points } });
growthApi.getGrowthPreferences = async () => reply({});
growthApi.buyShopItem = async (input) => {
  const item = fixture.items.find((item) => item.id === input.itemId);
  if (!item?.canBuy || input.expectedCost !== item.cost || input.economyVersion !== fixture.economyVersion)
    return reply({ ok: false });
  fixture.points -= Number(item.cost);
  item.owned = true;
  update();
  return reply({ ok: true });
};
growthApi.equipBackground = async (id) => {
  if (id !== null && !fixture.items.some((item) => item.id === id && item.owned)) return reply({ ok: false });
  fixture.equippedBackground = id;
  update();
  return reply({ ok: true, equipped: id });
};
// 所有额外请求也留在内存；实际公开主页组件的操作不得透传真实后端。
request.defaults.adapter = async (config) => {
  const path = String(config.url || '');
  let data: unknown = {};
  const readOnly = !config.method || config.method.toLowerCase() === 'get';
  if (path.endsWith('/feed/capabilities')) data = { feedEnabled: true, writesEnabled: true };
  else if (path.endsWith('/topics')) data = [];
  else if (path.endsWith('/profiles/options/me')) data = { userPublicId: 'profile-qa', enabled: true };
  else if (path.endsWith('/profiles/profile-qa'))
    data = {
      name: '山间拾光',
      isOwn: true,
      backgroundShopEnabled: true,
      role: 'member',
      avatar: '',
      frameId: 'frame_mint',
      level: 7,
      levelName: '探花',
      title: null,
      communityId: 'ln_DEMO01',
      backgroundId: `background_${params.get('art') || (params.get('theme') === 'night' ? 'stars' : 'mountains')}`,
      bio: '记录生活的细碎光芒，让每一个灵感都有安放之处。',
      communityTenureLabel: '加入轻笺约 1 年',
      achievements: [{ key: 'bookmark_10', group: 'create' }],
      allAchievements: [{ key: 'bookmark_10', group: 'create' }],
      achievementCount: 1,
      hasMoreAchievements: false,
      followingCount: 12,
      followerCount: 28,
      posts: { items: [], nextCursor: null },
      featuredPostItems: [],
    };
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: readOnly ? 200 : 403, data } };
};
const pinia = createPinia();
const user = useUserStore(pinia);
user.id = 'background-qa';
user.role = 'user';
user.alias = '山间拾光';
const i18n = createI18n({
  legacy: false,
  locale: params.get('locale') || 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});
const publicView = params.get('view') === 'public';
const entry = publicView ? (await import('@/view/community/CommunityFeed.vue')).default : Harness;
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: Harness },
    { path: '/community/profile', component: entry, meta: { feedMode: 'profile' } },
  ],
});
if (publicView) await router.push('/community/profile');
createApp(entry)
  .use(pinia)
  .use(i18n)
  .use(router)
  .directive('click-log', {})
  .directive('auto-scrollbar', {})
  .mount('#app');

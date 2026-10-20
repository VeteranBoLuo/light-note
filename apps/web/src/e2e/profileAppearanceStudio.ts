import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { RouterView, createMemoryHistory, createRouter } from 'vue-router';
import { PROFILE_BACKGROUND_IDS } from '@lightnote/shared/profile-backgrounds';
import request from '@/http/request';
import { useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import type { Shop, ShopItem } from '@/composables/useGrowth';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
import Harness from './ProfileAppearanceHarness.vue';
import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

// 资料编辑与个人装扮的本地验收页：真实组件 + 内存数据，所有请求都在本页应答，不连接后端、不扣真实积分。
// 参数：state=newbie|visitor|loading|error|maintenance|long|profile-loading|profile-error，appearance=none，identity=official，theme=night，renderProfile=mobile，density，locale=en-US。
const params = new URLSearchParams(location.search);
const state = params.get('state');
const mobile = params.get('renderProfile') === 'mobile' || innerWidth < 768;
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  mobile,
);

const newbie = state === 'newbie';
const level = newbie ? 2 : 15;
const frameRows: [string, NonNullable<ShopItem['rarity']>, number, number][] = [
  ['frame_mint', 'basic', 80, 0],
  ['frame_ink', 'basic', 160, 0],
  ['frame_moonstone', 'basic', 240, 0],
  ['frame_gold', 'rare', 700, 0],
  ['frame_sakura', 'rare', 1000, 0],
  ['frame_sunset', 'rare', 1400, 0],
  ['frame_ocean', 'epic', 2000, 0],
  ['frame_aurora', 'epic', 2800, 0],
  ['frame_flame', 'epic', 3800, 0],
  ['frame_neon', 'legendary', 6000, 3],
  ['frame_galaxy', 'legendary', 9000, 4],
  ['frame_dragon', 'legendary', 12000, 5],
  ['frame_celestial', 'legendary', 16000, 6],
];
const achievementRows: [string, NonNullable<ShopItem['rarity']>, string, number, number][] = [
  ['frame_first_light', 'basic', 'streak_1', 1, 1],
  ['frame_bookmark_intro', 'basic', 'bookmark_10', 10, 10],
  ['frame_file_intro', 'basic', 'file_5', 5, 5],
  ['frame_note_seed', 'basic', 'note_10', 10, 10],
  ['frame_streak_seed', 'rare', 'streak_7', 7, 7],
  ['frame_bookmark_seed', 'rare', 'bookmark_50', 50, 50],
  ['frame_note_flow', 'rare', 'note_30', 30, 30],
  ['frame_file_seed', 'rare', 'file_30', 12, 30],
  ['frame_streak_month', 'epic', 'streak_30', 30, 30],
  ['frame_bookmark_corridor', 'epic', 'bookmark_200', 126, 200],
  ['frame_note_masterpiece', 'epic', 'note_200', 88, 200],
  ['frame_file_vault', 'epic', 'file_200', 12, 200],
  ['frame_bookmark_archive', 'legendary', 'bookmark_500', 126, 500],
  ['frame_note_constellation', 'legendary', 'note_500', 88, 500],
  ['frame_file_constellation', 'legendary', 'file_500', 12, 500],
  ['frame_streak_eternal', 'legendary', 'streak_365', 64, 365],
];
const owned = new Set(
  newbie
    ? ['frame_first_light']
    : [
        'background_mountains',
        'background_coast',
        'frame_mint',
        'frame_moonstone',
        'frame_dragon',
        'frame_first_light',
        'frame_bookmark_intro',
        'frame_note_seed',
        'frame_streak_seed',
        'frame_bookmark_seed',
        'frame_note_flow',
        'frame_streak_month',
      ],
);
const fixture: Shop = {
  economyVersion: 'points-economy-c9',
  points: newbie ? 300 : 2652,
  level,
  equippedTitle: null,
  equippedFrame: newbie ? 'frame_first_light' : 'frame_dragon',
  equippedBackground: newbie ? null : 'background_coast',
  protectCards: 0,
  purchaseEnabled: state !== 'maintenance',
  isVisitor: state === 'visitor',
  items: PROFILE_BACKGROUND_IDS.map((id, index) => ({
    id,
    type: 'cosmetic',
    effect: 'background',
    name: id,
    desc: '',
    cost: [600, 800, 1000, 1500][index],
    minLevel: 0,
    bonusTokens: 0,
    owned: false,
    equipped: false,
    canBuy: true,
  })),
  frames: [
    ...frameRows.map(([id, rarity, cost, minLevel]) => ({
      id,
      type: 'cosmetic' as const,
      effect: 'frame',
      rarity,
      name: id,
      desc: '',
      cost,
      minLevel,
      bonusTokens: 0,
      acquisition: 'shop' as const,
      owned: false,
      equipped: false,
      canBuy: true,
    })),
    ...achievementRows.map(([id, rarity, achievementKey]) => ({
      id,
      type: 'cosmetic' as const,
      effect: 'frame',
      rarity,
      name: id,
      desc: '',
      cost: null,
      minLevel: 0,
      bonusTokens: 0,
      acquisition: 'achievement' as const,
      achievementKey,
      owned: false,
      equipped: false,
      canBuy: false,
    })),
  ],
};
if (params.get('appearance') === 'none') {
  fixture.equippedFrame = null;
  fixture.equippedBackground = null;
}
const achievements = achievementRows.map(([id, , key, cur, target]) => {
  const value = newbie ? Math.min(cur, key === 'streak_1' ? 1 : 2) : cur;
  const unlocked = value >= target;
  return {
    key,
    group: key.split('_')[0],
    target,
    cur: value,
    unlocked,
    claimed: owned.has(id),
    claimable: unlocked && !owned.has(id),
    frameId: id,
  };
});

function sync() {
  for (const item of [...fixture.items, ...(fixture.frames || [])]) {
    item.owned = owned.has(item.id);
    item.equipped = item.id === fixture.equippedBackground || item.id === fixture.equippedFrame;
    item.canEquip = item.owned;
    item.canBuy =
      item.acquisition !== 'achievement' &&
      fixture.purchaseEnabled &&
      !fixture.isVisitor &&
      !item.owned &&
      fixture.points >= Number(item.cost) &&
      level >= item.minLevel;
  }
  for (const achievement of achievements) {
    achievement.claimed = owned.has(achievement.frameId);
    achievement.claimable = achievement.unlocked && !achievement.claimed;
  }
}

function growthSnapshot() {
  return {
    name: newbie ? '童生' : '文圣',
    level,
    points: fixture.points,
    equippedFrame: fixture.equippedFrame,
    equippedBackground: fixture.equippedBackground,
  };
}

const ownProfile = {
  bio: '记录生活与灵感，让喜欢的事物慢慢生长。',
  showCommunityTenure: true,
  featuredAchievementKeys: [],
  revision: 1,
  usesDefaultFeaturedAchievements: true,
  availableAchievements: [],
  publicPreview: {
    name: '山间拾光',
    userPublicId: 'profile-qa',
    communityId: 'ln_DEMO01',
    role: params.get('identity') === 'official' ? 'official' : 'member',
    avatar: '',
    frameId: fixture.equippedFrame,
    frameRarity: newbie ? 'basic' : 'legendary',
    level,
    levelName: newbie ? '童生' : '文圣',
    title: null,
    backgroundId: fixture.equippedBackground,
    bio: '记录生活与灵感，让喜欢的事物慢慢生长。',
    communityTenureLabel: null,
    achievements: [],
    achievementCount: 0,
    hasMoreAchievements: false,
  },
};
const account = {
  id: 'appearance-qa',
  role: 'user',
  alias: state === 'long' ? '一个正在记录生活与灵感的轻笺用户' : '山间拾光',
  email: 'demo@example.com',
  headPicture: '',
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
request.defaults.adapter = async (config) => {
  const path = String(config.url || '').replace(/\?.*$/, '');
  const method = String(config.method || 'get').toLowerCase();
  const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : config.data || {};
  let data: unknown = {};
  sync();
  if (path.endsWith('/api/growth/shop')) {
    if (state === 'loading') await new Promise(() => {});
    if (state === 'error')
      return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 500, data: null } };
    data = structuredClone(fixture);
  } else if (path.endsWith('/api/growth/me')) data = growthSnapshot();
  else if (path.endsWith('/api/growth/dashboard')) data = { achievements: structuredClone(achievements), quests: [] };
  else if (path.endsWith('/api/growth/inventory')) data = { items: [], assets: { points: fixture.points } };
  else if (path.endsWith('/api/community-chat/profile/me')) {
    if (state === 'profile-loading') await new Promise(() => {});
    if (state === 'profile-error')
      return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 500, data: null } };
    if (method !== 'get') {
      ownProfile.bio = body.bio;
      ownProfile.revision += 1;
    }
    data = structuredClone(ownProfile);
  } else if (path.endsWith('/api/user/saveUserInfo')) {
    Object.assign(account, body);
    data = {};
  } else if (path.endsWith('/api/user/getUserInfo')) data = structuredClone(account);
  else if (path.endsWith('/api/growth/shop/buy')) {
    await wait(400);
    const item = [...fixture.items, ...(fixture.frames || [])].find((entry) => entry.id === body.itemId);
    if (!item?.canBuy || body.expectedCost !== item.cost) data = { ok: false, msg: '无法兑换' };
    else {
      fixture.points -= Number(item.cost);
      owned.add(item.id);
      data = { ok: true, points: fixture.points, itemId: item.id, effect: { type: item.effect } };
    }
  } else if (path.endsWith('/api/growth/equipFrame')) {
    await wait(300);
    if (body.frameId && !owned.has(body.frameId)) data = { ok: false };
    else {
      fixture.equippedFrame = body.frameId;
      data = { ok: true, equipped: body.frameId };
    }
  } else if (path.endsWith('/api/growth/equipBackground')) {
    await wait(300);
    if (body.backgroundId && !owned.has(body.backgroundId)) data = { ok: false };
    else {
      fixture.equippedBackground = body.backgroundId;
      data = { ok: true, equipped: body.backgroundId };
    }
  } else if (path.endsWith('/api/growth/achievement/claim')) {
    await wait(300);
    const achievement = achievements.find((entry) => entry.key === body.key);
    if (!achievement?.claimable) data = { ok: false };
    else {
      owned.add(achievement.frameId);
      data = { ok: true, frameId: achievement.frameId };
    }
  } else if (method !== 'get') data = { ok: true };
  sync();
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 200, data } };
};

const pinia = createPinia();
const user = useUserStore(pinia);
if (state !== 'visitor') {
  Object.assign(user, account);
}
const i18n = createI18n({
  legacy: false,
  locale: params.get('locale') || 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: Harness },
    { path: '/growth', component: Harness },
  ],
});
createApp({ render: () => h(RouterView) })
  .use(pinia)
  .use(i18n)
  .use(router)
  .component('svg-icon', SvgIcon)
  .directive('click-log', {})
  .directive('auto-scrollbar', {})
  .mount('#app');

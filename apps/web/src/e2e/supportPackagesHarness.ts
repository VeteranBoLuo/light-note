import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { SUPPORT_PACKAGE_CATALOG, SUPPORT_PACKAGE_CATALOG_VERSION } from '@lightnote/shared';
import globalDirect from '@/config/globalDirect';
import { RoleEnum } from '@/config/bookmarkCfg';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { bookmarkStore, useUserStore } from '@/store';
import type { EntitlementStoreState, SupportBenefit, SupportPackage } from '@/api/supportApi';
import '@/assets/css/index.less';
import SupportPackagesHarness from './SupportPackagesHarness.vue';
import { saveEntitlementJourney, clearEntitlementJourney } from '@/utils/entitlementJourney';
import { applyUiDensity } from '@/composables/useUiDensity';

const params = new URLSearchParams(window.location.search);
const visualState = params.get('state') || 'default';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const requestedCategory = ['ai', 'storage', 'combo'].includes(String(params.get('category')))
  ? String(params.get('category'))
  : 'ai';
const isGuest = visualState === 'guest';

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', window.innerWidth < 768);
document.body.dataset.visualState = visualState;

function apiResponse<TConfig>(config: TConfig, data: unknown) {
  return {
    data: { status: 200, msg: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: null,
  };
}

function benefit(aiTokens = 0, storageMb = 0): SupportBenefit {
  return { aiTokens, storageMb };
}

function regularPackages(): SupportPackage[] {
  return SUPPORT_PACKAGE_CATALOG.map((item) => ({
    ...item,
    firstPurchaseStatus: 'not_applicable',
  }));
}

function storeState(): EntitlementStoreState {
  return {
    authenticated: !isGuest,
    orderSyncAvailable: true,
    orderCount: isGuest ? 0 : 2,
    totalAmount: isGuest ? '0.00' : '94.00',
    grantedTokens: isGuest ? 0 : 7_100_000,
    grantedStorageMb: isGuest ? 0 : 2_048,
    lastPurchaseAt: isGuest ? null : '2026-08-25 12:30:00',
    recentOrders: isGuest
      ? []
      : [
          {
            id: 'visual-combo-order',
            amount: '88.00',
            month: 1,
            productType: 0,
            optionKey: null,
            orderPurpose: 'entitlement_purchase',
            ownershipSource: 'checkout',
            confirmedAt: '2026-08-25 12:30:00',
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
          {
            id: 'visual-ai-order',
            amount: '6.00',
            month: 1,
            productType: 0,
            optionKey: null,
            orderPurpose: 'entitlement_purchase',
            ownershipSource: 'checkout',
            confirmedAt: '2026-08-24 09:10:00',
            rewardStatus: 'credited',
            rewardReasonCode: null,
            rewardTokens: 600_000,
            grantedTokens: 600_000,
            rewardStorageMb: 0,
            grantedStorageMb: 0,
            intentType: 'campaign',
            skuId: 'summer-ai-6',
            firstPurchaseApplied: false,
          },
        ],
  };
}

function catalogFixture() {
  const now = Date.now();
  const campaignLimitReached = visualState === 'limit';
  const campaignPending = visualState === 'pending';
  return {
    catalogVersion: SUPPORT_PACKAGE_CATALOG_VERSION,
    catalogEnabled: true,
    checkoutEnabled: visualState !== 'preview',
    grantEnabled: visualState !== 'preview',
    previewMode: visualState === 'preview',
    campaignsEnabled: true,
    packages: regularPackages(),
    campaigns:
      visualState === 'no-campaign'
        ? []
        : [
            {
              campaignId: '11111111-1111-4111-8111-111111111111',
              campaignKey: 'summer-2026',
              campaignVersion: 1,
              catalogVersion: 'campaign:11111111-1111-4111-8111-111111111111:v1',
              campaignTitle: '夏末限定加量',
              description: '活动套餐按标示额度到账，请留意有效期与限购次数。',
              startsAt: new Date(now - 24 * 60 * 60_000).toISOString(),
              endsAt: new Date(now + 4 * 24 * 60 * 60_000).toISOString(),
              campaignSkuId: '22222222-2222-4222-8222-222222222222',
              skuId: 'summer-combo-30',
              title: '夏末 AI + 空间组合包',
              category: 'combo',
              amount: 30,
              benefit: benefit(2_400_000, 768),
              perUserLimit: 1,
              completedCount: campaignLimitReached ? 1 : 0,
              remainingPurchases: campaignLimitReached ? 0 : 1,
              limitReached: campaignLimitReached,
              hasActiveCheckout: campaignPending,
            },
          ],
  };
}

let queryCount = 0;
let publicPreference = { participateInRanking: true, showIdentity: true, adminHidden: false };
const campaignFixture = () => ({
  campaignKey: 'autumn',
  campaignVersion: 1,
  title: '这个秋天，为灵感多留一点空间',
  description: '让值得珍藏的资料与想法，在轻笺里慢慢生长。',
  serverNow: new Date().toISOString(),
  startsAt: new Date(Date.now() - 86400000).toISOString(),
  endsAt: new Date(Date.now() + 86400000 * 7).toISOString(),
  lifecycle: ['upcoming', 'paused', 'ended'].includes(visualState) ? visualState : 'active',
  checkoutEnabled: !['upcoming', 'paused', 'ended'].includes(visualState),
  themeKey: 'autumn-desk-v1',
  packages: Array.from({ length: 4 }, (_, index) => ({
    campaignId: '11111111-1111-4111-8111-111111111111',
    campaignKey: 'autumn',
    campaignVersion: 1,
    campaignTitle: '秋日补给',
    description: '测试目录 · 不是真实商品',
    catalogVersion: 'campaign:11111111-1111-4111-8111-111111111111:v1',
    campaignSkuId: `22222222-2222-4222-8222-22222222222${index}`,
    skuId: `autumn-${index}`,
    title: ['轻藏补给包', '长藏补给包', '进阶补给包', '创作补给包'][index],
    category: 'combo',
    amount: [9.9, 29.9, 59.9, 99.9][index],
    benefit: { aiTokens: [100000, 250000, 500000, 750000][index], storageMb: [256, 1024, 2048, 3072][index] },
    perUserLimit: 1,
    completedCount: 0,
    remainingPurchases: 1,
    limitReached: visualState === 'limited',
    hasActiveCheckout: false,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 86400000 * 7).toISOString(),
  })),
});
request.defaults.adapter = async (config) => {
  if (config.url === '/api/support/campaign-entry')
    return apiResponse(config, ['hidden', 'paused', 'ended'].includes(visualState) ? null : campaignFixture());
  if (config.url === '/api/support/campaigns/autumn') {
    if (visualState === 'loading') await new Promise(() => {});
    if (visualState === 'error') throw new Error('fixture_error');
    if (visualState === 'hidden')
      return { ...apiResponse(config, null), data: { status: 404, msg: 'Hidden', data: null } };
    return apiResponse(config, campaignFixture());
  }
  if (config.url === '/api/support/checkout-intents')
    return apiResponse(config, {
      intentId: '33333333-3333-4333-8333-333333333333',
      url: 'https://afdian.com/a/lightnote',
    });
  if (String(config.url).startsWith('/api/support/checkout-intents/'))
    return apiResponse(config, {
      intentId: '33333333-3333-4333-8333-333333333333',
      status: visualState === 'review' ? 'review' : ++queryCount > 1 ? 'credited' : 'pending',
      amount: 9.9,
      benefit: { aiTokens: 100000, storageMb: 256 },
    });
  if (config.url === '/api/support/state')
    return apiResponse(config, {
      authenticated: !isGuest,
      oauthAvailable: true,
      orderSyncAvailable: true,
      linked: false,
      orderCount: 0,
      totalAmount: '0.00',
      publicPreference,
      recentOrders: [],
    });
  if (config.url === '/api/support/leaderboard')
    return apiResponse(config, { scope: 'all_time', items: [], mine: null, totalParticipants: 0 });
  if (config.url === '/api/support/public-preference') {
    publicPreference = { ...publicPreference, ...JSON.parse(String(config.data)) };
    return apiResponse(config, publicPreference);
  }

  if (config.url === '/api/search/batchSelectionPreview') {
    return apiResponse(config, {
      unavailableItems: visualState === 'return-deleted' ? [{ type: 'bookmark', id: 'visual-bookmark' }] : [],
    });
  }
  if (config.url === '/api/support/catalog') {
    if (visualState === 'loading') await new Promise(() => {});
    if (visualState === 'error') {
      throw Object.assign(new Error('Visual catalog fixture failed'), { code: 'SUPPORT_CATALOG_UNAVAILABLE' });
    }
    return apiResponse(config, catalogFixture());
  }
  if (config.url === '/api/support/store/state') {
    if (visualState === 'state-loading') await new Promise(() => {});
    if (visualState === 'state-error') {
      throw Object.assign(new Error('Visual store state fixture failed'), {
        code: 'ENTITLEMENT_STORE_STATE_UNAVAILABLE',
      });
    }
    return apiResponse(config, storeState());
  }
  if (config.url === '/api/support/events') return apiResponse(config, null);
  if (config.url === '/api/chat/aiQuota')
    return apiResponse(config, { used: 0, quota: 500000, remaining: 500000, dailyRemaining: 500000, bonusTokens: 0 });
  if (config.url === '/api/common/recordOperationLogs') return apiResponse(config, null);
  if (config.url === '/api/user/me') return apiResponse(config, { id: isGuest ? '' : 'visual-support-user' });
  if (config.url === '/api/growth/me') {
    return apiResponse(config, {
      exp: 12_000,
      level: 15,
      name: '拾光者',
      spaceMb: 5_120,
      spaceBonusMb: 2_048,
      aiTokenDaily: 500_000,
      streak: 8,
      points: 1_860,
      checkedInToday: true,
      levelStartExp: 10_000,
      nextLevelExp: 14_000,
      expToNext: 2_000,
      progress: 0.5,
      isMax: false,
      features: { growthCenterV2: true, pointsCenter: true },
    });
  }
  throw Object.assign(new Error(`Unexpected visual fixture request: ${config.url || ''}`), {
    code: 'VISUAL_FIXTURE_UNEXPECTED_REQUEST',
  });
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/campaign/:campaignKey', component: { render: () => null } },
    { path: '/:pathMatch(.*)*', component: { render: () => null } },
  ],
});
await router.push({
  path:
    params.get('page') === 'support'
      ? '/support'
      : params.get('page') === 'campaign'
        ? '/campaign/autumn'
        : params.get('page') === 'draft'
          ? '/draft'
          : '/store',
  query: { category: requestedCategory },
});

const pinia = createPinia();
const app = createApp(SupportPackagesHarness, { visualState });
app.use(pinia);
app.use(router);
app.use(
  createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN, 'en-US': enUS },
  }),
);
const user = useUserStore(pinia);
user.setUserInfo({
  id: isGuest ? '' : 'visual-support-user',
  role: isGuest ? RoleEnum.VISITOR : RoleEnum.USER,
  userName: isGuest ? '游客' : '视觉验收用户',
  alias: isGuest ? '游客' : '视觉验收用户',
  preferences: { theme, lang: locale, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;
applyUiDensity(params.get('density'), !bookmarkStore(pinia).isDesktop);
clearEntitlementJourney();
if (visualState.startsWith('return-')) {
  saveEntitlementJourney({
    userId: user.id,
    source: 'bookmark',
    asset: 'ai',
    returnPath: '/bookmark-task',
    task: {
      title: '继续整理阅读材料',
      skillId: 'bookmark.analyze',
      surface: 'bookmark.dialog',
      promptKey: 'question',
      input: { question: '请保留我刚才输入的整理要求' },
      resourceRefs: [{ type: 'bookmark', id: 'visual-bookmark' }],
      showGrounding: false,
    },
  });
}
globalDirect(app);
app.mount('#app');

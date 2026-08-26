import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import globalDirect from '@/config/globalDirect';
import { RoleEnum } from '@/config/bookmarkCfg';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { bookmarkStore, useUserStore } from '@/store';
import type {
  EntitlementStoreState,
  FirstPurchaseStatus,
  SupportBenefit,
  SupportPackage,
  SupportPackageCategory,
} from '@/api/supportApi';
import '@/assets/css/index.less';
import SupportPackagesHarness from './SupportPackagesHarness.vue';

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
document.documentElement.classList.toggle('light-note-mobile-rendering', window.innerWidth <= 600);
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

function firstStatus(index: number): FirstPurchaseStatus {
  if (isGuest) return 'login_required';
  if (visualState === 'used') return 'used';
  return index % 3 === 1 ? 'used' : 'available';
}

function regularPackage(
  skuId: string,
  category: SupportPackageCategory,
  amount: number,
  base: SupportBenefit,
  firstPurchase: SupportBenefit,
  index: number,
  comboSavings = 0,
): SupportPackage {
  return {
    skuId,
    category,
    amount,
    base,
    firstPurchase,
    comboSavings,
    firstPurchaseStatus: firstStatus(index),
  };
}

function regularPackages(): SupportPackage[] {
  return [
    regularPackage('ai-6', 'ai', 6, benefit(600_000), benefit(780_000), 0),
    regularPackage('ai-18', 'ai', 18, benefit(1_800_000), benefit(2_340_000), 1),
    regularPackage('ai-50', 'ai', 50, benefit(5_000_000), benefit(6_500_000), 2),
    regularPackage('ai-100', 'ai', 100, benefit(10_000_000), benefit(13_000_000), 3),
    regularPackage('storage-6', 'storage', 6, benefit(0, 128), benefit(0, 160), 0),
    regularPackage('storage-18', 'storage', 18, benefit(0, 512), benefit(0, 640), 1),
    regularPackage('storage-50', 'storage', 50, benefit(0, 1_536), benefit(0, 2_048), 2),
    regularPackage('storage-100', 'storage', 100, benefit(0, 3_072), benefit(0, 4_096), 3),
    regularPackage('combo-10', 'combo', 10, benefit(600_000, 128), benefit(780_000, 160), 0, 2),
    regularPackage('combo-30', 'combo', 30, benefit(1_800_000, 512), benefit(2_340_000, 640), 1, 6),
    regularPackage('combo-88', 'combo', 88, benefit(5_000_000, 1_536), benefit(6_500_000, 2_048), 2, 12),
    regularPackage('combo-168', 'combo', 168, benefit(10_000_000, 3_072), benefit(13_000_000, 4_096), 3, 32),
  ];
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
    catalogVersion: 'support-packages-v2',
    catalogEnabled: true,
    checkoutEnabled: true,
    grantEnabled: true,
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
              description: '独立活动套餐，不影响常驻首充资格。',
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

request.defaults.adapter = async (config) => {
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
      throw Object.assign(new Error('Visual store state fixture failed'), { code: 'ENTITLEMENT_STORE_STATE_UNAVAILABLE' });
    }
    return apiResponse(config, storeState());
  }
  if (config.url === '/api/common/recordOperationLogs') return apiResponse(config, null);
  if (config.url === '/api/user/me') return apiResponse(config, { id: isGuest ? '' : 'visual-support-user' });
  if (config.url === '/api/growth/me') {
    return apiResponse(config, {
      exp: 12_000,
      level: 15,
      name: '拾光者',
      spaceMb: 5_120,
      spaceBonusMb: 2_048,
      aiTokenDaily: 2_000_000,
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
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
await router.push({ path: '/store', query: { category: requestedCategory } });

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
globalDirect(app);
app.mount('#app');

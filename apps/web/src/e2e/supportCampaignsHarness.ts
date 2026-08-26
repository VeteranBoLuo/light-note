import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';
import SupportCampaignsHarness from './SupportCampaignsHarness.vue';

const params = new URLSearchParams(window.location.search);
const visualState = params.get('state') || 'default';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';

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

function sku(
  campaignSkuId: string,
  skuId: string,
  title: string,
  amount: string,
  aiTokens: number,
  storageMb: number,
  marginBps: number,
  sortOrder = 0,
) {
  return {
    campaignSkuId,
    skuId,
    title,
    category: aiTokens > 0 && storageMb > 0 ? 'combo' : aiTokens > 0 ? 'ai' : 'storage',
    amount,
    aiTokens,
    storageMb,
    perUserLimit: 1,
    marginBps,
    sortOrder,
  };
}

function campaignFixtures() {
  const now = Date.now();
  const base = {
    version: 1,
    costPolicyVersion: 'support-cost-v1',
    publishedAt: null,
    suspendedAt: null,
    createTime: new Date(now - 7 * 24 * 60 * 60_000).toISOString(),
    updateTime: new Date(now - 2 * 60 * 60_000).toISOString(),
  };
  return [
    {
      ...base,
      id: '11111111-1111-4111-8111-111111111111',
      campaignKey: 'summer-2026',
      catalogVersion: 'campaign:11111111-1111-4111-8111-111111111111:v1',
      title: '夏末限定加量',
      description: '已发布活动：最终价格和权益不可修改，只能暂停。',
      status: 'published',
      startsAt: new Date(now - 24 * 60 * 60_000).toISOString(),
      endsAt: new Date(now + 4 * 24 * 60 * 60_000).toISOString(),
      publishedAt: new Date(now - 24 * 60 * 60_000).toISOString(),
      skus: [
        sku('21111111-1111-4111-8111-111111111111', 'summer-combo-30', '夏末组合包', '30.00', 2_400_000, 768, 4_391),
        sku('21111111-1111-4111-8111-111111111112', 'summer-storage-18', '夏末空间包', '18.00', 0, 768, 4_252, 1),
      ],
    },
    {
      ...base,
      id: '33333333-3333-4333-8333-333333333333',
      campaignKey: 'autumn-preview',
      catalogVersion: 'campaign:33333333-3333-4333-8333-333333333333:v1',
      title: '秋日活动草稿',
      description: '尚未发布，可继续核对成本和权益。',
      status: 'draft',
      startsAt: new Date(now + 10 * 24 * 60 * 60_000).toISOString(),
      endsAt: new Date(now + 17 * 24 * 60 * 60_000).toISOString(),
      // 草稿允许低于门禁，用来验收红色成本告警；发布操作会由服务端拒绝。
      skus: [sku('43333333-3333-4333-8333-333333333333', 'autumn-ai-18', '秋日 AI 包', '18.00', 4_400_000, 0, 3_533)],
    },
    {
      ...base,
      id: '55555555-5555-4555-8555-555555555555',
      campaignKey: 'spring-2026',
      catalogVersion: 'campaign:55555555-5555-4555-8555-555555555555:v1',
      title: '春日活动（已结束）',
      description: '结束后不再生成新结算意图。',
      status: 'published',
      startsAt: new Date(now - 20 * 24 * 60 * 60_000).toISOString(),
      endsAt: new Date(now - 13 * 24 * 60 * 60_000).toISOString(),
      publishedAt: new Date(now - 20 * 24 * 60 * 60_000).toISOString(),
      skus: [sku('65555555-5555-4555-8555-555555555555', 'spring-ai-6', '春日 AI 包', '6.00', 700_000, 0, 6_600)],
    },
    {
      ...base,
      id: '77777777-7777-4777-8777-777777777777',
      campaignKey: 'paused-2026',
      catalogVersion: 'campaign:77777777-7777-4777-8777-777777777777:v1',
      title: '暂停中的活动',
      description: '保留历史领取记录，但不允许继续下单。',
      status: 'suspended',
      startsAt: new Date(now - 2 * 24 * 60 * 60_000).toISOString(),
      endsAt: new Date(now + 5 * 24 * 60 * 60_000).toISOString(),
      publishedAt: new Date(now - 2 * 24 * 60 * 60_000).toISOString(),
      suspendedAt: new Date(now - 2 * 60 * 60_000).toISOString(),
      skus: [sku('87777777-7777-4777-8777-777777777777', 'paused-storage-6', '暂停空间包', '6.00', 0, 192, 5_539)],
    },
  ];
}

function grantFixtures() {
  return [
    {
      id: 'grant-1',
      providerOrderNo: '202608250001',
      userId: 'visual-user-1',
      skuId: 'summer-combo-30',
      paidAmount: '30.00',
      calculatedAiTokens: 2_400_000,
      calculatedStorageMb: 768,
      grantedAiTokens: 2_400_000,
      grantedStorageMb: 768,
      status: 'credited',
      reasonCode: null,
      creditedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      createTime: new Date(Date.now() - 50 * 60_000).toISOString(),
    },
    {
      id: 'grant-2',
      providerOrderNo: '202608250002',
      userId: 'visual-user-2',
      skuId: 'summer-storage-18',
      paidAmount: '18.00',
      calculatedAiTokens: 0,
      calculatedStorageMb: 768,
      grantedAiTokens: 0,
      grantedStorageMb: 0,
      status: 'manual_review',
      reasonCode: 'amount_mismatch',
      creditedAt: null,
      createTime: new Date(Date.now() - 20 * 60_000).toISOString(),
    },
  ];
}

request.defaults.adapter = async (config) => {
  if (config.url === '/api/support/admin/campaigns') {
    if (visualState === 'loading') await new Promise(() => {});
    if (visualState === 'error') {
      throw Object.assign(new Error('Visual campaign fixture failed'), { code: 'ADMIN_SUPPORT_CAMPAIGNS_FAILED' });
    }
    return apiResponse(config, visualState === 'empty' ? [] : campaignFixtures());
  }
  if (/^\/api\/support\/admin\/campaigns\/[^/]+\/grants$/u.test(String(config.url || ''))) {
    if (visualState === 'grants-loading') await new Promise(() => {});
    if (visualState === 'grants-error') {
      throw Object.assign(new Error('Visual campaign grants fixture failed'), {
        code: 'ADMIN_SUPPORT_CAMPAIGN_GRANTS_FAILED',
      });
    }
    return apiResponse(config, visualState === 'grants-empty' ? [] : grantFixtures());
  }
  throw Object.assign(new Error(`Unexpected visual fixture request: ${config.url || ''}`), {
    code: 'VISUAL_FIXTURE_UNEXPECTED_REQUEST',
  });
};

const app = createApp(SupportCampaignsHarness, { visualState });
app.use(createPinia());
app.use(
  createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN, 'en-US': enUS },
  }),
);
app.mount('#app');

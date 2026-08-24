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
import '@/assets/css/index.less';
import AiUsageCenterHarness from './AiUsageCenterHarness.vue';

const params = new URLSearchParams(window.location.search);
const state = params.get('state') || 'default';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const view = params.get('view') === 'settings' ? 'settings' : 'usage';
let usageRequestCount = 0;

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', window.innerWidth <= 600);
document.body.dataset.visualState = state;

const tokenActions = [
  ['search.answer', 'search', 'searchAnswer'],
  ['help.answer', 'help', 'helpAnswer'],
  ['search.summarize_selected', 'search', 'searchSummarizeSelected'],
  ['search.compare_selected', 'search', 'searchCompareSelected'],
  ['file.summarize', 'file', 'fileSummarize'],
  ['file.ask', 'file', 'fileAsk'],
  ['file.compare', 'file', 'fileCompare'],
  ['file.create_note_preview', 'file', 'fileCreateNotePreview'],
  ['note.batch_summarize', 'note', 'noteBatchSummarize'],
  ['note.batch_compare', 'note', 'noteBatchCompare'],
  ['note.create_from_sources', 'note', 'noteCreateFromSources'],
  ['note.transform_text', 'note', 'noteTransformText'],
  ['bookmark.summarize_page', 'bookmark', 'bookmarkSummarizePage'],
  ['bookmark.compare_pages', 'bookmark', 'bookmarkComparePages'],
  ['bookmark.create_note_preview', 'bookmark', 'bookmarkCreateNotePreview'],
  ['bookmark.parse_url', 'bookmark', 'bookmarkParseUrl'],
  ['todo.parse_draft', 'todo', 'todoParseDraft'],
  ['todo.breakdown', 'todo', 'todoBreakdown'],
  ['note.extract_todos', 'note', 'noteExtractTodos'],
  ['file.extract_todos', 'file', 'fileExtractTodos'],
  ['note.organize_tags', 'note', 'noteOrganizeTags', 'item'],
  ['bookmark.organize', 'bookmark', 'bookmarkOrganize', 'item'],
  ['tag.icon_keywords', 'tag', 'tagIconKeywords'],
].map(([id, module, labelKey, unit = 'request']) => ({ id, module, labelKey, unit }));

const freeActions = [
  ['core_editing', 'general', 'coreEditing', 'coreEditingDescription'],
  ['local_search', 'search', 'localSearch', 'localSearchDescription'],
  ['file_local_processing', 'file', 'fileLocalProcessing', 'fileLocalProcessingDescription'],
  ['bookmark_snapshot', 'bookmark', 'bookmarkSnapshot', 'bookmarkSnapshotDescription'],
  ['tag_icon_direct_search', 'tag', 'tagIconDirectSearch', 'tagIconDirectSearchDescription'],
  ['cache_or_no_model', 'general', 'cacheOrNoModel', 'cacheOrNoModelDescription'],
].map(([id, module, labelKey, descriptionKey]) => ({ id, module, labelKey, descriptionKey }));

const moduleRows = [
  { module: 'note', chargedTokens: 13_420, providerTokens: 14_200, actions: 7 },
  { module: 'bookmark', chargedTokens: 8_610, providerTokens: 9_030, actions: 4 },
  { module: 'file', chargedTokens: 4_780, providerTokens: 5_018, actions: 3 },
  { module: 'search', chargedTokens: 2_492, providerTokens: 2_612, actions: 2 },
  { module: 'todo', chargedTokens: 1_200, providerTokens: 1_260, actions: 1 },
  { module: 'tag', chargedTokens: 980, providerTokens: 980, actions: 1 },
];

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateBefore(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return localDateKey(date);
}

function usageItems() {
  const now = Date.now();
  return [
    {
      id: 'fixture-1',
      actionId: 'note.organize_tags',
      module: 'note',
      labelKey: 'noteOrganizeTags',
      unit: 'item',
      createdAt: now - 18 * 60_000,
      status: 'partial',
      modelCalled: true,
      providerCallCount: 12,
      providerTokens: 8_420,
      chargedTokens: 8_420,
      platformCoveredTokens: 0,
      usageComplete: true,
      quotaSettlementStatus: 'settled',
      durationMs: 22_480,
    },
    {
      id: 'fixture-2',
      actionId: 'bookmark.summarize_page',
      module: 'bookmark',
      labelKey: 'bookmarkSummarizePage',
      unit: 'request',
      createdAt: now - 2 * 60 * 60_000,
      status: 'success',
      modelCalled: true,
      providerCallCount: 2,
      providerTokens: 4_550,
      chargedTokens: 4_230,
      platformCoveredTokens: 320,
      usageComplete: true,
      quotaSettlementStatus: 'settled',
      durationMs: 7_840,
    },
    {
      id: 'fixture-3',
      actionId: 'todo.breakdown',
      module: 'todo',
      labelKey: 'todoBreakdown',
      unit: 'request',
      createdAt: now - 4 * 60 * 60_000,
      status: 'success',
      modelCalled: true,
      providerCallCount: 1,
      providerTokens: 1_260,
      chargedTokens: 1_200,
      platformCoveredTokens: 60,
      usageComplete: false,
      quotaSettlementStatus: 'deferred',
      durationMs: 4_920,
    },
    {
      id: 'fixture-4',
      actionId: 'tag.icon_keywords',
      module: 'tag',
      labelKey: 'tagIconKeywords',
      unit: 'request',
      createdAt: now - 8 * 60 * 60_000,
      status: 'failed',
      modelCalled: true,
      providerCallCount: 1,
      providerTokens: 980,
      chargedTokens: 980,
      platformCoveredTokens: 0,
      usageComplete: true,
      quotaSettlementStatus: 'settled',
      durationMs: 3_180,
    },
    {
      id: 'fixture-5',
      actionId: 'search.summarize_selected',
      module: 'search',
      labelKey: 'searchSummarizeSelected',
      unit: 'request',
      createdAt: now - 26 * 60 * 60_000,
      status: 'aborted',
      modelCalled: true,
      providerCallCount: 1,
      providerTokens: 620,
      chargedTokens: 620,
      platformCoveredTokens: 0,
      usageComplete: true,
      quotaSettlementStatus: 'settled',
      durationMs: 1_840,
    },
    {
      id: 'fixture-6',
      actionId: 'file.ask',
      module: 'file',
      labelKey: 'fileAsk',
      unit: 'request',
      createdAt: now - 46 * 60 * 60_000,
      status: 'quota_blocked',
      modelCalled: true,
      providerCallCount: 1,
      providerTokens: 480,
      chargedTokens: 480,
      platformCoveredTokens: 0,
      usageComplete: true,
      quotaSettlementStatus: 'settled',
      durationMs: 2_040,
    },
  ];
}

function parsePayload(value: unknown) {
  if (typeof value !== 'string') return (value || {}) as Record<string, unknown>;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function makeFixture(payload: Record<string, unknown>) {
  const days = [7, 30, 90].includes(Number(payload.days)) ? Number(payload.days) : 7;
  const page = Math.max(1, Number(payload.page) || 1);
  const pageSize = Math.max(1, Number(payload.pageSize) || 20);
  const module = String(payload.module || 'all');
  const isEmpty = state === 'empty';
  const items = isEmpty ? [] : usageItems().filter((item) => module === 'all' || item.module === module);
  const modules = isEmpty ? [] : moduleRows.filter((item) => module === 'all' || item.module === module);
  const dailyTokens = [1_020, 3_850, 0, 4_210, 5_400, 6_700, 10_302];

  return {
    query: { days, page, pageSize, module },
    summary: isEmpty
      ? {
          chargedTokens: 0,
          providerTokens: 0,
          platformCoveredTokens: 0,
          todayChargedTokens: 0,
          modelActions: 0,
          zeroChargeModelActions: 0,
        }
      : {
          chargedTokens: 31_482,
          providerTokens: 33_100,
          platformCoveredTokens: 1_618,
          todayChargedTokens: 10_302,
          modelActions: 18,
          zeroChargeModelActions: 2,
        },
    daily: isEmpty
      ? []
      : dailyTokens.map((chargedTokens, index) => ({
          date: dateBefore(dailyTokens.length - index - 1),
          chargedTokens,
          providerTokens: chargedTokens + (index % 2 === 0 ? 80 : 0),
          actions: Math.max(0, Math.round(chargedTokens / 2_000)),
        })),
    modules,
    items,
    pagination: {
      page,
      pageSize,
      total: isEmpty ? 0 : module === 'all' ? 43 : items.length,
      totalPages: isEmpty ? 0 : module === 'all' ? Math.ceil(43 / pageSize) : 1,
    },
    catalog: {
      ruleVersion: 1,
      chargingRule: 'provider_actual_tokens',
      repairBilling: 'platform',
      missingUsageBilling: 'request_estimate_capped',
      tokenActions,
      freeActions,
    },
  };
}

function makeDetailFixture(payload: Record<string, unknown>) {
  const executionId = String(payload.executionId || '');
  const execution = usageItems().find((item) => item.id === executionId) || usageItems()[1];
  const now = Date.now();
  const calls = [
    {
      sequenceNo: 1,
      stageType: 'image_recognition',
      provider: 'deepseek',
      model: 'deepseek-v4-flash-vision-exp',
      status: 'success',
      usageStatus: 'reported',
      billingScope: 'user',
      promptTokens: 1_199,
      completionTokens: 211,
      totalTokens: 1_410,
      estimatedTokens: 3_000,
      durationMs: 6_313,
      createdAt: now - 16_000,
      triggerReason: null,
      errorCategory: null,
    },
    {
      sequenceNo: 2,
      stageType: 'model_generation',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'success',
      usageStatus: 'reported',
      billingScope: 'user',
      promptTokens: 358,
      completionTokens: 605,
      totalTokens: 963,
      estimatedTokens: 2_400,
      durationMs: 12_386,
      createdAt: now - 7_000,
      triggerReason: null,
      errorCategory: null,
    },
    {
      sequenceNo: 3,
      stageType: 'output_repair',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'success',
      usageStatus: 'reported',
      billingScope: 'platform',
      promptTokens: 1_007,
      completionTokens: 655,
      totalTokens: 1_662,
      estimatedTokens: 2_400,
      durationMs: 3_414,
      createdAt: now - 2_000,
      triggerReason: 'source_required',
      errorCategory: null,
    },
  ];
  const detailCalls =
    state === 'detail-empty'
      ? []
      : state === 'detail-edge'
        ? calls.map((call) => {
            if (call.sequenceNo === 1) {
              return {
                ...call,
                status: 'failed',
                usageStatus: 'missing',
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                errorCategory: 'timeout',
              };
            }
            if (call.sequenceNo === 3) return { ...call, triggerReason: 'historical_unknown' };
            return call;
          })
        : calls;
  return {
    execution: {
      ...execution,
      providerCallCount: 3,
      providerTokens: 6_192,
      chargedTokens: 4_530,
      platformCoveredTokens: 1_662,
      durationMs: 22_936,
    },
    calls: detailCalls,
  };
}

request.defaults.adapter = async (config) => {
  if (config.url === '/api/user/me') {
    return {
      data: {
        status: 200,
        msg: 'ok',
        data: { id: 'visual-user', email: 'visual@example.com', login_type: 'local', password: '******' },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: null,
    };
  }
  if (config.url === '/api/user/getMySessions') {
    return {
      data: { status: 200, msg: 'ok', data: [] },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: null,
    };
  }
  if (config.url === '/api/chat/aiQuota') {
    if (state === 'loading') await new Promise(() => {});
    if (state === 'error') {
      throw Object.assign(new Error('Visual quota fixture failed'), { code: 'AI_QUOTA_UNAVAILABLE' });
    }
    return {
      data: {
        status: 200,
        msg: 'ok',
        data: {
          exempt: false,
          used: 103_000,
          quota: 15_042_000,
          remaining: 14_939_000,
          dailyQuota: 4_000_000,
          dailyUsed: 103_000,
          dailyRemaining: 3_897_000,
          bonusTokens: 11_042_000,
          enforcing: true,
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: null,
    };
  }
  if (config.url === '/api/chat/aiUsageDetail') {
    if (state === 'detail-loading') await new Promise(() => {});
    if (state === 'detail-error') {
      throw Object.assign(new Error('Visual detail fixture failed'), { code: 'AI_USAGE_DETAIL_UNAVAILABLE' });
    }
    return {
      data: { status: 200, msg: 'ok', data: makeDetailFixture(parsePayload(config.data)) },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: null,
    };
  }
  if (config.url !== '/api/chat/aiUsage') {
    throw Object.assign(new Error(`Unexpected visual fixture request: ${config.url || ''}`), {
      code: 'VISUAL_FIXTURE_UNEXPECTED_REQUEST',
    });
  }
  usageRequestCount += 1;
  if (state === 'loading') {
    await new Promise(() => {});
  }
  if (state === 'error' || (state === 'stale' && usageRequestCount > 1)) {
    throw Object.assign(new Error('Visual fixture request failed'), { code: 'AI_USAGE_UNAVAILABLE' });
  }
  return {
    data: { status: 200, msg: 'ok', data: makeFixture(parsePayload(config.data)) },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: null,
  };
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
await router.push(view === 'settings' ? '/settings' : '/ai-usage');

const pinia = createPinia();
const app = createApp(AiUsageCenterHarness, { visualState: state, view });
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
  id: 'visual-user',
  role: RoleEnum.USER,
  userName: '视觉验收用户',
  alias: '视觉验收用户',
  preferences: { theme, lang: locale, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;
globalDirect(app);
app.mount('#app');

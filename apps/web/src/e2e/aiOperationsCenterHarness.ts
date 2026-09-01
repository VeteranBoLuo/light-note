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
import AiOperationsCenterHarness from './AiOperationsCenterHarness.vue';

const params = new URLSearchParams(window.location.search);
const state = params.get('state') || 'default';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const LINKED_EXECUTION_ID = '7bc4f1a8-0d1e-4c60-a9d3-1974332a7c4d';
const now = Date.now();
const requestCounts = new Map<string, number>();

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', window.innerWidth <= 600);
document.body.dataset.visualState = state;

function shanghaiDateBefore(days: number) {
  const date = new Date(now - days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function executionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: LINKED_EXECUTION_ID,
    requestId: 'request-note-transform-001',
    actionId: 'note.transform_text',
    module: 'note',
    labelKey: 'noteTransformText',
    unit: 'request',
    createdAt: now - 8 * 60_000,
    updatedAt: now - 7 * 60_000,
    status: 'success',
    modelCalled: true,
    providerCallCount: 2,
    providerTokens: 3_842,
    chargedTokens: 3_010,
    platformCoveredTokens: 832,
    usageComplete: true,
    quotaSettlementStatus: 'settled',
    durationMs: 8_420,
    actor: { id: 'user-001', alias: '山岚', role: 'user' },
    subject: { id: 'user-001', alias: '山岚', role: 'user' },
    billingPolicy: 'user',
    surface: 'note-editor',
    skillVersion: 6,
    billingRuleVersion: 2,
    validationRuleVersion: 4,
    providers: ['deepseek'],
    models: ['deepseek-v4-flash'],
    estimatedCost: 0.0068,
    failedProviderCalls: 0,
    missingUsageCalls: 0,
    platformCalls: 1,
    errorCategory: null,
    errorCode: null,
    staleRunning: false,
    usageAttention: false,
    settlementAttention: false,
    ...overrides,
  };
}

function executionItems() {
  return [
    executionFixture(),
    executionFixture({
      id: '2250b34d-2260-4f07-98f3-d387e0e91cd4',
      requestId: 'request-bookmark-summary-002',
      actionId: 'bookmark.summarize_page',
      module: 'bookmark',
      labelKey: 'bookmarkSummarizePage',
      status: 'partial',
      usageComplete: false,
      quotaSettlementStatus: 'deferred',
      usageAttention: true,
      settlementAttention: true,
      createdAt: now - 26 * 60_000,
      updatedAt: now - 25 * 60_000,
      providerCallCount: 3,
      providerTokens: 6_280,
      chargedTokens: 4_910,
      platformCoveredTokens: 1_370,
      durationMs: 14_620,
      actor: { id: 'user-002', alias: '南乔', role: 'user' },
      subject: { id: 'user-002', alias: '南乔', role: 'user' },
      providers: ['deepseek', 'qwen'],
      models: ['deepseek-v4-flash', 'qwen-long'],
      estimatedCost: 0.0124,
      missingUsageCalls: 1,
      platformCalls: 1,
    }),
    executionFixture({
      id: '56c4b04d-41f8-4e33-9a4d-c2178947cc8e',
      requestId: 'request-file-summary-003',
      actionId: 'file.summarize',
      module: 'file',
      labelKey: 'fileSummarize',
      status: 'failed',
      createdAt: now - 54 * 60_000,
      updatedAt: now - 53 * 60_000,
      providerCallCount: 1,
      providerTokens: 1_120,
      chargedTokens: 0,
      platformCoveredTokens: 1_120,
      durationMs: 31_400,
      actor: { id: 'root-001', alias: '管理员', role: 'root' },
      subject: { id: 'user-003', alias: '夏木', role: 'user' },
      failedProviderCalls: 1,
      estimatedCost: 0.0021,
      errorCategory: 'timeout',
      errorCode: 'AI_PROVIDER_TIMEOUT',
      platformCalls: 1,
    }),
    executionFixture({
      id: '60d5e29e-c11f-4c61-8f0f-0f63f2e2db8b',
      requestId: 'request-todo-breakdown-004',
      actionId: 'todo.breakdown',
      module: 'todo',
      labelKey: 'todoBreakdown',
      status: 'quota_blocked',
      modelCalled: false,
      providerCallCount: 0,
      providerTokens: 0,
      chargedTokens: 0,
      platformCoveredTokens: 0,
      createdAt: now - 2 * 60 * 60_000,
      updatedAt: now - 2 * 60 * 60_000,
      durationMs: 120,
      providers: [],
      models: [],
      estimatedCost: 0,
    }),
    executionFixture({
      id: '9f880ded-c539-40f8-b3ca-5b916c430cf0',
      requestId: 'request-tag-icon-005',
      actionId: 'tag.icon_keywords',
      module: 'tag',
      labelKey: 'tagIconKeywords',
      status: 'running',
      createdAt: now - 92 * 60_000,
      updatedAt: now - 91 * 60_000,
      durationMs: 0,
      staleRunning: true,
      usageComplete: false,
      quotaSettlementStatus: 'pending',
    }),
    executionFixture({
      id: '1a44ca86-19d0-4e28-946c-1e86d752fb80',
      requestId: 'request-search-answer-006',
      actionId: 'search.answer',
      module: 'search',
      labelKey: 'searchAnswer',
      status: 'aborted',
      createdAt: now - 4 * 60 * 60_000,
      updatedAt: now - 4 * 60 * 60_000,
      durationMs: 1_540,
      actor: { id: '', alias: null, role: null },
      subject: { id: 'user-004', alias: '听雨', role: 'user' },
    }),
  ];
}

function overviewFixture() {
  const empty = state === 'empty';
  const values = [18_200, 25_600, 14_100, 0, 31_400, 22_500, 36_280];
  return {
    timezone: 'Asia/Shanghai',
    generatedAt: now,
    summary: empty
      ? {
          executions: 0,
          actors: 0,
          modelActions: 0,
          providerCalls: 0,
          providerTokens: 0,
          chargedTokens: 0,
          platformCoveredTokens: 0,
          estimatedCost: 0,
          delivered: 0,
          succeeded: 0,
          partial: 0,
          failed: 0,
          quotaBlocked: 0,
          aborted: 0,
          running: 0,
          deliveryRate: 0,
          technicalErrorRate: 0,
          averageDurationMs: 0,
          durationP95: 0,
          anomalySignals: 0,
          staleRunning: 0,
          usageMissing: 0,
          settlementAttention: 0,
        }
      : {
          executions: 146,
          actors: 38,
          modelActions: 132,
          providerCalls: 178,
          providerTokens: 148_080,
          chargedTokens: 126_420,
          platformCoveredTokens: 21_660,
          estimatedCost: 0.2864,
          delivered: 121,
          succeeded: 114,
          partial: 7,
          failed: 6,
          quotaBlocked: 8,
          aborted: 5,
          running: 6,
          deliveryRate: 95.3,
          technicalErrorRate: 4.7,
          averageDurationMs: 5_870,
          durationP95: 18_420,
          anomalySignals: 11,
          staleRunning: 2,
          usageMissing: 2,
          settlementAttention: 1,
        },
    daily: empty
      ? []
      : values.map((providerTokens, index) => ({
          date: shanghaiDateBefore(values.length - index - 1),
          executions: 14 + index,
          modelActions: 12 + index,
          providerTokens,
          chargedTokens: Math.round(providerTokens * 0.86),
          delivered: 11 + index,
          failures: [0, 1, 0, 0, 2, 0, 1][index],
        })),
    modules: empty
      ? []
      : [
          {
            module: 'note',
            executions: 51,
            modelActions: 48,
            providerTokens: 61_400,
            chargedTokens: 52_100,
            failures: 2,
          },
          {
            module: 'bookmark',
            executions: 34,
            modelActions: 31,
            providerTokens: 38_220,
            chargedTokens: 31_820,
            failures: 1,
          },
          {
            module: 'file',
            executions: 27,
            modelActions: 24,
            providerTokens: 28_600,
            chargedTokens: 24_200,
            failures: 2,
          },
          {
            module: 'search',
            executions: 19,
            modelActions: 17,
            providerTokens: 14_900,
            chargedTokens: 13_100,
            failures: 1,
          },
          {
            module: 'todo',
            executions: 15,
            modelActions: 12,
            providerTokens: 4_960,
            chargedTokens: 4_200,
            failures: 0,
          },
        ],
    providers: empty
      ? []
      : [
          {
            provider: 'deepseek',
            model: 'deepseek-v4-flash',
            calls: 151,
            tokens: 126_400,
            estimatedCost: 0.2318,
            failedCalls: 4,
            missingUsageCalls: 1,
            platformCalls: 14,
          },
          {
            provider: 'qwen',
            model: 'qwen-long',
            calls: 27,
            tokens: 21_680,
            estimatedCost: 0.0546,
            failedCalls: 2,
            missingUsageCalls: 1,
            platformCalls: 3,
          },
        ],
  };
}

function detailFixture(executionId: string) {
  const execution = executionItems().find((item) => item.id === executionId) || executionItems()[0];
  return {
    execution,
    privacy: 'governance_metadata_only',
    calls: [
      {
        sequenceNo: 1,
        stageType: 'model_generation',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'success',
        usageStatus: 'reported',
        billingScope: 'user',
        promptTokens: 1_940,
        completionTokens: 1_070,
        totalTokens: 3_010,
        estimatedTokens: 4_000,
        estimatedCost: 0.0054,
        durationMs: 6_120,
        createdAt: now - 9 * 60_000,
        triggerReason: null,
        errorCategory: null,
      },
      {
        sequenceNo: 2,
        stageType: 'output_repair',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        status: 'success',
        usageStatus: 'reported',
        billingScope: 'platform',
        promptTokens: 510,
        completionTokens: 322,
        totalTokens: 832,
        estimatedTokens: 1_200,
        estimatedCost: 0.0014,
        durationMs: 2_300,
        createdAt: now - 8 * 60_000,
        triggerReason: 'source_required',
        errorCategory: null,
      },
    ],
  };
}

function parsePayload(value: unknown) {
  if (typeof value !== 'string') return (value || {}) as Record<string, unknown>;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function response(config: any, data: unknown) {
  return {
    data: { status: 200, msg: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: null,
  };
}

request.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  requestCounts.set(url, (requestCounts.get(url) || 0) + 1);
  const count = requestCounts.get(url) || 1;
  if (state === 'loading' && url !== '/api/common/getDeepSeekBalance') await new Promise(() => {});
  if (state === 'error' && url !== '/api/common/getDeepSeekBalance') {
    throw Object.assign(new Error('Visual operations fixture failed'), { code: 'AI_OPERATIONS_STORE_UNAVAILABLE' });
  }
  if (state === 'partial' && url === '/api/admin/ai-operations/executions/query') {
    throw Object.assign(new Error('Visual list fixture failed'), { code: 'AI_OPERATIONS_STORE_UNAVAILABLE' });
  }
  if (state === 'stale' && count > 1 && url !== '/api/common/getDeepSeekBalance') {
    throw Object.assign(new Error('Visual refresh fixture failed'), { code: 'AI_OPERATIONS_STORE_UNAVAILABLE' });
  }
  if (url === '/api/admin/ai-operations/overview') return response(config, overviewFixture());
  if (url === '/api/admin/ai-operations/executions/query') {
    const payload = parsePayload(config.data);
    const allItems = state === 'empty' ? [] : executionItems();
    const module = String(payload.module || 'all');
    const status = String(payload.status || 'all');
    const items = allItems.filter(
      (item) =>
        (module === 'all' || item.module === module) &&
        (status === 'all' ||
          (status === 'attention' &&
            (item.status === 'failed' ||
              item.staleRunning ||
              item.missingUsageCalls > 0 ||
              ['pending', 'deferred', 'reservation_failed'].includes(item.quotaSettlementStatus))) ||
          item.status === status),
    );
    return response(config, { query: payload, items, total: items.length, hasMore: false, nextCursor: null });
  }
  if (url === '/api/admin/ai-operations/executions/detail') {
    const payload = parsePayload(config.data);
    return response(config, detailFixture(String(payload.executionId || '')));
  }
  if (url === '/api/common/getDeepSeekBalance') {
    return response(config, {
      totalBalance: '8.63',
      currency: 'CNY',
      stale: state === 'stale' && count > 1,
      dailyBalanceChange: {
        isAvailable: true,
        currency: 'CNY',
        change: '-0.95',
        partialDay: false,
        stale: state === 'stale' && count > 1,
      },
    });
  }
  throw Object.assign(new Error(`Unexpected visual fixture request: ${url}`), {
    code: 'VISUAL_FIXTURE_UNEXPECTED_REQUEST',
  });
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
await router.push(state === 'detail' ? `/admin/agentLog?executionId=${LINKED_EXECUTION_ID}` : '/admin/agentLog');

const pinia = createPinia();
const app = createApp(AiOperationsCenterHarness);
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
  id: 'root-001',
  role: RoleEnum.Root,
  userName: '运行管理员',
  alias: '运行管理员',
  preferences: { theme, lang: locale, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;
globalDirect(app);
app.mount('#app');

import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createI18n } from 'vue-i18n';
import Workspace from '@/view/organize/OrganizeSuggestionWorkspace.vue';
import request from '@/http/request';
import { bookmarkStore, useUserStore } from '@/store';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { resourceOutcome, resourceGroup, reviewDisposition } from '@/view/organize/organizeResourceState';
import type { SuggestionRun, WorkspaceItem, WorkspaceSuggestion } from '@/api/organizeSuggestionApi';
import '@/assets/css/index.less';

// 本地状态验收：整理接口使用内存响应，不调用模型或修改真实资料。
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') || 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.has('renderProfile'));
for (const el of [document.documentElement, document.body, document.getElementById('app')!]) {
  el.style.height = '100%';
  el.style.margin = '0';
}
const check = (id: string, status: string, kind: WorkspaceSuggestion['kind'] = 'tags'): WorkspaceSuggestion => ({
  id,
  status,
  kind,
  reason:
    status === 'not_applicable'
      ? kind === 'tags'
        ? '已有标签，本次仅补齐无标签资料'
        : '当前名称无需调整'
      : kind === 'empty'
        ? '没有发现空内容问题'
        : '根据资料内容建议主题',
  before: [],
  after: ['pending', 'applied'].includes(status) ? [{ id: 't', name: '开发', source: 'existing' }] : null,
});
const row = (
  id: string,
  title: string,
  suggestions: WorkspaceSuggestion[],
  patch: Partial<WorkspaceItem> = {},
): WorkspaceItem => ({
  id,
  aiStatus: 'not_needed',
  ruleStatus: 'completed',
  suggestions,
  resource: {
    id,
    type: 'note',
    title,
    tags: [{ id: 't', name: '开发', source: 'existing' }],
    source: { folder: '' },
    guards: {},
    evidenceLevel: 'text',
  },
  ...patch,
});
const clean = () => [
  check('clean-tags', 'not_applicable'),
  check('clean-title', 'not_applicable', 'title'),
  check('clean-empty', 'no_suggestion', 'empty'),
];
const items: WorkspaceItem[] = [
  row('pending', '待审核的标签建议', [check('pending-tags', 'pending')]),
  row('partial', '标签可应用，重复检查失败', [check('partial-tags', 'pending')], {
    work: [{ kind: 'duplicate', lane: 'direct', status: 'failed' }],
  }),
  row('manual', '需要手动补充的资料', [check('manual-tags', 'insufficient')]),
  row('working', '三项检查完成，仍在等待重复检查', clean(), {
    work: [{ kind: 'duplicate', lane: 'direct', status: 'waiting' }],
  }),
  row('failed', '分析失败的资料', [check('failed-tags', 'failed')], { aiStatus: 'failed' }),
  row('clean', '轻笺 — 已有标签，名称和内容正常', clean()),
  row('applied', '已经应用的资料', [check('applied-tags', 'applied')]),
  row('ignored', '已经忽略的资料', [check('ignored-tags', 'ignored')]),
  row('mixed', '应用与忽略混合的资料', [check('mixed-tags', 'applied'), check('mixed-title', 'ignored', 'title')]),
  row('skipped', '本次跳过的资料', [], { ruleStatus: 'skipped' }),
  row('expired', '资料变化，建议已失效', [check('expired-tags', 'expired')]),
];
const run: SuggestionRun = {
  id: 'outcomes-fixture',
  status: 'running',
  runVersion: 3,
  rulePhase: 'completed',
  options: { resourceTypes: ['note'], checks: ['tags', 'title', 'empty', 'duplicate'], scope: 'all', items: [] },
  summary: {
    total: items.length,
    types: { note: items.length },
    aiTotal: 0,
    ruleTotal: items.length,
    skipped: 0,
    files: { parsed: 0, metadata: 0 },
    estimatedTokensLower: 0,
    estimatedTokensUpper: 0,
    aiEnabled: true,
  },
  progress: [],
  items,
  nextCursor: null,
};
function snapshot(reviewState = '') {
  const outcomes = {
    review: 0,
    manual: 0,
    processing: 0,
    unfinished: 0,
    reviewed: 0,
    unchanged: 0,
    skipped: 0,
    unavailable: 0,
  };
  const current = items.map((item) => ({ ...item, outcome: resourceOutcome(item, run) }));
  for (const item of current) outcomes[item.outcome]++;
  const lane = {
    total: 1,
    completed: 0,
    partial: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    running: 0,
    waiting: 1,
    queued: 0,
    settled: true,
  };
  const review = {
    pending: items.flatMap((i) => i.suggestions).filter((s) => s.status === 'pending').length,
    manualObjects: outcomes.manual,
    retryFiles: 0,
    outcomes,
  };
  const visible = current.filter(
    (item) => !reviewState || item.outcome !== 'reviewed' || reviewDisposition(item) === reviewState,
  );
  const groupTotals: Record<string, number> = {};
  for (const item of visible) {
    const group = resourceGroup(item, run);
    groupTotals[group] = (groupTotals[group] || 0) + 1;
  }
  return {
    ...run,
    groupTotals,
    overview: {
      inspection: { total: items.length, checked: items.length, skipped: 1, settled: true },
      direct: lane,
      ai: { ...lane, total: 0, waiting: 0 },
      review,
    },
    items: visible,
    review: {
      pending: items.flatMap((i) => i.suggestions).filter((s) => s.status === 'pending').length,
      manualObjects: outcomes.manual,
      retryFiles: 0,
      outcomes,
    },
  };
}
request.defaults.adapter = async (config) => {
  const url = String(config.url);
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  let data: unknown = [];
  if (url.endsWith('/actions')) {
    const id = decodeURIComponent(url.split('/').at(-2)!);
    const suggestion = items.flatMap((i) => i.suggestions).find((s) => s.id === id)!;
    suggestion.status = body.action === 'ignore' ? 'ignored' : 'applied';
    data = { status: suggestion.status };
  } else if (url.endsWith('/runs')) data = [snapshot()];
  else if (url.includes('/runs/')) data = snapshot(String(config.params?.reviewState || ''));
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 200, data } };
};
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Workspace }] });
const app = createApp({
  setup() {
    useUserStore().$patch({ id: 'outcomes-fixture', role: 'user' });
    const bookmark = bookmarkStore();
    const sync = () => {
      bookmark.screenWidth = innerWidth;
      bookmark.screenHeight = innerHeight;
    };
    sync();
    window.addEventListener('resize', sync);
    return () => h(Workspace);
  },
});
app.use(createPinia());
app.use(createI18n({ legacy: false, locale: params.get('locale') || 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(router);
globalDirect(app);
await router.isReady();
app.mount('#app');

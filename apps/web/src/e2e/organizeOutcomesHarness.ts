import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createI18n } from 'vue-i18n';
import Workspace from '@/view/organize/OrganizeSuggestionWorkspace.vue';
import request from '@/http/request';
import { bookmarkStore, useUserStore } from '@/store';
import globalDirect from '@/config/globalDirect';
import { densityCssVariables, type UiDensity } from '@/config/uiDensity';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { resourceOutcome, resourceGroup, reviewDisposition } from '@/view/organize/organizeResourceState';
import type { SuggestionRun, WorkspaceItem, WorkspaceSuggestion } from '@/api/organizeSuggestionApi';
import '@/assets/css/index.less';

// 本地状态验收：整理接口使用内存响应，不调用模型或修改真实资料。
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') || 'day';
const density = (
  ['compact', 'standard', 'comfortable'].includes(params.get('density') || '') && !params.has('renderProfile')
    ? params.get('density')
    : 'standard'
) as UiDensity;
for (const [key, value] of Object.entries(densityCssVariables(density)))
  document.documentElement.style.setProperty(key, value);
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
if (params.has('volume')) {
  const size = Math.max(items.length, Math.min(1000, Number(params.get('volume')) || 260));
  for (let index = items.length; index < size; index++) {
    const id = `extra-${String(index).padStart(4, '0')}`;
    items.push(
      row(id, `整理资料 ${index}`, params.has('batch') && index < 75 ? [check(`${id}-tags`, 'pending')] : clean()),
    );
  }
}
const run: SuggestionRun = {
  id: 'outcomes-fixture',
  status: params.has('volume') ? 'completed' : 'running',
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
const requests: Array<{ url: string; group?: string; after?: string }> = [];
Object.assign(window, { __organizeRequests: requests });
let failedGroup = false;
let wroteSuggestions = false,
  failedRefresh = false;
request.defaults.adapter = async (config) => {
  const url = String(config.url);
  const query = config.params || {};
  requests.push({ url, group: query.group, after: query.after });
  if (params.has('delay')) await new Promise((resolve) => setTimeout(resolve, Number(params.get('delay')) || 150));
  if (query.group && query.group === params.get('failGroup') && !failedGroup) {
    failedGroup = true;
    throw new Error('测试：分组读取失败');
  }
  if (
    params.has('failRefresh') &&
    wroteSuggestions &&
    !failedRefresh &&
    config.method === 'get' &&
    url.includes('/runs/') &&
    !query.group
  ) {
    failedRefresh = true;
    throw new Error('测试：统计刷新失败');
  }
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  let data: unknown = [];
  if (url.endsWith('/apply-batch')) {
    wroteSuggestions = true;
    data = {
      results: body.items.map(({ suggestionId }: { suggestionId: string }) => {
        const suggestion = items.flatMap((i) => i.suggestions).find((s) => s.id === suggestionId)!;
        suggestion.status = 'applied';
        return { suggestionId, status: 'applied', applied: suggestion.after };
      }),
    };
  } else if (url.endsWith('/actions')) {
    const id = decodeURIComponent(url.split('/').at(-2)!);
    const suggestion = items.flatMap((i) => i.suggestions).find((s) => s.id === id)!;
    suggestion.status = body.action === 'ignore' ? 'ignored' : 'applied';
    data = { status: suggestion.status, applied: suggestion.after };
  } else if (url.endsWith('/runs')) data = [snapshot()];
  else if (url.includes('/runs/') || url.endsWith('/workspace')) {
    const result = snapshot(String(query.reviewState || ''));
    const selected = result.items.filter(
      (item) =>
        (!query.resourceType || item.resource.type === query.resourceType) &&
        (!query.kind || item.suggestions.some((s) => s.kind === query.kind)) &&
        (!query.reviewOnly || item.outcome === 'review'),
    );
    const groupTotals: Record<string, number> = {};
    for (const item of selected) {
      const group = resourceGroup(item, run);
      groupTotals[group] = (groupTotals[group] || 0) + 1;
    }
    const page = (group: string, after = '') => {
      const rows = selected
        .filter((item) => resourceGroup(item, run) === group && item.id > after)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return { items: rows.slice(0, 30), nextCursor: rows.length > 30 ? rows[29].id : null };
    };
    if (query.group) data = page(query.group, query.after);
    else {
      const groups =
        (typeof query.groups === 'string' && query.preferredRunId === run.id) || !url.endsWith('/workspace')
          ? String(query.groups).split(',')
          : ['priority', 'manual', 'unfinished'];
      const pages = Object.fromEntries(groups.map((group) => [group, page(group)]));
      data = {
        ...result,
        resourceType: query.resourceType || 'note',
        kind: query.kind || '',
        groupTotals,
        pages,
        items: undefined,
        nextCursor: null,
        batchAvailable: selected.some((item) =>
          item.suggestions.some(
            (s) => s.status === 'pending' && ['tags', 'title', 'description', 'archive'].includes(s.kind),
          ),
        ),
      };
    }
  }
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 200, data: structuredClone(data) } };
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

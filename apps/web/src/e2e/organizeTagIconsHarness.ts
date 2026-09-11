import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createI18n } from 'vue-i18n';
import Workspace from '@/view/organize/OrganizeSuggestionWorkspace.vue';
import request from '@/http/request';
import { bookmarkStore } from '@/store';
import globalDirect from '@/config/globalDirect';
import icon from '@/config/icon';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import type { SuggestionRun, WorkspaceItem } from '@/api/organizeSuggestionApi';
import '@/assets/css/index.less';
// 独立验收夹具：所有 API 使用内存响应，不访问数据库或模型。
const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
const candidate = (name = 'lucide:book-open', src = icon.resource.note) => ({
  iconName: name,
  iconUrl: src,
  color: 'currentColor',
});
const items = ['阅读', '数据库', '生活灵感与长期探索', '随手记', '已完成标签'].map((title, i) => ({
  id: `item-${i}`,
  resource: {
    type: 'tag',
    id: `tag-${i}`,
    title,
    iconUrl: '',
    tags: [],
    source: { folder: '' },
    guards: {},
    evidenceLevel: 'metadata',
  },
  aiStatus: 'not_needed',
  ruleStatus: 'completed',
  suggestions: [
    {
      id: `suggestion-${i}`,
      kind: 'tag_icon',
      status: ['pending', 'pending', 'no_suggestion', 'failed', 'applied'][i],
      reason: '',
      before: '',
      after: i < 2 || i === 4 ? candidate() : null,
      candidates:
        i < 2
          ? [candidate(), candidate('lucide:file', icon.organize.file), candidate('lucide:tag', icon.resource.tag)]
          : [],
    },
  ],
})) as WorkspaceItem[];
let run = {
  id: 'icon-fixture',
  status: 'completed',
  rulePhase: 'completed',
  checked: 5,
  createdAt: '2026-09-08',
  options: { resourceTypes: ['tag'], checks: ['tag_icon'], scope: 'all', items: [] },
  summary: {
    total: 5,
    types: { tag: 5 },
    aiTotal: 0,
    ruleTotal: 5,
    skipped: 0,
    files: { parsed: 0, metadata: 0 },
    estimatedTokensLower: 0,
    estimatedTokensUpper: 0,
    aiEnabled: true,
  },
  progress: [{ resourceType: 'tag', aiStatus: 'not_needed', total: 5 }],
  counts: [
    { status: 'pending', total: 2 },
    { status: 'failed', total: 1 },
  ],
  items,
} as SuggestionRun;
if (params.has('expired')) {
  items.splice(
    0,
    items.length,
    ...(['expired', 'pending'].map((status, index) => ({
      id: `expired-item-${index}`,
      resource: {
        type: 'note',
        id: `note-${index}`,
        title: index ? '有效笔记' : '已移入回收站的笔记',
        tags: [],
        source: { folder: '' },
        guards: {},
        evidenceLevel: 'metadata',
      },
      aiStatus: 'completed',
      ruleStatus: 'completed',
      suggestions: [
        {
          id: `expired-suggestion-${index}`,
          kind: 'tags',
          status,
          reason: index ? '建议标签' : '资料已移入回收站，此建议已失效',
          before: [],
          after: [{ id: 'tag', name: '开发' }],
        },
      ],
    })) as WorkspaceItem[]),
  );
  run.options = { resourceTypes: ['note'], checks: ['tags'], scope: 'all', items: [] };
  run.summary = { ...run.summary, total: 2, types: { note: 2 } };
  run.checked = 2;
}
// V3 overview scenarios use synthetic counts and the existing isolated API adapter.
const scenario = params.get('progress');
if (scenario) {
  const lane = {
    total: 0,
    completed: 0,
    partial: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    running: 0,
    waiting: 0,
    queued: 0,
    settled: false,
  };
  run.runVersion = 3;
  run.status =
    scenario === 'partial' || scenario === 'complete' ? 'completed' : scenario === 'paused' ? 'paused' : 'running';
  run.summary = { ...run.summary, total: 72, types: { bookmark: 20, note: 20, file: 20, tag: 12 }, aiTotal: null };
  run.options.resourceTypes = ['bookmark', 'file', 'note', 'tag'];
  run.options.checks = ['tags', 'title', 'empty', 'duplicate', 'tag_icon'];
  run.overview = {
    inspection: { total: 72, checked: scenario === 'checking' ? 46 : 72, skipped: 0, settled: scenario !== 'checking' },
    direct: {
      ...lane,
      total: 72,
      completed: scenario === 'checking' ? 0 : 60,
      running: scenario === 'checking' ? 0 : 1,
      queued: scenario === 'checking' ? 72 : 11,
    },
    ai: {
      ...lane,
      total: scenario === 'checking' ? 0 : 19,
      completed: scenario === 'checking' ? 0 : 8,
      running: scenario === 'checking' || scenario === 'paused' ? 0 : 1,
      queued: scenario === 'checking' ? 0 : scenario === 'paused' ? 11 : 10,
    },
    review: {
      pending: scenario === 'checking' ? 0 : 15,
      manualObjects: scenario === 'checking' ? 0 : 6,
      retryFiles: scenario === 'partial' ? 2 : 0,
    },
  };
  if (['complete', 'partial'].includes(scenario)) {
    run.overview.direct = { ...lane, total: 72, completed: 72, settled: true };
    run.overview.ai = {
      ...lane,
      total: 19,
      completed: scenario === 'partial' ? 17 : 19,
      failed: scenario === 'partial' ? 2 : 0,
      settled: true,
    };
  }
  if (scenario === 'free') run.overview.ai = { ...lane, settled: true };
  if (scenario === 'ended') {
    run.status = 'ended';
    run.overview.inspection = { total: 72, checked: 46, skipped: 0, settled: false };
    run.overview.direct = { ...lane, total: 46, cancelled: 46, settled: true };
    run.overview.ai = { ...lane, settled: true };
    run.overview.review = { pending: 0, manualObjects: 0, retryFiles: 0 };
  }
  if (scenario === 'allpaused') {
    run.status = 'paused';
    run.overview.direct = { ...lane, total: 72, completed: 72 };
    run.overview.ai = { ...lane, total: 19, completed: 8, queued: 11 };
  }
  if (params.has('longNumbers')) {
    run.summary.total = 1234567;
    run.overview.inspection.total = 1234567;
    run.overview.inspection.checked = 1234567;
    run.overview.direct.total = 1234567;
    run.overview.direct.completed = 1234567;
    run.overview.review.pending = 1234567;
  }

  run.overview.review.outcomes =
    scenario === 'checking'
      ? { review: 0, manual: 0, processing: 72, unfinished: 0, reviewed: 0, unchanged: 0, skipped: 0, unavailable: 0 }
      : { review: 13, manual: 6, processing: 0, unfinished: 2, reviewed: 7, unchanged: 44, skipped: 0, unavailable: 0 };
  if (scenario === 'ended')
    run.overview.review.outcomes = {
      review: 0,
      manual: 0,
      processing: 0,
      unfinished: 72,
      reviewed: 0,
      unchanged: 0,
      skipped: 0,
      unavailable: 0,
    };
  if (['running', 'free', 'paused', 'allpaused'].includes(scenario))
    run.overview.review.outcomes = {
      review: 13,
      manual: 6,
      processing: 11,
      unfinished: 0,
      reviewed: 0,
      unchanged: 42,
      skipped: 0,
      unavailable: 0,
    };
  if (scenario === 'complete') {
    run.overview.review.outcomes.unfinished = 0;
    run.overview.review.outcomes.unchanged = 46;
  }
  if (params.has('longNumbers')) run.overview.review.outcomes.unchanged += run.summary.total - 72;
  run.review = run.overview.review;
  if (scenario === 'legacy') {
    run.review.pending = 14;
    run.review.manualObjects = 29;
    run.review.outcomes = {
      review: 14,
      manual: 29,
      processing: 0,
      unfinished: 7,
      reviewed: 1,
      unchanged: 20,
      skipped: 0,
      unavailable: 1,
    };
    run.runVersion = 2;
    run.status = 'completed';
    run.summary.aiTotal = 19;
    run.checked = 72;
    run.progress = [
      { resourceType: 'file', aiStatus: 'completed', total: 17 },
      { resourceType: 'file', aiStatus: 'failed', total: 2 },
    ];
    run.overview = undefined;
    run.review.retryFiles = 0;
  }

  run.canPause = run.status === 'running';
  run.canResume = run.status === 'paused';
  run.canEnd = ['running', 'paused'].includes(run.status);
  run.pauseReason = run.status === 'paused' ? 'user' : undefined;
  run.rulePhase = scenario === 'checking' ? 'pending' : 'completed';
}
if (params.has('unfinishedIcons')) {
  const titles = ['银行卡', '密钥', '项目搭建', 'CS2', '面试', '弹幕', '椅子', '游戏账号', '轻笺历程', '轻笺知识库'];
  const template = items[0];
  items.splice(
    0,
    items.length,
    ...(titles.map((title, i) => ({
      ...template,
      id: `outcome-${i}`,
      resource: { ...template.resource, id: `tag-${i}`, title },
      outcome: i < 3 ? 'review' : i < 5 ? 'manual' : 'unfinished',
      aiStatus: 'completed',
      suggestions: [
        {
          ...template.suggestions[0],
          id: `suggestion-${i}`,
          status: i < 3 ? 'pending' : i < 5 ? 'no_suggestion' : 'insufficient',
          after: i < 3 ? candidate() : null,
          candidates: i < 3 ? [candidate()] : [],
        },
      ],
    })) as WorkspaceItem[]),
  );
  run.summary = { ...run.summary, total: 10, types: { tag: 10 } };
  run.checked = 10;
  run.review = {
    pending: 3,
    manualObjects: 2,
    retryFiles: 0,
    outcomes: {
      review: 3,
      manual: 2,
      unfinished: 5,
      processing: 0,
      reviewed: 0,
      unchanged: 0,
      skipped: 0,
      unavailable: 0,
    },
  };
  run.groupTotals = { priority: 3, manual: 2, analysis: 5 };
}
request.defaults.adapter = async (config) => {
  run.counts = [...new Set(items.flatMap((item) => item.suggestions.map((s) => s.status)))].map((status) => ({
    status,
    total: items.filter((item) => item.suggestions.some((s) => s.status === status)).length,
  }));
  const url = String(config.url);
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  let data: unknown = [];
  if (url.endsWith('/runs')) {
    if (params.has('loadDelay')) await new Promise((resolve) => setTimeout(resolve, 300));
    const { overview, progress, review, counts, items: _items, ...brief } = run;
    data = params.has('empty') ? [] : [brief];
  } else if (url.endsWith('/pause') || url.endsWith('/resume')) {
    run.status = url.endsWith('/pause') ? 'paused' : 'running';
    run.canPause = run.status === 'running';
    run.canResume = run.status === 'paused';
    data = run;
  } else if (url.endsWith('/previews')) {
    run = { ...run, options: body, status: 'preview' };
    if (params.has('skipped'))
      run.summary = {
        ...run.summary,
        total: 12,
        types: { tag: 12 },
        ruleTotal: 12,
        skipped: 34,
        skippedReasons: { customIcon: 34, unavailable: 0 },
      };
    data = run;
  } else if (url.endsWith('/start')) {
    run.status = 'completed';
    data = run;
  } else if (url.endsWith('/actions')) {
    const id = decodeURIComponent(url.split('/').at(-2)!);
    const s = items.flatMap((item) => item.suggestions).find((s) => s.id === id)!;
    if (params.has('conflict') && id === 'suggestion-1') {
      return {
        data: { status: 409, msg: '标签已在其他页面修改，请重新整理', data: { code: 'ORGANIZE_RESOURCE_CHANGED' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    }
    s.status = body.action === 'ignore' ? 'ignored' : 'applied';
    data = { status: s.status, applied: body.action === 'apply' ? candidate(body.value.iconName) : undefined };
  } else if (url.includes('/runs/')) {
    if (params.has('loadDelay')) await new Promise((resolve) => setTimeout(resolve, 1800));
    if (params.has('loadError')) throw new Error('整理结果读取失败');
    data = run;
  } else if (url.endsWith('/tagIcon/search'))
    data = { icons: [], keywords: [], translatedQuery: '', page: 0, hasMore: false, aiExpanded: !!body.useAi };
  else if (url.endsWith('/tagIcon/resolve')) data = { iconUrl: icon.resource.note };
  return { data: { status: 200, msg: '', data }, status: 200, statusText: 'OK', headers: {}, config };
};
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Workspace }] });
const app = createApp({
  setup() {
    const store = bookmarkStore();
    const sync = () => {
      store.screenWidth = innerWidth;
      store.screenHeight = innerHeight;
    };
    sync();
    window.addEventListener('resize', sync);
    return () =>
      h('div', { style: 'height:100%;width:100%;max-width:1100px;margin:auto;padding:16px;box-sizing:border-box' }, [
        h(Workspace),
      ]);
  },
});
app.use(createPinia());
app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(router);
globalDirect(app);
await router.isReady();
// 固定验收容器宽度，避免全局 body flex 使首屏按内容收缩。
document.getElementById('app')!.style.width = '100%';
app.mount('#app');

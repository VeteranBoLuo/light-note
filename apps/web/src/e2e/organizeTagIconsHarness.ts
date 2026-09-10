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
request.defaults.adapter = async (config) => {
  run.counts = [...new Set(items.flatMap((item) => item.suggestions.map((s) => s.status)))].map((status) => ({
    status,
    total: items.filter((item) => item.suggestions.some((s) => s.status === status)).length,
  }));
  const url = String(config.url);
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  let data: unknown = [];
  if (url.endsWith('/runs')) data = params.has('empty') ? [] : [run];
  else if (url.endsWith('/previews')) {
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
  } else if (url.includes('/runs/')) data = run;
  else if (url.endsWith('/tagIcon/search'))
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
      h('div', { style: 'height:100%;max-width:1100px;margin:auto;padding:16px;box-sizing:border-box' }, [
        h(Workspace),
      ]);
  },
});
app.use(createPinia());
app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(router);
globalDirect(app);
await router.isReady();
app.mount('#app');

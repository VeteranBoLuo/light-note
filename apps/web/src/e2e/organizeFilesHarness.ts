import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createI18n } from 'vue-i18n';
import Workspace from '@/view/organize/OrganizeSuggestionWorkspace.vue';
import request from '@/http/request';
import { bookmarkStore } from '@/store';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import type { SuggestionRun, WorkspaceItem } from '@/api/organizeSuggestionApi';
import '@/assets/css/index.less';
// 独立验收夹具：所有 API 使用内存响应，不访问数据库或模型。
const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
const ids = [
  '灯具选购-主卧吸顶灯与照明方案.jpg',
  '项目面试准备-03-可视化基础建设.md',
  '窗户图纸.pdf',
  '2026-7-13.png',
  '缺少内容.pdf',
];
const readings = [
  { state: 'visual', complete: true, totalPages: 1, readPages: 1 },
  { state: 'text', complete: true, totalPages: 1, readPages: 1 },
  {
    state: 'partial',
    complete: false,
    totalPages: 4,
    readPages: 3,
    missingPages: [4],
    reasonCode: 'CONTENT_UNREADABLE',
  },
  { state: 'waiting', complete: false },
  { state: 'metadata', complete: false, reasonCode: 'FILE_CONTENT_INVALID' },
];
const items = ids.map((title, i) => ({
  id: `item-${i}`,
  resource: {
    type: 'file',
    id: `${i}`,
    title,
    tags: [],
    source: { folder: '' },
    guards: {},
    evidenceLevel: readings[i].state,
    reading: readings[i],
  },
  aiStatus: ['completed', 'completed', 'completed', 'waiting_content', 'failed'][i],
  ruleStatus: 'completed',
  suggestions: [
    {
      id: `suggestion-${i}`,
      kind: 'tags',
      status: ['pending', 'pending', 'pending', 'running', 'failed'][i],
      reason: '根据资料内容建议的核心主题标签',
      reasonCode: i < 3 ? 'suggested' : 'no_suggestion',
      before: [],
      after:
        i < 3
          ? [
              {
                id: i === 1 ? 'existing-tag' : null,
                name: ['灯具', '数据可视化', '门窗'][i],
                source: i === 1 ? 'existing' : 'new',
                evidenceType: i === 0 ? 'visual' : 'text',
                locator: i === 2 ? '第 1 页' : '',
                evidence: ['主卧灯', '可视化基础建设', '门窗图纸'][i],
              },
            ]
          : null,
      reading: readings[i],
    },
  ],
})) as WorkspaceItem[];
let run = {
  id: 'file-fixture',
  status: params.has('paused') ? 'paused' : 'running',
  runVersion: 2,
  rulePhase: 'completed',
  canPause: !params.has('paused'),
  canResume: params.has('paused'),
  canEnd: true,
  checked: 5,
  queued: 1,
  inFlight: 0,
  createdAt: '2026-09-09',
  options: { resourceTypes: ['file'], checks: ['tags'], scope: 'all', items: [] },
  summary: {
    total: 5,
    types: { file: 5 },
    aiTotal: 5,
    ruleTotal: 0,
    skipped: 0,
    files: { parsed: 2, metadata: 3 },
    estimatedTokensLower: null,
    estimatedTokensUpper: null,
    aiEnabled: true,
  },
  progress: [
    { resourceType: 'file', aiStatus: 'completed', total: 3 },
    { resourceType: 'file', aiStatus: 'waiting_content', total: 1 },
    { resourceType: 'file', aiStatus: 'failed', total: 1 },
  ],
  counts: [
    { status: 'pending', total: 3 },
    { status: 'running', total: 1 },
    { status: 'failed', total: 1 },
  ],
  items,
} as SuggestionRun;
request.defaults.adapter = async (config) => {
  const url = String(config.url);
  let data: unknown = [];
  if (url.endsWith('/getFileInfo')) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return { data: { status: 404, msg: '', data: null }, status: 200, statusText: 'OK', headers: {}, config };
  }
  if (url.endsWith('/runs')) data = [run];
  else if (url.endsWith('/retry-preview'))
    data = { ...run, id: 'retry-fixture', status: 'preview', summary: { ...run.summary, total: 1 } };
  else if (url.endsWith('/pause') || url.endsWith('/resume')) {
    run = {
      ...run,
      status: url.endsWith('/pause') ? 'paused' : 'running',
      canPause: url.endsWith('/resume'),
      canResume: url.endsWith('/pause'),
    };
    data = run;
  } else if (url.includes('/runs/')) data = run;
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

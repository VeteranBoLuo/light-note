import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { normalizeProductVersion } from '@lightnote/shared';
import { bookmarkStore, useUserStore } from '@/store';
import UpdateLogs from '@/components/personCenter/UpdateLogs.vue';
import type { UpdateLogItem } from '@/api/updateLogApi';
import { densityCssVariables, requiresStandardDensity, resolveUiDensity } from '@/config/uiDensity';
import globalDirect from '@/config/globalDirect';
import i18n from '@/i18n';
import en from '@/i18n/locales/en-US-core';
import request from '@/http/request';
import '@/assets/css/index.less';

// Local-only fixture. All APIs fail closed unless explicitly handled below; no real writes.
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const root = params.get('role') === 'root';
const items: UpdateLogItem[] = [
  {
    id: 'next-release',
    title: '下一次整版更新',
    productVersion: '1.1.0',
    publishDate: '2026-11-05',
    summary: '这是管理端草稿，正式发布前不会成为最新版本。',
    highlights: ['集中功能更新'],
    tags: ['书签', '云空间'],
    contentMarkdown: '',
    imageKeys: [],
    status: 'draft',
  },
  {
    id: 'milestone',
    title: '知识庄园开放：资料处理、公开分享与创作体验升级',
    productVersion: '1.0.0',
    publishDate: '2026-10-30',
    summary: '汇总 9 月 18 日以来的主要更新：知识庄园向登录用户开放，完善笔记创作、数据导出、成长装扮与跨端收集体验。',
    highlights: ['知识庄园向登录用户开放。', '完善笔记创作、公开分享和云空间体验。', '优化跨端收集及常用功能。'],
    tags: ['知识庄园', '知识工坊', '公开资源', '笔记', '云空间', '成长', 'Android'],
    contentMarkdown: '## 知识庄园开放\n\n本段仅用于本地布局和展开验收。',
    imageKeys: [],
    status: 'published',
  },
  {
    id: 'older-release',
    title: '新版社区上线：图文交流、资源整理与跨端体验升级',
    publishDate: '2026-09-18',
    productVersion: '',
    summary: '新版社区与公开主页上线，完善图文阅读、资源检索和 AI 整理进度。',
    highlights: ['新增广场，支持图文交流。', '完善笔记与云空间体验。'],
    tags: ['社区', '资源中心', '笔记'],
    contentMarkdown: '',
    imageKeys: [],
    status: 'published',
  },
];
if (params.get('onlyDraft') === '1') items.splice(1);
if (params.get('empty') === '1') items.splice(0);
if (params.get('longVersion') === '1' && items[1]) items[1].productVersion = `${'1'.repeat(28)}.1.0`;
let saveAttempts = 0;
request.defaults.adapter = async (config) => {
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  let data: unknown;
  let status = 200;
  let msg = 'ok';
  if (config.url === '/api/updateLog/list') data = { items: items.filter((item) => item.status === 'published') };
  else if (config.url === '/api/updateLog/manageList') data = { items };
  else if (config.url === '/api/updateLog/save') {
    saveAttempts += 1;
    const item = items.find((entry) => entry.id === body.id);
    const version = normalizeProductVersion(body.productVersion);
    if (!item || version === null) {
      status = 400;
      msg = '产品版本格式无效';
      data = null;
    } else if (params.get('saveFail') === '1' && saveAttempts === 1) {
      status = 503;
      msg = '模拟保存失败，请重试';
      data = null;
    } else {
      Object.assign(item, body, { productVersion: version });
      data = { item: { ...item } };
    }
  } else if (['/api/common/recordOperationLogs', '/api/common/recordAiEvent'].includes(String(config.url))) data = null;
  else throw new Error(`Unexpected changelog fixture request: ${config.url}`);
  // Match HTTP JSON isolation; Vue must not share mutable records with the fixture store.
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status, msg, data: structuredClone(data) } };
};

document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
for (const [key, value] of Object.entries(
  densityCssVariables(
    resolveUiDensity(params.get('density'), requiresStandardDensity({ name: 'updateLogs' }, !mobile)),
  ),
))
  document.documentElement.style.setProperty(key, value);
i18n.global.setLocaleMessage('en-US', en);
(i18n.global.locale.value as string) = locale;
const pinia = createPinia();
useUserStore(pinia).setUserInfo({
  id: 'changelog-fixture',
  role: root ? 'root' : 'visitor',
  alias: 'Fixture',
  preferences: { lang: locale, theme, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/updateLogs', name: 'updateLogs', component: UpdateLogs },
    { path: '/:pathMatch(.*)*', component: { render: () => h('p', 'Fixture destination') } },
  ],
});
const app = createApp({ render: () => h(RouterView) });
app.use(pinia).use(router).use(i18n);
globalDirect(app);
await router.push('/updateLogs');
await router.isReady();
app.mount('#app');

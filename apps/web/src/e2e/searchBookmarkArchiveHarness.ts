import { createApp, h, watch } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory, RouterView } from 'vue-router';
import axios from 'axios';
import request from '@/http/request';
import i18n, { setLocale } from '@/i18n';
import globalDirect from '@/config/globalDirect';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import type { SearchResultItem } from '@/api/search';
import '@/assets/css/index.less';

// Fictional, fully intercepted API data; never connect this acceptance page to a backend or Provider.
const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
await setLocale(locale);
const pinia = createPinia();
setActivePinia(pinia);
const user = useUserStore(pinia);
user.setUserInfo({
  id: 'search-archive-fixture',
  role: params.get('guest') === '1' ? 'visitor' : 'user',
  preferences: {
    theme,
    lang: locale,
    noteViewMode: 'card',
    openBookmarkIn: params.get('openIn') === 'current' ? 'current' : 'newTab',
  },
});
const bookmark = bookmarkStore(pinia);
const syncViewport = () => {
  bookmark.screenWidth = innerWidth;
  bookmark.screenHeight = innerHeight;
};
syncViewport();
window.addEventListener('resize', syncViewport);
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
applyUiDensity(params.get('density'), !bookmark.isDesktop);
const url = 'https://example.com/';
const resources: SearchResultItem[] = Array.from({ length: 72 }, (_, index) => ({
  id: `archive-fixture-${index + 1}`,
  type: 'bookmark',
  title: `项目参考资料 ${String(index + 1).padStart(2, '0')}`,
  description: '工作资料 · 已存网页正文与原网页分别打开',
  url,
  tags: [{ id: 'work', name: '工作' }],
  extra: '2026-10-20',
}));
const calls: Array<{ path: string; body: Record<string, any> }> = [];
let searchCount = 0;
let readCount = 0;
const adapter: NonNullable<typeof request.defaults.adapter> = async (config) => {
  const path = String(config.url || '');
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  calls.push({ path, body });
  document.body.dataset.fixtureRequests = JSON.stringify(calls);
  let data: unknown = null;
  if (path === '/api/search/global') {
    document.body.dataset.searchCount = String(++searchCount);
    const offset = Number(body.cursor?.offset || 0);
    const size = Number(body.pageSize || 24);
    const items = resources.slice(offset, offset + size);
    const hasMore = offset + items.length < resources.length;
    data = {
      items,
      groups: [{ type: 'bookmark', items }],
      total: resources.length,
      ...(body.includeMetadata
        ? { typeTotals: { bookmark: resources.length }, tagOptions: ['工作'], tagMatches: [] }
        : {}),
      hasMore,
      nextCursor: hasMore ? { type: 'all', offset: offset + items.length } : null,
    };
  } else if (path === '/api/bookmark/snapshot') {
    document.body.dataset.archiveReadCount = String(++readCount);
    if (params.get('state') === 'slow') await new Promise((resolve) => setTimeout(resolve, 1500));
    if (params.get('state') === 'error' && readCount === 1) throw new Error('验收：网络暂时不可用');
    data = {
      bookmarkUrl: url,
      url: params.get('state') === 'stale' ? 'https://example.com/old' : url,
      title: `存档 ${body.id}`,
      content:
        params.get('state') === 'empty'
          ? null
          : `这是 ${body.id} 的已保存正文。\n\n` +
            Array.from(
              { length: 24 },
              (_, i) => `第 ${i + 1} 段：阅读存档不会保存或上传内容，关闭后保留搜索现场。`,
            ).join('\n\n'),
      summary: params.get('state') === 'empty' ? null : '已有摘要：复用存档阅读器，不重新生成。',
      char_count: params.get('state') === 'empty' ? 0 : 1600,
      update_time: params.get('state') === 'empty' ? null : '2026-10-20 10:00:00',
      source: 'static_html',
      ...(params.get('state') === 'failed'
        ? {
            archiveTask: { status: 'failed', reason_code: 'TIMEOUT', retryable: true, attempts: 3 },
          }
        : {}),
    };
  } else if (path === '/api/organize/summary') {
    data = { pendingShortcut: { count: 0 }, totals: { findingTotal: 0 } };
  } else if (
    !['/api/common/recordOperationLogs', '/api/common/recordResourceOpen', '/api/support/events'].includes(path)
  ) {
    document.body.dataset.unexpectedRequest = path;
    throw new Error(`Unexpected fixture request: ${path}`);
  }
  return { data: { status: 200, data, msg: '' }, status: 200, statusText: 'OK', headers: {}, config };
};
request.defaults.adapter = adapter;
axios.defaults.adapter = adapter;
const { default: SearchCenter } = await import('@/view/search/SearchCenter.vue');
const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: '/search', component: SearchCenter }],
});
const source = `/search?q=${encodeURIComponent('项目')}&type=bookmark&sort=updated&date=30d&tags=${encodeURIComponent('工作')}&view=${params.get('view') === 'card' ? 'card' : 'list'}`;
await router.replace(location.hash.slice(1) || source);
await router.isReady();
watch(
  router.currentRoute,
  (route) => {
    document.body.dataset.fixtureRoute = route.fullPath;
  },
  { immediate: true },
);
createApp({ render: () => h(RouterView) })
  .use(pinia)
  .use(router)
  .use(i18n)
  .use(globalDirect)
  .mount('#app');

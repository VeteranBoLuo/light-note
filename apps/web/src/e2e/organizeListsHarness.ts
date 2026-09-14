import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import { bookmarkStore, organizeStore } from '@/store';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import Center from '@/view/organize/OrganizeCenter.vue';
import '@/assets/css/index.less';

// 固定内存分页，所有请求均由 adapter 拦截，不访问真实 API。
const params = new URLSearchParams(location.search);
const calls: Array<{ issue: string; cursor: number; keyword: string }> = [];
let failed = false;
const total = params.has('empty') ? 0 : params.has('short') ? 3 : 194;
document.documentElement.dataset.theme = params.get('theme') || 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
for (const el of [document.documentElement, document.body, document.getElementById('app')!]) {
  el.style.height = '100%';
  el.style.margin = '0';
}
document.body.style.display = 'block';
document.getElementById('app')!.style.width = '100%';
request.defaults.adapter = async (config) => {
  const url = String(config.url);
  let data: unknown = [];
  if (url.includes('/issues/')) {
    const issue = url.split('/').pop()!;
    const cursor = Number(config.params?.cursor || 0);
    const keyword = String(config.params?.keyword || '');
    calls.push({ issue, cursor, keyword });
    await new Promise((resolve) => setTimeout(resolve, params.has('slow') ? 1500 : 100));
    if (params.has('error') && cursor > 0 && !failed) {
      failed = true;
      throw new Error('fixture pagination failure');
    }
    const count = keyword === '无结果' ? 0 : total;
    const end = Math.min(
      count,
      cursor + (params.has('underfill') && cursor === 0 ? 2 : Number(config.params?.limit || 20)),
    );
    const items = Array.from({ length: Math.max(0, end - cursor) }, (_, offset) => {
      const i = cursor + offset;
      const title = `${keyword || '验收资料'} ${i + 1} — 连续滚动自动加载`;
      const common = { url: `https://example.com/resource/${i}`, updatedAt: '2026-09-14T08:00:00Z' };
      if (issue === 'duplicate_bookmark')
        return {
          ...common,
          groupKey: `group-${i}`,
          memberCount: 2,
          canResolve: true,
          members: [
            { id: `a-${i}`, name: title },
            { id: `b-${i}`, name: `${title} 副本` },
          ],
        };
      if (issue === 'bookmark_health')
        return {
          ...common,
          id: `health-${i}`,
          name: title,
          observedCode: '404',
          checkedAt: common.updatedAt,
        };
      return {
        ...common,
        resourceType: ['note', 'file', 'bookmark'][i % 3],
        resourceId: String(i),
        title,
        summary: '用于检查分页、筛选、批量选择及浅深主题的模拟资料。',
      };
    });
    data = { items, nextCursor: end < count ? String(end) : null, hasMore: end < count };
  } else if (url.endsWith('/summary')) {
    const summary = { findingCount: total, hasMore: false };
    data = {
      pendingShortcut: { count: 0 },
      totals: { findingTotal: total * 3 },
      issues: { untagged: summary, duplicateBookmark: summary, bookmarkHealth: summary },
    };
  } else if (url.includes('/health')) data = null;
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 200, data } };
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/organize', name: 'organizeCenter', component: Center }],
});
const app = createApp({
  setup() {
    const bookmark = bookmarkStore();
    const sync = () => {
      bookmark.screenWidth = innerWidth;
      bookmark.screenHeight = innerHeight;
    };
    sync();
    window.addEventListener('resize', sync);
    Object.assign(window, { organizeFixture: { calls, store: organizeStore(), router } });
    return () => h(RouterView);
  },
});
app.use(createPinia());
app.use(createI18n({ legacy: false, locale: params.get('locale') || 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(router);
globalDirect(app);
await router.push({ path: '/organize', query: { issue: params.get('issue') || 'untagged' } });
await router.isReady();
app.mount('#app');

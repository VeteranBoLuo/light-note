import { createApp, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import { createI18n } from 'vue-i18n';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import { bookmarkStore, useUserStore, todoStore, inboxStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import MobileAppShell from '@/components/mobile/MobileAppShell.vue';
import Inbox from '@/view/inbox/Inbox.vue';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// Real task/resource lists with in-memory data; never connect to a business service.
const params = new URLSearchParams(location.search);
const pinia = createPinia();
setActivePinia(pinia);
const user = useUserStore();
user.id = 'range-fixture';
user.role = 'user';
const bookmark = bookmarkStore();
bookmark.screenWidth = innerWidth;
bookmark.screenHeight = innerHeight;
user.preferences.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.dataset.theme = user.currentTheme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
applyUiDensity(params.get('density'), bookmark.isMobile);
for (const element of [document.documentElement, document.body, document.getElementById('app')!]) {
  element.style.height = '100%';
  element.style.margin = '0';
}
document.body.style.display = 'block';
const items = Array.from({ length: 12 }, (_, index) => ({
  id: `todo-${index + 1}`,
  title: `连选待办 ${index + 1}`,
  description: '共享批量手势验收',
  priority: 1,
  status: 'pending',
  checklist: [],
  tags: [],
  createdAt: '2026-10-20 10:00:00',
  updatedAt: '2026-10-20 10:00:00',
}));
const resources = items.map((item) => ({
  resourceType: 'note',
  resourceId: item.id,
  title: item.title,
  summary: item.description,
  detail: '',
  source: 'manual',
  collectedAt: item.createdAt,
  resourceCreatedAt: item.createdAt,
}));
const groupNodes = (key: string) =>
  items
    .slice(key === 'focus' ? 0 : 6, key === 'focus' ? 6 : 12)
    .map((item, index) =>
      index === 1
        ? {
            kind: 'series',
            key: item.id,
            seriesId: `series-${key}`,
            representative: item,
            instanceCount: 3,
            overdueCount: 0,
            futureCount: 2,
          }
        : { kind: 'item', key: item.id, item },
    );
request.defaults.adapter = async (config) => {
  const url = String(config.url),
    body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  let data: any = [];
  if (url.endsWith('/todo/workspace/group'))
    data = { nodes: groupNodes(body.groupKey), nodeCount: 6, instanceCount: 8, nextCursor: null };
  else if (url.endsWith('/todo/workspace'))
    data = {
      items: body.ids ? items.filter((item) => body.ids.includes(item.id)) : items,
      groups: ['focus', 'unassigned'].map((key) => ({ key, nodeCount: 6, instanceCount: 8 })),
      lists: [],
      overview: { allTotal: 12 },
      groupCounts: { focus: 6, unassigned: 6 },
      statusTotals: { pending: 12, completed: 0, all: 12 },
      total: 12,
      nextCursor: null,
    };
  else if (url.endsWith('/inbox/list'))
    data = {
      items: resources,
      total: 12,
      pendingTotal: 12,
      todoPendingTotal: 12,
      typeTotals: { note: 12, file: 0, bookmark: 0 },
    };
  else if (url.endsWith('/inbox/count'))
    data = { pendingTotal: 12, todoPendingTotal: 12, typeTotals: { note: 12, file: 0, bookmark: 0 } };
  else if (url.endsWith('/todo/list')) data = { items: [], total: 0 };
  else if (url.endsWith('/todo/count')) data = { total: 12, pendingTotal: 12 };
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 200, data } };
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/inbox', name: 'inbox', component: Inbox }],
});
await router.push({ path: '/inbox', query: { tab: params.get('module') === 'inbox' ? 'note' : 'todo' } });
const app = createApp({
  render: () =>
    h(
      MobileAppShell,
      { enabled: bookmark.isMobile, showTopBar: bookmark.isMobile, showBottomNav: false, showTopSwitcher: false },
      () => h(RouterView),
    ),
});
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
app.mount('#app');
Object.assign(window, { rangeFixture: { todo: todoStore(), inbox: inboxStore() } });

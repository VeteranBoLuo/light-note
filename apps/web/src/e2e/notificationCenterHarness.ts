import { createApp, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import NotificationBell from '@/components/notification/NotificationBell.vue';
import { useNotification, type NotificationItem } from '@/composables/useNotification';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// Disposable fixture: every request is intercepted; no real notification is read, changed or sent.
const params = new URLSearchParams(location.search),
  page = params.get('view') === 'page';
const pinia = createPinia();
setActivePinia(pinia);
useUserStore().$patch({ id: 'notice-fixture', role: 'user' });
bookmarkStore().screenWidth = innerWidth;
document.body.style.cssText = 'display:block;margin:0;background:var(--background-color);color:var(--text-color)';
document.getElementById('app')!.style.cssText = 'width:100%;max-width:none;margin:0;height:100vh';
document.documentElement.dataset.theme = params.get('theme') || 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
applyUiDensity(params.get('density') || 'medium', innerWidth < 1000);
const items: NotificationItem[] = [
  {
    id: 'batch-result',
    type: 'public_resource',
    title: '公开资源审核结果',
    content: '',
    isRead: 0,
    createTime: new Date().toISOString(),
    link: '/search/publications',
    meta: { kind: 'result', counts: { approve: 12, reject: 2 } },
  },
];
if (params.has('readToggle')) {
  items.splice(
    0,
    items.length,
    {
      id: 'preview-todo',
      type: 'todo_reminder',
      title: '待办提醒',
      content: '整理今日笔记',
      isRead: 0,
      createTime: new Date().toISOString(),
      link: null,
      meta: { todoId: 'preview-todo-item' },
      todoState: 'pending',
    },
    {
      id: 'preview-system',
      type: 'system',
      title: '资料整理已完成',
      content: '这是一条已读示例通知，可以标记为未读，留待稍后查看。',
      isRead: 1,
      createTime: new Date(Date.now() - 600000).toISOString(),
      link: null,
      meta: {},
    },
    {
      id: 'preview-long',
      type: 'system',
      title: '长标题示例：你的笔记整理结果已经生成，可以稍后继续查看详细内容',
      content: '右侧两个操作始终保留固定位置，切换状态不会改变通知宽度。',
      isRead: 1,
      createTime: new Date(Date.now() - 1200000).toISOString(),
      link: null,
      meta: {},
    },
  );
}
const counts: Record<string, number> = {
  todo_reminder: 21,
  system: 3,
  opinion_reply: 128,
  community_feed: 6,
  public_resource: 1,
};
const unread = params.get('unread') === 'off' ? { unreadTotal: 0, byType: {} } : { unreadTotal: 159, byType: counts };
function syncFixtureUnread() {
  const byType: Record<string, number> = Object.fromEntries(Object.keys(counts).map((key) => [key, 0]));
  for (const item of items) if (!item.isRead) byType[item.type] = (byType[item.type] || 0) + 1;
  unread.byType = byType;
  unread.unreadTotal = Object.values(byType).reduce((total, count) => total + count, 0);
}
if (params.has('readToggle')) syncFixtureUnread();
const matchesType = (item: NotificationItem, type: string) =>
  !type || type === 'all' || type === item.type || (type === 'system_group' && item.type === 'system');
// Keep mock responses consistent with count changes while the popover remains open.
window.addEventListener('fixture-notification-unread', (event) => {
  const count = Number((event as CustomEvent<number>).detail) || 0;
  unread.unreadTotal = count * 5;
  unread.byType = Object.fromEntries(Object.keys(counts).map((type) => [type, count]));
  void useNotification().refreshUnread();
});
const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (new URL(url, location.href).pathname === '/api/notification/stream')
    return Promise.resolve(new Response('', { status: 503 }));
  return originalFetch(input, init);
};
request.defaults.adapter = async (config) => {
  const path = String(config.url),
    input = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  let data: unknown = {};
  let status = 200;
  let msg = '';
  if (path.endsWith('/notification/unreadCount')) data = unread;
  else if (path.endsWith('/notification/setReadState')) {
    document.body.dataset.readStateWrites = String(Number(document.body.dataset.readStateWrites || 0) + 1);
    await new Promise((resolve) => setTimeout(resolve, Number(params.get('writeDelay')) || 250));
    const item = items.find((row) => row.id === input.id);
    if (params.has('failRead')) {
      status = 500;
      msg = '演示：状态切换失败，请重试';
    } else if (!item) status = 404;
    else {
      item.isRead = input.isRead ? 1 : 0;
      syncFixtureUnread();
      data = { id: item.id, isRead: Boolean(item.isRead) };
    }
  } else if (path.endsWith('/notification/markRead')) {
    items.forEach((item) => {
      if (input.ids?.includes(item.id)) item.isRead = 1;
    });
    syncFixtureUnread();
  } else if (path.endsWith('/notification/markAllRead')) {
    items.forEach((item) => {
      if (matchesType(item, input.type)) item.isRead = 1;
    });
    if (params.has('readToggle')) syncFixtureUnread();
    else if (!input.type || input.type === 'all') {
      unread.unreadTotal = 0;
      unread.byType = {};
      items.forEach((item) => (item.isRead = 1));
    }
  } else if (path.endsWith('/notification/list'))
    data = {
      items:
        params.get('state') === 'empty'
          ? []
          : items.filter((item) => matchesType(item, input.type)).map((item) => ({ ...item })),
      total: params.get('state') === 'empty' ? 0 : items.filter((item) => matchesType(item, input.type)).length,
      ...unread,
      currentPage: 1,
      pageSize: 20,
    };
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status, data, msg } };
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', name: 'fixture', component: NotificationBell }],
});
const app = createApp({
  render: () =>
    h(
      'main',
      {
        style: page ? 'height:100vh' : 'display:flex;justify-content:flex-end;padding:var(--ui-space-24,24px)',
      },
      [h(NotificationBell, { page })],
    ),
});
app.use(pinia);
app.use(createI18n({ legacy: false, locale: params.get('locale') || 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(router);
globalDirect(app);
await router.isReady();
app.mount('#app');

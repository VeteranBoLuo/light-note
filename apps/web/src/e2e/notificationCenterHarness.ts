import { createApp, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import NotificationBell from '@/components/notification/NotificationBell.vue';
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
const items = [
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
const counts = { todo_reminder: 21, system: 3, opinion_reply: 128, community_feed: 6, public_resource: 1 };
const unread = params.get('unread') === 'off' ? { unreadTotal: 0, byType: {} } : { unreadTotal: 159, byType: counts };
request.defaults.adapter = async (config) => {
  const path = String(config.url),
    input = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  let data: unknown = {};
  if (path.endsWith('/notification/unreadCount')) data = unread;
  else if (path.endsWith('/notification/list'))
    data = {
      items: params.get('state') === 'empty' || !['all', 'public_resource'].includes(input.type) ? [] : items,
      total: params.get('state') === 'empty' ? 0 : 1,
      ...unread,
      currentPage: 1,
      pageSize: 20,
    };
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 200, data } };
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

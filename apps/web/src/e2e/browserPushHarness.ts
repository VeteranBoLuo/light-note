import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { bookmarkStore, useUserStore } from '@/store';
import NotificationBell from '@/components/notification/NotificationBell.vue';
import BrowserPushQuietHoursSettings from '@/components/notification/BrowserPushQuietHoursSettings.vue';
import BrowserPushSettings from '@/components/notification/BrowserPushSettings.vue';
import { useBrowserPush } from '@/composables/useBrowserPush';
import { openNotificationPanel } from '@/utils/notificationEntry';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
const params = new URLSearchParams(location.search);
// Isolated UI fixture: never request real notification permission or bind a real device.
const scenario = params.get('pushState');
let fixtureInvalid = scenario === 'invalid' || scenario === 'error';
let fixtureBinding: any = { id: 'fixture-subscription', generation: 'fixture-generation', userId: 'fixture-user' };
let fixtureSubscription: any;
if (scenario) {
  const makeSubscription = (endpoint: string): any => ({
    options: {},
    toJSON: () => ({ endpoint }),
    unsubscribe: async () => {
      fixtureSubscription = null;
      return true;
    },
  });
  fixtureSubscription = makeSubscription('old-fixture');
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: 'granted', requestPermission: async () => 'granted' },
  });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
  const registration = {
    active: {
      postMessage: (data: any, ports: any[]) => {
        if (data.type === 'push.binding.set') fixtureBinding = data.binding;
        ports[0].postMessage({ binding: fixtureBinding });
      },
    },
    pushManager: {
      getSubscription: async () => fixtureSubscription,
      subscribe: async () => {
        if (scenario === 'error') throw new Error('FIXTURE_SUBSCRIBE_FAILED');
        return (fixtureSubscription = makeSubscription('new-fixture'));
      },
    },
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register: async () => registration, getRegistration: async () => registration },
  });
}
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const targetId = '00000000-0000-4000-8000-000000000001';
const metrics = { writes: [] as string[], lists: [] as any[], retry: 0 };
(window as any).__pushAcceptance = metrics;
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
const items = [
  {
    id: targetId,
    type: 'todo_reminder',
    title: '待办提醒',
    content: '整理本周的阅读笔记',
    meta: { todoId: 'fixture-todo' },
    todoState: 'pending',
    isRead: 0,
    createTime: '2026-09-08 09:00:00',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    type: 'community_chat',
    title: '有人回复了你',
    content: '轻笺用户：这个想法不错，我们可以继续讨论。',
    meta: {},
    isRead: 0,
    createTime: '2026-09-08 08:00:00',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    type: 'system',
    title: '本次整理已完成',
    content: '整理结果已就绪，可以查看并审核建议。',
    meta: {},
    isRead: 1,
    createTime: '2026-09-07 12:00:00',
  },
];
request.defaults.adapter = async (config) => {
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  const url = String(config.url);
  const ok = (data: any) => ({ data: { status: 200, data }, status: 200, statusText: 'OK', headers: {}, config });
  if (url.endsWith('/user/saveUserInfo')) {
    metrics.writes.push(url);
    return ok(null);
  }
  if (url.endsWith('/notification/browser/config'))
    return ok({
      available: Boolean(scenario),
      enabled: Boolean(fixtureBinding) && !fixtureInvalid,
      invalid: fixtureInvalid,
      userId: 'fixture-user',
      publicKey: 'B' + 'A'.repeat(86),
    });
  if (url.endsWith('/notification/browser/subscribe'))
    return ok({ id: 'fixture-subscription', generation: 'new-generation', userId: 'fixture-user' });
  if (url.endsWith('/notification/browser/activate')) {
    fixtureInvalid = false;
    return ok(null);
  }
  if (url.endsWith('/notification/browser/unsubscribe')) return ok(null);
  if (url.endsWith('/notification/unreadCount'))
    return ok({ unreadTotal: 2, byType: { todo_reminder: 1, community_chat: 1 } });
  if (url.endsWith('/notification/list')) {
    metrics.lists.push(body);
    if (params.get('target') === 'error' && body.notificationId && metrics.retry++ === 0)
      throw new Error('FIXTURE_LOCATE_FAILURE');
    return ok({
      items,
      total: body.notificationId ? 43 : 3,
      currentPage: body.notificationId ? 3 : 1,
      pageSize: 20,
      unreadTotal: 2,
      targetFound: params.get('target') !== 'missing',
    });
  }
  if (/\/notification\/(markRead|markAllRead|delete)$/.test(url)) {
    metrics.writes.push(url);
    return ok(null);
  }
  if (url.includes('/common/recordOperation')) return ok(null);
  throw new Error('UNEXPECTED_PUSH_FIXTURE_REQUEST');
};
const pinia = createPinia();
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { render: () => null } },
    { path: '/notifications', name: 'notifications', component: { render: () => null } },
    { path: '/settings', component: { render: () => null } },
  ],
});
const page = params.get('panel') !== 'popover';
const app = createApp({
  render: () =>
    h(
      'main',
      {
        style: page
          ? 'max-width:920px;height:100vh;margin:auto;display:flex;flex-direction:column;padding:16px;box-sizing:border-box;background:var(--background-color);color:var(--text-color)'
          : 'padding:28px;display:flex;justify-content:flex-end;background:var(--background-color);min-height:100vh',
      },
      [...(page ? [h(BrowserPushSettings), h(BrowserPushQuietHoursSettings)] : []), h(NotificationBell, { page })],
    ),
});
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
useUserStore(pinia).setUserInfo({
  id: 'fixture-user',
  role: 'user',
  alias: 'Fixture',
  preferences: { theme, lang: locale, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;
globalDirect(app);
await router.push(
  page ? { name: 'notifications', query: { notificationId: targetId, pushOwner: 'fixture-user' } } : '/',
);
app.mount('#app');
await nextTick();
if (!page) openNotificationPanel(targetId);
(window as any).__setPushState = (state: any) => {
  const push = useBrowserPush();
  push.state.value = state;
  push.enabled.value = state === 'on';
  push.preferred.value = state !== 'off';
};

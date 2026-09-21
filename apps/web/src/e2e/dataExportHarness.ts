import { createApp, h } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import Settings from '@/view/settings/Settings.vue';
import { useUserStore } from '@/store';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import request from '@/http/request';
import { bookmarkStore } from '@/store';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
let task: any = params.has('state')
  ? {
      id: 'test-task',
      status: params.get('state'),
      stage: params.get('state') === 'running' ? 'notes' : 'ready',
      options: { types: ['notes', 'bookmarks'], noteFormat: 'html', includeImages: true },
      total: 120,
      completed: params.get('state') === 'running' ? 36 : 119,
      failed: params.get('state') === 'partial' ? 1 : 0,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      canDownload: ['completed', 'partial'].includes(params.get('state') || ''),
    }
  : null;
request.defaults.adapter = async (config) => {
  const url = String(config.url);
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  let data: any = task;
  if (url.endsWith('/create')) {
    task = {
      id: 'test-task',
      status: 'running',
      stage: 'notes',
      options: body,
      total: 120,
      completed: 36,
      failed: 0,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      canDownload: false,
    };
    data = task;
  }
  if (url.endsWith('/cancel')) {
    task = { ...task, status: 'cancelled', canDownload: false };
    data = task;
  }
  if (url.endsWith('/failures')) data = [{ title: '图片未能完整下载的笔记', code: 'DATA_EXPORT_IMAGE_FAILED' }];
  return { data: { status: 200, data, msg: 'ok' }, status: 200, statusText: 'OK', headers: {}, config };
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
await router.push({ path: '/settings', query: { section: params.get('section') || 'export' } });
const app = createApp({ setup: () => () => h('main', { style: 'width:100%;height:100vh;display:flex;' }, [h(Settings, { style: "width:100%;" })]) });
const pinia = createPinia();
app.use(pinia);
app.use(router);
const user = useUserStore(pinia);
user.setUserInfo({ id: 'export-acceptance', role: 'user', preferences: { theme: params.get('theme') || 'day', noteViewMode: 'card' } });
bookmarkStore(pinia).screenWidth = window.innerWidth;
window.addEventListener('resize', () => { bookmarkStore(pinia).screenWidth = window.innerWidth; });
app.use(
  createI18n({
    legacy: false,
    locale: params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN',
    messages: { 'zh-CN': zh, 'en-US': en },
  }),
);
app.use(globalDirect);
app.mount('#app');

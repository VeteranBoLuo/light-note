import { createApp, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createI18n } from 'vue-i18n';
import request from '@/http/request';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import globalDirect from '@/config/globalDirect';
import Settings from '@/view/settings/Settings.vue';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// Entire settings page with disposable account data. Every API request is intercepted.
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const storeKey = `manor-reminder-fixture:${params.get('case') || 'default'}`;
const pinia = createPinia();
setActivePinia(pinia);
const user = useUserStore();
const preferences = {
  theme: params.get('theme') === 'night' ? 'night' : 'day',
  lang: locale,
  ...JSON.parse(localStorage.getItem(storeKey) || '{}'),
};
if (params.get('state') === 'off') preferences.notifyManor = false;
if (['on', 'child-off', 'in-app-off'].includes(params.get('state') || '')) preferences.notifyManor = true;
if (params.get('state') === 'child-off') preferences.notifyManorDigest = false;
if (params.get('state') === 'in-app-off') preferences.notificationsInApp = false;
user.$patch({
  id: 'manor-reminder-fixture',
  role: params.has('guest') ? 'visitor' : 'user',
  preferences,
  adminContext: params.has('admin')
    ? ({ id: 'fixture-preview', subjectUserId: 'fixture-owner', mode: 'readonly' } as never)
    : null,
});
bookmarkStore().screenWidth = innerWidth;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.body.style.cssText = 'display:block;margin:0;background:var(--background-color);color:var(--text-color)';
document.getElementById('app')!.style.cssText = 'width:100%;max-width:none;margin:0;height:100vh';
applyUiDensity(params.get('density') || 'medium', mobile);
if (params.has('unsupported')) {
  const supports = CSS.supports.bind(CSS);
  CSS.supports = ((property: string, value?: string) =>
    property === 'container-type' || property === 'translate'
      ? false
      : value === undefined
        ? supports(property)
        : supports(property, value)) as typeof CSS.supports;
}
let writes = 0;
request.defaults.adapter = async (config) => {
  const path = String(config.url || ''),
    input = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  let data: unknown = {},
    status = 200,
    msg = '';
  if (path.endsWith('/growth/me'))
    data = { level: 3, exp: 40, points: 120, features: { manor: !params.has('closed') } };
  else if (path.endsWith('/user/saveUserInfo')) {
    writes++;
    document.body.dataset.preferenceWrites = String(writes);
    await new Promise((resolve) => setTimeout(resolve, params.has('slowSave') ? 1500 : 100));
    if (params.has('failSave') && writes === 1) {
      status = 500;
      msg = '夹具模拟保存失败';
    } else localStorage.setItem(storeKey, input.preferences);
  } else if (path.includes('/community/chat/notification')) data = { globalEnabled: true, rootAllMessages: false };
  return { data: { status, data, msg }, status: 200, statusText: 'OK', headers: {}, config };
};
const originalFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (new URL(url, location.href).pathname.startsWith('/api/'))
    return Promise.resolve(
      new Response(JSON.stringify({ status: 200, data: {} }), { headers: { 'content-type': 'application/json' } }),
    );
  return originalFetch(input, init);
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
await router.push({ path: '/settings', query: params.has('index') ? {} : { section: 'notification' } });
const app = createApp({ render: () => h(Settings) });
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
app.mount('#app');

import { createApp, h, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { RouterView, createMemoryHistory, createRouter } from 'vue-router';
import { createI18n } from 'vue-i18n';
import request from '@/http/request';
import { bookmarkStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';
import { setLocale } from '@/i18n';
import GithubCallBack from '@/view/auth/callback/GithubCallBack.vue';
import '@/assets/css/index.less';

// 本地内存验收；所有 API 均在本页应答，不发邮件、不连接 GitHub、不绑定真实账号或签发会话。
const params = new URLSearchParams(location.search);
const pinia = createPinia();
setActivePinia(pinia);
const bookmark = bookmarkStore(pinia);
bookmark.screenWidth = innerWidth;
const mobile = params.get('renderProfile') === 'mobile' || bookmark.isMobile;
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  mobile,
);
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
setLocale(locale);
const outcome = ref('本地验收：已返回邮箱登录');
request.defaults.adapter = async (config) => ({
  data: { status: 409, data: params.has('legacy') ? { bindingRequired: true } : { code: 'GITHUB_OAUTH_EMAIL_CONFLICT', retryable: false } },
  status: 200, statusText: 'OK', config, headers: {},
});
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/auth/callback', component: GithubCallBack },
    { path: '/', component: { setup: () => () => h('p', outcome.value) } },
  ],
});
await router.push({ path: '/auth/callback', query: { code: crypto.randomUUID(), state: 'local-ui-binding-state' } });
createApp({ render: () => h('main', { style: { width: '100%' } }, [h(RouterView)]) })
  .use(pinia)
  .use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zhCN, 'en-US': enUS } }))
  .use(router)
  .directive('auto-scrollbar', {})
  .mount('#app');

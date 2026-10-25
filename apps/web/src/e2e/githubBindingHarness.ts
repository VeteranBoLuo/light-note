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
request.defaults.adapter = async (config) => {
  let status = 200;
  let data: any = [];
  let msg = '';
  if (config.url === '/api/user/github') {
    status = params.has('networkError') ? 503 : 409;
    data = params.has('networkError')
      ? { code: 'GITHUB_OAUTH_TOKEN_RESULT_UNKNOWN', requestId: 'local-only-reference' }
      : { bindingRequired: true, maskedEmail: 'fi***@example.com', githubLogin: 'fixture-user' };
    if (params.has('networkError')) msg = 'GitHub 网络暂时不稳定，请重新授权或使用邮箱登录';
  } else if (config.url?.endsWith('/github/bind')) {
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    if (!body.confirm) data = { cancelled: true };
    else if (params.has('expired')) {
      status = 409;
      data = { code: 'GITHUB_OAUTH_STATE_EXPIRED' };
      msg = '绑定请求已过期，请重新授权';
    } else {
      data = { sid: 'local-fixture-session' };
      outcome.value = '本地验收：已确认绑定并登录';
    }
  } else if (config.url === '/api/user/me')
    data = { id: 'fixture-user', alias: '测试账号', role: 'user', preferences: {} };
  return { data: { status, data, msg }, status: 200, statusText: 'OK', config, headers: {} };
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/auth/callback', component: GithubCallBack },
    { path: '/', component: { setup: () => () => h('p', outcome.value) } },
    { path: '/:pathMatch(.*)*', component: { setup: () => () => h('p', outcome.value) } },
  ],
});
await router.push({ path: '/auth/callback', query: { code: crypto.randomUUID(), state: crypto.randomUUID() } });
createApp({ render: () => h('main', { style: { width: '100%' } }, [h(RouterView)]) })
  .use(pinia)
  .use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zhCN, 'en-US': enUS } }))
  .use(router)
  .directive('auto-scrollbar', {})
  .mount('#app');

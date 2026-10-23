import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { applyUiDensity } from '@/composables/useUiDensity';
import globalDirect from '@/config/globalDirect';
import { bookmarkStore, useUserStore } from '@/store';
import request from '@/http/request';
import { setLocale } from '@/i18n';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import AccountSecurity from '@/components/settings/AccountSecurity.vue';
import '@/assets/css/index.less';

// 独立本地内存验收，所有 API 就地应答，不接触真实账号、验证码、邮件或 GitHub。
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
const locale = params.get('lang') === 'en' ? 'en-US' : 'zh-CN';
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  mobile,
);
setLocale(locale);
document.body.style.cssText = 'display:block;margin:0';
document.getElementById('app')!.style.cssText = 'width:100%;min-height:100vh';
let email = 'fixture@example.com';
let confirms = 0;
request.defaults.adapter = async (config) => {
  let data: any = {},
    status = 200,
    msg = '';
  const hasPassword = params.get('state') !== 'github';
  if (config.url?.endsWith('/me'))
    data = { id: 'fixture-user', role: 'user', email, githubId: '123', loginType: 'local', hasPassword };
  if (config.url?.endsWith('/email-change/status')) {
    if (params.has('loadError')) {
      status = 500;
      msg = '本地模拟：加载失败';
    }
    data = { email, hasPassword, githubBound: true, recentGithub: !hasPassword && !params.has('stale') };
  }
  if (config.url?.endsWith('/getMySessions'))
    data = [{ id: 'here', current: true, userAgent: 'Macintosh Chrome', lastActiveTime: '2026-10-23 12:00:00' }];
  if (config.url?.endsWith('/email-change/request'))
    data = { challenge: 'local-only-email-ticket', maskedEmail: 'ne***@example.com', resendAfter: 60 };
  if (config.url?.endsWith('/email-change/confirm')) {
    if (params.has('error') && ++confirms === 1) {
      status = 400;
      msg = locale === 'en-US' ? 'The code is incorrect or expired.' : '验证码错误或已过期，请重新获取';
    } else {
      email = 'new@example.com';
      data = { email };
    }
  }
  return { data: { status, data, msg }, status: 200, statusText: 'OK', headers: {}, config };
};
const app = createApp({
  render: () =>
    h('main', { style: 'max-width:var(--ui-layout-960,960px);margin:0 auto;padding:var(--ui-space-24,24px)' }, [
      h(AccountSecurity),
    ]),
});
app.use(createPinia());
app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] }));
useUserStore().$patch({ id: 'fixture-user', role: 'user' });
bookmarkStore().screenWidth = innerWidth;
globalDirect(app);
app.mount('#app');
window.addEventListener('light-note:auth-expired', () => (document.body.dataset.signedOut = 'true'));

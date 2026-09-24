import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { densityCssVariables, type UiDensity } from '@/config/uiDensity';
import globalDirect from '@/config/globalDirect';
import { bookmarkStore, useUserStore } from '@/store';
import request from '@/http/request';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import AccountSecurity from '@/components/settings/AccountSecurity.vue';
import '@/assets/css/index.less';
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
for (const [key, value] of Object.entries(
  densityCssVariables(mobile ? 'standard' : ((params.get('density') || 'standard') as UiDensity)),
)) {
  document.documentElement.style.setProperty(key, value);
}
document.body.style.cssText = 'display:block;margin:0';
document.getElementById('app')!.style.cssText = 'width:100%;min-height:100vh';
let submits = 0;
request.defaults.adapter = async (config) => {
  let data: any = {};
  let status = 200;
  let msg = '';
  if (config.url?.endsWith('/me'))
    data = {
      id: 'fixture-user',
      role: 'user',
      email: 'fixture@example.com',
      githubId: '123',
      loginType: 'github',
      hasPassword: params.get('state') === 'set' ? true : params.get('state') === 'legacy' ? null : false,
    };
  if (config.url?.endsWith('/getMySessions'))
    data = [{ id: 'current', current: true, userAgent: 'Windows Chrome', lastActiveTime: '2026-09-24 12:00:00' }];
  if (config.url?.endsWith('/configPassword') && params.has('error') && ++submits === 1) {
    status = 400;
    msg = '验证码错误或已过期';
  }
  return { data: { status, data, msg }, status: 200, statusText: 'OK', headers: {}, config };
};
const app = createApp({
  render: () => h('main', { style: 'max-width:960px;margin:0 auto;padding:24px' }, [h(AccountSecurity)]),
});
app.use(createPinia());
app.use(
  createI18n({
    legacy: false,
    locale: params.get('lang') === 'en' ? 'en-US' : 'zh-CN',
    messages: { 'zh-CN': zh, 'en-US': en },
  }),
);
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] }));
useUserStore().$patch({ id: 'fixture-user', role: 'user' });
bookmarkStore().screenWidth = window.innerWidth;
globalDirect(app);
app.mount('#app');
window.addEventListener('light-note:auth-expired', () => (document.body.dataset.signedOut = 'true'));

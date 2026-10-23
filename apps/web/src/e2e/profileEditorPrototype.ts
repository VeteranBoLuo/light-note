import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { applyUiDensity } from '@/composables/useUiDensity';
import globalDirect from '@/config/globalDirect';
import { bookmarkStore, useUserStore } from '@/store';
import request from '@/http/request';
import { setLocale } from '@/i18n';
import zh from '@/i18n/locales/zh-CN';
import Prototype from './ProfileEditorPrototype.vue';
import '@/assets/css/index.less';

// 独立原型，资料和请求只保存在本页内存；不读取账号，也不发送真实邮件。
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  mobile,
);
setLocale('zh-CN');
document.body.style.cssText = 'display:block;margin:0';
document.getElementById('app')!.style.cssText = 'width:100%;min-height:100vh';
request.defaults.adapter = async (config) => {
  let data: unknown;
  if (config.url?.endsWith('/email-change/status')) {
    data = { email: 'demo@example.com', hasPassword: true, githubBound: false, recentGithub: false };
  } else if (config.url?.endsWith('/email-change/request')) {
    data = { challenge: 'prototype-memory-ticket', maskedEmail: 'ne***@example.com', resendAfter: 60 };
  } else if (config.url?.endsWith('/email-change/confirm')) {
    data = { email: 'new@example.com' };
  } else {
    throw new Error('PROTOTYPE_NETWORK_DISABLED');
  }
  return { data: { status: 200, data, msg: '' }, status: 200, statusText: 'OK', headers: {}, config };
};
const app = createApp(Prototype);
app.use(createPinia());
app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Prototype }] }));
useUserStore().$patch({ id: 'profile-prototype', role: 'user', email: 'demo@example.com' });
bookmarkStore().screenWidth = innerWidth;
globalDirect(app);
app.mount('#app');

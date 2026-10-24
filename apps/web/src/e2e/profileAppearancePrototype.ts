import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { applyUiDensity } from '@/composables/useUiDensity';
import request from '@/http/request';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';
import Prototype from './ProfileAppearancePrototype.vue';

// 原型所有操作仅影响本页内存；不读取账号，也不透传网络请求。
request.defaults.adapter = async () => {
  throw new Error('PROTOTYPE_NETWORK_DISABLED');
};
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
const mobile = params.get('renderProfile') === 'mobile' || innerWidth < 768;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  mobile,
);
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Prototype }] });
createApp(Prototype)
  .use(createPinia())
  .use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }))
  .use(router)
  .directive('auto-scrollbar', {})
  .mount('#app');

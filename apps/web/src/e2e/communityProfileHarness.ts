import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import request from '@/http/request';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
import Harness from './CommunityProfileHarness.vue';

const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
applyUiDensity(params.get('density'), mobile);
request.defaults.adapter = async (config) => ({
  config,
  status: 200,
  statusText: 'OK',
  headers: {},
  data: { status: 200, data: {} },
});
const pinia = createPinia();
const user = useUserStore(pinia);
user.id = params.get('state') === 'visitor' ? '' : 'community-profile-fixture';
user.role = params.get('state') === 'visitor' ? 'visitor' : 'user';
createApp(Harness)
  .use(pinia)
  .use(
    createI18n({
      legacy: false,
      locale: params.get('locale') || 'zh-CN',
      fallbackLocale: 'zh-CN',
      messages: { 'zh-CN': zhCN, 'en-US': enUS },
    }),
  )
  .directive('auto-scrollbar', {})
  .mount('#app');

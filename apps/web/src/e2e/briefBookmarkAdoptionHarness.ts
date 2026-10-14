import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { bookmarkStore, useUserStore } from '@/store';
import DailyBriefCard from '@/components/workbenches/DailyBriefCard.vue';
import { useUserActivity } from '@/composables/useUserActivity';
import { densityCssVariables, resolveUiDensity } from '@/config/uiDensity';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// Uses actual components; browser acceptance intercepts all network requests.
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
document.documentElement.dataset.theme = params.get('theme') || 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
for (const [key, value] of Object.entries(densityCssVariables(resolveUiDensity(params.get('density')))))
  document.documentElement.style.setProperty(key, value);
const pinia = createPinia();
const user = useUserStore(pinia);
user.setUserInfo({
  id: 'brief-fixture',
  role: params.get('role') || 'user',
  alias: 'Fixture',
  preferences: {
    openBookmarkIn: params.get('openIn') === 'current' ? 'current' : 'newTab',
    theme: params.get('theme') || 'day',
    noteViewMode: 'card',
  },
});
if (params.get('preview')) user.adminContext = { mode: 'readonly', id: 'preview-fixture' } as any;
bookmarkStore(pinia).screenWidth = window.innerWidth;
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
const app = createApp({
  setup() {
    useUserActivity();
    return () =>
      h(DailyBriefCard, {
        eligible: true,
        ownerKey: 'brief-fixture',
        compact: mobile,
        readOnly: Boolean(user.adminContext),
      });
  },
});
app
  .use(pinia)
  .use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }))
  .use(router);
globalDirect(app);
app.mount('#app');

import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { applyUiDensity } from '@/composables/useUiDensity';
import { bookmarkStore, useUserStore } from '@/store';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import Panel from '@/components/communityChat/CommunityChatNotificationSettingsPanel.vue';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
// Isolated fixture: all requests are intercepted; no live account or chat messages.
const params = new URLSearchParams(location.search);
const settings = { enabled: !params.has('disabled'), level: 'mentions', rootAllMessages: !params.has('off') };
const control = { failLoad: params.has('error'), failSave: params.has('failSave') };
request.defaults.adapter = async (config) => {
  let data: unknown = {};
  if (String(config.url).includes('/notifications')) {
    if (config.method === 'put') {
      if (control.failSave) throw new Error('Fixture save failure');
      Object.assign(settings, typeof config.data === 'string' ? JSON.parse(config.data) : config.data);
    } else if (control.failLoad) throw new Error('Fixture load failure');
    data = { ...settings };
  }
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 200, data } };
};
document.documentElement.dataset.theme = params.get('theme') || 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  params.get('renderProfile') === 'mobile',
);
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Panel }] });
const app = createApp({
  setup() {
    const user = useUserStore();
    user.$patch({ id: 'fixture-root', role: params.has('ordinary') ? 'user' : 'root' });
    user.preferences.notificationsInApp = !params.has('inAppOff');
    bookmarkStore().screenWidth = innerWidth;
    Object.assign(window, { rootChatFixture: { user, control, settings } });
    return () =>
      h(
        'main',
        {
          style:
            'width:min(100%,var(--ui-layout-640,640px));padding:var(--ui-space-20,20px);margin:auto;box-sizing:border-box',
        },
        [h(Panel, { compact: !params.has('expanded') })],
      );
  },
});
app.use(createPinia());
app.use(createI18n({ legacy: false, locale: params.get('locale') || 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(router);
globalDirect(app);
await router.isReady();
app.mount('#app');

import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { bookmarkStore, useUserStore } from '@/store';
import CoreUsageReport from '@/view/admin/components/productInsights/CoreUsageReport.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import { useUserActivity } from '@/composables/useUserActivity';
import { captureResourceOpen } from '@/utils/resourceReuseRuntime';
import { openBookmarkUrl } from '@/utils/openBookmark';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// Browser tests intercept every API request; this page must never use real account data.
const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
document.documentElement.dataset.theme = params.get('theme') || 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
const pinia = createPinia();
const user = useUserStore(pinia);
user.setUserInfo({
  id: 'reuse-fixture',
  role: 'user',
  alias: 'Fixture',
  preferences: { lang: locale, theme: 'day', noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;
const app = createApp({
  setup() {
    useUserActivity();
    (window as any).__reuseFixture = {
      automatic: () => captureResourceOpen()('note', 'fixture-note'),
      role: (role: string) => {
        user.role = role;
      },
      preview: (enabled: boolean) => {
        user.adminContext = enabled ? ({ mode: 'readonly' } as any) : null;
      },
    };
    return () =>
      h('main', { style: 'padding:20px;max-width:1100px;margin:auto;color:var(--text-color)' }, [
        h(CoreUsageReport, { days: 30 }),
        h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;margin-top:24px' }, [
          h(
            BButton,
            {
              id: 'open-bookmark',
              onClick: () => openBookmarkUrl('https://example.invalid', { resourceId: 'fixture-bookmark' }),
            },
            () => '打开书签',
          ),
          h(
            BButton,
            {
              id: 'open-note',
              onClick: () => {
                const opened = captureResourceOpen();
                setTimeout(() => opened('note', 'fixture-note'), 50);
              },
            },
            () => '打开笔记',
          ),
          h('div', { 'data-reuse-resource-type': 'file', 'data-reuse-resource-id': '12' }, [
            h(BButton, { id: 'use-file' }, () => '在文件预览中操作'),
          ]),
        ]),
      ]);
  },
});
app
  .use(pinia)
  .use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] }));
app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
app.mount('#app');

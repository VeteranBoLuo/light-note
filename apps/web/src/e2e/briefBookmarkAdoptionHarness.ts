import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { bookmarkStore, useUserStore } from '@/store';
import DailyBriefCard from '@/components/workbenches/DailyBriefCard.vue';
import { useUserActivity } from '@/composables/useUserActivity';
import { densityCssVariables, resolveUiDensity } from '@/config/uiDensity';
import globalDirect from '@/config/globalDirect';
import request from '@/http/request';
import BButton from '@/components/base/BasicComponents/BButton.vue';
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
const isolated = params.get('scenario') === 'release';
const owner = ref('brief-fixture');
let refreshed = false;
if (isolated) {
  // Native-browser acceptance uses the real card/composable with no business API or Provider access.
  request.defaults.adapter = async (config) => {
    const path = new URL(config.url || '', 'http://fixture.invalid').pathname;
    if (path.endsWith('/refresh')) refreshed = true;
    const second = owner.value !== 'brief-fixture';
    const english = params.get('locale') === 'en-US';
    const brief = {
      version: 2,
      date: '2026-10-24',
      generatedBy: 'facts',
      headline: second
        ? english
          ? 'Account B: no resources added today.'
          : '账号乙：今天暂无新增资源'
        : english
          ? 'Account A: 2 notes added today.'
          : '账号甲：今天新增 2 篇笔记',
      insights: [],
      recommendation: '',
      adviceStatus: refreshed ? 'deferred' : 'no_value',
      lastAdviceResult: { adviceStatus: 'no_value', recommendation: '' },
      sections: [],
    };
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: {
        status: 200,
        msg: '',
        data: {
          featureEnabled: true,
          enabled: true,
          autoUpdate: true,
          status: 'ready',
          brief,
          date: brief.date,
          nextDateAt: '2099-10-25T00:00:00+08:00',
          generatedAt: '2026-10-24T02:00:00+08:00',
          dataAsOf: '2026-10-24T02:00:00+08:00',
          lastErrorCode: null,
          stale: false,
          shouldGenerate: false,
        },
      },
    };
  };
}
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
router.afterEach((to) => {
  document.documentElement.dataset.briefNavigation = to.fullPath;
});
const app = createApp({
  setup() {
    useUserActivity();
    const card = () =>
      h(DailyBriefCard, {
        eligible: true,
        ownerKey: owner.value,
        compact: mobile,
        readOnly: Boolean(user.adminContext),
      });
    return () =>
      isolated
        ? h('main', [
            h(
              BButton,
              {
                onClick: () => {
                  owner.value = owner.value === 'brief-fixture' ? 'brief-second' : 'brief-fixture';
                  refreshed = false;
                  user.setUserInfo({ ...user.$state, id: owner.value } as any);
                },
              },
              () => '切换验收账号',
            ),
            card(),
          ])
        : card();
  },
});
app
  .use(pinia)
  .use(
    createI18n({
      legacy: false,
      locale: params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN',
      messages: { 'zh-CN': zh, 'en-US': en },
    }),
  )
  .use(router);
globalDirect(app);
app.mount('#app');

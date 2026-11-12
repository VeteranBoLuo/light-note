import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { bookmarkStore, useUserStore } from '@/store';
import BookmarkEdit from '@/components/manage/bookmarkEditMg/BookmarkEdit.vue';
import BookmarkEditMobile from '@/components/manage/bookmarkEditMg/BookmarkEditMobile.vue';
import QuickSave from '@/view/quickSave/QuickSave.vue';
import ProductInsights from '@/view/admin/components/productInsights/ProductInsights.vue';
import { densityCssVariables, resolveUiDensity } from '@/config/uiDensity';
import globalDirect from '@/config/globalDirect';
import i18n from '@/i18n';
import en from '@/i18n/locales/en-US-core';
import request from '@/http/request';
import { resolveBookmarkUrlInput } from '@lightnote/shared';
import '@/assets/css/index.less';

// Test-only entry. The browser runner must intercept every API and block external requests.
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const view = params.get('view') || 'bookmark';
const recognitionFailure = params.get('recognitionFailure');
if (
  recognitionFailure &&
  [
    'BOOKMARK_PAGE_NOT_FOUND',
    'BOOKMARK_PAGE_DNS_FAILED',
    'BOOKMARK_PAGE_TLS_FAILED',
    'BOOKMARK_PAGE_TLS_HANDSHAKE_FAILED',
    'empty-result',
  ].includes(recognitionFailure)
) {
  // 独立错误验收只使用本地夹具，未登记的请求失败关闭。
  let recognitionAttempts = 0;
  request.defaults.adapter = async (config) => {
    const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
    let data: unknown;
    if (config.url === '/api/bookmark/queryTagList') data = [];
    else if (config.url === '/api/bookmark/resolveUrl') data = resolveBookmarkUrlInput(payload.url);
    else if (config.url === '/api/ai/skills/config') {
      data = {
        protocolVersion: 1,
        kernelEnabled: true,
        skills: { bookmark: true },
        availableSkills: [{ id: 'bookmark.parse_url', version: 1, domain: 'bookmark', effect: 'preview' }],
      };
    } else if (config.url === '/api/ai/skills/execute') {
      recognitionAttempts += 1;
      const failedAttempt = recognitionAttempts === 1 || params.get('recognitionRecover') !== '1';
      if (failedAttempt && recognitionFailure !== 'empty-result') {
        const status = ['BOOKMARK_PAGE_DNS_FAILED', 'BOOKMARK_PAGE_TLS_HANDSHAKE_FAILED'].includes(recognitionFailure)
          ? 503
          : 422;
        return {
          config,
          status: 200,
          statusText: 'OK',
          headers: {},
          data: { status, msg: 'Local recognition failure fixture', data: { code: recognitionFailure } },
        };
      }
      data = {
        protocolVersion: 1,
        requestId: payload.requestId,
        skillId: payload.skillId,
        skillVersion: payload.skillVersion,
        status: 'completed',
        threadId: null,
        scopeDigest: null,
        result: {
          kind: 'field_suggestions',
          fields:
            failedAttempt && recognitionFailure === 'empty-result'
              ? { name: '', description: '', matchedTagIds: [], newTags: [] }
              : { name: '读取成功的真实标题', description: '恢复后的网页说明', matchedTagIds: [], newTags: [] },
        },
        sources: [],
        coverage: null,
        availableActions: [],
        receipt: null,
        error: null,
      };
    } else if (['/api/common/recordAiEvent', '/api/common/recordOperationLogs'].includes(String(config.url)))
      data = null;
    else throw new Error(`Unexpected recognition fixture request: ${config.url}`);
    return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 200, msg: 'ok', data } };
  };
}
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
for (const [key, value] of Object.entries(
  densityCssVariables(resolveUiDensity(params.get('density'), mobile || view === 'quick')),
)) {
  document.documentElement.style.setProperty(key, value);
}
i18n.global.setLocaleMessage('en-US', en);
(i18n.global.locale.value as string) = locale;
const pinia = createPinia();
useUserStore(pinia).setUserInfo({
  id: 'adoption-fixture',
  role: 'user',
  alias: 'Fixture',
  preferences: { lang: locale, theme, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/bookmark/:id', component: mobile ? BookmarkEditMobile : BookmarkEdit },
    { path: '/quickSave', component: QuickSave },
    { path: '/insights', component: ProductInsights },
    { path: '/:pathMatch(.*)*', component: { render: () => h('p', { id: 'saved-destination' }, '已保存') } },
  ],
});
const app = createApp({ render: () => h(RouterView) });
app.use(pinia).use(router).use(i18n);
globalDirect(app);
await router.push(
  view === 'admin'
    ? '/insights'
    : view === 'quick'
      ? '/quickSave?mode=formal&url=https%3A%2F%2Fexample.com%2Farticle'
      : '/bookmark/add',
);
await router.isReady();
app.mount('#app');

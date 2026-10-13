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
import '@/assets/css/index.less';

// Test-only entry. The browser runner must intercept every API and block external requests.
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const view = params.get('view') || 'bookmark';
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

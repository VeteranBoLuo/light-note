import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import TagFilterSelector from '@/components/noteLibrary/library/TagFilterSelector.vue';
import i18n, { setLocale } from '@/i18n';
import { bookmarkStore, useUserStore } from '@/store';
import globalDirect from '@/config/globalDirect';
import { applyUiDensity } from '@/composables/useUiDensity';
import request from '@/http/request';
import '@/assets/css/index.less';

// Synthetic tags only; no account data or API writes.
const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
await setLocale(params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN');
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
request.defaults.adapter = async (config) => ({
  data: { status: 200, data: {}, msg: '' },
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
const names = params.has('empty')
  ? []
  : ['健身', 'SSL', '证书', '椅子', 'CS2', ...Array.from({ length: 20 }, (_, i) => `长期项目记录与阅读计划 ${i + 1}`)];
const app = createApp({
  setup() {
    const store = bookmarkStore();
    useUserStore().preferences.theme = theme;
    const sync = () => {
      store.screenWidth = innerWidth;
      store.screenHeight = innerHeight;
      applyUiDensity(params.get('density'), !store.isDesktop);
    };
    sync();
    window.addEventListener('resize', sync);
    return () =>
      h('main', { style: 'box-sizing:border-box;width:100%;padding:24px;display:flex;justify-content:flex-end' }, [
        h(TagFilterSelector, { allTags: names.map((name, i) => ({ id: String(i), name })) }),
        h('output', { style: 'position:fixed;bottom:24px;left:24px' }, JSON.stringify(router.currentRoute.value.query)),
      ]);
  },
});
app.use(createPinia());
app.use(i18n);
app.use(router);
globalDirect(app);
await router.isReady();
document.getElementById('app')!.style.cssText = 'width:100%;height:100vh';
app.mount('#app');

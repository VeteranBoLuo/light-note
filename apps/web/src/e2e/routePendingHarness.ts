import { createApp, defineComponent, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, createWebHashHistory, RouterView, useRoute } from 'vue-router';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { bookmarkStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import { installRoutePending } from '@/utils/routePending';
import { isMobileShellRoute } from '@/config/mobileNavigation';
import MainLayout from '@/view/index.vue';
import MobileAppShell from '@/components/mobile/MobileAppShell.vue';
import '@/assets/css/index.less';

// 本地验收：真实主布局、PC 导航与手机外壳（与根组件一样按路由声明启用）；目标模块按 delay 参数延迟“下载”，接口全部返回空数据。
// /personCenter 与线上一致位于主布局之外，用于验证进出“我的”页时的等待态。
// profile=real 时改用真实“我的”页与带条目状态的浏览历史，用于验证返回时恢复滚动位置。
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
const delay = Math.max(0, Number(params.get('delay') ?? 2500) || 0);
const realProfile = params.get('profile') === 'real';
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
applyUiDensity(params.get('density'), mobile);
request.defaults.adapter = async (config) => ({
  data: { status: 200, data: null, msg: '' },
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});

const pageOf = (title: string) =>
  defineComponent({
    name: `RoutePendingFixture${title}`,
    setup: () => () => h('section', { style: 'padding:24px', 'data-fixture-page': title }, [h('h1', title)]),
  });
const delayed = (title: string) => () =>
  new Promise<ReturnType<typeof pageOf>>((resolve) => setTimeout(() => resolve(pageOf(title)), delay));

const router = createRouter({
  history: realProfile ? createWebHashHistory() : createMemoryHistory(),
  routes: [
    {
      path: '/',
      component: MainLayout,
      children: [
        { path: '', redirect: '/workbenches' },
        { path: 'workbenches', name: 'workbenches', component: pageOf('工作台'), meta: { mobileShell: 'today', mobileBottomNav: true } },
        { path: 'inbox', name: 'inbox', component: delayed('待办'), meta: { mobileShell: 'todo', mobileBottomNav: true } },
        { path: 'growth', name: 'growth', component: delayed('成长中心') },
        { path: 'settings', name: 'settings', component: delayed('设置') },
        { path: 'support', name: 'support', component: delayed('支持轻笺') },
      ],
    },
    {
      path: '/personCenter',
      name: 'personCenter',
      component: realProfile
        ? () =>
            new Promise((resolve) => setTimeout(resolve, delay)).then(() => import('@/view/personCenter/PersonCenterMobile.vue'))
        : delayed('我的'),
      meta: { mobileShell: 'profile', mobileBottomNav: true },
    },
  ],
});
installRoutePending(router);
const committed = ref(0);
router.afterEach(() => committed.value++);
(window as any).__routePendingHarness = { go: (path: string) => router.push(path).catch(() => undefined), committed };

const app = createApp({
  setup() {
    const bookmark = bookmarkStore();
    const sync = () => {
      bookmark.screenWidth = innerWidth;
      bookmark.screenHeight = innerHeight;
    };
    sync();
    window.addEventListener('resize', sync);
    const route = useRoute();
    return () =>
      mobile
        ? h(
            MobileAppShell,
            {
              enabled: isMobileShellRoute(true, route.meta),
              showTopBar: route.meta.mobileTopBar !== false,
              showTopSwitcher: false,
              showBottomNav: route.meta.mobileBottomNav === true,
            },
            () => h(RouterView),
          )
        : h(RouterView);
  },
});
app.use(createPinia());
app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(router);
globalDirect(app);
await router.push('/workbenches');
await router.isReady();
app.mount('#app');

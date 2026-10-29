import { createApp, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createWebHashHistory, RouterView } from 'vue-router';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { bookmarkStore, useUserStore } from '@/store';
import request from '@/http/request';
import { applyUiDensity } from '@/composables/useUiDensity';
import ManorManagement from '@/view/admin/components/manorManagement/ManorManagement.vue';
import Admin from '@/view/admin/admin/Admin.vue';
import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
import { createManorAdminFixture } from './manorAdminFixture';
import '@/assets/css/index.less';

const params = new URLSearchParams(location.search),
  pinia = createPinia();
setActivePinia(pinia);
const bookmark = bookmarkStore(pinia),
  user = useUserStore(pinia);
bookmark.screenWidth = innerWidth;
user.$patch({ id: 'root_fixture', role: 'root', adminContext: null });
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle(
  'light-note-mobile-rendering',
  bookmark.isMobile || params.get('renderProfile') === 'mobile',
);
applyUiDensity(
  params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard',
  bookmark.isMobile,
);
const data = createManorAdminFixture(),
  scenario = params.get('scenario');
let failOnce = true;
if (scenario === 'maintenance') data.runtime.mode = 'maintenance';
if (scenario === 'legacy') data.runtime.coverageStartedAt = null;
if (params.get('audience') === 'all') data.runtime.audience = 'all';
request.defaults.adapter = async (config) => {
  const path = new URL(config.url || '', 'http://fixture.invalid').pathname;
  if (Number(params.get('delay')) > 0)
    await new Promise((resolve) => setTimeout(resolve, Math.min(5000, Number(params.get('delay')))));
  const query = config.params || {};
  let value: unknown = {};
  let status = 200;
  if (path.includes('/growth/admin/manor/')) {
    if (scenario === 'error')
      return {
        data: { status: 503, data: { code: 'MANOR_ADMIN_FAILED' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    if (path.endsWith('/runtime')) {
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      if (scenario === 'conflict' && failOnce) {
        failOnce = false;
        data.runtime.revision++;
        status = 409;
        value = { code: 'MANOR_RUNTIME_CONFLICT' };
      } else {
        Object.assign(data.runtime, { mode: body.mode, message: body.message, revision: data.runtime.revision + 1 });
        value = data.runtime;
        if (scenario === 'unknown' && failOnce) {
          failOnce = false;
          throw { code: 'ERR_NETWORK', config, message: 'Network Error' };
        }
      }
    } else if (path.endsWith('/status')) value = data.runtime;
    else if (path.endsWith('/overview')) {
      const report = data.overview();
      if (scenario === 'empty') {
        report.opened = 0;
        report.activity = { all: 0, plant: 0, fish: 0, resource: 0 };
        report.recent = [];
        report.finances = { issued: 0, spent: 0, trend: [] };
        report.earners = { ...report.earners!, items: [] };
      }
      if (scenario === 'partial') {
        report.finances = null;
        report.earners = null;
        report.failures = ['finances', 'earners'];
      }
      value = report;
    } else if (path.endsWith('/players')) {
      const list =
        scenario === 'empty'
          ? []
          : data.players.filter((p) => !query.search || p.alias.includes(query.search) || p.userId === query.search);
      const start = (Number(query.page || 1) - 1) * 20;
      value = { items: list.slice(start, start + 20), total: list.length, page: Number(query.page || 1) };
    } else if (path.includes('/players/')) value = data.player(decodeURIComponent(path.split('/').at(-1)!));
    else if (path.endsWith('/operations')) {
      const ops =
        scenario === 'empty'
          ? []
          : data.ops.filter(
              (o) => (!query.userId || o.userId === query.userId) && (!query.action || o.action === query.action),
            );
      value = { items: ops, nextCursor: null };
    }
  } else if (path.includes('getAdminOverview')) value = { pending: { opinion: 0, security: 0 } };
  else if (path.includes('reports')) value = { total: 0 };
  return { data: { status, data: structuredClone(value) }, status: 200, statusText: 'OK', headers: {}, config };
};
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/admin', component: Admin, children: [{ path: 'manorManagement', component: ManorManagement }] },
    { path: '/manorManagement', component: ManorManagement },
    { path: '/:pathMatch(.*)*', component: { render: () => h('p', '隔离预览：此处跳往现有后台模块，不调用正式接口') } },
  ],
});
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const i18n = createI18n({ legacy: false, locale, fallbackLocale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } });
if (!location.hash)
  await router.replace({
    path: bookmark.isMobile ? '/manorManagement' : '/admin/manorManagement',
    query: { tab: params.get('tab') || 'overview' },
  });
const app = createApp({
  render: () =>
    h('div', { style: { height: '100vh', display: 'flex', flexDirection: 'column' } }, [
      h(
        'header',
        {
          style: {
            height: 'var(--ui-control-48,48px)',
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            paddingInline: 'var(--ui-space-20,20px)',
            borderBottom: '1px solid var(--surface-border-color)',
            color: 'var(--desc-color)',
          },
        },
        '轻笺 · 庄园管理隔离预览（全部数据为示例）',
      ),
      h('main', { style: { flex: '1', minHeight: '0', background: 'var(--background-color)' } }, [h(RouterView)]),
    ]),
})
  .use(pinia)
  .use(router)
  .use(i18n);
app.component('svg-icon', SvgIcon);
app.directive('auto-scrollbar', {});
app.mount('#app');

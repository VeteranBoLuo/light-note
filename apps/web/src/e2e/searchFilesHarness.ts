import { createApp, h, onBeforeUnmount, watch } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory, RouterView } from 'vue-router';
import { createI18n } from 'vue-i18n';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import { useMobileGlobalSearch } from '@/composables/useMobileGlobalSearch';
import { bindResourceReuseRuntime, createResourceReuseRuntime } from '@/utils/resourceReuseRuntime';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import type { SearchResultItem } from '@/api/search';
import '@/assets/css/index.less';

// 所有内容均为虚构数据；内存适配器截获全部 API，绝不连接业务后端或 Provider。
const params = new URLSearchParams(location.search);
const surface = params.get('surface') || 'desktop';
const pinia = createPinia();
setActivePinia(pinia);
const user = useUserStore(pinia);
user.setUserInfo({ id: 'search-file-fixture-user', role: 'user' });
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
user.preferences = { ...user.preferences, theme, lang: locale, resourceView: params.get('view') === 'list' ? 'list' : 'card' };
bookmarkStore(pinia).screenWidth = innerWidth;
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', innerWidth < 768);
applyUiDensity(params.get('density'), innerWidth < 1200);

const title = params.has('long')
  ? '项目资料：一份包含很长名称的报告，用于核对窄屏截断、定位操作和键盘访问 #1.txt'
  : '项目报告 #1.txt';
const items: SearchResultItem[] = ['42', '43'].map((id) => ({
  id,
  type: 'file',
  title,
  description: `虚构文件 ${id}，两项同名，仍须打开各自的文件 ID。`,
  extra: 'TXT · 1 KB',
  route: '/cloudSpace?fileName=old-route.txt',
  raw: { update_time: '2026-10-10 10:00:00' },
}));
let infoReads = 0;
let listReads = 0;
let failed = false;
const files = items.map((item) => ({
  id: item.id,
  fileName: params.has('renamed') ? `改名后的文件 ${item.id}.txt` : item.title,
  fileType: 'txt',
  fileSize: 1024,
  category: 'document',
  fileUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(`这是虚构文件 ${item.id} 的正文。`)}`,
  uploadTime: '2026-10-10 10:00:00',
  tags: [],
}));

request.defaults.adapter = async (config) => {
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  const url = String(config.url);
  let data: unknown = null;
  let status = 200;
  if (url === '/api/search/global') {
    if (params.get('state') === 'loading') await new Promise((resolve) => setTimeout(resolve, 900));
    if (params.get('state') === 'search-error' && !failed) {
      failed = true;
      throw new Error('Fixture offline');
    }
    const visible = params.get('state') === 'empty' ? [] : items;
    data = {
      items: visible,
      groups: [{ type: 'file', items: visible }],
      total: visible.length,
      typeTotals: { file: visible.length },
      hasMore: false,
      nextCursor: null,
      tagOptions: [],
      tagMatches: [],
    };
  } else if (url === '/api/file/getFileInfo') {
    infoReads++;
    document.body.dataset.infoReads = String(infoReads);
    document.body.dataset.infoId = String(body.id);
    if (params.get('state') === 'offline') throw new Error('Fixture offline');
    if (params.get('state') === 'slow') await new Promise((resolve) => setTimeout(resolve, 900));
    status = params.get('state') === 'missing' ? 404 : params.get('state') === 'forbidden' ? 403 : 200;
    data = status === 200 ? files.find((file) => file.id === body.id) : null;
  } else if (url === '/api/file/queryFiles') {
    listReads++;
    document.body.dataset.listReads = String(listReads);
    document.body.dataset.fileNameFilter = String(body.filters?.fileName || '');
    const visible = files.filter((file) => !body.filters?.fileName || file.fileName.includes(body.filters.fileName));
    data = { items: visible, total: visible.length, page: 1, hasMore: false };
  } else if (url === '/api/file/queryFolder') {
    data = { items: [], allFileCount: files.length, maxDepth: 8 };
  } else if (url === '/api/file/queryTotalFileSize') {
    data = { totalSizeMB: 1, quotaMB: 1024 };
  } else if (url === '/api/note/resourceBacklinks') {
    data = [];
  } else if (url === '/api/organize/summary') {
    data = { pendingShortcut: { count: 0 }, totals: { findingTotal: 0 } };
  } else if (!['/api/common/recordOperationLogs', '/api/common/recordResourceReuse', '/api/support/events'].includes(url)) {
    document.body.dataset.unexpectedRequest = url;
    throw new Error(`Unexpected fixture request: ${url}`);
  }
  return { data: { status, data, msg: '' }, status: 200, statusText: 'OK', headers: {}, config };
};

const { default: SearchCenter } = await import('@/view/search/SearchCenter.vue');
const { default: CloudSpace } = await import('@/view/cloudSpace/cloudSpace.vue');
const { default: GlobalSearch } = await import('@/components/search/GlobalSearch.vue');
const { default: MobileGlobalSearchOverlay } = await import('@/components/globalSearch/MobileGlobalSearchOverlay.vue');
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/search', name: 'search', component: surface === 'center' ? SearchCenter : { render: () => null } },
    { path: '/cloudSpace', name: 'cloudSpace', component: CloudSpace },
  ],
});
await router.replace('/search');
watch(
  router.currentRoute,
  (route) => {
    document.body.dataset.fixtureRoute = route.fullPath;
  },
  { immediate: true },
);
const app = createApp({
  setup() {
    const { openSearch } = useMobileGlobalSearch();
    const reuse = createResourceReuseRuntime({
      report: async (target) => {
        document.body.dataset.reuse = `${target.resourceType}:${target.resourceId}`;
        return true;
      },
    });
    reuse.setOwner(user.id);
    bindResourceReuseRuntime(reuse);
    onBeforeUnmount(() => {
      reuse.dispose();
      bindResourceReuseRuntime(null);
    });
    return () =>
      h('div', { style: { height: '100%' } }, [
        surface === 'desktop' ? h(GlobalSearch) : null,
        surface === 'mobile'
          ? h(BButton, { id: 'open-mobile-search', onClick: () => openSearch() }, () => '打开移动搜索')
          : null,
        surface === 'mobile' ? h(MobileGlobalSearchOverlay) : null,
        h(RouterView),
      ]);
  },
});
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }))
  .use(globalDirect);
app.mount('#app');

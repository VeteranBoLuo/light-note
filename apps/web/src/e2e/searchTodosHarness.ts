import { createApp, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import { createI18n } from 'vue-i18n';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { bookmarkStore, useUserStore } from '@/store';
import '@/assets/css/index.less';

// 仅使用虚构内容和内存适配器，所有 API 请求均在此截获。
const params = new URLSearchParams(location.search);
const pinia = createPinia();
setActivePinia(pinia);
const user = useUserStore(pinia);
user.id = 'search-fixture-user';
const bookmark = bookmarkStore(pinia);
bookmark.screenWidth = window.innerWidth;
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
const rows = [
  {
    id: 'note-1',
    type: 'note',
    title: '项目计划资料',
    description: '用于核对资料批量选择',
    raw: { updateTime: '2026-09-10 09:00:00' },
  },
  ...['pending', 'completed', 'pending', 'pending'].map((status, index) => ({
    id: `todo-${index}`,
    type: 'todo',
    title: [
      '准备项目评审材料',
      '已完成的项目核对',
      '没有截止时间的项目任务',
      '很长的项目待办标题：核对移动端和桌面端的浅色深色展示以及批量操作边界',
    ][index],
    description: '这是虚构的验收内容，检查状态、标签、截止时间和安全跳转。',
    status,
    priority: index % 3,
    dueAt: index === 2 ? null : index === 3 ? '2099-09-15 10:00:00' : '2020-09-09 10:00:00',
    tags: [{ id: 'tag-1', name: '项目' }],
    route: `/inbox?tab=todo&todoId=todo-${index}`,
    raw: { update_time: '2026-09-10 09:00:00' },
  })),
];
let failed = false;
request.defaults.adapter = async (config) => {
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  const url = String(config.url);
  let data: unknown = [];
  let status = 200;
  if (url.includes('/search/')) {
    if (url.includes('batchSelectionPreview')) {
      const types = body.selection?.query?.types || [];
      document.documentElement.dataset.batchTypes = types.join(',');
      if (types.includes('todo') || !types.length) throw new Error('Invalid fixture batch scope');
      data = { mode: 'allMatching', total: 1, typeCounts: { note: 1, bookmark: 0, file: 0 } };
    } else {
      if (params.get('state') === 'loading') await new Promise((resolve) => setTimeout(resolve, 1800));
      if (params.get('state') === 'error' && !failed) {
        status = 500;
        failed = true;
      }
      const items =
        params.get('state') === 'empty'
          ? []
          : rows.filter(
              (row) =>
                (!body.types?.length || body.types.includes(row.type)) &&
                (!body.keyword || row.title.includes(body.keyword)),
            );
      const types = ['bookmark', 'note', 'file', 'todo'];
      data = {
        items,
        groups: types.map((type) => ({ type, items: items.filter((item) => item.type === type) })),
        typeTotals: Object.fromEntries(types.map((type) => [type, items.filter((item) => item.type === type).length])),
        total: items.length,
        hasMore: false,
        nextCursor: null,
        tagOptions: ['项目'],
        tagMatches: [],
      };
    }
  }
  return {
    data: { status, data, msg: status === 500 ? 'Fixture failure' : '' },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  };
};
const { default: SearchCenter } = await import('@/view/search/SearchCenter.vue');
const { default: GlobalSearch } = await import('@/components/search/GlobalSearch.vue');
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/search', component: SearchCenter },
    {
      path: '/inbox',
      component: { render: () => h('p', { id: 'todo-destination' }, router.currentRoute.value.fullPath) },
    },
  ],
});
await router.push({ path: '/search', query: params.get('type') ? { type: params.get('type')! } : {} });
const app = createApp({ render: () => (params.get('surface') === 'quick' ? h(GlobalSearch) : h(RouterView)) });
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale: params.get('locale') || 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }))
  .use(globalDirect);
app.mount('#app');

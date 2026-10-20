import { createApp, h, watch } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory, RouterView } from 'vue-router';
import axios from 'axios';
import request from '@/http/request';
import i18n, { setLocale } from '@/i18n';
import globalDirect from '@/config/globalDirect';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import type { SearchResultItem } from '@/api/search';
import '@/assets/css/index.less';

// 所有 API 都由内存适配器截获，真实页面仅使用虚构资料，不连接后端或 AI Provider。
const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
await setLocale(locale);
const pinia = createPinia();
setActivePinia(pinia);
const user = useUserStore(pinia);
user.setUserInfo({
  id: 'search-note-return-fixture',
  role: 'user',
  preferences: { theme, lang: locale, noteViewMode: 'card' },
});
const bookmark = bookmarkStore(pinia);
const syncViewport = () => {
  bookmark.screenWidth = innerWidth;
  bookmark.screenHeight = innerHeight;
};
syncViewport();
window.addEventListener('resize', syncViewport);
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
applyUiDensity(params.get('density'), !bookmark.isDesktop);

const source = `/search?q=${encodeURIComponent('项目')}&type=note&sort=updated&date=30d&tags=${encodeURIComponent('工作')}&view=${params.get('view') === 'card' ? 'card' : 'list'}`;
const notes = Array.from({ length: 96 }, (_, index) => ({
  id: `fixture-${index + 1}`,
  title: `项目资料 ${String(index + 1).padStart(2, '0')}`,
  type: 'markdown',
  content: `# 项目资料 ${index + 1}\n\n这是完全虚构的验收笔记。返回后应保留关键词、筛选和原结果位置。`,
  revision: 1,
  createBy: user.id,
  createTime: '2026-10-18 10:00:00',
  updateTime: '2026-10-19 10:00:00',
  parentId: null,
  tags: [{ id: 'fixture-tag', name: '工作' }],
  hasContent: true,
  childCount: 0,
  descendantCount: 0,
}));
const features = { noteTreeRead: true, noteTreeWrite: true, noteTreeMobile: true };
const calls: Array<{ path: string; body: Record<string, any> }> = [];
let searchGeneration = 0;
let failed = false;
let noteOpened = false;
const fixtureAdapter: NonNullable<typeof request.defaults.adapter> = async (config) => {
  const path = String(config.url || '');
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  calls.push({ path, body });
  document.body.dataset.fixtureRequests = JSON.stringify(calls);
  let data: unknown = null;
  let status = 200;
  if (path === '/api/search/global') {
    if (!body.cursor) searchGeneration++;
    const returning = noteOpened && searchGeneration > 1;
    if (returning && params.get('state') === 'slow') await new Promise((resolve) => setTimeout(resolve, 1200));
    if (returning && params.get('state') === 'error' && !failed) {
      failed = true;
      throw new Error('验收：网络暂时不可用');
    }
    const freshNotes = returning && params.get('state') === 'removed' ? notes.slice(40) : notes;
    const offset = Number(body.cursor?.offset || 0);
    const count = Number(body.pageSize || 24);
    const items: SearchResultItem[] = freshNotes.slice(offset, offset + count).map((note) => ({
      id: note.id,
      type: 'note',
      title: returning && params.get('state') === 'renamed' ? `${note.title}（已更新）` : note.title,
      description: '项目检索验收资料',
      extra: 'Markdown',
      route: `/noteLibrary/${note.id}`,
      tags: note.tags,
      raw: note,
    }));
    const hasMore = offset + items.length < freshNotes.length;
    data = {
      items,
      groups: [{ type: 'note', items }],
      total: freshNotes.length,
      ...(body.includeMetadata
        ? { typeTotals: { note: freshNotes.length }, tagOptions: ['工作'], tagMatches: [] }
        : {}),
      hasMore,
      nextCursor: hasMore ? { type: 'all', offset: offset + items.length } : null,
    };
    document.body.dataset.searchGeneration = String(searchGeneration);
  } else if (path === '/api/note/getNoteDetail') {
    noteOpened = true;
    const note = notes.find((item) => item.id === body.id);
    status = note ? 200 : 404;
    data = note ? { ...note, breadcrumb: [note], noteTreeFeatures: features } : null;
  } else if (path === '/api/note/getNoteTreeFeatures') {
    data = { features };
  } else if (path === '/api/note/queryNoteTree') {
    data = { items: body.parentId ? [] : notes.slice(0, 5), total: 5, hasMore: false };
  } else if (path === '/api/note/queryNoteBreadcrumb') {
    data = notes.filter((note) => note.id === body.noteId);
  } else if (
    /getNoteTags|queryNoteTagList|queryNoteTemplates|resourceBacklinks|resourceRefs\/resolve|queryTagList/u.test(path)
  ) {
    data = [];
  } else if (path === '/api/organize/summary') {
    data = { pendingShortcut: { count: 0 }, totals: { findingTotal: 0 } };
  } else if (path === '/api/note/queryNoteImportTasks') {
    data = { items: [], total: 0, hasMore: false };
  } else if (
    !['/api/common/recordOperationLogs', '/api/common/recordResourceReuse', '/api/support/events'].includes(path)
  ) {
    document.body.dataset.unexpectedRequest = path;
    throw new Error(`Unexpected fixture request: ${path}`);
  }
  return { data: { status, data, msg: '' }, status: 200, statusText: 'OK', headers: {}, config };
};
request.defaults.adapter = fixtureAdapter;
axios.defaults.adapter = fixtureAdapter;

const { default: SearchCenter } = await import('@/view/search/SearchCenter.vue');
const { default: NoteDetail } = await import('@/view/noteLibrary/NoteDetail.vue');
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/search', component: SearchCenter },
    { path: '/noteLibrary/:id', component: NoteDetail },
    { path: '/:pathMatch(.*)*', component: { render: () => h('p', '其他入口保持原返回地址') } },
  ],
});
const initialPath = location.hash.slice(1) || params.get('entry') || source;
await router.replace(initialPath);
await router.isReady();
watch(
  router.currentRoute,
  (route) => {
    document.body.dataset.fixtureRoute = route.fullPath;
  },
  { immediate: true },
);
createApp({
  render: () =>
    h(RouterView, null, {
      default: ({ Component, route }: any) => (Component ? h(Component, { key: route.path }) : null),
    }),
})
  .use(pinia)
  .use(router)
  .use(i18n)
  .use(globalDirect)
  .mount('#app');

import { createApp, h, watch } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory, RouterView } from 'vue-router';
import axios from 'axios';
import request from '@/http/request';
import i18n, { setLocale } from '@/i18n';
import globalDirect from '@/config/globalDirect';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import '@/assets/css/index.less';

// 所有 API 都由内存适配器截获，真实页面仅使用虚构资料，不连接后端或 AI Provider。
const params = new URLSearchParams(location.search);
document.addEventListener(
  'click',
  (event) => {
    const button = (event.target as HTMLElement)?.closest('.organize-resource-row button');
    const container = document.querySelector('.organize-issue-view');
    if (button?.textContent?.trim() !== '打开' || !container) return;
    const row = [...container.querySelectorAll('[data-untagged-resource-key]')].find(
      (item) => item.getBoundingClientRect().bottom > container.getBoundingClientRect().top,
    );
    document.body.dataset.fixtureOpenPosition = JSON.stringify({
      top: container.scrollTop,
      key: row?.getAttribute('data-untagged-resource-key'),
      offset: row ? container.getBoundingClientRect().top - row.getBoundingClientRect().top : 0,
    });
  },
  true,
);

const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
await setLocale(locale);
const pinia = createPinia();
setActivePinia(pinia);
const user = useUserStore(pinia);
user.setUserInfo({
  id: 'organize-note-return-fixture',
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

const source = '/organize?issue=untagged';
const resourceType = ['bookmark', 'file'].includes(params.get('resource') || '') ? params.get('resource')! : 'note';
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
  tags: [],
  hasContent: true,
  childCount: 0,
  descendantCount: 0,
}));
const features = { noteTreeRead: true, noteTreeWrite: true, noteTreeMobile: true };
const calls: Array<{ path: string; body: Record<string, any> }> = [];
let failed = false;
let resourceOpened = false;
let openedId = '';
const removedIds = new Set<string>();
const fixtureAdapter: NonNullable<typeof request.defaults.adapter> = async (config) => {
  const path = String(config.url || '');
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  const call = { path, body };
  calls.push(call);
  document.body.dataset.fixtureRequests = JSON.stringify(calls);
  let data: unknown = null;
  let status = 200;
  if (path === '/api/organize/issues/untagged') {
    const query = config.params || {};
    call.body = { ...query };
    document.body.dataset.fixtureRequests = JSON.stringify(calls);
    const returning = resourceOpened;
    if (returning && params.get('state') === 'slow') await new Promise((resolve) => setTimeout(resolve, 1400));
    if (returning && params.get('state') === 'error' && !failed && query.cursor) {
      failed = true;
      throw new Error('验收：返回续页暂时不可用');
    }
    let freshNotes = notes.filter((note) => !removedIds.has(note.id));
    if (returning && params.get('state') === 'tagged') freshNotes = freshNotes.filter((note) => note.id !== openedId);
    if (returning && params.get('state') === 'removed') freshNotes = freshNotes.slice(45);
    if (returning && params.get('state') === 'empty') freshNotes = [];
    const keyword = String(query.keyword || '');
    if (keyword) freshNotes = freshNotes.filter((note) => note.title.includes(keyword));
    if (query.resourceType && !['all', resourceType].includes(query.resourceType)) freshNotes = [];
    const offset = Number(query.cursor || 0);
    const page = freshNotes.slice(offset, offset + Number(query.limit || 20));
    const items = page.map((note) => ({
      resourceId: note.id,
      resourceType,
      title: note.title,
      summary: '完全虚构的整理返回验收资料',
      updatedAt: note.updateTime,
    }));
    data = {
      items,
      hasMore: offset + items.length < freshNotes.length,
      nextCursor: offset + items.length < freshNotes.length ? String(offset + items.length) : null,
    };
  } else if (path === '/api/bookmark/getBookmarkDetail') {
    resourceOpened = true;
    openedId = String(body.filters.id);
    data = {
      id: openedId,
      name: notes.find((item) => item.id === openedId)?.title,
      url: 'https://example.com',
      description: '虚构书签',
    };
  } else if (path === '/api/file/getFileInfo') {
    resourceOpened = true;
    openedId = String(body.id);
    data = {
      id: openedId,
      fileName: `${notes.find((item) => item.id === openedId)?.title}.txt`,
      fileType: 'text/plain',
      category: 'text',
      fileUrl: 'data:text/plain;charset=utf-8,%E8%99%9A%E6%9E%84%E6%96%87%E4%BB%B6%E9%AA%8C%E6%94%B6',
      fileSize: 18,
    };
  } else if (path === '/api/file/queryFiles') {
    data = { items: [], total: 0, hasMore: false, page: 1 };
  } else if (path === '/api/file/queryFolder') {
    data = [];
  } else if (path === '/api/file/queryTotalFileSize') {
    data = { totalSizeMB: 0, quotaMB: 1024 };
  } else if (path === '/api/bookmark/getRelatedTag') {
    data = [];
  } else if (path === '/api/note/getNoteDetail') {
    resourceOpened = true;
    openedId = String(body.id);
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
    const issue = { state: 'ready', findingCount: 96, affectedResourceCount: 96, hasMore: false };
    data = {
      pendingShortcut: { count: 0 },
      totals: { findingTotal: 96 },
      issues: { untagged: issue, duplicateBookmark: { ...issue, groupCount: 0 }, bookmarkHealth: issue },
    };
  } else if (path === '/api/organize/suggestions/runs') {
    data = [];
  } else if (path === '/api/note/delNote') {
    (body.ids || []).forEach((id: string) => removedIds.add(id));
    data = { deletedCount: body.ids.length };
  } else if (path === '/api/note/updateNote') {
    const note = notes.find((item) => item.id === body.id);
    if (note) Object.assign(note, body, { revision: note.revision + 1 });
    data = note;
  } else if (path === '/api/note/queryNoteImportTasks') {
    data = { items: [], total: 0, hasMore: false };
  } else if (
    ![
      '/api/common/recordOperationLogs',
      '/api/common/recordResourceReuse',
      '/api/common/recordAiEvent',
      '/api/support/events',
    ].includes(path)
  ) {
    document.body.dataset.unexpectedRequest = path;
    throw new Error(`Unexpected fixture request: ${path}`);
  }
  return { data: { status, data, msg: '' }, status: 200, statusText: 'OK', headers: {}, config };
};
request.defaults.adapter = fixtureAdapter;
axios.defaults.adapter = fixtureAdapter;

const { default: OrganizeCenter } = await import('@/view/organize/OrganizeCenter.vue');
const { default: BookmarkEdit } = await import('@/view/manage/BookmarkEditMg.vue');
const { default: CloudSpace } = await import('@/view/cloudSpace/cloudSpace.vue');
const { default: NoteDetail } = await import('@/view/noteLibrary/NoteDetail.vue');
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/organize', name: 'organizeCenter', component: OrganizeCenter },
    { path: '/noteLibrary/:id', component: NoteDetail },
    { path: '/manage/editBookmark/:id', component: BookmarkEdit },
    { path: '/cloudSpace', name: 'cloudSpace', component: CloudSpace },
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

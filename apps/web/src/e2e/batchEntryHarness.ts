import { createApp, h, ref, watch } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import { createI18n } from 'vue-i18n';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { bookmarkStore, useUserStore } from '@/store';
import { useResourceSelectionRuntime } from '@/composables/useResourceSelection';
import MobileAppShell from '@/components/mobile/MobileAppShell.vue';
import Snapshot from '@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue';
import Host from '@/components/resourceActions/ResourceBatchTagsHost.vue';
import '@/assets/css/index.less';

// 真实页面与布局使用内存资料验收，不访问业务服务。
const params = new URLSearchParams(location.search);
const pinia = createPinia();
setActivePinia(pinia);
const type = params.get('module') === 'notes' ? 'note' : 'bookmark';
const tags = [
  { id: 'tag1', name: '工作' },
  { id: 'tag2', name: '学习' },
];
const items = Array.from({ length: params.has('noteNavigation') ? 26 : 8 }, (_, i) => ({
  id: String(i + 1),
  name: `设计资料 ${i + 1}`,
  title: `设计资料 ${i + 1}`,
  url: 'https://example.com',
  description: '批量标签管理验收资料',
  content: '页面布局与交互设计',
  type: 'html',
  noteType: 'html',
  tags: [],
  tagList: [],
  updateTime: '2026-09-07 12:00:00',
}));
// Two directory scopes plus a nested child exercise selection boundaries on the real note page.
if (params.has('noteScope')) {
  const parents = [null, null, '1', '1', '2', '2', '3', null];
  if (params.has('noteNavigation')) parents[25] = '3';
  items.forEach((item, index) => Object.assign(item, { parentId: parents[index] || null }));
}
if (params.has('noteNavigation')) {
  items.forEach(item => Object.assign(item, {
    childCount: items.filter((child: any) => child.parentId === item.id).length,
    hasChildren: items.some((child: any) => child.parentId === item.id),
  }));
}
request.defaults.adapter = async (config) => {
  const url = String(config.url);
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  let data: any = [];
  if (url.endsWith('/snapshot')) {
    const state = params.get('state') || 'failed';
    data = {
      content: state === 'empty' || state === 'pending' ? null : '这是此前保存的网页正文。'.repeat(60),
      title: '网页存档示例',
      update_time: '2026-09-07 20:00:00',
      source: 'rendered_dom',
      failedCount: state === 'failed' ? 3 : 0,
      archiveTask:
        state === 'empty'
          ? null
          : {
              status: state,
              attempts: state === 'pending' ? 0 : 1,
              msg:
                state === 'failed'
                  ? '网站拒绝自动读取，请在浏览器中查看'
                  : state === 'retry_wait'
                    ? '读取网页超时，可稍后重试'
                    : null,
            },
    };
  } else if (url.endsWith('/archive')) data = { ok: true, status: 'pending' };
  else if (url.endsWith('/getBookmarkList') || url.endsWith('/queryNoteList')) {
    const scopeItems = params.has('noteScope') && url.endsWith('/queryNoteList')
      ? items.filter((item: any) => (!body.parentId || item.parentId === body.parentId) &&
          (!body.keyword || item.title.includes(body.keyword)))
      : params.has('tree') && url.endsWith('/queryNoteList') ? items.slice(0, 3) : items;
    data = { items: scopeItems, total: scopeItems.length, page: 1, hasMore: false };
  } else if (url.endsWith('/getNoteTreeFeatures'))
    data = {
      features: {
        noteTreeRead: params.has('tree'),
        noteTreeWrite: params.has('tree'),
        noteTreeMobile: params.has('tree'),
      },
    };
  else if (url.endsWith('/queryNoteTree'))
    data = {
      parentId: body.parentId || null,
      maxDepth: 8,
      items: (params.has('noteScope')
        ? items.filter((item: any) => item.parentId === (body.parentId || null))
        : body.parentId ? [] : items).map((item: any) => ({
          ...item,
          parentId: item.parentId || null,
          hasChildren: params.has('noteScope') && items.some((child: any) => child.parentId === item.id),
          childCount: params.has('noteScope') ? items.filter((child: any) => child.parentId === item.id).length : 0,
          isTop: false,
          sort: Number(item.id),
        })),
    };
  else if (url.endsWith('/getNoteDetail')) data = items.find((item) => item.id === body.id);
  else if (url.endsWith('/queryNoteBreadcrumb')) {
    if (params.has('noteScope')) {
      const path: Array<{ id: string; title: string }> = [];
      const visited = new Set<string>();
      let current: any = items.find(item => item.id === (body.noteId || body.id));
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        path.unshift({ id: current.id, title: current.title });
        current = items.find(item => item.id === current.parentId);
      }
      data = { items: path };
    } else data = { items: items.filter((item) => item.id === (body.noteId || body.id)) };
  }
  else if (url.endsWith('/batchSelectionPreview'))
    data = {
      resolvedItems: body.selection.items.map((item: any) => ({ ...item, title: `设计资料 ${item.id}` })),
      unavailableItems: [],
    };
  else if (url.endsWith('/batchResourceTagWorkspace'))
    data = {
      items: body.selection.items.map((item: any) => ({ ...item, title: `设计资料 ${item.id}` })),
      selectionSummary: {
        editableCount: body.selection.items.length,
        typeCounts: { [type]: body.selection.items.length },
      },
      allTags: tags,
      selectedResourceTags: [],
      tagRelationCounts: {},
      resourceTagsMap: {},
    };
  else if (url.endsWith('/batchUpdateResourceTags'))
    data = { affectedRelationCount: body.selection.items.length, skippedRelationCount: 0 };
  else if (url.endsWith('/previews'))
    data = {
      id: 'fixture-run',
      status: 'preview',
      options: body,
      summary: {
        total: body.selection?.items?.length || 1,
        types: { bookmark: 1 },
        files: { parsed: 0, metadata: 0 },
        aiEnabled: true,
      },
    };
  else if (url.endsWith('/summary')) data = null;
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 200, data } };
};
const { default: Home } = await import('@/view/home/Home.vue');
const { default: Notes } = await import('@/view/noteLibrary/NoteLibrary.vue');
const { default: Center } = await import('@/view/organize/OrganizeCenter.vue');
const { default: CloudActions } = await import('@/components/cloudSpace/MobileCloudSpaceActionsDrawer.vue');
const { default: BookmarkManage } = await import('@/view/manage/BookmarkMg.vue');
const { default: Layout } = await import('@/view/index.vue');
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/',
      component: Layout,
      children: [
        { path: 'home', name: 'home', component: Home },
        { path: 'manage/bookmarkMg', name: 'bookmarkManage', component: BookmarkManage },
        { path: 'noteLibrary', name: 'noteLibrary', component: Notes },
        { path: 'note/:id', alias: '/noteLibrary/:id', name: 'noteDetail', component: { render: () => null } },
        { path: 'organize', name: 'organizeCenter', component: Center },
        {
          path: 'cloud-menu',
          component: {
            setup() {
              const open = ref(true);
              const sort = ref('latest');
              return () =>
                h(CloudActions, {
                  open: open.value,
                  'onUpdate:open': (value: boolean) => (open.value = value),
                  sortValue: sort.value,
                  sortOptions: [
                    { value: 'latest', label: '最新上传' },
                    { value: 'name', label: '文件名称' },
                  ],
                  onSort: (value: string) => (sort.value = value),
                });
            },
          },
        },
      ],
    },
  ],
});
// 浏览器验收直接复用页面正在使用的内存路由，避免动态导入/HMR 生成另一个 Web history 实例。
Object.assign(window, { batchEntryFixture: { router } });
// 笔记树和库内预览沿用模块路由，验收时同步到内存路由，避免跳出夹具。
if (params.has('tree')) {
  const { default: moduleRouter } = await import('@/router');
  moduleRouter.push = router.push.bind(router);
  moduleRouter.replace = router.replace.bind(router);
  if (params.has('noteNavigation')) {
    moduleRouter.go = router.go.bind(router);
    moduleRouter.back = router.back.bind(router);
    moduleRouter.forward = router.forward.bind(router);
  }
  watch(
    router.currentRoute,
    (route) => {
      moduleRouter.currentRoute.value = route;
    },
    { immediate: true, flush: 'sync' },
  );
}
const bookmark = bookmarkStore();
bookmark.screenWidth = innerWidth;
bookmark.screenHeight = innerHeight;
bookmark.bookmarkList = items as any;
bookmark.tagList = [];
const user = useUserStore();
user.id = 'fixture-user';
user.role = 'user';
if (params.has('noteNavigation')) {
  user.preferences.noteParentOpenMode = params.get('parentMode') === 'preview' ? 'preview' : 'children';
  user.preferences.noteDirectEdit = params.has('directEdit');
  user.preferences.noteViewMode = params.get('view') === 'list' ? 'list' : 'card';
}
user.preferences.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.dataset.theme = user.currentTheme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
for (const el of [document.documentElement, document.body, document.getElementById('app')!]) {
  el.style.height = '100%';
  el.style.margin = '0';
}
document.body.style.display = 'block';
document.getElementById('app')!.style.width = '100%';
await router.push(params.get('module') === 'bookmark-mobile' ? '/manage/bookmarkMg' : params.get('module') === 'cloud' ? '/cloud-menu' : type === 'note' ? '/noteLibrary' : '/home');
const app = createApp({
  setup() {
    useResourceSelectionRuntime();
    return () => [
      h(MobileAppShell, { enabled: bookmark.isMobile, showTopBar: bookmark.isMobile, showBottomNav: false, showTopSwitcher: false }, () =>
        h(RouterView),
      ),
      h(Host),
      ...(params.get('snapshot') ? [h(Snapshot, { visible: true, bookmarkId: 'fixture-bookmark' })] : []),
    ];
  },
});
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale: params.get('lang') === 'en' ? 'en-US' : 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
app.mount('#app');

import { createApp, h } from 'vue';
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
const items = Array.from({ length: 8 }, (_, i) => ({
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
request.defaults.adapter = async (config) => {
  const url = String(config.url);
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  let data: any = [];
  if (url.endsWith('/getBookmarkList') || url.endsWith('/queryNoteList'))
    data = { items, total: items.length, page: 1, hasMore: false };
  else if (url.endsWith('/getNoteTreeFeatures')) data = { readEnabled: false, writeEnabled: false };
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
const { default: Layout } = await import('@/view/index.vue');
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/',
      component: Layout,
      children: [
        { path: 'home', name: 'home', component: Home },
        { path: 'noteLibrary', name: 'noteLibrary', component: Notes },
        { path: 'organize', name: 'organizeCenter', component: Center },
      ],
    },
  ],
});
const bookmark = bookmarkStore();
bookmark.screenWidth = innerWidth;
bookmark.screenHeight = innerHeight;
bookmark.bookmarkList = items as any;
bookmark.tagList = [];
const user = useUserStore();
user.id = 'fixture-user';
user.role = 'user';
user.preferences.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.dataset.theme = user.currentTheme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
for (const el of [document.documentElement, document.body, document.getElementById('app')!]) {
  el.style.height = '100%';
  el.style.margin = '0';
}
await router.push(type === 'note' ? '/noteLibrary' : '/home');
const app = createApp({
  setup() {
    useResourceSelectionRuntime();
    return () => [
      h(MobileAppShell, { enabled: bookmark.isMobile, showTopBar: bookmark.isMobile, showBottomNav: false }, () =>
        h(RouterView),
      ),
      h(Host),
    ];
  },
});
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
app.mount('#app');

import { createApp, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory, RouterView, useRoute } from 'vue-router';
import { createI18n } from 'vue-i18n';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import { useMobileGlobalSearch } from '@/composables/useMobileGlobalSearch';
import { useResourceSelectionRuntime } from '@/composables/useResourceSelection';
import { localDateKey } from '@/utils/featureShortcuts';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import '@/assets/css/index.less';

// 功能直达与「最近上线」验收：真实搜索组件与书签管理页，内存假接口，不访问业务后端。
// 参数：surface=desktop|mobile|manager、role=user|root|visitor、theme=day|night、density、locale=en-US、featured=0、
// notes=0（没有笔记）、entry=/noteLibrary/n2（从笔记详情开始）
const params = new URLSearchParams(location.search);
const surface = params.get('surface') || 'desktop';
const role = params.get('role') || 'user';
const pinia = createPinia();
setActivePinia(pinia);
const user = useUserStore(pinia);
if (role !== 'visitor') user.setUserInfo({ id: 'feature-shortcut-fixture-user', role });
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
user.preferences = { ...user.preferences, theme, lang: locale };
const bookmark = bookmarkStore(pinia);
bookmark.screenWidth = innerWidth;
bookmark.screenHeight = innerHeight;
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', innerWidth < 768);
applyUiDensity(params.get('density'), innerWidth < 1200);

type Item = { id: string; type: string; title: string; description: string; extra?: string; tags?: unknown[] };
const library: Item[] = [
  { id: 'b1', type: 'bookmark', title: 'MDN Web 文档', description: 'Web 技术的权威参考：HTML、CSS、JavaScript 与 Web API' },
  { id: 'b2', type: 'bookmark', title: 'Figma', description: '在线界面设计与原型协作工具' },
  { id: 'b3', type: 'bookmark', title: 'PDF 在线导出工具', description: '把网页、图片转成 PDF 并导出下载' },
  { id: 'b4', type: 'bookmark', title: '发票查验平台', description: '全国增值税发票查验' },
  { id: 'n1', type: 'note', title: '十月读书清单', description: '《置身事内》读到第三章；《原则》摘录待整理……', extra: '2026-10-30' },
  { id: 'n2', type: 'note', title: '项目周会纪要 10-27', description: '本周完成：登录页改版；下周：数据导出联调……', extra: '2026-10-27' },
  { id: 'n3', type: 'note', title: '周报导出与归档流程', description: '每周五把本周笔记合并导出为 PDF……', extra: '2026-10-24' },
  { id: 'n4', type: 'note', title: '报销流程', description: '电子发票先上传云空间，再在系统里提交……', extra: '2026-09-03' },
  { id: 'f1', type: 'file', title: '发票-2026-10.pdf', description: 'PDF · 报销' },
  { id: 'f2', type: 'file', title: '发票报销汇总.xlsx', description: '表格 · 报销' },
  { id: 'f3', type: 'file', title: '周报-第 43 周.docx', description: 'Word 文档' },
  { id: 't1', type: 'todo', title: '整理十月发票', description: '今天 18:00 截止' },
  { id: 't2', type: 'todo', title: '周五提交周报', description: '每周五 17:00' },
];
const featuredItems =
  params.get('featured') === '0'
    ? []
    : [
        { featureId: 'manor', description: '', publishDate: localDateKey() },
        { featureId: 'note-reference', description: '', publishDate: localDateKey() },
      ];

// 页面树根层顺序：置顶的手绘笔记在最前，参考栏直达应跳过它打开第一篇文字笔记。
const notes =
  params.get('notes') === '0'
    ? []
    : [
        { id: 'd1', title: '手绘草图', type: 'drawing', content: '{"elements":[]}' },
        { id: 'n1', title: '体重记录', type: 'html', content: '<p>2026年10月29日 61.0</p>' },
        { id: 'n2', title: '读书笔记', type: 'markdown', content: '# 读书笔记\n\n第三章摘录。' },
      ].map((note) => ({
        ...note,
        revision: 1,
        createBy: 'feature-shortcut-fixture-user',
        createTime: '2026-10-18 10:00:00',
        updateTime: '2026-10-30 10:00:00',
        parentId: null,
        tags: [],
        hasContent: true,
        childCount: 0,
        descendantCount: 0,
      }));
const noteFeatures = { noteTreeRead: true, noteTreeWrite: true, noteTreeMobile: true };

function suggest(keyword: string) {
  if (!keyword) {
    return ['bookmark', 'note', 'file', 'todo'].flatMap((type) => library.filter((item) => item.type === type).slice(0, 3));
  }
  const hits = library.filter((item) => item.title.includes(keyword) || item.description.includes(keyword));
  // 模拟服务端相关度：标题开头命中 > 标题包含 > 仅描述命中。
  const score = (item: Item) => (item.title.startsWith(keyword) ? 3 : item.title.includes(keyword) ? 2 : 1);
  return hits.sort((a, b) => score(b) - score(a));
}

request.defaults.adapter = async (config) => {
  const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : config.data || {};
  const url = String(config.url);
  let data: unknown = [];
  if (url === '/api/search/global') {
    const items = suggest(String(body.keyword || '').trim()).map((item) => ({ ...item, tags: [] }));
    data = { keyword: body.keyword, items, hasMore: false };
  } else if (url === '/api/updateLog/featured') {
    data = { items: featuredItems };
  } else if (url === '/api/updateLog/saveFeatured') {
    featuredItems.splice(0, featuredItems.length, ...body.items);
    document.body.dataset.savedFeatured = JSON.stringify(body.items);
    data = { items: featuredItems };
  } else if (url.endsWith('/getBookmarkList')) {
    const items = library
      .filter((item) => item.type === 'bookmark')
      .map((item) => ({ ...item, name: item.title, url: 'https://example.com', tagList: [], tags: [] }));
    data = { items, total: items.length, page: 1, hasMore: false };
  } else if (url.endsWith('/queryTagList')) {
    data = [];
  } else if (url === '/api/note/queryNoteList') {
    document.body.dataset.noteListScope = 'parentId' in body ? 'tree-root' : 'flat';
    data = { items: notes, total: notes.length, page: 1, hasMore: false };
  } else if (url === '/api/note/getNoteDetail') {
    const note = notes.find((item) => item.id === body.id);
    data = note ? { ...note, breadcrumb: [note], noteTreeFeatures: noteFeatures } : null;
  } else if (url === '/api/note/getNoteTreeFeatures') {
    data = { features: noteFeatures };
  } else if (url === '/api/note/queryNoteTree') {
    data = { items: body.parentId ? [] : notes, total: notes.length, hasMore: false };
  } else if (url === '/api/note/queryNoteBreadcrumb') {
    data = notes.filter((note) => note.id === body.noteId);
  }
  return { data: { status: 200, data, msg: '' }, status: 200, statusText: 'OK', headers: {}, config };
};

const { default: GlobalSearch } = await import('@/components/search/GlobalSearch.vue');
const { default: MobileGlobalSearchOverlay } = await import('@/components/globalSearch/MobileGlobalSearchOverlay.vue');
const { default: FeaturedFeaturesManager } = await import('@/components/search/FeaturedFeaturesManager.vue');
const { default: BookmarkMg } = await import('@/view/manage/BookmarkMg.vue');
const { default: NoteDetail } = await import('@/view/noteLibrary/NoteDetail.vue');
const Placeholder = {
  setup() {
    const route = useRoute();
    return () => h('div', { class: 'fixture-page', 'data-fixture-path': route.fullPath }, `fixture page: ${route.fullPath}`);
  },
};
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/manage/bookmarkMg', name: 'bookmarkMg', component: BookmarkMg },
    { path: '/noteLibrary/:id', name: 'noteDetail', component: NoteDetail },
    { path: '/:pathMatch(.*)*', name: 'fixture', component: Placeholder },
  ],
});
await router.replace(params.get('entry') || '/workbenches');
router.afterEach((to) => {
  document.body.dataset.fixtureRoute = to.fullPath;
});

const app = createApp({
  setup() {
    useResourceSelectionRuntime();
    const { openSearch } = useMobileGlobalSearch();
    return () =>
      h('div', { class: 'feature-shortcut-harness' }, [
        surface === 'desktop' ? h('header', { class: 'fixture-nav' }, [h(GlobalSearch)]) : null,
        surface === 'mobile'
          ? h(BButton, { id: 'open-mobile-search', onClick: () => openSearch() }, () => '打开移动搜索')
          : null,
        surface === 'mobile' ? h(MobileGlobalSearchOverlay) : null,
        surface === 'manager' ? h(FeaturedFeaturesManager, { visible: true }) : null,
        h('main', { class: 'fixture-main' }, [h(RouterView)]),
      ]);
  },
});
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale, fallbackLocale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }))
  .use(globalDirect);
app.mount('#app');

const style = document.createElement('style');
style.textContent = `
  html, body, #app { height: 100%; margin: 0; }
  body { background: var(--background-color); }
  .feature-shortcut-harness { height: 100%; display: flex; flex-direction: column; }
  .fixture-nav { height: 56px; padding: 0 16px; display: flex; align-items: center; justify-content: flex-end; border-bottom: 1px solid var(--surface-divider-color); }
  .fixture-main { flex: 1; min-height: 0; }
  .fixture-page { padding: 24px; color: var(--desc-color); }
`;
document.head.append(style);

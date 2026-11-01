import { createApp, defineComponent, h, ref, watch } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createWebHashHistory, RouterView } from 'vue-router';
import axios from 'axios';
import request from '@/http/request';
import i18n, { setLocale } from '@/i18n';
import globalDirect from '@/config/globalDirect';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import type { PdfExcerptHandler } from '@/utils/pdfExcerpt';
import '@/assets/css/index.less';

// PDF 摘录验收：真实笔记页（TinyMCE / CodeMirror、参考栏）与真实文件预览，接口全部由内存适配器截获。
// 参数：theme=day|night、density=small|large、locale=en-US、renderProfile=mobile；
// 入口 #/noteLibrary/n1?ref=file:f1（参考栏插入）或 #/cloudSpace（云空间预览摘录到笔记）。
const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
await setLocale(locale);
const pinia = createPinia();
setActivePinia(pinia);
const user = useUserStore(pinia);
user.setUserInfo({ id: 'pdf-excerpt-fixture', role: 'user', preferences: { theme, lang: locale, noteViewMode: 'card' } });
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

const file = {
  id: 'f1',
  fileName: '用户访谈方法指南.pdf',
  fileType: 'application/pdf',
  fileUrl: new URL('/e2e/fixtures/pdf-excerpt.pdf', location.origin).href,
  category: 'document',
};
const base = { createBy: user.id, createTime: '2026-10-30 10:00:00', updateTime: '2026-10-31 14:02:00', parentId: null };
const notes: Record<string, any> = {
  n1: {
    ...base,
    id: 'n1',
    title: '访谈发现与相反证据',
    type: 'html',
    revision: 1,
    content:
      '<h2>01 · 三位受访者的共同点</h2><p>A、B、C 都提到「收藏之后很少回看」。</p>' +
      '<h2>02 · 记录方法</h2><p>下一轮改用固定模板，原话和解读分栏写。</p>',
  },
  n2: {
    ...base,
    id: 'n2',
    title: '访谈提纲与记录方法',
    type: 'markdown',
    revision: 1,
    content: '# 访谈提纲与记录方法\n\n每场 40 分钟，先问行为再问态度。\n',
  },
};
const features = { noteTreeRead: true, noteTreeWrite: true, noteTreeMobile: true };
const saved: Record<string, string> = {};

const fixtureAdapter: NonNullable<typeof request.defaults.adapter> = async (config) => {
  const path = String(config.url || '');
  const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : config.data || {};
  let data: unknown = [];
  let status = 200;
  if (path === '/api/note/getNoteDetail') {
    const note = notes[String(body.id)];
    status = note ? 200 : 404;
    data = note ? { ...note, breadcrumb: [note], noteTreeFeatures: features } : null;
  } else if (path === '/api/note/updateNote') {
    const note = notes[String(body.id)];
    if (note) {
      note.content = body.content;
      note.revision += 1;
      saved[note.id] = body.content;
      document.body.dataset.savedNotes = JSON.stringify(saved);
    }
    data = { id: body.id, revision: note?.revision || 1, updateTime: '2026-11-01 10:00:00' };
  } else if (path === '/api/note/addNote') {
    const id = `n${Object.keys(notes).length + 1}`;
    notes[id] = { ...base, id, title: body.title, type: body.type, revision: 1, content: body.content };
    data = { id };
  } else if (path === '/api/file/getFileInfo') {
    status = body.id === file.id ? 200 : 404;
    data = body.id === file.id ? file : null;
  } else if (path === '/api/search/global') {
    const keyword = String(body.keyword || '').trim();
    const items = Object.values(notes)
      .filter((note) => !keyword || note.title.includes(keyword))
      .map((note) => ({ id: note.id, type: 'note', title: note.title, description: '', route: `/noteLibrary/${note.id}` }));
    data = { keyword, items, groups: [{ type: 'note', label: 'note', items }], total: items.length, hasMore: false };
  } else if (path === '/api/note/getNoteTreeFeatures') {
    data = { features };
  } else if (path === '/api/note/queryNoteTree') {
    data = { items: body.parentId ? [] : Object.values(notes), total: Object.keys(notes).length, hasMore: false };
  } else if (path === '/api/note/queryNoteBreadcrumb') {
    data = Object.values(notes).filter((note) => note.id === body.noteId);
  } else if (path === '/api/organize/summary') {
    data = { pendingShortcut: { count: 0 }, totals: { findingTotal: 0 } };
  } else if (path === '/api/note/queryNoteImportTasks') {
    data = { items: [], total: 0, hasMore: false };
  } else if (path === '/api/note/resolveResourceRefs') {
    data = {
      refs: (body.refs || []).map((ref: { type: string; id: string }) => ({
        ...ref,
        available: ref.type === 'file' ? ref.id === file.id : Boolean(notes[ref.id]),
        title: ref.type === 'file' ? file.fileName : notes[ref.id]?.title,
      })),
    };
  } else if (!/getNoteTags|queryNoteTagList|queryNoteTemplates|resourceBacklinks|queryTagList|recordOperationLogs|recordResourceReuse|support\/events/u.test(path)) {
    const unexpected = new Set(JSON.parse(document.body.dataset.unexpectedRequests || '[]'));
    unexpected.add(path);
    document.body.dataset.unexpectedRequests = JSON.stringify([...unexpected]);
  }
  return { data: { status, data, msg: '' }, status: 200, statusText: 'OK', headers: {}, config };
};
request.defaults.adapter = fixtureAdapter;
axios.defaults.adapter = fixtureAdapter;

const { default: NoteDetail } = await import('@/view/noteLibrary/NoteDetail.vue');
const { default: FilePreview } = await import('@/components/FilePreview.vue');

// 云空间预览的最小宿主：与 cloudSpace.vue 相同地传入「摘录到笔记」能力。
const CloudPreviewHost = defineComponent({
  setup() {
    const visible = ref(true);
    const pdfExcerpt: PdfExcerptHandler = { mode: 'pick', file: { fileId: file.id, fileName: file.fileName } };
    return () =>
      h('div', { class: 'pdf-excerpt-harness-cloud' }, [
        h('p', { style: 'padding:16px' }, '云空间（验收宿主）'),
        visible.value
          ? h(FilePreview, {
              visible: visible.value,
              fileInfo: file,
              pdfExcerpt,
              'onUpdate:visible': (value: boolean) => (visible.value = value),
            })
          : null,
      ]);
  },
});

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/noteLibrary/:id', component: NoteDetail },
    { path: '/cloudSpace', component: CloudPreviewHost },
    { path: '/:pathMatch(.*)*', redirect: '/noteLibrary/n1?ref=file:f1' },
  ],
});
await router.replace(location.hash.slice(1) || '/noteLibrary/n1?ref=file:f1');
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

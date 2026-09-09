import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createI18n } from 'vue-i18n';
import NoteTransferDialog from '@/components/noteLibrary/transfer/NoteTransferDialog.vue';
import NoteTreeRow from '@/components/noteLibrary/tree/NoteTreeRow.vue';
import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import request from '@/http/request';
import { bookmarkStore } from '@/store';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
const node = {
  id: 'root',
  title: '开发文档',
  type: 'html',
  parentId: null,
  sort: 0,
  isTop: false,
  childCount: 3,
  hasChildren: true,
  revision: 1,
};
let status = params.get('state') || 'review';
let dismissed = false;
let items = [
  {
    id: 'a',
    title: 'Markdown 项目记录',
    sourceName: '工作记录/项目记录.md',
    type: 'markdown',
    status: 'ready',
    selected: true,
    warnings: [],
    imageCount: 1,
    errorCode: null,
    noteId: null,
  },
  {
    id: 'b',
    title: '富文本会议纪要',
    sourceName: '会议纪要.docx',
    type: 'html',
    status: 'ready',
    selected: true,
    warnings: ['format_simplified', 'missing_image'],
    imageCount: 2,
    errorCode: null,
    noteId: null,
  },
];
if (status === 'completed')
  items = items.map((i, index) => ({
    ...i,
    status: index ? 'failed' : 'completed',
    noteId: index ? null : 'created',
    errorCode: index ? 'NOTE_IMPORT_FAILED' : null,
  })) as any;
request.defaults.adapter = async (config) => {
  const url = String(config.url);
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  let data: any = {};
  if (url.endsWith('/list'))
    data =
      params.has('empty') || dismissed
        ? []
        : [
            {
              id: 'task',
              status,
              title: '发布预览', itemCount: 1, completedCount: status === 'completed' ? 1 : 0, failedCount: items.filter((i) => i.status === 'failed').length,
              createTime: new Date().toISOString(),
            },
          ];
  else if (url.endsWith('/dismiss')) dismissed = true;
  else if (url.endsWith('/detail'))
    data = {
      id: 'task',
      status,
      parentId: null,
      uploadBytes: Number(params.get('bytes') || 0),
      errorCode: status === 'failed' ? 'NOTE_IMPORT_PARSE_FAILED' : null,
      createTime: new Date().toISOString(),
      items: structuredClone(items),
    };
  else if (url.endsWith('/start')) {
    status = 'running';
    data = {};
  } else if (url.endsWith('/stop')) status = 'paused';
  else if (url.endsWith('/create')) data = { id: 'task' };
  else if (url.endsWith('/parse')) status = 'review';
  else if (url.endsWith('/preview'))
    data = {
      type: 'html',
      content: '<h1>会议纪要</h1><p>正文预览</p><table><tr><td>事项</td><td>责任人</td></tr></table>',
    };
  else if (url.endsWith('/previewExportScope'))
    data = {
      count: body.includeDescendants ? 4 : 1,
      descendantCount: 3,
      drawingCount: body.includeDescendants ? 1 : 0,
      scopeToken: 'scope',
      limit: 200,
    };
  else if (url.endsWith('/getNotesForExport'))
    data = {
      notes: [
        { id: 'root', title: '开发文档', type: 'html', content: '<p>正文</p>', parentId: null },
        { id: 'child', title: '子页面', type: 'markdown', content: '# 说明', parentId: 'root' },
      ],
    };
  else if (url.endsWith('/queryNoteTree')) data = { items: [node], hasMore: false };
  else if (url.endsWith('/queryNoteBreadcrumb')) data = { items: [node] };
  return { data: { status: 200, msg: '', data }, status: 200, statusText: 'OK', headers: {}, config };
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { render: () => null } },
    { path: '/note/:id', name: 'noteDetail', component: { render: () => null } },
  ],
});
const app = createApp({
  setup() {
    const dialog = ref<any>(null);
    const store = bookmarkStore();
    const sync = () => {
      store.screenWidth = innerWidth;
      store.screenHeight = innerHeight;
    };
    sync();
    window.addEventListener('resize', sync);
    return () =>
      h('main', { style: 'padding:24px;max-width:1000px;margin:auto' }, [
        h('h1', '笔记库'),
        h(
          BActionMenu,
          {
            items: [
              { key: 'import', label: '导入笔记' },
              { key: 'divider', divider: true },
              { key: 'templates', label: '模板管理' },
            ],
            triggers: ['click'],
            onSelect: (key: string) => (key === 'import' ? dialog.value.openImport() : dialog.value.openRecords()),
          },
          { default: () => h(BButton, {}, () => '更多') },
        ),
        h(BButton, { onClick: () => dialog.value.openExport(node) }, () => '目录导出'),
        h('ul', { style: 'padding:16px;width:280px' }, [
          h(NoteTreeRow as any, {
            node,
            depth: 0,
            childrenByParent: new Map(),
            expandedIds: new Set(),
            loadingKeys: new Set(),
            writeEnabled: true,
            dragEnabled: false,
            onImport: () => dialog.value.openImport(node.id),
            onExport: () => dialog.value.openExport(node),
          }),
        ]),
        h(NoteTransferDialog, { ref: dialog }),
      ]);
  },
});
app.use(createPinia());
app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(router);
globalDirect(app);
await router.isReady();
app.mount('#app');

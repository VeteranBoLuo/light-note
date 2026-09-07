import { createApp, defineComponent, h, ref, computed } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { useResourceSelection, useResourceSelectionRuntime } from '@/composables/useResourceSelection';
import { bookmarkStore, cloudSpaceStore, useUserStore } from '@/store';
import Host from '@/components/resourceActions/ResourceBatchTagsHost.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import FolderTags from '@/components/cloudSpace/CloudFolderTagsModal.vue';
import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
import '@/assets/css/index.less';

// 固定数据与内存响应，不连接数据库、对象存储或模型。
const pinia = createPinia();
setActivePinia(pinia);
const { default: FieldList } = await import('@/components/cloudSpace/fieldList.vue');
const params = new URLSearchParams(location.search);
const state = params.get('state');
const names = ['工作', '项目开发', '装修', '菜谱', '面试', '文档', 'AI', '日常', 'SSL', '证书', '游戏账号', '知识库'];
const tags = Array.from({ length: 46 }, (_, i) => ({
  id: String(i),
  name: i < names.length ? names[i] : `主题标签 ${i + 1}`,
}));
const files = Array.from({ length: 70 }, (_, i) => ({
  id: String(i),
  fileName: `项目资料 ${i + 1}.pdf`,
  fileSize: 1024 * (i + 1),
  fileType: 'pdf',
  tags: i < 5 ? [tags[0]] : [],
  folderId: 'folder',
}));
let workspaceCalls = 0;
let writes = 0;
request.defaults.adapter = async (config) => {
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  const url = String(config.url);
  let data: unknown = [];
  let status = 200;
  if (url.endsWith('/batchSelectionPreview')) {
    const selected = body.folderScope ? files.slice(0, 10) : body.selection?.items || body.items || [];
    data = {
      resolvedItems: selected.map((item: { id: string }) => ({
        id: String(item.id),
        type: 'file',
        title: files[Number(item.id)]?.fileName || '文件',
      })),
      unavailableItems: [],
    };
  } else if (url.endsWith('/batchResourceTagWorkspace')) {
    workspaceCalls++;
    if (state === 'loading') await new Promise((resolve) => setTimeout(resolve, 2500));
    if (state === 'error' && workspaceCalls === 1) status = 500;
    const selected = body.selection.items
      .map((item: { id: string }) => files.find((file) => file.id === item.id))
      .filter(Boolean);
    const relationCounts: Record<string, number> = {};
    const map: Record<string, unknown> = {};
    for (const file of selected) {
      map[`file:${file.id}`] = file.tags;
      for (const tag of file.tags) relationCounts[tag.id] = (relationCounts[tag.id] || 0) + 1;
    }
    data = {
      items: selected.map((file: { id: string; fileName: string }) => ({
        id: file.id,
        type: 'file',
        title: file.fileName,
      })),
      selectionSummary: { editableCount: selected.length, typeCounts: { file: selected.length } },
      allTags: state === 'empty' ? [] : tags,
      selectedResourceTags: state === 'empty' ? [] : tags.filter((tag) => relationCounts[tag.id]),
      tagRelationCounts: relationCounts,
      resourceTagsMap: map,
    };
  } else if (url.endsWith('/batchUpdateResourceTags')) {
    writes++;
    if (state === 'submit-error' && writes === 1) status = 500;
    let affected = 0;
    if (status === 200) {
      for (const item of body.selection.items) {
        const file = files.find((file) => file.id === item.id)!;
        for (const id of body.tagIds) {
          const exists = file.tags.some((tag) => tag.id === id);
          if (body.action === 'add' && !exists) {
            file.tags.push(tags.find((tag) => tag.id === id)!);
            affected++;
          }
          if (body.action === 'remove' && exists) {
            file.tags = file.tags.filter((tag) => tag.id !== id);
            affected++;
          }
        }
      }
    }
    data = {
      affectedRelationCount: affected,
      skippedRelationCount: body.selection.items.length * body.tagIds.length - affected,
    };
  } else if (url.endsWith('/queryFiles')) {
    const pageSize = body.pageSize;
    data = {
      items: files.slice((body.currentPage - 1) * pageSize, body.currentPage * pageSize),
      page: body.currentPage,
      total: files.length,
      hasMore: body.currentPage * pageSize < files.length,
    };
  }
  return { data: { status, data, msg: 'fixture' }, status: 200, statusText: 'OK', headers: {}, config };
};
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
const page = defineComponent({
  setup() {
    const cloud = cloudSpaceStore();
    cloud.fileList = structuredClone(files) as any;
    cloud.filePage = 2;
    cloud.fileTotal = files.length;
    cloud.fileHasMore = false;
    cloud.loading = false;
    const user = useUserStore();
    user.id = 'fixture-user';
    const selection = useResourceSelection(
      'files',
      computed(() => cloud.fileList),
      'file',
      computed(() => cloud.loading),
      () => cloud.refreshLoadedFiles(),
    );
    selection.mode.value = true;
    selection.store.setItems(files.slice(0, 17).map((file) => ({ id: file.id, type: 'file', title: file.fileName })));
    const folderOpen = ref(false);
    const folder = {
      id: 'folder',
      name: '项目开发',
      fullPath: '项目开发',
      hasChildren: true,
      directFileCount: 10,
      parentId: null,
    };
    return () =>
      h(
        'main',
        {
          style:
            'height:100vh;display:flex;flex-direction:column;padding:24px;box-sizing:border-box;background:var(--background-color);color:var(--text-color)',
        },
        [
          h('div', { style: 'display:flex;gap:16px;align-items:center;margin-bottom:20px' }, [
            h('h1', { style: 'font-size:24px;margin:0;flex:1' }, '云空间'),
            h(
              BButton,
              {
                onClick: () => {
                  folderOpen.value = true;
                },
              },
              () => '文件夹标签',
            ),
            h(
              BButton,
              {
                onClick: () => {
                  selection.mode.value = !selection.mode.value;
                },
              },
              () => (selection.mode.value ? '退出批量' : '批量操作'),
            ),
          ]),
          h(FieldList, { batchMode: selection.mode.value, viewMode: 'table' }),
          h(FolderTags, {
            visible: folderOpen.value,
            'onUpdate:visible': (value: boolean) => (folderOpen.value = value),
            folder: folder as any,
            folders: [folder] as any,
            onPrepared: (items: any[]) => {
              void closeCurrentMobileOverlayThen(
                () => {
                  folderOpen.value = false;
                },
                () => selection.openTags('add', items),
              );
            },
          }),
        ],
      );
  },
});
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/cloudSpace', component: page }] });
await router.push('/cloudSpace');
const app = createApp({
  setup() {
    useResourceSelectionRuntime();
    return () => [h(RouterView), h(Host)];
  },
});
app
  .use(pinia)
  .use(router)
  .use(
    createI18n({
      legacy: false,
      locale: params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN',
      messages: { 'zh-CN': zh, 'en-US': en },
    }),
  );
bookmarkStore(pinia).screenWidth = window.innerWidth;
app.use(globalDirect);
app.mount('#app');

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';

const mocks = vi.hoisted(() => ({
  apiBasePost: vi.fn(),
  recordOperation: vi.fn(),
  success: vi.fn(),
  cloud: {
    folder: { id: 'folder-1', name: '项目' },
    folderList: [] as Array<Record<string, unknown>>,
    queryFolder: vi.fn(),
    queryFieldList: vi.fn(),
    refreshAfterFileMutation: vi.fn(),
  },
}));

vi.mock('@/http/request.ts', () => ({ apiBasePost: mocks.apiBasePost }));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: mocks.recordOperation }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: mocks.success },
}));
vi.mock('@/store', () => ({ cloudSpaceStore: () => mocks.cloud }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', render: () => h('span', { class: 'svg-icon-stub' }) },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    name: 'BModalStub',
    props: ['visible', 'title'],
    setup(props: { visible: boolean; title: string }, { slots }: { slots: Record<string, () => unknown> }) {
      return () =>
        props.visible
          ? h('section', { class: 'modal-stub' }, [h('h1', props.title), slots.default?.(), slots.footer?.()])
          : null;
    },
  },
}));

const { default: CloudFolderClearModal } = await import('./CloudFolderClearModal.vue');

const source = readFileSync(resolve(process.cwd(), 'src/components/cloudSpace/CloudFolderClearModal.vue'), 'utf8');

const folders = [
  {
    id: 'folder-1',
    name: '项目',
    parentId: null,
    depth: 1,
    sort: 0,
    childCount: 1,
    directFileCount: 2,
    hasChildren: true,
    path: ['项目'],
    fullPath: '项目',
  },
  {
    id: 'folder-2',
    name: '周报',
    parentId: 'folder-1',
    depth: 2,
    sort: 0,
    childCount: 0,
    directFileCount: 3,
    hasChildren: false,
    path: ['项目', '周报'],
    fullPath: '项目 / 周报',
  },
];

let cleanup: (() => void) | undefined;

function mountModal() {
  const host = document.createElement('div');
  document.body.append(host);
  const visible = ref(true);
  const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: {
      'zh-CN': {
        common: { cancel: '取消' },
        cloudSpace: {
          allFile: '全部文件',
          clearFolderFilesTitle: '删除目录内全部文件',
          clearFolderFilesHeading: '文件将移入回收站',
          clearFolderFilesDescription: '处理目录树文件',
          clearFolderFilesScope: '处理范围',
          clearFolderFilesCount: '当前 {count} 个文件',
          clearFolderSubfoldersCount: '{count} 个子文件夹',
          clearFolderDeleteFoldersOption: '同时删除当前文件夹及所有子文件夹',
          clearFolderKeepFoldersHint: '保留目录',
          clearFolderDeleteFoldersHint: '删除目录',
          clearFolderFilesConfirm: '移入回收站',
          clearFolderFilesAndFoldersConfirm: '删除文件和文件夹',
          clearFolderFilesSuccess: '已删除 {count} 个文件',
          clearFolderFilesAndFoldersSuccess: '已删除 {count} 个文件和 {folderCount} 个文件夹',
          clearFolderFilesFailed: '删除失败',
        },
      },
    },
  });
  const app = createApp({
    setup() {
      return () =>
        h(CloudFolderClearModal, {
          visible: visible.value,
          'onUpdate:visible': (value: boolean) => {
            visible.value = value;
          },
          folder: folders[0],
          folders,
        });
    },
  });
  app.use(i18n);
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cloud.folder = { id: 'folder-1', name: '项目' };
  mocks.cloud.folderList = [...folders];
  mocks.cloud.queryFolder.mockResolvedValue(true);
  mocks.cloud.queryFieldList.mockResolvedValue(true);
  mocks.cloud.refreshAfterFileMutation.mockResolvedValue(true);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('CloudFolderClearModal', () => {
  it('使用 B 系列确认控件，并明确区分保留和删除文件夹两种可恢复结果', () => {
    expect(source).toContain('<BModal');
    expect(source).toContain('<BCheckbox v-model="deleteFolders"');
    expect(source).toContain('<BButton type="danger"');
    expect(source).toContain("'cloudSpace.clearFolderKeepFoldersHint'");
    expect(source).toContain("'cloudSpace.clearFolderDeleteFoldersHint'");
    expect(source).toContain(':mask-closable="!submitting"');
    expect(source).toContain(':esc-closable="!submitting"');
    expect(source).toContain(':history-closable="!submitting"');
    expect(source).toContain(':close-disabled="submitting"');
    expect(source).toContain('role="alert"');
  });

  it('由后端按目录范围原子执行，前端不收集或提交文件 ID', () => {
    expect(source).toContain("'/api/file/clearFolderFiles'");
    expect(source).toContain('{ id: props.folder.id, deleteFolders: shouldDeleteFolders }');
    expect(source).not.toContain('fileIds:');
  });

  it('默认只清空文件并保留目录，成功后统一刷新文件与目录计数', async () => {
    mocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: { deletedFileCount: 5, deletedFolderCount: 0, deleteFolders: false },
    });
    const host = mountModal();
    await nextTick();
    expect(host.textContent).toContain('当前 5 个文件');
    expect(host.textContent).toContain('1 个子文件夹');

    host.querySelector<HTMLButtonElement>('.danger_btn')?.click();
    await nextTick();
    await nextTick();

    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/file/clearFolderFiles',
      { id: 'folder-1', deleteFolders: false },
      { silent: true },
    );
    expect(mocks.cloud.refreshAfterFileMutation).toHaveBeenCalledOnce();
    expect(mocks.cloud.queryFolder).not.toHaveBeenCalled();
  });

  it('勾选后删除目录树，并在刷新后把已不存在的当前目录切回全部文件', async () => {
    mocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: { deletedFileCount: 5, deletedFolderCount: 2, deleteFolders: true },
    });
    mocks.cloud.queryFolder.mockImplementation(async () => {
      mocks.cloud.folderList = [];
      return true;
    });
    const host = mountModal();
    await nextTick();
    host.querySelector<HTMLElement>('[role="checkbox"]')?.click();
    await nextTick();
    expect(host.textContent).toContain('删除文件和文件夹');

    host.querySelector<HTMLButtonElement>('.danger_btn')?.click();
    await nextTick();
    await nextTick();

    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/file/clearFolderFiles',
      { id: 'folder-1', deleteFolders: true },
      { silent: true },
    );
    expect(mocks.cloud.queryFolder).toHaveBeenCalledOnce();
    expect(mocks.cloud.queryFieldList).toHaveBeenCalledOnce();
    expect(mocks.cloud.folder).toEqual({ id: 'all', name: '全部文件' });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { selectionResource, useResourceSelectionStore } from '@/store/resourceSelection';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  refresh: vi.fn(),
  record: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/http/request.ts', () => ({ apiBasePost: mocks.post }));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: mocks.record }));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: () => false }));
vi.mock('@/store', () => ({
  cloudSpaceStore: () => ({ folderList: [], refreshAfterFileMutation: mocks.refresh }),
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: mocks.success, error: mocks.error },
}));
vi.mock('@/components/cloudSpace/CloudFolderPicker.vue', () => ({
  default: { render: () => h('div') },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible'],
    setup(props: { visible: boolean }, { slots }: { slots: Record<string, () => unknown> }) {
      return () => (props.visible ? h('section', [slots.default?.(), slots.footer?.()]) : null);
    },
  },
}));

const { default: MoveFile } = await import('./MoveFile.vue');
const file = (id: string | number, folderId = 'folder-a') => ({ id, fileName: `${id}.txt`, folderId });
const cleanups: Array<() => void> = [];

async function mountMove({ files = [file(1), file('2', 'folder-b')], selectedFiles = files, batch = true } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const selection = useResourceSelectionStore();
  selection.start('files', 'user');
  selection.setItems(selectedFiles.map((item) => selectionResource(item, 'file')));
  const operation = batch ? selection.beginOperation(files.map((item) => selectionResource(item, 'file'))) : null;
  const visible = ref(false);
  const moved = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(MoveFile, {
        files,
        selectionOperation: operation,
        visible: visible.value,
        'onUpdate:visible': (open: boolean) => (visible.value = open),
        onMoved: moved,
      }),
  });
  app.use(pinia);
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      missingWarn: false,
      fallbackWarn: false,
      messages: { 'zh-CN': { common: { confirm: '确认', cancel: '取消' } } },
    }),
  );
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  visible.value = true;
  await nextTick();
  return {
    selection,
    visible,
    moved,
    confirm: () => host.querySelector<HTMLButtonElement>('.primary_btn')!.click(),
    cancel: () => host.querySelector<HTMLButtonElement>('.default_btn')!.click(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.post.mockResolvedValue({ status: 200 });
  mocks.refresh.mockResolvedValue(true);
});
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

describe('云文件移动后的选择状态', () => {
  it('跨目录选中的文件移动成功后取消勾选，下一批只包含新选择', async () => {
    const x = await mountMove();
    const session = x.selection.session;
    x.confirm();
    await vi.waitFor(() => expect(x.visible.value).toBe(false));

    expect(mocks.post).toHaveBeenCalledWith('/api/file/associateFile', {
      folderId: 'folder-a',
      fileIds: [1, '2'],
    });
    expect(x.selection.items).toEqual([]);
    expect(x.selection.busy).toBe(false);
    expect(x.selection.module).toBe('files');
    expect(x.selection.session).toBe(session);
    expect(x.moved).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();

    x.selection.setVisible([selectionResource(file('next', 'folder-c'), 'file')], true);
    expect(x.selection.beginOperation()?.selection).toEqual({
      mode: 'explicit',
      items: [{ type: 'file', id: 'next' }],
    });
  });

  it('成功时只移除实际提交的文件，其他目录的选择仍保留', async () => {
    const x = await mountMove({ files: [file(1)], selectedFiles: [file(1), file('keep', 'folder-b')] });
    x.confirm();
    await vi.waitFor(() => expect(x.visible.value).toBe(false));
    expect(x.selection.items.map((item) => item.id)).toEqual(['keep']);
  });

  it.each(['business', 'network'])('移动失败（%s）后保留选择，允许原批次重试', async (failure) => {
    if (failure === 'business') mocks.post.mockResolvedValueOnce({ status: 500, msg: '移动失败' });
    else mocks.post.mockRejectedValueOnce(new Error('offline'));
    const x = await mountMove();
    x.confirm();
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
    await nextTick();
    expect(x.visible.value).toBe(true);
    expect(x.selection.items.map((item) => item.id)).toEqual(['1', '2']);
    expect(x.moved).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();

    x.confirm();
    await vi.waitFor(() => expect(x.visible.value).toBe(false));
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(x.selection.items).toEqual([]);
  });

  it('取消移动只释放操作锁，切换文件夹后仍可累积选择', async () => {
    const x = await mountMove();
    x.cancel();
    await nextTick();
    expect(x.visible.value).toBe(false);
    expect(x.selection.busy).toBe(false);
    expect(x.selection.items.map((item) => item.id)).toEqual(['1', '2']);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(x.moved).not.toHaveBeenCalled();

    x.selection.navigate({ path: '/cloudSpace', query: { folder: 'folder-c' } });
    x.selection.refreshItems([selectionResource(file('next', 'folder-c'), 'file')]);
    x.selection.setVisible([selectionResource(file('next', 'folder-c'), 'file')], true);
    expect(x.selection.items.map((item) => item.id)).toEqual(['1', '2', 'next']);
  });

  it('单文件快捷移动不清理无关的批量选择', async () => {
    const x = await mountMove({ files: [file(1)], selectedFiles: [file('keep', 'folder-b')], batch: false });
    x.confirm();
    await vi.waitFor(() => expect(x.visible.value).toBe(false));
    expect(x.selection.items.map((item) => item.id)).toEqual(['keep']);
  });

  it('旧会话的成功回执不能清除新会话中同 ID 的选择', async () => {
    let resolve!: (value: { status: number }) => void;
    mocks.post.mockReturnValueOnce(new Promise((done) => (resolve = done)));
    const x = await mountMove();
    x.confirm();
    x.selection.end();
    x.selection.start('files', 'other-user');
    x.selection.setItems([selectionResource(file(1), 'file')]);
    resolve({ status: 200 });
    await nextTick();
    await nextTick();
    expect(x.selection.items.map((item) => item.id)).toEqual(['1']);
    expect(x.moved).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

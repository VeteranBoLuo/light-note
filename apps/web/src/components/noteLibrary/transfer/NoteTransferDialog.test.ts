import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { noteExportSettingsZh } from '@/i18n/locales/noteExportSettings';
import { noteTransferZh } from '@/i18n/locales/noteTransfer';
const userState = reactive({ id: 'test' });
const api = vi.hoisted(() => vi.fn());
const delivery = vi.hoisted(() => vi.fn(async (_file: any) => 'downloaded'));
const recordOperation = vi.hoisted(() => vi.fn());
vi.mock('@/utils/fileDelivery', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  deliverGeneratedFile: delivery,
}));
vi.mock('@/utils/androidBridge', () => ({ isLightNoteAndroidApp: () => false }));
vi.mock('@/api/commonApi', () => ({ recordOperation }));
const confirmAlert = vi.hoisted(() => vi.fn());
vi.mock('@/http/request', () => ({ apiBasePost: api }));
vi.mock('@/store', () => ({ useUserStore: () => userState, bookmarkStore: () => ({ isMobile: false }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible', 'title'],
    template: '<section v-if="visible"><h2>{{ title }}</h2><slot/><slot name="footer"/></section>',
  },
}));
vi.mock('../tree/NoteDirectoryPicker.vue', () => ({ default: { template: '<div/>' } }));
vi.mock('@/components/base/BasicComponents/BUpload.vue', () => ({
  default: {
    emits: ['change'],
    template: '<button @click="$emit(\'change\', [newFile()])">上传测试文件</button>',
    methods: { newFile: () => new File(['body'], 'test.html') },
  },
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: confirmAlert } }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: { success: vi.fn() } }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<i/>' } }));
vi.mock('@/utils/mobileOverlayHistory', () => ({ closeCurrentMobileOverlayThen: async (cb: () => void) => cb() }));
vi.mock('./NoteTransferShell.vue', () => ({
  default: {
    props: ['visible', 'title'],
    template:
      '<section v-if="visible"><h2>{{ title }}</h2><slot name="navigation"/><slot/><slot name="footer"/></section>',
  },
}));
const { default: Dialog } = await import('./NoteTransferDialog.vue');
let cleanup: () => void;
let task: any;
const fixture = (status = 'review') => ({
  id: 'task',
  status,
  uploadBytes: 4,
  createTime: '2026-09-09T06:00:00Z',
  parentId: null,
  errorCode: null,
  items: [
    {
      id: 'item',
      title: '测试笔记',
      sourceName: 'test.html',
      type: 'html',
      status: status === 'completed' ? 'completed' : 'ready',
      selected: true,
      imageCount: 15,
      warnings: [],
      noteId: status === 'completed' ? 'note' : null,
    },
  ],
});
async function settle() {
  for (let i = 0; i < 15; i++) await nextTick();
}
function mount() {
  const dialog = ref<any>();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ setup: () => () => h(Dialog, { ref: dialog }) });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          noteTransfer: noteTransferZh,
          noteExportSettings: noteExportSettingsZh,
          note: { untitled: '未命名笔记' },
        },
      },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, dialog };
}
function click(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll<HTMLElement>('button, [role=tab]')].find((b) =>
    (b.getAttribute('aria-label') || b.textContent || '').includes(text),
  );
  expect(button, text).toBeTruthy();
  button!.click();
}
beforeEach(() => {
  vi.useFakeTimers();
  userState.id = 'test';
  task = fixture();
  api.mockReset();
  api.mockImplementation(async (url, data, options) => {
    if (url.endsWith('/list')) return { status: 200, data: [{ ...task, title: '测试笔记', itemCount: 1 }] };
    if (url.endsWith('/create')) return { status: 200, data: { id: 'task' } };
    if (url.includes('/upload?')) options.onUploadProgress({ loaded: 4, total: 4 });
    if (url.endsWith('/start')) task = { ...task, status: 'queued' };
    return { status: 200, data: structuredClone(task) };
  });
});
afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
});
describe('import navigation and lifecycle', () => {
  it('uploads, reviews, executes and renders a separate result view', async () => {
    const { host, dialog } = mount();
    dialog.value.openImport();
    await settle();
    click(host, '上传测试文件');
    await settle();
    expect(host.textContent).toContain('检查即将导入的内容');
    click(host, '确认并后台导入');
    await settle();
    expect(host.querySelector('.import-progress')).toBeTruthy();
    expect(host.querySelector('.note-transfer__steps')).toBeNull();
    task = fixture('completed');
    await vi.advanceTimersByTimeAsync(2500);
    await settle();
    expect(host.querySelector('.import-result')).toBeTruthy();
    expect(host.textContent).toContain('打开笔记');
    expect(host.querySelector('.note-transfer__steps')).toBeNull();
  });
  it('opens completed history as a result without a new-import flash', async () => {
    task = fixture('completed');
    const { host, dialog } = mount();
    dialog.value.openRecords();
    await settle();
    click(host, '查看结果');
    await settle();
    expect(host.querySelector('.import-result')).toBeTruthy();
    expect(host.querySelector('.note-transfer__drop')).toBeNull();
  });
  it('keeps the last snapshot and shows stale progress after polling fails', async () => {
    task = fixture('running');
    const { host, dialog } = mount();
    dialog.value.openRecords();
    await settle();
    click(host, '查看进度');
    await settle();
    api.mockRejectedValue(new Error('offline'));
    await vi.advanceTimersByTimeAsync(2500);
    await settle();
    expect(host.querySelector('.import-progress')).toBeTruthy();
    expect(host.textContent).toContain('进度暂未更新');
  });
  it('does not restore a late detail after returning to new import', async () => {
    const { host, dialog } = mount();
    dialog.value.openRecords();
    await settle();
    let resolve!: (value: any) => void;
    api.mockImplementation((url) =>
      url.endsWith('/detail') ? new Promise((r) => (resolve = r)) : Promise.resolve({ status: 200, data: [] }),
    );
    click(host, '继续检查');
    await settle();
    expect(host.querySelector('.note-transfer__skeleton')).toBeTruthy();
    dialog.value.openImport();
    await settle();
    resolve({ status: 200, data: fixture('completed') });
    await settle();
    expect(host.querySelector('.import-result')).toBeNull();
    expect(host.querySelector('.note-transfer__drop')).toBeTruthy();
  });
});

it('ignores a poll begun before a stop request', async () => {
  task = fixture('running');
  const { host, dialog } = mount();
  dialog.value.openRecords();
  await settle();
  click(host, '查看进度');
  await settle();
  let oldResolve!: (value: any) => void;
  api.mockImplementationOnce(() => new Promise((resolve) => (oldResolve = resolve)));
  await vi.advanceTimersByTimeAsync(2500);
  api.mockImplementation(async (url) => {
    if (url.endsWith('/stop')) task = fixture('paused');
    return { status: 200, data: structuredClone(task) };
  });
  click(host, '停止剩余导入');
  await settle();
  expect(host.textContent).toContain('已暂停');
  oldResolve({ status: 200, data: fixture('running') });
  await settle();
  expect(host.querySelector('.import-result')).toBeTruthy();
  expect(host.textContent).toContain('已暂停');
});

it('confirms clearing terminal history and retains unfinished tasks from the server', async () => {
  const { host, dialog } = mount();
  dialog.value.openRecords();
  await settle();
  click(host, '清空已结束任务');
  expect(api.mock.calls.some(([url]) => url.endsWith('/clear-history'))).toBe(false);
  const confirmation = confirmAlert.mock.calls.at(-1)![0];
  expect(confirmation.okType).toBe('danger');
  expect(confirmation.content).toContain('待确认、暂停和执行中的任务保留');
  api.mockImplementation(async (url) =>
    url.endsWith('/clear-history')
      ? { status: 200, data: { clearedCount: 2 } }
      : { status: 200, data: [{ ...fixture('paused'), title: '保留任务', itemCount: 1 }] },
  );
  confirmation.onOk();
  await settle();
  expect(host.textContent).toContain('保留任务');
  expect(host.textContent).toContain('继续导入');
});

it('preserves history if clearing fails', async () => {
  const { host, dialog } = mount();
  dialog.value.openRecords();
  await settle();
  click(host, '清空已结束任务');
  api.mockRejectedValue(new Error('offline'));
  confirmAlert.mock.calls.at(-1)![0].onOk();
  await settle();
  expect(host.textContent).toContain('测试笔记');
  expect(host.querySelector('[role="alert"]')).toBeTruthy();
});

it('returns from history to the existing review with edited title and selection intact', async () => {
  const { host, dialog } = mount();
  dialog.value.openImport();
  await settle();
  click(host, '上传测试文件');
  await settle();
  const input = host.querySelector('input')!;
  input.value = '保留的标题';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  click(host, '导入任务');
  await settle();
  expect(host.textContent).toContain('返回导入笔记');
  click(host, '返回导入笔记');
  await settle();
  expect(host.querySelector('input')?.value).toBe('保留的标题');
  expect(host.textContent).toContain('确认并后台导入');
});

it('returns from a task detail to history before returning to the original new import', async () => {
  const { host, dialog } = mount();
  dialog.value.openImport();
  await settle();
  click(host, '导入任务');
  await settle();
  click(host, '继续检查');
  await settle();
  click(host, '返回导入任务');
  await settle();
  expect(host.querySelector('.note-transfer__records')).toBeTruthy();
  click(host, '返回导入笔记');
  await settle();
  expect(host.querySelector('.note-transfer__drop')).toBeTruthy();
});

describe('directory merged export', () => {
  const notes = [
    { id: 'root', title: 'Root', type: 'html', content: '<p>First</p>' },
    { id: 'child', title: 'Child', type: 'markdown', content: 'Second' },
  ];
  function exportApi() {
    vi.useRealTimers();
    delivery.mockClear();
    recordOperation.mockClear();
    api.mockImplementation(async (url, data) => {
      if (url.endsWith('previewExportScope'))
        return {
          status: 200,
          data: {
            nodes: data.includeDescendants ? notes : notes.slice(0, 1),
            scopeToken: 'locked',
            count: data.includeDescendants ? 2 : 1,
            descendantCount: 1,
            drawingCount: 0,
            limit: 100,
          },
        };
      return { status: 200, data: { notes } };
    });
  }
  it('uses a scope token, merges in the visible order, and retries without losing configuration', async () => {
    exportApi();
    const { host, dialog } = mount();
    await dialog.value.openExport({ id: 'root', title: 'Folder' });
    await settle();
    click(host, '合并为一个文件');
    await settle();
    click(host, '反转顺序');
    await settle();
    api.mockImplementationOnce(async () => ({ status: 200, data: { notes: notes.slice(0, 1) } }));
    click(host, '开始导出');
    await vi.waitFor(() => expect(host.textContent).toContain(noteExportSettingsZh.changed));
    expect(delivery).not.toHaveBeenCalled();
    expect([...host.querySelectorAll('.export-note strong')].map((n) => n.textContent)).toEqual(['Child', 'Root']);
    click(host, '开始导出');
    await vi.waitFor(() => expect(delivery).toHaveBeenCalledOnce());
    expect(recordOperation).toHaveBeenCalledOnce();
    expect(recordOperation).toHaveBeenCalledWith({
      module: '笔记库',
      operation: '导出笔记目录成功【2篇/merged/html】',
    });
    const file = delivery.mock.calls[0][0] as any;
    expect(file.fileName).toBe('Folder.html');
    expect(file.content.indexOf('Second')).toBeLessThan(file.content.indexOf('First'));
    expect(
      api.mock.calls.some(([url, data]) => url.endsWith('getNotesForExport') && data.scopeToken === 'locked'),
    ).toBe(true);
  });
  it('passes custom naming and title choices to the merged file and resets on reopening', async () => {
    exportApi();
    const { host, dialog } = mount();
    await dialog.value.openExport({ id: 'root', title: 'Folder' });
    await settle();
    click(host, '合并为一个文件');
    await settle();
    const input = host.querySelector<HTMLInputElement>('.export-name-field input')!;
    expect(input.placeholder).toBe('Folder');
    input.value = '汇编';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    const checks = host.querySelectorAll<HTMLElement>('.export-title-options [role=checkbox]');
    checks[0].click();
    await nextTick();
    checks[1].click();
    await settle();
    click(host, '开始导出');
    await vi.waitFor(() => expect(delivery).toHaveBeenCalledOnce());
    const file = delivery.mock.calls[0][0] as any;
    expect(file.fileName).toBe('汇编.html');
    const doc = new DOMParser().parseFromString(file.content, 'text/html');
    expect([...doc.querySelectorAll('h1')].map((n) => n.textContent)).toEqual(['汇编']);
    await dialog.value.openExport({ id: 'root', title: 'Folder' });
    await settle();
    click(host, '合并为一个文件');
    await settle();
    expect(host.querySelector<HTMLInputElement>('.export-name-field input')!.value).toBe('');
    expect(
      [...host.querySelectorAll('.export-title-options [role=checkbox]')].map((n) => n.getAttribute('aria-checked')),
    ).toEqual(['false', 'true']);
  });
  it('blocks drawings, keeps the full scope, and resets options on reopening', async () => {
    exportApi();
    const drawingNotes = [...notes, { id: 'draw', title: '草图', type: 'drawing' }];
    api.mockImplementation(async (url, data) => ({
      status: 200,
      data: {
        nodes: data.includeDescendants ? drawingNotes : notes.slice(0, 1),
        scopeToken: 'locked',
        count: data.includeDescendants ? 3 : 1,
        descendantCount: 2,
        drawingCount: data.includeDescendants ? 1 : 0,
        limit: 100,
      },
    }));
    const { host, dialog } = mount();
    await dialog.value.openExport({ id: 'root', title: 'Folder' });
    await settle();
    click(host, '合并为一个文件');
    await settle();
    expect(host.textContent).toContain('草图');
    const button = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('开始导出'))!;
    expect(button.disabled).toBe(true);
    expect(host.querySelectorAll('.export-row')).toHaveLength(3);
    await dialog.value.openExport({ id: 'root', title: 'Folder' });
    await settle();
    expect(host.querySelector('[role=tab][aria-selected="true"]')?.textContent).toContain('分别导出');
  });
  it('invalidates late responses after an account switch and prevents duplicate requests', async () => {
    exportApi();
    const { host, dialog } = mount();
    await dialog.value.openExport({ id: 'root', title: 'Folder' });
    await settle();
    click(host, '合并为一个文件');
    await settle();
    let resolve!: (value: any) => void;
    api.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    click(host, '开始导出');
    await settle();
    click(host, '开始导出');
    await settle();
    expect(api.mock.calls.filter(([url]) => url.endsWith('getNotesForExport'))).toHaveLength(1);
    userState.id = 'other';
    await settle();
    resolve({ status: 200, data: { notes } });
    await settle();
    expect(delivery).not.toHaveBeenCalled();
    expect(recordOperation).not.toHaveBeenCalled();
    expect(host.querySelector('.export-order')).toBeNull();
  });
  it('stops on an invalid scope token and requires a fresh confirmation', async () => {
    exportApi();
    const { host, dialog } = mount();
    await dialog.value.openExport({ id: 'root', title: 'Folder' });
    await settle();
    click(host, '合并为一个文件');
    await settle();
    api.mockImplementationOnce(async () => ({ status: 409 }));
    click(host, '开始导出');
    await vi.waitFor(() => expect(host.textContent).toContain(noteTransferZh.exportChanged));
    expect(delivery).not.toHaveBeenCalled();
    expect(api.mock.calls.filter(([url]) => url.endsWith('getNotesForExport'))).toHaveLength(1);
  });
  it('does not deliver a late response after unmount', async () => {
    exportApi();
    const { host, dialog } = mount();
    await dialog.value.openExport({ id: 'root', title: 'Folder' });
    await settle();
    click(host, '合并为一个文件');
    await settle();
    let resolve!: (value: any) => void;
    api.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    click(host, '开始导出');
    await settle();
    cleanup();
    cleanup = () => {};
    resolve({ status: 200, data: { notes } });
    await settle();
    expect(delivery).not.toHaveBeenCalled();
  });
});

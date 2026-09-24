import { createApp, nextTick } from 'vue';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import Dialog from './SaveAsNoteDialog.vue';
import { getNoteSaveState, resetNoteSaveDrafts } from './saveAsNoteState';
const mocks = vi.hoisted(() => ({ post: vi.fn(), link: vi.fn(), owner: 'owner', refresh: vi.fn() }));
vi.mock('@/store', () => ({
  useUserStore: () => ({ id: 'owner' }),
  useNoteWorkspaceStore: () => ({ ensureOwner: vi.fn(), refreshTree: mocks.refresh }),
}));
vi.mock('@/api/noteDetailPrefetch', () => ({ buildNoteDetailRequestScope: () => mocks.owner }));
vi.mock('@/http/request', () => ({ apiBasePost: mocks.post, apiQueryPost: async () => ({ status: 200, data: [] }) }));
vi.mock('@/api/toolbox', () => ({ fetchToolboxWorkspaces: async () => [], addToolboxWorkspaceResources: mocks.link }));
vi.mock('@/utils/mobileOverlayHistory', () => ({
  closeCurrentMobileOverlayThen: async (close: any, next: any) => {
    close();
    next();
  },
}));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('./NoteSaveLocation.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/tag/InlineTagCreate.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible'],
    emits: ['update:visible'],
    watch: {
      visible(value: boolean) {
        if (!value) (this as any).$emit('update:visible', false);
      },
    },
    template: '<div><slot /><slot name="footer" /></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: { props: ['value', 'disabled'], template: '<input :value="value" :disabled="disabled" />' },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
}));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({ default: { template: '<div />' } }));
let cleanup = () => {};
const flush = async () => {
  for (let i = 0; i < 25; i++) await nextTick();
};
beforeEach(() => {
  resetNoteSaveDrafts();
  vi.clearAllMocks();
  mocks.owner = 'owner';
  mocks.post.mockResolvedValue({ status: 200 });
  mocks.link.mockResolvedValue(undefined);
});
afterEach(() => cleanup());
async function mount(request: any) {
  const host = document.createElement('div');
  document.body.append(host);
  const close = vi.fn();
  const app = createApp(Dialog, { session: { request, owner: 'owner', resolve: vi.fn() }, onClose: close });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await flush();
  return { host, close };
}
async function click(host: HTMLElement, key: string) {
  (Array.from(host.querySelectorAll('button')).find((b) => b.textContent === key) as HTMLButtonElement).click();
  await flush();
}
it('freezes uncertain requests, prevents duplicate clicks and replays the same configuration', async () => {
  let reject!: (reason: unknown) => void;
  const save = vi
    .fn()
    .mockImplementationOnce(() => new Promise((_, r) => (reject = r)))
    .mockResolvedValue({ noteId: 'note' });
  const request = { sourceKey: 'source', title: 'Title', type: 'markdown', save };
  const { host, close } = await mount(request);
  await click(host, 'saveAsNote.save');
  await click(host, 'saveAsNote.save');
  expect(save).toHaveBeenCalledTimes(1);
  reject(new Error('lost response'));
  await flush();
  const state = getNoteSaveState('owner', request);
  expect(state.uncertain).toBe(true);
  expect(host.querySelector('input')?.disabled).toBe(true);
  state.options.title = 'changed outside';
  await click(host, 'saveAsNote.save');
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  expect(save.mock.calls[1][0].title).toBe('Title');
  expect(close).toHaveBeenCalledWith({ noteId: 'note', openAfterSave: false });
});
it('retries only failed associations after the note is created', async () => {
  const save = vi.fn().mockResolvedValue({ noteId: 'note' });
  const request = { sourceKey: 'source', title: 'Title', type: 'markdown' as const, save };
  const state = getNoteSaveState('owner', request);
  state.options.tags = ['tag'];
  state.options.projectId = 'project';
  mocks.link.mockRejectedValueOnce(new Error('project down')).mockResolvedValue(undefined);
  const { host, close } = await mount(request);
  await click(host, 'saveAsNote.save');
  expect(host.textContent).toContain('saveAsNote.partial');
  expect(close).not.toHaveBeenCalled();
  await click(host, 'saveAsNote.retryLinks');
  expect(save).toHaveBeenCalledTimes(1);
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(mocks.link).toHaveBeenCalledTimes(2);
});
it('ignores callbacks after account changes and separates drafts by source and owner', async () => {
  let resolve!: (value: any) => void;
  const save = vi.fn(() => new Promise((r) => (resolve = r)));
  const request = { sourceKey: 'a', title: 'A', type: 'markdown' as const, save };
  const { host, close } = await mount(request);
  await click(host, 'saveAsNote.save');
  mocks.owner = 'other';
  resolve({ noteId: 'old' });
  await flush();
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(getNoteSaveState('other', request).noteId).toBe('');
  expect(getNoteSaveState('owner', { ...request, sourceKey: 'b', title: 'B' }).options.title).toBe('B');
});
it('保存并打开成功后返回目标笔记及打开意图', async () => {
  const save = vi.fn().mockResolvedValue({ noteId: 'new-note' });
  const { host, close } = await mount({ sourceKey: 'new', title: 'Title', type: 'markdown', save });
  await click(host, 'saveAsNote.saveAndOpen');
  expect(save).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledWith({ noteId: 'new-note', openAfterSave: true });
});
it('打开已保存笔记不重复保存，返回已有笔记及打开意图', async () => {
  const save = vi.fn();
  const { host, close } = await mount({ sourceKey: 'existing', title: 'Title', type: 'markdown', save,
    lookup: async () => ({ noteId: 'existing-note' }) });
  await click(host, 'saveAsNote.open');
  expect(save).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledWith({ noteId: 'existing-note', openAfterSave: true });
});

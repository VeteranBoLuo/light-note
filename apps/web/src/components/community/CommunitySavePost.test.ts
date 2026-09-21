import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import SavePost from './CommunitySavePost.vue';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
  upload: vi.fn(),
  insert: vi.fn(),
  close: vi.fn(),
  success: vi.fn(),
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: mocks.success, error: vi.fn() },
}));
vi.mock('@/components/tag/InlineTagCreate.vue', () => ({ default: { template: '<div />' } }));
vi.mock('./CommunityNoteLocation.vue', () => ({
  default: {
    props: ['value', 'disabled'],
    emits: ['update:value'],
    template: `<button class="choose-parent" :disabled="disabled" @click="$emit('update:value', 'child-page')">Choose child</button>`,
  },
}));
vi.mock('@/api/communityFeedApi', () => ({ feedGet: mocks.get }));
vi.mock('@/http/request', () => ({ apiBasePost: mocks.post, apiQueryPost: async () => ({ status: 200, data: [] }) }));
vi.mock('@/store', () => ({
  useUserStore: () => ({ id: 'owner', role: 'user' }),
  useNoteWorkspaceStore: () => ({
    ensureOwner: vi.fn(),
    loadChildren: async () => [],
    insertCreatedNote: mocks.insert,
  }),
}));
vi.mock('@/api/noteDetailPrefetch', () => ({ buildNoteDetailRequestScope: () => '' }));
vi.mock('@/api/cloudFileUploadApi', () => ({
  ensureCloudFolder: async () => ({ id: 'folder' }),
  uploadManagedCloudFile: mocks.upload,
}));
vi.mock('@/utils/noteShareExposure', () => ({ confirmNoteShareExposure: async () => undefined }));
vi.mock('@/utils/mobileOverlayHistory', () => ({
  closeCurrentMobileOverlayThen: async (close: any, next: any) => {
    close();
    await next();
  },
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({ default: { template: '<div><slot /></div>' } }));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: {
    props: ['value', 'type'],
    emits: ['update:value'],
    template: `<input :value="value" :data-type="type" @input="$emit('update:value', $event.target.value)" />`,
  },
}));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
}));
let cleanup: () => void;
const flush = async () => {
  for (let i = 0; i < 30; i++) await nextTick();
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ key: 'stable', note: null, bookmark: null });
  mocks.post.mockResolvedValue({ status: 200, data: { id: 'saved' } });
  mocks.upload.mockResolvedValue({ fileId: 'own-image' });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['image'], { type: 'image/png' }) }),
  );
});
afterEach(() => {
  cleanup?.();
  vi.unstubAllGlobals();
});
async function mount(kind: 'note' | 'bookmark' = 'note', images: any[] = []) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(SavePost, {
    kind,
    onClose: mocks.close,
    post: { publicId: 'post', title: '标题', body: '正文', author: { name: '作者' }, images } as any,
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await flush();
  return host;
}
async function save(host: HTMLElement) {
  Array.from(host.querySelectorAll('button'))
    .find((x) => x.textContent === 'common.save' || x.textContent === 'community.feed.retrySaveTags')!
    .click();
  await flush();
}
it('copies images before creating the note and retries failed tags without duplicating the note or images', async () => {
  let tagCalls = 0;
  mocks.post.mockImplementation(async (url: string) =>
    url.includes('updateNoteTags') ? { status: ++tagCalls === 1 ? 500 : 200 } : { status: 200, data: { id: 'saved' } },
  );
  const host = await mount('note', [{ publicId: 'image', url: '/api/community/images/image' }]);
  await save(host);
  expect(host.textContent).toContain('community.feed.savedTagsFailed');
  expect(mocks.push).not.toHaveBeenCalled();
  await save(host);
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  const creates = mocks.post.mock.calls.filter(([url]) => url.endsWith('/addNote'));
  expect(creates).toHaveLength(1);
  expect(creates[0][1].content).toContain('/api/file/image/own-image');
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.success).toHaveBeenCalledWith('common.saveSuccess');
});
it('opens existing resources without creating replacements', async () => {
  mocks.get.mockResolvedValue({ key: 'stable', note: { id: 'existing', deleted: false } });
  const host = await mount();
  host.querySelector('button')!.click();
  await flush();
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.push).toHaveBeenCalledWith({ path: '/noteLibrary/existing' });
});
it('saves bookmarks, closes the modal and confirms success without navigating', async () => {
  const host = await mount('bookmark');
  await save(host);
  expect(mocks.post.mock.calls[0][0]).toBe('/api/bookmark/addBookmark');
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.success).toHaveBeenCalledWith('common.saveSuccess');
});
it('does not create a note when image copying fails', async () => {
  mocks.upload.mockRejectedValue(new Error('quota'));
  const host = await mount('note', [{ publicId: 'image', url: '/api/community/images/image' }]);
  await save(host);
  expect(mocks.post).not.toHaveBeenCalled();
  expect(host.textContent).toContain('community.feed.saveFailed');
});

it('passes the selected child page to note creation', async () => {
  const host = await mount();
  (host.querySelector('.choose-parent') as HTMLButtonElement).click();
  await flush();
  await save(host);
  const create = mocks.post.mock.calls.find(([url]) => url.endsWith('/addNote'));
  expect(create?.[1].parentId).toBe('child-page');
});

it('labels bookmark thoughts as description and saves the entered description', async () => {
  const host = await mount('bookmark');
  expect(host.textContent).toContain('community.feed.bookmarkDescription');
  expect(host.textContent).not.toContain('community.feed.myThoughts');
  const input = host.querySelector('[data-type="textarea"]') as HTMLInputElement;
  input.value = '稍后阅读';
  input.dispatchEvent(new Event('input'));
  await flush();
  await save(host);
  expect(mocks.post.mock.calls[0][1].description).toBe('稍后阅读');
});
it('appends personal thoughts to the saved note in a quote block', async () => {
  const host = await mount();
  const input = host.querySelector('[data-type="textarea"]') as HTMLInputElement;
  input.value = '我的补充';
  input.dispatchEvent(new Event('input'));
  await flush();
  await save(host);
  const create = mocks.post.mock.calls.find(([url]) => url.endsWith('/addNote'));
  const node = document.createElement('div');
  node.innerHTML = create?.[1].content;
  expect(node.querySelector('blockquote')?.textContent).toContain('我的补充');
});

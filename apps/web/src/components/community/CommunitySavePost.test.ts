import { resetNoteSaveDrafts } from '@/components/noteLibrary/save/saveAsNoteState';
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
  dialog: vi.fn(),
}));
vi.mock('@/composables/useSaveAsNote', () => ({openSaveAsNote: mocks.dialog}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: mocks.success, error: vi.fn() },
}));
vi.mock('@/components/tag/InlineTagCreate.vue', () => ({ default: { template: '<div />' } }));
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
  resetNoteSaveDrafts();
  mocks.dialog.mockImplementation(() => new Promise(() => {}));
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
const options = {title:'自定义标题',parentId:'child-page',tags:[],projectId:'',thoughts:'我的补充'};
async function adapter(images: any[] = []) { await mount('note',images); const request = mocks.dialog.mock.calls[0][0]; await request.lookup(); return request; }
it('preserves thoughts, parent, source and image copies across save retries', async () => {
  const request = await adapter([{publicId:'image',url:'/api/community/images/image'}]);
  await request.save(options); await request.save(options);
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  const create = mocks.post.mock.calls.find(([url]) => url.endsWith('/addNote'));
  expect(create?.[1]).toMatchObject({title:options.title,parentId:'child-page',idempotencyKey:'stable'});
  expect(create?.[1].content).toContain('/api/file/image/own-image');
  const node = document.createElement('div'); node.innerHTML=create?.[1].content;
  expect(node.querySelector('blockquote')?.textContent).toContain('我的补充');
});
it('returns existing note and trash state without creating replacements', async () => {
  mocks.get.mockResolvedValue({key:'stable',note:{id:'existing',deleted:true}});
  const request = await adapter();
  expect(await request.lookup()).toEqual({noteId:'existing',unavailable:true});
  expect(mocks.post).not.toHaveBeenCalled();
});
it('does not create a note when image copy or source permission fails', async () => {
  mocks.upload.mockRejectedValue(new Error('quota'));
  const request=await adapter([{publicId:'image',url:'/api/community/images/image'}]);
  await expect(request.save(options)).rejects.toThrow('quota');
  expect(mocks.post).not.toHaveBeenCalled();
  mocks.get.mockRejectedValue(new Error('forbidden'));
  await expect(request.save(options)).rejects.toThrow('forbidden');
  expect(mocks.upload).toHaveBeenCalledTimes(1);
});
it('saves bookmarks, closes the modal and confirms success without navigating', async () => {
  const host = await mount('bookmark');
  await save(host);
  expect(mocks.post.mock.calls[0][0]).toBe('/api/bookmark/addBookmark');
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.success).toHaveBeenCalledWith('common.saveSuccess');
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

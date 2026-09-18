import { beforeEach, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import Editor from './CommunityPostEditor.vue';
vi.mock('@/api/communityChatApi', () => ({
  getCommunityChatOwnProfile: vi.fn(async () => ({
    status: 200,
    data: { publicPreview: { name: 'Author', userPublicId: 'author' } },
  })),
}));
vi.mock('./CommunityPostCard.vue', () => ({
  default: { props: ['post'], template: '<article>{{ post.title }} {{ post.body }}</article>' },
}));
const mocks = vi.hoisted(() => ({
  operation: vi.fn(),
  write: vi.fn(),
  upload: vi.fn(),
  discard: vi.fn(),
  alert: vi.fn(),
  leave: vi.fn(),
}));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: mocks.alert } }));
vi.mock('vue-router', () => ({ onBeforeRouteLeave: mocks.leave }));
vi.mock('@/store', () => ({ useUserStore: () => ({ id: 'a', role: 'user' }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh-CN' } }) }));
vi.mock('@/api/communityFeedApi', () => ({
  feedOperation: mocks.operation,
  uploadFeedImage: mocks.upload,
  discardFeedImage: mocks.discard,
  discardFeedResource: mocks.discard,
}));
vi.mock('@/composables/useMobileLayout', () => ({ useMobileLayout: () => ({ value: false }) }));
vi.mock('@/utils/mobileOverlayHistory', () => ({
  closeCurrentMobileOverlayThen: async (close: Function, next: Function) => {
    close();
    await next();
  },
}));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    template:
      '<div><button data-close @click="$emit(\'close\')">close</button><slot name="header-actions"/><slot/></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({ default: { template: '<div><slot/></div>' } }));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' },
}));
vi.mock('@/components/noteLibrary/detail/MarkdownCodeMirror.vue', () => ({
  __esModule: true,
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}));
vi.mock('@/components/noteLibrary/detail/TinyMceEditorRuntime.vue', () => ({
  __esModule: true,
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}));
vi.mock('@/components/base/BasicComponents/BTabs.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: {
    props: ['value'],
    emits: ['update:value'],
    template: `<textarea :value="value" @input="$emit('update:value', $event.target.value)" />`,
  },
}));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({ default: { template: '<div />' } }));
vi.mock('./CommunityMentionPicker.vue', () => ({ default: { template: '<div />' } }));
vi.mock('./CommunityMarkdown.vue', () => ({ default: { template: '<div />' } }));
const flush = async () => {
  for (let n = 0; n < 20; n++) await nextTick();
};
function button(host: HTMLElement, name: string) {
  return Array.from(host.querySelectorAll('button')).find(
    (el) => el.textContent === 'community.feed.' + name || el.getAttribute('aria-label') === 'community.feed.' + name,
  )!;
}
async function body(host: HTMLElement, value: string) {
  await flush();
  const input = host.querySelectorAll('textarea')[1];
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  mocks.discard.mockResolvedValue({});
  mocks.operation.mockReturnValue(mocks.write);
  mocks.write.mockResolvedValue({});
});
it('accepts a topic-only post and retains the draft and request identity on failed submission', async () => {
  mocks.write.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ status: 'published' });
  const saved = vi.fn();
  const host = document.createElement('div');
  const app = createApp(Editor, { topics: [], profileEnabled: true, onSaved: saved });
  app.mount(host);
  await body(host, '草稿内容');
  button(host, 'publishNext').click();
  await flush();
  expect(button(host, 'submit').disabled).toBe(false);
  button(host, 'submit').click();
  await flush();
  expect(saved).not.toHaveBeenCalled();
  expect(localStorage.getItem('community-post-draft:a|user|:new')).toContain('草稿内容');
  button(host, 'submit').click();
  await flush();
  expect(mocks.operation).toHaveBeenCalledTimes(1);
  expect(mocks.write).toHaveBeenCalledTimes(2);
  expect(saved).toHaveBeenCalledTimes(1);
  expect(saved).toHaveBeenCalledWith({ status: 'published' });
  expect(localStorage.getItem('community-post-draft:a|user|:new')).toBeNull();
  app.unmount();
});
it('restores an unpublished draft when reopened', async () => {
  const host = document.createElement('div');
  let app = createApp(Editor, { topics: [], profileEnabled: true });
  app.mount(host);
  await body(host, '保留本地写作');
  app.unmount();
  app = createApp(Editor, { topics: [], profileEnabled: true });
  app.mount(host);
  await flush();
  const restored = document.createElement('div');
  restored.innerHTML = host.querySelectorAll('textarea')[1].value;
  expect(restored.textContent?.trim()).toBe('保留本地写作');
  app.unmount();
});

vi.mock('./CommunityPostImages.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/base/BasicComponents/BUpload.vue', () => ({ default: { template: '<div><slot /></div>' } }));

it('blocks publishing until images finish, then submits only image identifiers', async () => {
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:local-test', revokeObjectURL: vi.fn() });
  let finish!: (value: unknown) => void;
  mocks.upload.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const host = document.createElement('div');
  const app = createApp(Editor, { topics: [], profileEnabled: true, imagesEnabled: true });
  app.mount(host);
  await body(host, '带图分享');
  const paste = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', {
    value: { files: [new File(['png'], 'test.png', { type: 'image/png' })] },
  });
  host.querySelector('section')!.dispatchEvent(paste);
  await flush();
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(button(host, 'publishNext').disabled).toBe(true);
  const id = mocks.upload.mock.calls[0][1];
  finish({
    publicId: id,
    url: '/api/community/images/' + id,
    width: 1,
    height: 1,
    fileSize: 3,
    contentType: 'image/png',
  });
  await flush();
  button(host, 'publishNext').click();
  await flush();
  button(host, 'submit').click();
  await flush();
  expect(mocks.operation.mock.calls[0][1].images).toEqual([id]);
  app.unmount();
  vi.unstubAllGlobals();
});
it('keeps failed images retryable and rejects unsupported files', async () => {
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:local-test', revokeObjectURL: vi.fn() });
  mocks.upload.mockRejectedValue(new Error('offline'));
  const host = document.createElement('div');
  const app = createApp(Editor, { topics: [], profileEnabled: true, imagesEnabled: true });
  app.mount(host);
  await body(host, '图片失败仍保留正文');
  const paste = (type: string) => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [new File(['x'], 'test', { type })] } });
    host.querySelector('section')!.dispatchEvent(event);
  };
  paste('image/svg+xml');
  await flush();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  paste('image/png');
  await flush();
  expect(button(host, 'publishNext').disabled).toBe(true);
  expect(button(host, 'retry')).toBeTruthy();
  button(host, 'removeImage').click();
  await flush();
  expect(button(host, 'publishNext').disabled).toBe(false);
  expect(host.querySelectorAll('textarea')[1].value).toBe('图片失败仍保留正文');
  app.unmount();
  vi.unstubAllGlobals();
});
it('stops a multi-image queue when its editor is disposed', async () => {
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:local-test', revokeObjectURL: vi.fn() });
  let finish!: (value: unknown) => void;
  mocks.upload.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const host = document.createElement('div');
  const app = createApp(Editor, { topics: [], profileEnabled: true, imagesEnabled: true });
  app.mount(host);
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files: [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })],
    },
  });
  host.querySelector('section')!.dispatchEvent(event);
  await flush();
  const publicId = mocks.upload.mock.calls[0][1];
  app.unmount();
  finish({
    publicId,
    url: '/api/community/images/' + publicId,
    width: 1,
    height: 1,
    fileSize: 1,
    contentType: 'image/png',
  });
  await flush();
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(mocks.discard).toHaveBeenCalledWith(publicId);
  vi.unstubAllGlobals();
});

vi.mock('./CommunityResourcePicker.vue', () => ({
  default: {
    template:
      "<button data-add-resource @click=\"$emit('add', { publicId: 'snapshot-id', kind: 'note', title: 'Note' }); $emit('close')\">choose</button>",
  },
}));
vi.mock('./CommunityPostResources.vue', () => ({
  default: { props: ['resources'], template: '<div data-resources>{{ resources.length }}</div>' },
}));
it('preserves snapshot identifiers in the draft and submits them without private content', async () => {
  const host = document.createElement('div');
  let app = createApp(Editor, { topics: [], profileEnabled: true, resourcesEnabled: true });
  app.mount(host);
  await body(host, 'Snapshot sharing');
  button(host, 'addResources').click();
  await flush();
  (host.querySelector('[data-add-resource]') as HTMLButtonElement).click();
  await flush();
  app.unmount();
  app = createApp(Editor, { topics: [], profileEnabled: true, resourcesEnabled: true });
  app.mount(host);
  await flush();
  expect(host.querySelector('[data-resources]')?.textContent).toBe('1');
  button(host, 'publishNext').click();
  await flush();
  button(host, 'submit').click();
  await flush();
  expect(mocks.operation).toHaveBeenLastCalledWith('posts', expect.objectContaining({ resources: ['snapshot-id'] }));
  app.unmount();
});

it('preselects the entry topic while keeping a restored draft body', async () => {
  sessionStorage.setItem(
    'community-post-draft:a|user|:new',
    JSON.stringify({
      body: '原来的草稿',
      draft: {
        kind: 'share',
        title: '',
        body: '原来的草稿',
        topics: ['tips'],
        mentions: [],
        images: [],
        resources: [],
      },
    }),
  );
  const host = document.createElement('div');
  const app = createApp(Editor, {
    topics: [
      { value: 'mid-autumn', label: '中秋' },
      { value: 'tips', label: '使用技巧' },
    ],
    initialTopic: 'mid-autumn',
    profileEnabled: true,
  });
  app.mount(host);
  await flush();
  button(host, 'publishNext').click();
  await flush();
  button(host, 'submit').click();
  await flush();
  expect(mocks.operation).toHaveBeenCalledWith(
    'posts',
    expect.objectContaining({ body: '原来的草稿', topics: ['mid-autumn'] }),
  );
  app.unmount();
});

it('closes empty drafts directly and lets users keep, discard or continue a nonempty draft', async () => {
  const host = document.createElement('div'),
    close = vi.fn();
  const app = createApp(Editor, {
    topics: [{ value: 'tips', label: 'Tips' }],
    initialTopic: 'tips',
    profileEnabled: true,
    onClose: close,
  });
  app.mount(host);
  await flush();
  (host.querySelector('[data-close]') as HTMLButtonElement).click();
  expect(close).toHaveBeenCalledOnce();
  expect(mocks.alert).not.toHaveBeenCalled();
  close.mockClear();
  await body(host, 'Draft content');
  (host.querySelector('[data-close]') as HTMLButtonElement).click();
  mocks.alert.mock.lastCall![0].onCancel();
  expect(close).not.toHaveBeenCalled();
  (host.querySelector('[data-close]') as HTMLButtonElement).click();
  mocks.alert.mock.lastCall![0].onOk('keep');
  expect(close).toHaveBeenCalledOnce();
  expect(localStorage.getItem('community-post-draft:a|user|:new')).toContain('Draft content');
  (host.querySelector('[data-close]') as HTMLButtonElement).click();
  mocks.alert.mock.lastCall![0].onOk('clear');
  expect(localStorage.getItem('community-post-draft:a|user|:new')).toBeNull();
  app.unmount();
});

it.each(['published', 'pending_review'])('allows saved %s navigation before the editor unmounts', async (status) => {
  let resolveWrite!: (value: unknown) => void;
  mocks.write.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveWrite = resolve;
      }),
  );
  let navigation: Promise<boolean> | undefined;
  const host = document.createElement('div');
  const app = createApp(Editor, {
    topics: [],
    profileEnabled: true,
    onSaved: () => {
      navigation = mocks.leave.mock.lastCall![0]();
    },
  });
  app.mount(host);
  await body(host, '重新发布的内容');
  button(host, 'publishNext').click();
  await flush();
  button(host, 'submit').click();
  await flush();
  expect(await mocks.leave.mock.lastCall![0]()).toBe(false);
  resolveWrite({ status });
  await flush();
  expect(navigation).toBeDefined();
  expect(await navigation).toBe(true);
  expect(mocks.alert).not.toHaveBeenCalled();
  app.unmount();
});

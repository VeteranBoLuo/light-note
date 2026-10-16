import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import { apiBasePost } from '@/http/request';
import { preflightBookmarkUrl } from '@/composables/useBookmarkUrlResolution';
import { uploadManagedCloudFile } from '@/api/cloudFileUploadApi';
import { completeAndroidShare, finishAndroidShare } from '@/utils/androidIncomingShare';
import type { QuickCaptureShareDraft } from '@/utils/incomingShare';

/**
 * 快速添加 · 系统分享预填。
 *
 * 分享草稿只在挂载时取走一次；保存成功后清理原生暂存并把「继续添加」换成「完成」，
 * 关闭弹窗视为放弃，切换账号则保留暂存等待新身份重新处理。
 */

const account = reactive({ id: 'share-user', adminContext: null as null | { id: string } });
const layout = { isMobile: false, isTablet: false, isDesktop: true };
let pendingDraft: QuickCaptureShareDraft | null = null;
const inbox = {
  quickCaptureType: 'bookmark',
  quickCaptureTypeExplicit: false,
  pendingTotal: 0,
  refreshCount: vi.fn(),
  refreshList: vi.fn(),
  takeQuickCaptureShare: () => {
    const draft = pendingDraft;
    pendingDraft = null;
    return draft;
  },
};
const todo = { refreshCount: vi.fn(), refreshList: vi.fn() };
const cloud = { refreshAfterFileMutation: vi.fn().mockResolvedValue(true) };
const route = reactive({ path: '/workbenches', query: {} });
vi.mock('@/store/cloudSpace', () => ({ default: () => cloud }));

vi.mock('@/store', () => ({
  useUserStore: () => account,
  bookmarkStore: () => layout,
  inboxStore: () => inbox,
  todoStore: () => todo,
}));
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push: vi.fn(), currentRoute: { value: route } }),
}));
vi.mock('@/http/request', () => ({ apiBasePost: vi.fn() }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/api/cloudFileUploadApi', () => ({
  uploadManagedCloudFile: vi.fn(),
  createManagedUploadBatchRequest: vi.fn(),
}));
vi.mock('@/api/todoApi', () => ({
  createTodoPlanV2: vi.fn(),
  previewTodoPlanV2: vi.fn(),
  getTodoPlanV2Config: vi.fn().mockResolvedValue({ status: 200, data: { quickReminderPresetsEnabled: true } }),
}));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: () => false }));
vi.mock('@/composables/useBookmarkUrlResolution', () => ({ preflightBookmarkUrl: vi.fn() }));
vi.mock('@/utils/mobileOverlayHistory', () => ({ closeCurrentMobileOverlayThen: (fn: () => void) => fn() }));
vi.mock('@/utils/androidBridge', () => ({ isLightNoteAndroidApp: () => true }));
vi.mock('@/utils/androidIncomingShare', () => ({ completeAndroidShare: vi.fn(), finishAndroidShare: vi.fn() }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn(), loading: vi.fn(() => vi.fn()) },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: { name: 'BModalStub', template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: { name: 'BDrawerStub', template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BTabs.vue', () => ({
  default: { name: 'BTabsStub', template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: { name: 'BInputStub', props: ['value'], template: '<textarea class="input-stub" :value="value" />' },
}));
vi.mock('@/components/base/BasicComponents/BUpload.vue', () => ({
  default: { name: 'BUploadStub', template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));
vi.mock('@/components/todo/QuickTodoForm.vue', () => ({
  default: { name: 'QuickTodoFormStub', template: '<div />' },
}));
vi.mock('@/components/todo/TodoEditorModal.vue', () => ({
  default: { name: 'TodoEditorModalStub', template: '<div />' },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    name: 'BButtonStub',
    props: ['disabled', 'loading', 'type', 'size'],
    template: '<button :disabled="disabled"><slot /></button>',
  },
}));

const { default: QuickCaptureModal } = await import('./QuickCaptureModal.vue');

let cleanup: (() => void) | undefined;

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(QuickCaptureModal, { visible: true }) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

function buttonByText(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.trim() === text) as
    HTMLButtonElement | undefined;
}

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

function draft(overrides: Partial<QuickCaptureShareDraft> = {}): QuickCaptureShareDraft {
  return {
    id: 'a'.repeat(32),
    text: '示例文章\nhttps://example.com/a',
    files: [],
    bookmarkName: '示例文章',
    skippedFiles: 0,
    textTruncated: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  account.id = 'share-user';
  route.path = '/workbenches';
  inbox.quickCaptureType = 'bookmark';
  pendingDraft = null;
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('快速添加 · 系统分享', () => {
  it('分享的网页按书签保存，使用分享标题、系统分享来源和同名避让，成功后提供「完成」', async () => {
    pendingDraft = draft();
    vi.mocked(preflightBookmarkUrl).mockResolvedValue({ ok: true, url: 'https://example.com/a' } as any);
    vi.mocked(apiBasePost).mockResolvedValue({ status: 200, data: { id: 'b1', name: '示例文章' } } as any);
    const host = mount();

    expect(host.textContent).toContain(zhCN.inbox.shareCaptureEyebrow);
    expect(host.querySelector<HTMLTextAreaElement>('.input-stub')?.value).toBe('示例文章\nhttps://example.com/a');

    buttonByText(host, zhCN.inbox.collect)!.click();
    await settle();

    expect(apiBasePost).toHaveBeenCalledWith(
      '/api/bookmark/addBookmark',
      expect.objectContaining({
        name: '示例文章',
        url: 'https://example.com/a',
        inboxSource: 'system_share',
        nameConflict: 'suffix',
      }),
    );
    expect(completeAndroidShare).toHaveBeenCalledWith('a'.repeat(32));
    expect(buttonByText(host, zhCN.inbox.continueCapture)).toBeUndefined();

    buttonByText(host, zhCN.inbox.shareFinish)!.click();
    expect(finishAndroidShare).toHaveBeenCalledTimes(1);
    cleanup?.();
    cleanup = undefined;
    expect(completeAndroidShare).toHaveBeenCalledTimes(1);
  });

  it('分享的文件进入文件列表并标注来源，跳过数量写进提示', async () => {
    inbox.quickCaptureType = 'file';
    pendingDraft = draft({
      text: '',
      bookmarkName: '',
      files: [new File(['a'], '截图.png', { type: 'image/png' })],
      skippedFiles: 2,
    });
    vi.mocked(uploadManagedCloudFile).mockResolvedValue({ fileId: '1', filename: '截图.png', status: '已上传' } as any);
    const host = mount();

    expect(host.querySelectorAll('.file-list__item')).toHaveLength(1);
    expect(host.querySelector('.file-list__source')?.textContent).toBe(zhCN.inbox.fromShare);
    expect(host.textContent).toContain('有 2 个文件无法读取或超出单次上限');

    buttonByText(host, zhCN.inbox.collect)!.click();
    await settle();

    expect(uploadManagedCloudFile).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ addToInbox: true, inboxSource: 'system_share' }),
    );
    expect(completeAndroidShare).toHaveBeenCalledWith('a'.repeat(32));
  });

  it('100 个、500MiB 的分享最多 3 个任务，部分成功刷新当前云空间，重试只上传失败项再刷新', async () => {
    route.path = '/cloudSpace';
    inbox.quickCaptureType = 'file';
    const readers = Array.from({ length: 100 }, (_, index) => vi.fn(async () => new File(['x'], `${index}.jpg`)));
    pendingDraft = draft({
      text: '',
      files: readers.map((read, index) => ({
        name: `${index}.jpg`,
        type: 'image/jpeg',
        size: 5 * 1024 * 1024,
        lastModified: index,
        read,
      })),
    });
    const finishers: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    let fail = true;
    vi.mocked(uploadManagedCloudFile).mockImplementation(async (file) => {
      active++;
      maxActive = Math.max(active, maxActive);
      if ('read' in file) await file.read();
      await new Promise<void>((resolve) => finishers.push(resolve));
      active--;
      if (file.name === '4.jpg' && fail)
        throw Object.assign(new Error('read failed'), { code: 'SHARE_FILE_UNREADABLE' });
      return { filename: file.name, fileId: file.name, status: '已上传' };
    });
    const host = mount();
    expect(host.querySelectorAll('.file-list__item')).toHaveLength(100);
    expect(readers.every((read) => read.mock.calls.length === 0)).toBe(true);
    buttonByText(host, zhCN.inbox.collect)!.click();
    await settle();
    expect(readers.filter((read) => read.mock.calls.length)).toHaveLength(3);
    for (let i = 0; i < 35; i++) {
      finishers.splice(0).forEach((resolve) => resolve());
      await settle();
    }
    expect(maxActive).toBe(3);
    expect(host.querySelectorAll('.file-list__item')).toHaveLength(1);
    expect(host.querySelector('.file-list__read-error')?.textContent).toContain('读取失败');
    expect(cloud.refreshAfterFileMutation).toHaveBeenCalledTimes(1);
    expect(completeAndroidShare).not.toHaveBeenCalled();
    fail = false;
    buttonByText(host, zhCN.inbox.collect)!.click();
    await settle();
    finishers.splice(0).forEach((resolve) => resolve());
    await settle();
    expect(cloud.refreshAfterFileMutation).toHaveBeenCalledTimes(2);
    expect(cloud.refreshAfterFileMutation).toHaveBeenLastCalledWith({ preserveLoaded: true });
    expect(readers[4]).toHaveBeenCalledTimes(2);
    expect(readers[5]).toHaveBeenCalledTimes(1);
    expect(completeAndroidShare).toHaveBeenCalledTimes(1);
  });

  it.each(['/cloudSpace', '/workbenches'])('文件全部上传成功：%s 仅刷新当前云空间', async (path) => {
    route.path = path;
    pendingDraft = draft({ text: '', files: [new File(['x'], 'image.jpg')] });
    vi.mocked(uploadManagedCloudFile).mockResolvedValue({
      fileId: 'new-file',
      filename: 'image.jpg',
      status: '已上传',
    });
    const host = mount();
    buttonByText(host, zhCN.inbox.collect)!.click();
    await settle();
    expect(cloud.refreshAfterFileMutation).toHaveBeenCalledTimes(path === '/cloudSpace' ? 1 : 0);
    expect(completeAndroidShare).toHaveBeenCalledTimes(1);
  });

  it('全部上传失败不刷新云空间，保留文件供重试', async () => {
    route.path = '/cloudSpace';
    pendingDraft = draft({ text: '', files: [new File(['x'], 'image.jpg')] });
    vi.mocked(uploadManagedCloudFile).mockRejectedValue(new Error('upload failed'));
    const host = mount();
    buttonByText(host, zhCN.inbox.collect)!.click();
    await settle();
    expect(cloud.refreshAfterFileMutation).not.toHaveBeenCalled();
    expect(completeAndroidShare).not.toHaveBeenCalled();
    expect(host.querySelectorAll('.file-list__item')).toHaveLength(1);
  });

  it('上传期间切换账号，旧上传结果不能刷新新账号的云空间', async () => {
    route.path = '/cloudSpace';
    pendingDraft = draft({ text: '', files: [new File(['x'], 'image.jpg')] });
    let finish!: () => void;
    vi.mocked(uploadManagedCloudFile).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ fileId: 'old-user-file', filename: 'image.jpg', status: '已上传' });
        }),
    );
    const host = mount();
    buttonByText(host, zhCN.inbox.collect)!.click();
    await settle();
    account.id = 'another-user';
    await nextTick();
    finish();
    await settle();
    expect(cloud.refreshAfterFileMutation).not.toHaveBeenCalled();
    expect(completeAndroidShare).not.toHaveBeenCalled();
  });

  it('全部跳过仍展示文件页、分类原因和明细，不能提交空文件集', async () => {
    pendingDraft = draft({
      text: '',
      skippedFiles: 3,
      skippedFileCounts: { count_limit: 1, size_limit: 1, unreadable: 1 },
      skippedFileDetails: [
        { name: 'too-big.mp4', reason: 'size_limit' },
        { name: 'broken.jpg', reason: 'unreadable' },
      ],
    });
    const host = mount();
    expect(host.textContent).toContain('超出数量上限');
    expect(host.textContent).toContain('超出总大小上限');
    expect(buttonByText(host, zhCN.inbox.collect)?.disabled).toBe(true);
    buttonByText(host, zhCN.inbox.shareShowSkipped)!.click();
    await nextTick();
    expect(host.querySelector('#share-skipped-details')?.textContent).toContain('too-big.mp4');
    expect(host.querySelector('#share-skipped-details')?.textContent).toContain('broken.jpg');
  });

  it('文字和文件一起分享时先存文件，文字保留到「继续添加」，全部保存后才清理暂存', async () => {
    inbox.quickCaptureType = 'file';
    pendingDraft = draft({
      text: '会议白板的说明',
      bookmarkName: '',
      files: [new File(['a'], '白板.jpg', { type: 'image/jpeg' })],
    });
    vi.mocked(uploadManagedCloudFile).mockResolvedValue({ fileId: '1', filename: '白板.jpg', status: '已上传' } as any);
    vi.mocked(apiBasePost).mockResolvedValue({ status: 200, data: { id: 'n1' } } as any);
    const host = mount();
    expect(host.textContent).toContain(zhCN.inbox.shareTextKept);

    buttonByText(host, zhCN.inbox.collect)!.click();
    await settle();
    expect(completeAndroidShare).not.toHaveBeenCalled();
    expect(buttonByText(host, zhCN.inbox.shareFinish)).toBeUndefined();

    buttonByText(host, zhCN.inbox.continueCapture)!.click();
    await nextTick();
    expect(host.querySelector<HTMLTextAreaElement>('.input-stub')?.value).toBe('会议白板的说明');
    buttonByText(host, zhCN.inbox.collect)!.click();
    await settle();

    expect(apiBasePost).toHaveBeenCalledWith(
      '/api/note/addNote',
      expect.objectContaining({ content: '会议白板的说明', inboxSource: 'system_share' }),
    );
    expect(completeAndroidShare).toHaveBeenCalledTimes(1);
    expect(buttonByText(host, zhCN.inbox.shareFinish)).toBeDefined();
  });

  it('未保存就关闭视为放弃，通知原生清理暂存', async () => {
    pendingDraft = draft();
    mount();
    cleanup?.();
    cleanup = undefined;
    expect(completeAndroidShare).toHaveBeenCalledWith('a'.repeat(32));
  });

  it('切换账号时保留暂存，等待新身份重新处理', async () => {
    pendingDraft = draft();
    mount();
    account.id = 'another-user';
    await nextTick();
    cleanup?.();
    cleanup = undefined;
    expect(completeAndroidShare).not.toHaveBeenCalled();
  });

  it('没有分享草稿时保持普通快速添加，不清理任何暂存', async () => {
    const host = mount();
    expect(host.textContent).toContain(zhCN.inbox.quickCaptureEyebrow);
    expect(host.textContent).not.toContain(zhCN.inbox.shareCaptureEyebrow);
    expect(buttonByText(host, zhCN.inbox.collect)?.disabled).toBe(true);
    cleanup?.();
    cleanup = undefined;
    expect(completeAndroidShare).not.toHaveBeenCalled();
  });
});

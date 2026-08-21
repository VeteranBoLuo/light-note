import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';

const mocks = vi.hoisted(() => ({
  cleanupImages: vi.fn(() => Promise.resolve({ status: 200 })),
  deleteLog: vi.fn(() => Promise.resolve({ status: 200 })),
  listLogs: vi.fn(),
  saveLog: vi.fn(),
  uploadImage: vi.fn(),
  message: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  uploadFile: null as File | null,
}));

vi.mock('@/api/updateLogApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api/updateLogApi')>();
  return {
    ...original,
    cleanupUpdateLogImages: mocks.cleanupImages,
    deleteUpdateLog: mocks.deleteLog,
    listManagedUpdateLogs: mocks.listLogs,
    saveUpdateLog: mocks.saveLog,
    uploadUpdateLogImage: mocks.uploadImage,
  };
});

vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/utils/common', () => ({ noteContentToHtml: vi.fn(() => Promise.resolve('')) }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: mocks.message }));
vi.mock('@/components/base/BasicComponents/BModal/Alert', () => ({ default: { alert: vi.fn() } }));

vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    name: 'BModalStub',
    props: ['visible'],
    emits: ['update:visible', 'close'],
    setup(props: { visible: boolean }, { slots }: { slots: Record<string, () => unknown> }) {
      return () => (props.visible ? h('section', { class: 'modal-stub' }, slots.default?.()) : null);
    },
  },
}));

vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    name: 'BButtonStub',
    props: ['disabled', 'loading'],
    setup(
      props: { disabled?: boolean },
      { slots, attrs }: { slots: Record<string, () => unknown>; attrs: Record<string, unknown> },
    ) {
      return () => h('button', { ...attrs, disabled: props.disabled }, slots.default?.());
    },
  },
}));

vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({
  default: { name: 'BLoadingStub', render: () => h('span') },
}));

vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: { name: 'BSelectStub', render: () => h('div', { class: 'select-stub' }) },
}));

vi.mock('@/components/base/BasicComponents/BTabs.vue', () => ({
  default: { name: 'BTabsStub', render: () => h('div', { class: 'tabs-stub' }) },
}));

vi.mock('@/components/base/BasicComponents/BUpload.vue', () => ({
  default: {
    name: 'BUploadStub',
    emits: ['change'],
    setup(
      _props: unknown,
      { slots, emit }: { slots: Record<string, () => unknown>; emit: (event: string, files: File[]) => void },
    ) {
      return () =>
        h(
          'div',
          {
            class: 'upload-stub',
            onClick: () => {
              if (mocks.uploadFile) emit('change', [mocks.uploadFile]);
            },
          },
          slots.default?.(),
        );
    },
  },
}));

const { default: UpdateLogEditor } = await import('./UpdateLogEditor.vue');

let app: ReturnType<typeof createApp> | undefined;
let host: HTMLDivElement | undefined;

function updateLogItem(contentMarkdown = '第一段\n\n第二段') {
  return {
    id: 'log-1',
    title: '版本更新',
    publishDate: '2026-08-21',
    summary: '',
    highlights: [],
    tags: [],
    contentMarkdown,
    imageKeys: [],
    status: 'draft' as const,
  };
}

async function mountEditor(contentMarkdown?: string) {
  mocks.listLogs.mockResolvedValue({ status: 200, data: { items: [updateLogItem(contentMarkdown)] } });
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(UpdateLogEditor, { visible: true, logId: 'log-1' });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          common: { loading: '加载中', delete: '删除', cancel: '取消', maxTotalSize: '总文件大小不能超过 {n}MB' },
          changelog: {
            imageAlt: '更新日志图片',
            imageUploadSuccess: '图片已插入光标位置，可切换到预览查看',
            imageUploadFailed: '图片上传失败',
            imageUploadBusy: '上一张图片仍在上传，请稍后再试',
            imageTypeUnsupported: '仅支持指定图片',
            status: { draft: '草稿', published: '已发布' },
            tabs: { edit: '编辑', preview: '预览' },
            imageSizes: { original: '原始', small: '小', medium: '中', large: '大', full: '通栏' },
          },
        },
      },
      missingWarn: false,
      fallbackWarn: false,
    }),
  );
  app.directive('mermaid', {});
  app.mount(host);
  await vi.waitFor(() => expect(mocks.listLogs).toHaveBeenCalledTimes(1));
  await nextTick();
  await nextTick();
  const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
  if (!textarea) throw new Error('markdown textarea not found');
  return textarea;
}

function imagePasteEvent(file?: File) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: file ? [{ kind: 'file', type: file.type, getAsFile: () => file }] : [],
      files: file ? [file] : [],
    },
  });
  return event;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uploadFile = new File(['button-image'], 'button.png', { type: 'image/png' });
  mocks.uploadImage.mockResolvedValue({
    status: 200,
    data: {
      objectKey: 'update-logs/log-1/button.png',
      url: '/api/updateLog/image/log-1/button.png',
    },
  });
});

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = undefined;
  host = undefined;
  mocks.uploadFile = null;
});

describe('UpdateLogEditor 图片插入', () => {
  it('按钮上传后把图片插入当前光标并把焦点留在插入位置', async () => {
    const textarea = await mountEditor();
    const cursor = textarea.value.indexOf('第二段');
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);

    host?.querySelector<HTMLButtonElement>('.upload-stub button')?.click();

    await vi.waitFor(() => expect(mocks.uploadImage).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(textarea.value).toContain('/api/updateLog/image/log-1/button.png'));
    expect(textarea.value).toBe(
      '第一段\n\n<img src="/api/updateLog/image/log-1/button.png" alt="button" data-ln-size="medium" />\n\n第二段',
    );
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(textarea.value.indexOf('第二段'));
    expect(mocks.message.success).toHaveBeenCalledWith('图片已插入光标位置，可切换到预览查看');
  });

  it('图片粘贴复用上传插入链路，纯文字粘贴继续交给 textarea 原生处理', async () => {
    const textarea = await mountEditor();
    const pastedFile = new File(['clipboard-image'], 'clipboard.png', { type: 'image/png' });
    mocks.uploadImage.mockResolvedValueOnce({
      status: 200,
      data: {
        objectKey: 'update-logs/log-1/clipboard.png',
        url: '/api/updateLog/image/log-1/clipboard.png',
      },
    });
    const cursor = textarea.value.indexOf('第二段');
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
    const paste = imagePasteEvent(pastedFile);

    textarea.dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(mocks.uploadImage).toHaveBeenCalledWith('log-1', pastedFile, expect.any(Function)));
    await vi.waitFor(() => expect(textarea.value).toContain('/api/updateLog/image/log-1/clipboard.png'));
    expect(textarea.value.indexOf('/api/updateLog/image/log-1/clipboard.png')).toBeLessThan(
      textarea.value.indexOf('第二段'),
    );

    mocks.uploadImage.mockClear();
    const textPaste = imagePasteEvent();
    textarea.dispatchEvent(textPaste);
    expect(textPaste.defaultPrevented).toBe(false);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it('上传期间正文变化时使用完成时的真实光标，不套用旧偏移', async () => {
    let resolveUpload: ((value: unknown) => void) | undefined;
    mocks.uploadImage.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const textarea = await mountEditor();
    textarea.focus();
    textarea.setSelectionRange(0, 0);
    host?.querySelector<HTMLButtonElement>('.upload-stub button')?.click();
    await vi.waitFor(() => expect(mocks.uploadImage).toHaveBeenCalledTimes(1));

    textarea.value = '用户继续编辑\n\n第二段';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const currentCursor = textarea.value.indexOf('第二段');
    textarea.setSelectionRange(currentCursor, currentCursor);
    resolveUpload?.({
      status: 200,
      data: {
        objectKey: 'update-logs/log-1/late.png',
        url: '/api/updateLog/image/log-1/late.png',
      },
    });

    await vi.waitFor(() => expect(textarea.value).toContain('/api/updateLog/image/log-1/late.png'));
    expect(textarea.value).toBe(
      '用户继续编辑\n\n<img src="/api/updateLog/image/log-1/late.png" alt="button" data-ln-size="medium" />\n\n第二段',
    );
  });

  it('粘贴不支持或超限图片时阻止无效正文并且不发起上传', async () => {
    const textarea = await mountEditor();
    const svgPaste = imagePasteEvent(new File(['<svg />'], 'unsafe.svg', { type: 'image/svg+xml' }));
    textarea.dispatchEvent(svgPaste);
    expect(svgPaste.defaultPrevented).toBe(true);
    expect(mocks.message.warning).toHaveBeenCalledWith('仅支持指定图片');

    mocks.message.warning.mockClear();
    const oversizedPaste = imagePasteEvent(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
    );
    textarea.dispatchEvent(oversizedPaste);
    expect(oversizedPaste.defaultPrevented).toBe(true);
    expect(mocks.message.warning).toHaveBeenCalledWith('总文件大小不能超过 5MB');
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });
});

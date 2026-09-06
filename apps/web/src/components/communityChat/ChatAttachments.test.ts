import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${Object.values(params).join(':')}` : key),
  }),
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    props: ['disabled', 'loading'],
    template: '<button type="button" :disabled="disabled"><slot /></button>',
  },
}));
vi.mock('@/components/base/BasicComponents/BTooltip.vue', () => ({
  default: { template: '<span class="tooltip-stub"><slot /></span>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span class="svg-icon-stub" />' },
}));

vi.mock('@/components/imagePreview/DerivedImage.vue', () => ({
  default: { props: ['source', 'resourceId', 'originalUrl', 'alt'], template: '<img :alt="alt" />' },
}));

const { default: ChatMessageAttachments } = await import('./ChatMessageAttachments.vue');
const { default: ChatPendingAttachments } = await import('./ChatPendingAttachments.vue');

const cleanupCallbacks: Array<() => void> = [];

afterEach(() => {
  while (cleanupCallbacks.length) cleanupCallbacks.pop()?.();
});

function mount(component: any, props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(component, props);
  app.mount(host);
  cleanupCallbacks.push(() => {
    app.unmount();
    host.remove();
  });
  return host;
}

describe('ChatMessageAttachments', () => {
  it('可预览文件打开预览、未知格式直接下载，过期图片和文件只保留元数据', async () => {
    const emitted = { preview: [] as string[], download: [] as string[] };
    const host = mount(ChatMessageAttachments, {
      attachments: [
        {
          publicId: 'image-ready',
          kind: 'image',
          fileName: 'photo.png',
          fileType: 'image/png',
          fileSize: 120,
          availability: 'available',
          expiresAt: '2099-01-01T00:00:00.000Z',
          url: '/api/community-chat/images/image-ready',
          width: 640,
          height: 480,
        },
        {
          publicId: 'pdf-ready',
          kind: 'file',
          fileName: 'report.pdf',
          fileType: 'application/pdf',
          fileSize: 2048,
          availability: 'available',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
        {
          publicId: 'binary-ready',
          kind: 'file',
          fileName: 'capture.bin',
          fileType: 'application/octet-stream',
          fileSize: 4096,
          availability: 'available',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
        {
          publicId: 'image-expired',
          kind: 'image',
          fileName: 'old-photo.webp',
          fileType: 'image/webp',
          fileSize: 512,
          availability: 'expired',
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
        {
          publicId: 'file-expired',
          kind: 'file',
          fileName: 'old-notes.txt',
          fileType: 'text/plain',
          fileSize: 24,
          availability: 'expired',
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      readyImageIds: new Set(['image-ready']),
      onOpenFile: (attachment: { publicId: string }) => emitted.preview.push(attachment.publicId),
      onDownloadFile: (attachment: { publicId: string }) => emitted.download.push(attachment.publicId),
    });

    expect(host.querySelectorAll('.chat-attachments__image')).toHaveLength(1);
    expect(host.textContent).toContain('communityChat.attachment.imageExpired');
    expect(host.textContent).toContain('communityChat.attachment.resourceExpired');
    expect(host.querySelectorAll('.chat-attachments__file.is-expired button')).toHaveLength(0);

    const fileActions = host.querySelectorAll<HTMLButtonElement>('.chat-attachments__file-main');
    fileActions[0]?.click();
    fileActions[1]?.click();
    await nextTick();
    expect(emitted.preview).toEqual(['pdf-ready']);
    expect(emitted.download).toEqual(['binary-ready']);
  });
});

describe('ChatPendingAttachments', () => {
  it('上传、失败和就绪状态分别展示进度、实色错误反馈与可操作入口', async () => {
    const emitted = { retry: [] as string[], remove: [] as string[], preview: [] as string[] };
    const host = mount(ChatPendingAttachments, {
      attachments: [
        {
          localId: 'local-uploading',
          publicId: 'local-uploading',
          kind: 'file',
          fileName: 'uploading.txt',
          fileType: 'text/plain',
          fileSize: 1024,
          availability: 'available',
          expiresAt: null,
          state: 'uploading',
          progress: 42,
        },
        {
          localId: 'local-failed',
          publicId: 'local-failed',
          kind: 'file',
          fileName: 'failed.txt',
          fileType: 'text/plain',
          fileSize: 1024,
          availability: 'available',
          expiresAt: null,
          state: 'failed',
          progress: 0,
        },
        {
          localId: 'local-image',
          publicId: 'image-ready',
          kind: 'image',
          fileName: 'ready.png',
          fileType: 'image/png',
          fileSize: 1024,
          availability: 'available',
          expiresAt: null,
          state: 'ready',
          progress: 100,
          url: '/api/community-chat/images/image-ready',
        },
      ],
      onRetry: (attachment: { localId: string }) => emitted.retry.push(attachment.localId),
      onRemove: (attachment: { localId: string }) => emitted.remove.push(attachment.localId),
      onPreview: (attachment: { localId: string }) => emitted.preview.push(attachment.localId),
    });

    expect(host.textContent).toContain('communityChat.attachment.uploadProgress:42');
    expect(host.textContent).toContain('communityChat.attachment.uploadFailed');
    expect(host.querySelector('.is-failed')).not.toBeNull();
    expect(host.querySelector<HTMLElement>('.chat-pending-attachment__progress > span')?.style.width).toBe('42%');
    expect(host.querySelector('.is-uploading .chat-pending-attachment__remove')).not.toBeNull();

    host.querySelector<HTMLButtonElement>('.chat-pending-attachment__retry')?.click();
    host.querySelector<HTMLButtonElement>('.chat-pending-attachment__image')?.click();
    host.querySelector<HTMLButtonElement>('.is-failed .chat-pending-attachment__remove')?.click();
    await nextTick();
    expect(emitted.retry).toEqual(['local-failed']);
    expect(emitted.preview).toEqual(['local-image']);
    expect(emitted.remove).toEqual(['local-failed']);
  });
});

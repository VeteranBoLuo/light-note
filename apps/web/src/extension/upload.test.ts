import { beforeEach, describe, expect, it, vi } from 'vitest';

const extensionPost = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ extensionPost }));

const { uploadExtensionFile } = await import('./upload');

class SuccessfulXhr {
  status = 200;
  upload = { addEventListener: vi.fn() };
  private listeners = new Map<string, Array<() => void>>();
  open = vi.fn();
  setRequestHeader = vi.fn();
  addEventListener(name: string, listener: () => void) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }
  send = vi.fn(() => queueMicrotask(() => this.emit('load')));
  abort = vi.fn(() => this.emit('abort'));
  protected emit(name: string) {
    for (const listener of this.listeners.get(name) || []) listener();
  }
}

class PendingXhr extends SuccessfulXhr {
  override send = vi.fn();
}

describe('浏览器插件托管文件上传', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extensionPost.mockResolvedValueOnce({
      uploadUrl: 'https://obs.example/upload',
      objectKey: 'files/user-1/uploads/00000000-0000-4000-8000-000000000001.pdf',
      headers: {},
      fileType: 'application/pdf',
    });
  });

  it('确认失败会调用中止接口清理未确认对象', async () => {
    vi.stubGlobal('XMLHttpRequest', SuccessfulXhr);
    extensionPost.mockRejectedValueOnce(new Error('confirm failed')).mockResolvedValueOnce({ deleted: true });
    const file = new File(['pdf'], '资料.pdf', { type: 'application/pdf' });

    await expect(uploadExtensionFile(file, { addToInbox: true })).rejects.toThrow('confirm failed');
    expect(extensionPost).toHaveBeenNthCalledWith(
      3,
      '/api/file/abortManagedUpload',
      { objectKey: 'files/user-1/uploads/00000000-0000-4000-8000-000000000001.pdf' },
    );
  });

  it('用户取消 PUT 后同样清理对象并保留 AbortError 供队列标记可重试', async () => {
    vi.stubGlobal('XMLHttpRequest', PendingXhr);
    extensionPost.mockResolvedValueOnce({ deleted: true });
    const controller = new AbortController();
    const promise = uploadExtensionFile(new File(['x'], 'x.txt'), {
      addToInbox: false,
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(extensionPost).toHaveBeenNthCalledWith(
      2,
      '/api/file/abortManagedUpload',
      { objectKey: 'files/user-1/uploads/00000000-0000-4000-8000-000000000001.pdf' },
    );
  });

  it('确认回包丢失但对象已落库时从中止核验恢复成功，不让重试生成重复文件', async () => {
    vi.stubGlobal('XMLHttpRequest', SuccessfulXhr);
    extensionPost
      .mockRejectedValueOnce(new TypeError('response lost'))
      .mockResolvedValueOnce({
        deleted: false,
        alreadyConfirmed: true,
        fileId: '31',
        filename: '资料.pdf',
      });

    await expect(
      uploadExtensionFile(new File(['pdf'], '资料.pdf', { type: 'application/pdf' }), { addToInbox: true }),
    ).resolves.toEqual({ fileId: '31', filename: '资料.pdf', addedToInbox: true });
  });
});

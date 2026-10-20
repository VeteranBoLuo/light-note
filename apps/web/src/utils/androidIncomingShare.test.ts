import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANDROID_SHARE_EVENT,
  completeAndroidShare,
  finishAndroidShare,
  createAndroidShareFiles,
  onAndroidShareAvailable,
  peekAndroidShare,
  resetAndroidIncomingShareForTest,
} from './androidIncomingShare';

const id = 'c'.repeat(32);
const posted: Array<Record<string, unknown>> = [];

function installBridge(reply?: (message: Record<string, unknown>) => Record<string, unknown> | null) {
  window.LightNoteAndroid = {
    postMessage(raw: string) {
      const message = JSON.parse(raw);
      posted.push(message);
      const payload = reply?.(message);
      if (payload) queueMicrotask(() => window.__lightNoteAndroidShareResult?.({ token: message.token, ...payload }));
    },
  };
}

beforeEach(() => {
  posted.length = 0;
  resetAndroidIncomingShareForTest();
});

afterEach(() => {
  delete window.LightNoteAndroid;
  delete window.__lightNoteAndroidShareResult;
  vi.useRealTimers();
});

describe('androidIncomingShare', () => {
  it('没有原生桥时直接返回不支持', async () => {
    await expect(peekAndroidShare()).resolves.toEqual({ status: 'unsupported' });
  });

  it('按 token 取回原生暂存的分享清单', async () => {
    installBridge(() => ({ status: 'ready', share: { id, text: 'hello', subject: '', files: [] } }));
    const result = await peekAndroidShare();
    expect(posted[0]).toMatchObject({ type: 'share.peek' });
    expect(result).toMatchObject({ status: 'ready', share: { id, text: 'hello' } });
  });

  it('复制中的分享返回 preparing，等待原生事件', async () => {
    installBridge(() => ({ status: 'preparing' }));
    await expect(peekAndroidShare()).resolves.toEqual({ status: 'preparing' });
  });

  it('旧版 App 不回复时超时按不支持处理', async () => {
    vi.useFakeTimers();
    installBridge(() => null);
    const pending = peekAndroidShare();
    vi.advanceTimersByTime(1500);
    await expect(pending).resolves.toEqual({ status: 'unsupported' });
  });

  it('已处理的分享在原生删除前再次查询到也不会重复弹出，完成消息只发一次', async () => {
    installBridge(() => ({ status: 'ready', share: { id, text: 'hello', subject: '', files: [] } }));
    completeAndroidShare(id);
    completeAndroidShare(id);
    expect(posted.filter((message) => message.type === 'share.complete')).toEqual([
      { type: 'share.complete', shareId: id },
    ]);
    await expect(peekAndroidShare()).resolves.toEqual({ status: 'none' });
  });

  it('「完成」通知原生把轻笺移到后台', () => {
    installBridge();
    expect(finishAndroidShare()).toBe(true);
    expect(posted).toEqual([{ type: 'share.finish' }]);
  });

  it('原生派发事件时通知订阅者，取消订阅后不再触发', () => {
    const listener = vi.fn();
    const stop = onAndroidShareAvailable(listener);
    window.dispatchEvent(new Event(ANDROID_SHARE_EVENT));
    stop();
    window.dispatchEvent(new Event(ANDROID_SHARE_EVENT));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('清单不读文件，上传时按需读取；单项失败可以重试', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/1')) return new Response('', { status: 404 });
      return { ok: true, blob: async () => new Blob(['data']) } as Response;
    });
    const files = createAndroidShareFiles(
      {
        id,
        text: '',
        subject: '',
        textTruncated: false,
        skippedFiles: 0,
        files: [
          { index: 0, name: '截图.png', mimeType: 'image/png', size: 4 },
          { index: 1, name: '丢失.pdf', mimeType: 'application/pdf', size: 4 },
        ],
      },
      fetcher as unknown as typeof fetch,
    );
    expect(fetcher).not.toHaveBeenCalled();
    const controller = new AbortController();
    const file = await files[0].read(controller.signal);
    expect(fetcher).toHaveBeenCalledWith(`/__native-share/${id}/0`, {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    expect(file.name).toBe('截图.png');
    expect(file.type).toBe('image/png');
    await expect(files[1].read()).rejects.toMatchObject({ code: 'SHARE_FILE_UNREADABLE' });
    fetcher.mockResolvedValue({ ok: true, blob: async () => new Blob(['data']) } as Response);
    await expect(files[1].read()).resolves.toMatchObject({ name: '丢失.pdf', size: 4 });
  });

  it('取消读取不发请求，大小变化不作为原分享上传', async () => {
    const fetcher = vi.fn(async () => new Response('changed'));
    const [file] = createAndroidShareFiles(
      {
        id,
        text: '',
        subject: '',
        textTruncated: false,
        skippedFiles: 0,
        files: [{ index: 99, name: 'last.txt', mimeType: 'text/plain', size: 4 }],
      },
      fetcher,
    );
    const controller = new AbortController();
    controller.abort();
    await expect(file.read(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(file.read()).rejects.toMatchObject({ code: 'SHARE_FILE_UNREADABLE' });
    expect(fetcher).toHaveBeenCalledWith(`/__native-share/${id}/99`, expect.anything());
  });
});

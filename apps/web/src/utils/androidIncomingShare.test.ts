import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANDROID_SHARE_EVENT,
  completeAndroidShare,
  finishAndroidShare,
  loadAndroidShareFiles,
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

  it('逐个读取分享文件，单个失败只计数', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/1')) return new Response('', { status: 404 });
      return new Response('data', { status: 200 });
    });
    const result = await loadAndroidShareFiles(
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
    expect(fetcher).toHaveBeenNthCalledWith(1, `/__native-share/${id}/0`, { cache: 'no-store', credentials: 'omit' });
    expect(result.failed).toBe(1);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe('截图.png');
    expect(result.files[0].type).toBe('image/png');
  });
});

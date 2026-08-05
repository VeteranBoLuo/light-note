import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiBasePost = vi.fn();
vi.mock('@/http/request', () => ({ apiBasePost }));

const { deliverExportViaAndroidBridge } = await import('./androidFileExport');

const postMessage = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.LightNoteAndroid = { postMessage };
});

afterEach(() => {
  delete window.LightNoteAndroid;
});

const exportOptions = (overrides: Record<string, unknown> = {}) => ({
  noteId: 'note-1',
  content: '# 周报',
  fileName: '周报.md',
  format: 'md' as const,
  mimeType: 'text/markdown',
  ...overrides,
});

describe('deliverExportViaAndroidBridge', () => {
  it('把内容换成绝对地址后交给原生下载桥', async () => {
    apiBasePost.mockResolvedValue({
      status: 200,
      data: { downloadUrl: '/api/note/exportFile?token=abc', fileName: '周报.md', expiresIn: 180 },
    });

    const outcome = await deliverExportViaAndroidBridge(exportOptions());

    expect(outcome).toEqual({ ok: true });
    const [url, payload] = [apiBasePost.mock.calls[0][0], apiBasePost.mock.calls[0][1]] as [string, any];
    expect(url).toBe('/api/note/exportFile');
    expect(payload.id).toBe('note-1');
    expect(payload.format).toBe('md');
    // 内容以 base64 上传，不是原文
    expect(payload.contentBase64).toBe(btoa(unescape(encodeURIComponent('# 周报'))));

    // 原生 WebViewSupport.download 只认 http(s) 绝对地址，相对路径会被判非法
    const bridgeMessage = JSON.parse(postMessage.mock.calls[0][0]);
    expect(bridgeMessage.type).toBe('download');
    expect(bridgeMessage.url).toBe(`${window.location.origin}/api/note/exportFile?token=abc`);
    expect(bridgeMessage.fileName).toBe('周报.md');
  });

  it('PDF 二进制内容按 base64 原样上传', async () => {
    apiBasePost.mockResolvedValue({
      status: 200,
      data: { downloadUrl: '/api/note/exportFile?token=abc', fileName: '周报.pdf' },
    });
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);

    const outcome = await deliverExportViaAndroidBridge(
      exportOptions({
        content: new Blob([bytes], { type: 'application/pdf' }),
        fileName: '周报.pdf',
        format: 'pdf',
        mimeType: 'application/pdf',
      }),
    );

    expect(outcome).toEqual({ ok: true });
    const payload = apiBasePost.mock.calls[0][1] as any;
    expect(payload.contentBase64).toBe(btoa(String.fromCharCode(...bytes)));
  });

  it('内容超限单独报 too_large，让调用方给专门文案', async () => {
    apiBasePost.mockResolvedValue({ status: 413, msg: '笔记内容过大' });

    const outcome = await deliverExportViaAndroidBridge(exportOptions());

    expect(outcome).toEqual({ ok: false, reason: 'too_large', message: '笔记内容过大' });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('换票据失败时不碰桥，交回调用方降级', async () => {
    apiBasePost.mockResolvedValue({ status: 404, msg: '笔记不存在' });

    const outcome = await deliverExportViaAndroidBridge(exportOptions());

    expect(outcome).toEqual({ ok: false, reason: 'request_failed', message: '笔记不存在' });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('接口抛异常（离线）时不抛给调用方', async () => {
    apiBasePost.mockRejectedValue(new Error('Network Error'));

    await expect(deliverExportViaAndroidBridge(exportOptions())).resolves.toEqual({
      ok: false,
      reason: 'request_failed',
    });
  });

  it('桥不可用时报 bridge_failed', async () => {
    delete window.LightNoteAndroid;
    apiBasePost.mockResolvedValue({
      status: 200,
      data: { downloadUrl: '/api/note/exportFile?token=abc', fileName: '周报.md' },
    });

    const outcome = await deliverExportViaAndroidBridge(exportOptions());

    expect(outcome).toEqual({ ok: false, reason: 'bridge_failed' });
  });
});

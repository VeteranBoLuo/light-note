import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeAndroidDownloadProgress, onAndroidDownloadProgress, saveImageViaAndroid } from './androidBridge';

/*
 * 原生和网页是各自发版的：字段缺失、类型不对、状态改名都可能在旧 App + 新网页
 * （或反之）的组合里出现。这里锁住「脏数据不能画到进度条上」。
 */
describe('normalizeAndroidDownloadProgress', () => {
  const valid = {
    id: '42',
    fileName: 'report.pdf',
    status: 'running',
    bytesDownloaded: 512,
    totalBytes: 2048,
    percent: 25,
  };

  it('正常快照原样通过', () => {
    expect(normalizeAndroidDownloadProgress(valid)).toEqual(valid);
  });

  it('没有 id 的整条丢弃:进度靠 id 聚合,认不出是哪次下载', () => {
    expect(normalizeAndroidDownloadProgress({ ...valid, id: '' })).toBeNull();
    expect(normalizeAndroidDownloadProgress({ ...valid, id: undefined })).toBeNull();
  });

  it('非对象一律丢弃', () => {
    expect(normalizeAndroidDownloadProgress(null)).toBeNull();
    expect(normalizeAndroidDownloadProgress('42')).toBeNull();
    expect(normalizeAndroidDownloadProgress(undefined)).toBeNull();
  });

  it('数字 id 也接受(原生若改成数字不至于整条失效)', () => {
    expect(normalizeAndroidDownloadProgress({ ...valid, id: 42 })?.id).toBe('42');
  });

  it('未知状态回落成 running,而不是让界面显示空白状态', () => {
    expect(normalizeAndroidDownloadProgress({ ...valid, status: 'queued' })?.status).toBe('running');
    expect(normalizeAndroidDownloadProgress({ ...valid, status: undefined })?.status).toBe('running');
  });

  it('NaN / 非数字兜底,不能把 NaN 画进宽度', () => {
    const result = normalizeAndroidDownloadProgress({
      ...valid,
      bytesDownloaded: 'x',
      totalBytes: NaN,
      percent: 'y',
    });
    expect(result?.bytesDownloaded).toBe(0);
    expect(result?.totalBytes).toBe(-1);
    expect(result?.percent).toBe(-1);
  });

  it('总量为 0 或负数都归一成 -1(未知)', () => {
    expect(normalizeAndroidDownloadProgress({ ...valid, totalBytes: 0 })?.totalBytes).toBe(-1);
    expect(normalizeAndroidDownloadProgress({ ...valid, totalBytes: -5 })?.totalBytes).toBe(-1);
  });

  it('百分比夹在 0~100', () => {
    expect(normalizeAndroidDownloadProgress({ ...valid, percent: 180 })?.percent).toBe(100);
    expect(normalizeAndroidDownloadProgress({ ...valid, percent: 33.7 })?.percent).toBe(34);
  });

  it('成功一定收口到 100%:服务器不给 Content-Length 时原生算不出百分比', () => {
    const result = normalizeAndroidDownloadProgress({
      ...valid,
      status: 'success',
      percent: -1,
      totalBytes: -1,
    });
    expect(result?.percent).toBe(100);
  });

  it('缺文件名时给空串,由界面回落到「下载中」文案', () => {
    expect(normalizeAndroidDownloadProgress({ ...valid, fileName: undefined })?.fileName).toBe('');
  });
});

describe('onAndroidDownloadProgress', () => {
  it('装上 window 回调并把校验后的快照分发给订阅者', () => {
    const received: unknown[] = [];
    const off = onAndroidDownloadProgress((progress) => received.push(progress));

    expect(typeof window.__lightNoteAndroidDownloadProgress).toBe('function');
    window.__lightNoteAndroidDownloadProgress!({ id: '7', status: 'running', percent: 10 });
    expect(received).toHaveLength(1);

    // 脏数据不该到达订阅者
    window.__lightNoteAndroidDownloadProgress!({ status: 'running' });
    expect(received).toHaveLength(1);

    off();
    window.__lightNoteAndroidDownloadProgress!({ id: '7', status: 'running', percent: 20 });
    expect(received).toHaveLength(1);
  });

  it('一个订阅者抛错不影响其它订阅者,也不把异常抛回原生', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good: unknown[] = [];
    const offBad = onAndroidDownloadProgress(() => {
      throw new Error('boom');
    });
    const offGood = onAndroidDownloadProgress((progress) => good.push(progress));

    expect(() => window.__lightNoteAndroidDownloadProgress!({ id: '9', status: 'running' })).not.toThrow();
    expect(good).toHaveLength(1);

    offBad();
    offGood();
    errorSpy.mockRestore();
  });
});

/*
 * 图片保存桥。头像是 base64 存库的，DownloadManager 不收，只能让原生解码写盘；
 * 而正式版 1.0.0 没有这个通道，收到未知消息类型会静默忽略 —— 所以「等不到回复」
 * 必须被当成「不支持」而不是永远挂着。
 */
describe('saveImageViaAndroid', () => {
  const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ';

  afterEach(() => {
    delete (window as any).LightNoteAndroid;
    vi.useRealTimers();
  });

  it('没有原生桥（浏览器）直接返回不支持', async () => {
    await expect(saveImageViaAndroid(dataUrl, 'a.jpg')).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });

  it('原生回传成功', async () => {
    const posted: string[] = [];
    (window as any).LightNoteAndroid = { postMessage: (m: string) => posted.push(m) };
    const promise = saveImageViaAndroid(dataUrl, 'a.jpg');
    const token = JSON.parse(posted[0]).token;
    expect(JSON.parse(posted[0]).type).toBe('image.save');
    window.__lightNoteAndroidImageSaveResult!({ token, ok: true });
    await expect(promise).resolves.toEqual({ ok: true, reason: undefined });
  });

  it('原生回传失败原因原样带出', async () => {
    const posted: string[] = [];
    (window as any).LightNoteAndroid = { postMessage: (m: string) => posted.push(m) };
    const promise = saveImageViaAndroid(dataUrl, 'a.jpg');
    const token = JSON.parse(posted[0]).token;
    window.__lightNoteAndroidImageSaveResult!({ token, ok: false, reason: 'failed' });
    await expect(promise).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('token 不匹配的回复不会误结算别的请求', async () => {
    vi.useFakeTimers();
    const posted: string[] = [];
    (window as any).LightNoteAndroid = { postMessage: (m: string) => posted.push(m) };
    const promise = saveImageViaAndroid(dataUrl, 'a.jpg');
    window.__lightNoteAndroidImageSaveResult!({ token: 'someone-else', ok: true });
    // 仍在等自己的回复，直到超时才按不支持结算
    vi.advanceTimersByTime(8001);
    await expect(promise).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });

  it('旧版 App 不回复 → 超时按不支持处理，不会一直挂着', async () => {
    vi.useFakeTimers();
    (window as any).LightNoteAndroid = { postMessage: () => undefined };
    const promise = saveImageViaAndroid(dataUrl, 'a.jpg');
    vi.advanceTimersByTime(8001);
    await expect(promise).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });
});

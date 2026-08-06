import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildExportFileName,
  canSaveGeneratedFile,
  canShareGeneratedFile,
  deliverGeneratedFile,
} from './fileDelivery';

describe('buildExportFileName', () => {
  it('按格式拼扩展名，并清掉会让 a[download] 截断的非法字符', () => {
    expect(buildExportFileName('2026/07 周报: 复盘', '未命名文档', 'md')).toBe('2026 07 周报 复盘.md');
    expect(buildExportFileName('a\\b*c?d"e<f>g|h', '未命名文档', 'html')).toBe('a b c d e f g h.html');
  });

  it('标题为空或只有非法字符时回落到占位名', () => {
    expect(buildExportFileName('', '未命名文档', 'pdf')).toBe('未命名文档.pdf');
    expect(buildExportFileName('///', '未命名文档', 'pdf')).toBe('未命名文档.pdf');
  });

  it('限长 40 字，避免超长标题产生不可保存的文件名', () => {
    const name = buildExportFileName('笺'.repeat(60), '未命名文档', 'md');
    expect(name).toBe(`${'笺'.repeat(40)}.md`);
  });
});

describe('deliverGeneratedFile', () => {
  let originalShare: PropertyDescriptor | undefined;
  let originalCanShare: PropertyDescriptor | undefined;
  let originalCreateObjectUrl: PropertyDescriptor | undefined;
  let originalRevokeObjectUrl: PropertyDescriptor | undefined;
  const createObjectUrl = vi.fn(() => 'blob:https://boluo66.top/note-export');
  const revokeObjectUrl = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
    originalCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');
    originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    createObjectUrl.mockClear();
    revokeObjectUrl.mockClear();
  });

  afterEach(() => {
    if (originalShare) Object.defineProperty(navigator, 'share', originalShare);
    else delete (navigator as Navigator & { share?: Navigator['share'] }).share;
    if (originalCanShare) Object.defineProperty(navigator, 'canShare', originalCanShare);
    else delete (navigator as Navigator & { canShare?: Navigator['canShare'] }).canShare;
    if (originalCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
    else delete (URL as Partial<typeof URL>).createObjectURL;
    if (originalRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
    else delete (URL as Partial<typeof URL>).revokeObjectURL;
    // 桩在 window 上的原生桥必须清掉，否则后面的用例会被误判成运行在 App 内
    delete window.LightNoteAndroid;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('手机端优先系统分享，分享成功后不再触发下载', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });

    await expect(
      deliverGeneratedFile({ content: '# 笔记', fileName: '笔记.md', mimeType: 'text/markdown', preferShare: true }),
    ).resolves.toBe('shared');
    expect(share).toHaveBeenCalledOnce();
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('用户取消分享时不偷偷改成下载', async () => {
    const error = new DOMException('cancelled', 'AbortError');
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockRejectedValue(error) });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });

    await expect(
      deliverGeneratedFile({ content: '# 笔记', fileName: '笔记.md', mimeType: 'text/markdown', preferShare: true }),
    ).resolves.toBe('cancelled');
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('桌面端不请求分享，直接下载并延迟释放 blob URL', async () => {
    const share = vi.fn();
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await expect(
      deliverGeneratedFile({ content: '<h1>笔记</h1>', fileName: '笔记.html', mimeType: 'text/html' }),
    ).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download="笔记.html"]')).toBeNull();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:https://boluo66.top/note-export');
  });

  it('Blob 内容（PDF）直接交付，不再包一层', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });

    await expect(
      deliverGeneratedFile({ content: blob, fileName: '笔记.pdf', mimeType: 'application/pdf' }),
    ).resolves.toBe('downloaded');
    expect(createObjectUrl).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
  });

  /*
   * 真机实测过的坑：App 内点导出日历，原生弹「无法开始下载」，网页同时报「已下载」。
   * 根因就是这里点完 anchor.click() 无条件返回 'downloaded'。落不了盘必须如实回报，
   * 而且不能白白造一个 blob URL 出来。
   */
  it('App 内不再假装下载：blob 落不了盘就回 unavailable', async () => {
    delete (navigator as Navigator & { share?: Navigator['share'] }).share;
    delete (navigator as Navigator & { canShare?: Navigator['canShare'] }).canShare;
    window.LightNoteAndroid = { postMessage: vi.fn() };
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await expect(
      deliverGeneratedFile({
        content: 'BEGIN:VCALENDAR',
        fileName: '待办.ics',
        mimeType: 'text/calendar',
        preferShare: true,
      }),
    ).resolves.toBe('unavailable');
    expect(canSaveGeneratedFile()).toBe(false);
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it('App 内一旦支持 Web Share 就照常走分享，不被上面那条挡掉', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });
    window.LightNoteAndroid = { postMessage: vi.fn() };

    await expect(
      deliverGeneratedFile({
        content: 'BEGIN:VCALENDAR',
        fileName: '待办.ics',
        mimeType: 'text/calendar',
        preferShare: true,
      }),
    ).resolves.toBe('shared');
    expect(canSaveGeneratedFile()).toBe(true);
  });

  it('两条路都不可用时抛错，由调用方转成明确提示而不是静默失败', async () => {
    delete (navigator as Navigator & { share?: Navigator['share'] }).share;
    delete (URL as Partial<typeof URL>).createObjectURL;

    expect(canShareGeneratedFile()).toBe(false);
    await expect(
      deliverGeneratedFile({ content: '# 笔记', fileName: '笔记.md', mimeType: 'text/markdown', preferShare: true }),
    ).rejects.toThrow(/unavailable/i);
  });
});

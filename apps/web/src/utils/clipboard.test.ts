import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

/**
 * 复制的 WebView 降级。
 *
 * 起因是鸿蒙「卓易通」兼容层实测复制不了：Clipboard API 在那里不可用，而复制是 App 内
 * 多个功能的最后退路（导出落不了盘时复制正文、更新装不上时复制下载页地址）。
 */

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function stubClipboard(writeText: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

describe('copyTextToClipboard', () => {
  it('Clipboard API 可用时直接用它', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand as never;

    await expect(copyTextToClipboard('https://boluo66.top/download/android')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://boluo66.top/download/android');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('Clipboard API 抛异常时退到 execCommand', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')));
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand as never;

    await expect(copyTextToClipboard('文本')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('压根没有 Clipboard API 时也能走 execCommand', async () => {
    stubClipboard(undefined);
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand as never;

    await expect(copyTextToClipboard('文本')).resolves.toBe(true);
  });

  it('两条路都失败时返回 false，让调用方给可操作的兜底', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('boom')));
    document.execCommand = vi.fn(() => false) as never;

    await expect(copyTextToClipboard('文本')).resolves.toBe(false);
  });

  it('降级用的 textarea 用完即清，不留在文档里', async () => {
    stubClipboard(undefined);
    document.execCommand = vi.fn(() => true) as never;

    await copyTextToClipboard('文本');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('execCommand 抛异常也不冒泡给调用方', async () => {
    stubClipboard(undefined);
    document.execCommand = vi.fn(() => {
      throw new Error('execCommand unavailable');
    }) as never;

    await expect(copyTextToClipboard('文本')).resolves.toBe(false);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('空文本不做任何尝试', async () => {
    const writeText = vi.fn();
    stubClipboard(writeText);
    await expect(copyTextToClipboard('')).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});

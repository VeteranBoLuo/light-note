import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BROWSER_BATCH_DOWNLOAD_INTERVAL_MS,
  submitBrowserBatchDownloads,
  triggerPreparedBrowserDownload,
} from './browserBatchDownload';

const files = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const resolveMeta = async (file: { id: string }) => ({
  downloadUrl: `https://files.example.com/${file.id}`,
  fileName: `${file.id}.txt`,
});

describe('browserBatchDownload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('按选择顺序逐项提交，并在相邻下载之间等待', async () => {
    const events: string[] = [];
    const progress: Array<[number, number]> = [];

    const result = await submitBrowserBatchDownloads({
      files,
      resolveMeta,
      submit: (meta) => events.push(`submit:${meta.fileName}`),
      wait: async (delayMs) => {
        events.push(`wait:${delayMs}`);
      },
      onSettled: (done, total) => progress.push([done, total]),
    });

    expect(result).toEqual({ submitted: 3, failed: 0, cancelled: false, failures: [] });
    expect(events).toEqual([
      'submit:a.txt',
      `wait:${BROWSER_BATCH_DOWNLOAD_INTERVAL_MS}`,
      'submit:b.txt',
      `wait:${BROWSER_BATCH_DOWNLOAD_INTERVAL_MS}`,
      'submit:c.txt',
    ]);
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('允许调用方覆盖顺序下载间隔', async () => {
    const wait = vi.fn(async () => {});

    await submitBrowserBatchDownloads({
      files: files.slice(0, 2),
      resolveMeta,
      submit: vi.fn(),
      intervalMs: 250,
      wait,
    });

    expect(wait).toHaveBeenCalledOnce();
    expect(wait).toHaveBeenCalledWith(250);
  });

  it('单项地址准备失败时继续提交其余文件', async () => {
    const submit = vi.fn();
    const wait = vi.fn(async () => {});
    const resolver = vi.fn(async (file: { id: string }) => {
      if (file.id === 'b') throw new Error('prepare failed');
      return resolveMeta(file);
    });

    const result = await submitBrowserBatchDownloads({ files, resolveMeta: resolver, submit, wait });

    expect(result).toMatchObject({ submitted: 2, failed: 1, cancelled: false });
    expect(result.failures[0]).toMatchObject({ index: 1, fileName: 'file-2' });
    expect(submit.mock.calls.map(([meta]) => meta.fileName)).toEqual(['a.txt', 'c.txt']);
    expect(wait).toHaveBeenCalledOnce();
  });

  it('单项提交抛错时记录失败并继续后续文件', async () => {
    const submit = vi.fn((meta: { fileName: string }) => {
      if (meta.fileName === 'b.txt') throw new Error('submit failed');
    });
    const wait = vi.fn(async () => {});

    const result = await submitBrowserBatchDownloads({ files, resolveMeta, submit, wait });

    expect(result).toMatchObject({ submitted: 2, failed: 1, cancelled: false });
    expect(result.failures[0]).toMatchObject({ index: 1, fileName: 'b.txt' });
    expect(submit).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('用户取消后不再准备和提交后续文件', async () => {
    let cancelled = false;
    const resolver = vi.fn(resolveMeta);
    const submit = vi.fn();
    const wait = vi.fn(async () => {});

    const result = await submitBrowserBatchDownloads({
      files,
      resolveMeta: resolver,
      submit,
      wait,
      isCancelled: () => cancelled,
      onSettled: () => {
        cancelled = true;
      },
    });

    expect(result).toEqual({ submitted: 1, failed: 0, cancelled: true, failures: [] });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('每个文件使用独立下载链接并在提交后清理临时元素', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    triggerPreparedBrowserDownload({
      downloadUrl: 'https://files.example.com/a',
      fileName: 'a.txt',
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });
});

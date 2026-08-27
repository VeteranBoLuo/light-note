import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitBrowserBatchDownloads, triggerPreparedBrowserDownload } from './browserBatchDownload';

const files = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const resolveMeta = async (file: { id: string }) => ({
  downloadUrl: `https://files.example.com/${file.id}`,
  fileName: `${file.id}.txt`,
});

describe('browserBatchDownload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('点击分别下载后按选择顺序逐项提交给浏览器', async () => {
    const submit = vi.fn();
    const progress: Array<[number, number]> = [];

    const result = await submitBrowserBatchDownloads({
      files,
      resolveMeta,
      submit,
      onSettled: (done, total) => progress.push([done, total]),
    });

    expect(result).toEqual({ submitted: 3, failed: 0, cancelled: false, failures: [] });
    expect(submit.mock.calls.map(([meta]) => meta.fileName)).toEqual(['a.txt', 'b.txt', 'c.txt']);
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('单项地址准备失败时继续提交其余文件', async () => {
    const submit = vi.fn();
    const resolver = vi.fn(async (file: { id: string }) => {
      if (file.id === 'b') throw new Error('prepare failed');
      return resolveMeta(file);
    });

    const result = await submitBrowserBatchDownloads({ files, resolveMeta: resolver, submit });

    expect(result).toMatchObject({ submitted: 2, failed: 1, cancelled: false });
    expect(result.failures[0]).toMatchObject({ index: 1, fileName: 'file-2' });
    expect(submit.mock.calls.map(([meta]) => meta.fileName)).toEqual(['a.txt', 'c.txt']);
  });

  it('单项提交抛错时记录失败并继续后续文件', async () => {
    const submit = vi.fn((meta: { fileName: string }) => {
      if (meta.fileName === 'b.txt') throw new Error('submit failed');
    });

    const result = await submitBrowserBatchDownloads({ files, resolveMeta, submit });

    expect(result).toMatchObject({ submitted: 2, failed: 1, cancelled: false });
    expect(result.failures[0]).toMatchObject({ index: 1, fileName: 'b.txt' });
    expect(submit).toHaveBeenCalledTimes(3);
  });

  it('用户取消后停止准备和提交后续文件', async () => {
    let cancelled = false;
    const resolver = vi.fn(resolveMeta);
    const submit = vi.fn();

    const result = await submitBrowserBatchDownloads({
      files,
      resolveMeta: resolver,
      submit,
      isCancelled: () => cancelled,
      onSettled: () => {
        cancelled = true;
      },
    });

    expect(result).toEqual({ submitted: 1, failed: 0, cancelled: true, failures: [] });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
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

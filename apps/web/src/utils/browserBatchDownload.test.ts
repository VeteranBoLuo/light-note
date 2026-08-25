import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canSaveBrowserBatchToDirectory,
  chooseBrowserBatchDownloadDirectory,
  resolveAvailableBrowserFileName,
  saveBrowserBatchToDirectory,
  triggerPreparedBrowserDownload,
  type BrowserFileSystemDirectoryHandle,
  type BrowserFileSystemWritable,
} from './browserBatchDownload';

const notFound = () => new DOMException('not found', 'NotFoundError');

const createDirectory = (initialNames: string[] = []) => {
  const names = new Set(initialNames);
  const written = new Map<string, Blob>();
  const removed: string[] = [];

  const directory: BrowserFileSystemDirectoryHandle = {
    getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
      if (!options?.create && !names.has(name)) throw notFound();
      if (options?.create) names.add(name);
      const writable: BrowserFileSystemWritable = {
        write: vi.fn(async (blob: Blob) => {
          written.set(name, blob);
        }),
        close: vi.fn(async () => {}),
        abort: vi.fn(async () => {}),
      };
      return { createWritable: vi.fn(async () => writable) };
    }),
    removeEntry: vi.fn(async (name: string) => {
      names.delete(name);
      written.delete(name);
      removed.push(name);
    }),
  };

  return { directory, names, written, removed };
};

const files = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const resolveMeta = async (file: { id: string }) => ({
  downloadUrl: `https://files.example.com/${file.id}`,
  fileName: `${file.id}.txt`,
});
const successfulFetch = vi.fn(async (url: string | URL | Request) => {
  return new Response(String(url), { status: 200 });
});

describe('browserBatchDownload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'showDirectoryPicker');
    window.history.replaceState(null, '', '/');
  });

  it('能力可用时在用户点击链路里打开可写目录选择器', async () => {
    const { directory } = createDirectory();
    const picker = vi.fn(async () => directory);
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: picker });

    expect(canSaveBrowserBatchToDirectory()).toBe(true);
    await expect(chooseBrowserBatchDownloadDirectory()).resolves.toBe(directory);
    expect(picker).toHaveBeenCalledWith({
      id: 'light-note-cloud-batch-download',
      mode: 'readwrite',
      startIn: 'downloads',
    });
  });

  it('开发验收参数可稳定进入无目录 API 的逐项下载分支', () => {
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: vi.fn() });
    window.history.replaceState(null, '', '/cloudSpace?batchDownloadProfile=manual');

    expect(canSaveBrowserBatchToDirectory()).toBe(false);

    window.history.replaceState(null, '', '/cloudSpace?batchDownloadProfile=manual-failure');
    expect(canSaveBrowserBatchToDirectory()).toBe(false);
  });

  it('三个文件逐个真正写入目录后才计为成功', async () => {
    const { directory, written } = createDirectory();
    const progress: Array<[number, number]> = [];

    const result = await saveBrowserBatchToDirectory({
      files,
      directory,
      resolveMeta,
      fetchImpl: successfulFetch as typeof fetch,
      onSettled: (done, total) => progress.push([done, total]),
    });

    expect(result).toEqual({ succeeded: 3, failed: 0, cancelled: false, failures: [] });
    expect([...written.keys()]).toEqual(['a.txt', 'b.txt', 'c.txt']);
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('目录已有同名文件时自动追加序号,不覆盖旧文件', async () => {
    const { directory } = createDirectory(['report.pdf', 'report(2).pdf']);

    await expect(resolveAvailableBrowserFileName(directory, 'report.pdf')).resolves.toBe('report(3).pdf');
  });

  it('真实 File System Access 写入流直接接收响应流,大文件无需先聚合为 Blob', async () => {
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk);
      },
    });
    const writable = Object.assign(stream, {
      write: async () => {},
      close: async () => {},
    }) as unknown as BrowserFileSystemWritable;
    const directory: BrowserFileSystemDirectoryHandle = {
      getFileHandle: vi.fn(async (_name: string, options?: { create?: boolean }) => {
        if (!options?.create) throw notFound();
        return { createWritable: async () => writable };
      }),
    };

    const result = await saveBrowserBatchToDirectory({
      files: [{ id: 'large' }],
      directory,
      resolveMeta,
      fetchImpl: successfulFetch as typeof fetch,
    });

    expect(result).toMatchObject({ succeeded: 1, failed: 0 });
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('单个请求失败会记录当前文件并继续保存剩余项', async () => {
    const { directory, written } = createDirectory();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      return new Response(String(url), { status: String(url).endsWith('/b') ? 500 : 200 });
    });

    const result = await saveBrowserBatchToDirectory({
      files,
      directory,
      resolveMeta,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.cancelled).toBe(false);
    expect(result.failures[0]).toMatchObject({ index: 1, fileName: 'b.txt' });
    expect([...written.keys()]).toEqual(['a.txt', 'c.txt']);
  });

  it('写盘失败会清理本轮创建的残留文件并继续', async () => {
    const { directory, removed } = createDirectory();
    const originalGetFileHandle = directory.getFileHandle.bind(directory);
    directory.getFileHandle = vi.fn(async (name: string, options?: { create?: boolean }) => {
      const handle = await originalGetFileHandle(name, options);
      if (name !== 'b.txt' || !options?.create) return handle;
      return {
        createWritable: async () => ({
          write: async () => {
            throw new Error('disk full');
          },
          close: async () => {},
          abort: async () => {},
        }),
      };
    });

    const result = await saveBrowserBatchToDirectory({
      files,
      directory,
      resolveMeta,
      fetchImpl: successfulFetch as typeof fetch,
    });

    expect(result).toMatchObject({ succeeded: 2, failed: 1, cancelled: false });
    expect(removed).toEqual(['b.txt']);
  });

  it('取消后不再解析或写入后续文件', async () => {
    const { directory, written } = createDirectory();
    let cancelled = false;
    const resolver = vi.fn(resolveMeta);

    const result = await saveBrowserBatchToDirectory({
      files,
      directory,
      resolveMeta: resolver,
      fetchImpl: successfulFetch as typeof fetch,
      isCancelled: () => cancelled,
      onSettled: () => {
        cancelled = true;
      },
    });

    expect(result).toMatchObject({ succeeded: 1, failed: 0, cancelled: true });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect([...written.keys()]).toEqual(['a.txt']);
  });

  it('兼容路径只在一次显式点击中提交一个预先准备好的下载', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    triggerPreparedBrowserDownload({
      downloadUrl: 'https://files.example.com/a',
      fileName: 'a.txt',
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });
});

export interface BrowserDownloadMeta {
  downloadUrl: string;
  fileName: string;
}

export interface BrowserBatchDownloadFailure {
  index: number;
  fileName: string;
  error: unknown;
}

export interface BrowserBatchDownloadResult {
  succeeded: number;
  failed: number;
  cancelled: boolean;
  failures: BrowserBatchDownloadFailure[];
}

export interface BrowserFileSystemWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
  getWriter?(): unknown;
}

export interface BrowserFileSystemFileHandle {
  createWritable(): Promise<BrowserFileSystemWritable>;
}

export interface BrowserFileSystemDirectoryHandle {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<BrowserFileSystemFileHandle>;
  removeEntry?(name: string): Promise<void>;
}

type DirectoryPicker = (options?: {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: string;
}) => Promise<BrowserFileSystemDirectoryHandle>;

interface BrowserWindowWithDirectoryPicker extends Window {
  showDirectoryPicker?: DirectoryPicker;
}

export interface SaveBrowserBatchOptions<T> {
  files: T[];
  directory: BrowserFileSystemDirectoryHandle;
  resolveMeta(file: T, index: number): Promise<BrowserDownloadMeta>;
  signal?: AbortSignal;
  isCancelled?(): boolean;
  onSettled?(completed: number, total: number): void;
  fetchImpl?: typeof fetch;
}

const isAbortError = (error: unknown, signal?: AbortSignal) => {
  return signal?.aborted || (error instanceof DOMException && error.name === 'AbortError');
};

const splitFileName = (name: string) => {
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0) return { base: name, extension: '' };
  return {
    base: name.slice(0, dotIndex),
    extension: name.slice(dotIndex),
  };
};

const entryExists = async (directory: BrowserFileSystemDirectoryHandle, name: string) => {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false;
    throw error;
  }
};

export const resolveAvailableBrowserFileName = async (
  directory: BrowserFileSystemDirectoryHandle,
  requestedName: string,
) => {
  if (!(await entryExists(directory, requestedName))) return requestedName;

  const { base, extension } = splitFileName(requestedName);
  let counter = 2;
  while (await entryExists(directory, `${base}(${counter})${extension}`)) {
    counter += 1;
  }
  return `${base}(${counter})${extension}`;
};

export const canSaveBrowserBatchToDirectory = () => {
  // 仅用于浏览器视觉验收“不支持目录 API”的兼容分支；生产构建会把 DEV 分支消除。
  const visualProfile = new URLSearchParams(window.location.search).get('batchDownloadProfile') || '';
  if (import.meta.env.DEV && visualProfile.startsWith('manual')) {
    return false;
  }
  return typeof (window as BrowserWindowWithDirectoryPicker).showDirectoryPicker === 'function';
};

export const chooseBrowserBatchDownloadDirectory = async () => {
  const picker = (window as BrowserWindowWithDirectoryPicker).showDirectoryPicker;
  if (!picker) throw new Error('DIRECTORY_PICKER_UNAVAILABLE');
  return picker.call(window, {
    id: 'light-note-cloud-batch-download',
    mode: 'readwrite',
    startIn: 'downloads',
  });
};

export const saveBrowserBatchToDirectory = async <T>({
  files,
  directory,
  resolveMeta,
  signal,
  isCancelled = () => false,
  onSettled,
  fetchImpl = fetch,
}: SaveBrowserBatchOptions<T>): Promise<BrowserBatchDownloadResult> => {
  let succeeded = 0;
  let failed = 0;
  let cancelled = false;
  const failures: BrowserBatchDownloadFailure[] = [];

  for (let index = 0; index < files.length; index += 1) {
    if (isCancelled() || signal?.aborted) {
      cancelled = true;
      break;
    }

    let fileName = `file-${index + 1}`;
    let createdName = '';
    let writable: BrowserFileSystemWritable | null = null;
    try {
      const meta = await resolveMeta(files[index], index);
      fileName = meta.fileName;
      if (isCancelled() || signal?.aborted) {
        cancelled = true;
        break;
      }

      const response = await fetchImpl(meta.downloadUrl, { signal });
      if (!response.ok) throw new Error(`DOWNLOAD_HTTP_${response.status}`);

      createdName = await resolveAvailableBrowserFileName(directory, meta.fileName);
      const fileHandle = await directory.getFileHandle(createdName, { create: true });
      writable = await fileHandle.createWritable();
      if (response.body && typeof writable.getWriter === 'function') {
        // FileSystemWritableFileStream 本身是 WritableStream；直接管道写入避免大文件整块驻留内存。
        await response.body.pipeTo(writable as unknown as WritableStream<Uint8Array>, signal ? { signal } : undefined);
      } else {
        // 测试替身或少数不完整实现没有 WritableStream 接口时再退回逐文件 Blob。
        const blob = await response.blob();
        await writable.write(blob);
        await writable.close();
      }
      writable = null;
      succeeded += 1;
    } catch (error) {
      if (isAbortError(error, signal) || isCancelled()) {
        cancelled = true;
        try {
          await writable?.abort?.(error);
        } catch {
          // 中止清理失败不改变用户主动取消的结果。
        }
        if (createdName && directory.removeEntry) {
          try {
            await directory.removeEntry(createdName);
          } catch {
            // 临时文件清理失败由浏览器/文件系统接管，不能再继续删除其他同名文件。
          }
        }
        break;
      }

      failed += 1;
      failures.push({ index, fileName, error });
      try {
        await writable?.abort?.(error);
      } catch {
        // 保留原始写入错误用于汇总。
      }
      if (createdName && directory.removeEntry) {
        try {
          await directory.removeEntry(createdName);
        } catch {
          // 已确认该名称由本轮创建，清理失败时只记录当前项失败并继续剩余文件。
        }
      }
    } finally {
      onSettled?.(succeeded + failed, files.length);
    }
  }

  return { succeeded, failed, cancelled, failures };
};

export const triggerPreparedBrowserDownload = (meta: BrowserDownloadMeta) => {
  const anchor = document.createElement('a');
  anchor.href = meta.downloadUrl;
  anchor.download = meta.fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

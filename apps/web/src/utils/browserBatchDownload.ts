export interface BrowserDownloadMeta {
  downloadUrl: string;
  fileName: string;
}

export interface BrowserBatchDownloadFailure {
  index: number;
  fileName: string;
  error: unknown;
}

export interface BrowserBatchDownloadSubmissionResult {
  submitted: number;
  failed: number;
  cancelled: boolean;
  failures: BrowserBatchDownloadFailure[];
}

export interface SubmitBrowserBatchDownloadsOptions<T> {
  files: T[];
  resolveMeta(file: T, index: number): Promise<BrowserDownloadMeta>;
  submit?(meta: BrowserDownloadMeta, index: number): void;
  isCancelled?(): boolean;
  onSettled?(completed: number, total: number): void;
  intervalMs?: number;
  wait?(delayMs: number): Promise<void>;
}

export const BROWSER_BATCH_DOWNLOAD_INTERVAL_MS = 600;

const waitForNextDownload = (delayMs: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });

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

/**
 * 按选择顺序逐项交给浏览器默认下载器，并在相邻提交之间主动让出事件循环。
 * 普通网页拿不到浏览器落盘回执，因此这里只统计“已提交”，不能宣称“已下载成功”。
 */
export const submitBrowserBatchDownloads = async <T>({
  files,
  resolveMeta,
  submit = triggerPreparedBrowserDownload,
  isCancelled = () => false,
  onSettled,
  intervalMs = BROWSER_BATCH_DOWNLOAD_INTERVAL_MS,
  wait = waitForNextDownload,
}: SubmitBrowserBatchDownloadsOptions<T>): Promise<BrowserBatchDownloadSubmissionResult> => {
  let submitted = 0;
  let failed = 0;
  let cancelled = false;
  let hasSubmitted = false;
  const failures: BrowserBatchDownloadFailure[] = [];

  for (let index = 0; index < files.length; index += 1) {
    if (isCancelled()) {
      cancelled = true;
      break;
    }

    let fileName = `file-${index + 1}`;
    try {
      const meta = await resolveMeta(files[index], index);
      fileName = meta.fileName;
      if (isCancelled()) {
        cancelled = true;
        break;
      }

      if (hasSubmitted && intervalMs > 0) {
        await wait(intervalMs);
        if (isCancelled()) {
          cancelled = true;
          break;
        }
      }

      submit(meta, index);
      submitted += 1;
      hasSubmitted = true;
    } catch (error) {
      failed += 1;
      failures.push({ index, fileName, error });
    } finally {
      onSettled?.(submitted + failed, files.length);
    }
  }

  return { submitted, failed, cancelled, failures };
};

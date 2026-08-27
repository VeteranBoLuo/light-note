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
}

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
 * 逐项把下载请求交给浏览器。普通网页拿不到浏览器下载完成回执，
 * 因此这里只统计「已提交」，绝不能把 anchor.click() 记成「已保存」。
 */
export const submitBrowserBatchDownloads = async <T>({
  files,
  resolveMeta,
  submit = triggerPreparedBrowserDownload,
  isCancelled = () => false,
  onSettled,
}: SubmitBrowserBatchDownloadsOptions<T>): Promise<BrowserBatchDownloadSubmissionResult> => {
  let submitted = 0;
  let failed = 0;
  let cancelled = false;
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
      submit(meta, index);
      submitted += 1;
    } catch (error) {
      failed += 1;
      failures.push({ index, fileName, error });
    } finally {
      onSettled?.(submitted + failed, files.length);
    }
  }

  return { submitted, failed, cancelled, failures };
};

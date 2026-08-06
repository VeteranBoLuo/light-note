/**
 * App 内批量下载的提交循环。
 *
 * 云空间的批量下载在 App 内不能像桌面端那样打包成 zip 交给 `a[download]`：blob 地址虽然
 * 会进原生 DownloadListener，却在 `WebViewSupport.download` 第一行的 isHttpUrl 被挡掉，
 * 只弹一句「无法开始下载」就 return，一个字节也不落盘（真机实测）。所以 App 内改成逐个
 * 把 http 地址交给 `{type:'download'}` 桥，由系统 DownloadManager 直连对象存储落盘。
 *
 * 依赖全部由调用方注入：取地址要用页面里已有的 getDownloadMeta（它会优先复用列表接口
 * 已经带回来的签名地址，省掉多余请求），提交要用和单文件下载共用的那份桥调用。这样这段
 * 循环本身不依赖 Vue 和 WebView，可以直接单测。
 */

export interface AndroidBatchDownloadMeta {
  downloadUrl: string;
  fileName: string;
}

export interface AndroidBatchDownloadOutcome {
  /** 已交给 DownloadManager 排队的数量 */
  succeeded: number;
  /** 取地址失败或桥拒收的数量 */
  failed: number;
  /** 是否因取消提前收尾 */
  cancelled: boolean;
}

/**
 * 归一成绝对 http(s) 地址。
 *
 * 原生 `WebViewSupport.download` 第一步就是 isHttpUrl 校验，相对路径会被判成非法下载并弹
 * 「无法开始下载」——而桥的 postMessage 仍然返回 true，不先挡住就会误计成功。老文件没有
 * obs_key 时列表给的是 `directory + fileName`（同源相对路径），拼成绝对地址后仍可用。
 */
function toAbsoluteHttpUrl(value: string): string | null {
  try {
    const origin = typeof window === 'undefined' ? undefined : window.location.origin;
    const url = new URL(String(value || ''), origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function submitAndroidBatchDownload<T>(options: {
  files: T[];
  resolveMeta: (file: T, index: number) => Promise<AndroidBatchDownloadMeta>;
  submit: (downloadUrl: string, fileName: string) => boolean;
  isCancelled?: () => boolean;
  onSubmitted?: (done: number, total: number) => void;
}): Promise<AndroidBatchDownloadOutcome> {
  const { files, resolveMeta, submit, isCancelled, onSubmitted } = options;
  let succeeded = 0;
  let failed = 0;

  for (let index = 0; index < files.length; index++) {
    // 已经交出去的下载归 DownloadManager 管、撤不回来，所以取消只能停在「不再提交新的」
    if (isCancelled?.()) {
      return { succeeded, failed, cancelled: true };
    }

    try {
      const { downloadUrl, fileName } = await resolveMeta(files[index], index);
      const absoluteUrl = toAbsoluteHttpUrl(downloadUrl);
      if (absoluteUrl && submit(absoluteUrl, fileName)) {
        succeeded += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      // 单个文件失败不中断其余文件：中途退出会让用户既拿不到剩下的，也不知道哪几个成了
      console.error('批量下载单个文件失败:', error);
      failed += 1;
    }

    onSubmitted?.(index + 1, files.length);
  }

  return { succeeded, failed, cancelled: false };
}

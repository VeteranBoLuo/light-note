/**
 * 客户端生成文件的统一交付链路（笔记导出、日历文件等前端就地生成的内容）。
 *
 * 移动端不能只写 `a[download]`：
 * - 手机浏览器与 PWA 支持 Web Share，分享文件可直接存进「文件」或转发到其他 App，
 *   比隐式下载更符合手机上的使用习惯；
 * - 轻笺 Android APK 的 WebView 既没有 Web Share，`setDownloadListener` 也不会为
 *   `blob:` URL 触发（原生侧 `WebViewSupport.download` 只接受 http(s)），
 *   所以在 APK 内两条路都走不通，必须由调用方给出可操作的降级，不能静默失败。
 */

export type FileDeliveryResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * 生成导出文件名：清掉文件系统非法字符、折叠空白并限长。
 * 笔记标题里的 `/`、`:` 会让 `a[download]` 静默截断甚至丢文件，必须先清洗。
 */
export function buildExportFileName(title: string, fallback: string, extension: string): string {
  const withoutControls = Array.from(String(title ?? ''))
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('');
  const cleaned = withoutControls
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const limited = Array.from(cleaned).slice(0, 40).join('').trim();
  return `${limited || fallback}.${extension}`;
}

/** 当前环境能否用 Web Share 分享文件（手机浏览器/PWA 可以，APK WebView 不行）。 */
export function canShareGeneratedFile(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof File !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  );
}

/** 当前环境能否用 blob URL 触发下载。 */
export function canDownloadGeneratedFile(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof URL.revokeObjectURL === 'function'
  );
}

/**
 * 把生成好的内容交给系统：`preferShare` 时优先 Web Share（文件分享），
 * 不支持或失败时降级为 blob 下载。用户主动取消分享返回 `cancelled`，
 * 调用方不得记成功埋点、也不要强行改成下载打扰用户。
 *
 * 两条路都不可用时抛错，由调用方转成明确提示。
 */
export async function deliverGeneratedFile(options: {
  content: string | Blob;
  fileName: string;
  mimeType: string;
  preferShare?: boolean;
}): Promise<FileDeliveryResult> {
  const { content, fileName, mimeType, preferShare = false } = options;
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: `${mimeType};charset=utf-8` });

  if (preferShare && canShareGeneratedFile()) {
    try {
      const file = new File([blob], fileName, { type: mimeType });
      if (navigator.canShare!({ files: [file] })) {
        await navigator.share!({ files: [file], title: fileName });
        return 'shared';
      }
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
      // canShare/File/share 在部分 WebView 中会抛异常；除用户取消外统一降级下载
    }
  }

  if (!canDownloadGeneratedFile()) {
    throw new Error('File delivery is unavailable in the current environment');
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    return 'downloaded';
  } finally {
    anchor.remove();
    // Safari/WebView 可能在 click 返回后才读取 blob，延迟释放可避免偶发空文件
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * 客户端生成文件的统一交付链路（笔记导出、日历文件等前端就地生成的内容）。
 *
 * 移动端不能只写 `a[download]`：
 * - 手机浏览器与 PWA 支持 Web Share，分享文件可直接存进「文件」或转发到其他 App，
 *   比隐式下载更符合手机上的使用习惯；
 * - 轻笺 Android APK 的 WebView 没有 Web Share；`a[download]` 的 `blob:` 地址虽然会进
 *   `setDownloadListener`，但原生侧 `WebViewSupport.download` 第一行的 isHttpUrl 只接受
 *   http(s)，blob 会被当场挡掉、弹一句「无法开始下载」就 return（真机实测），
 *   所以在 APK 内两条路都走不通，必须由调用方给出可操作的降级，不能静默失败。
 */

import { isLightNoteAndroidApp } from '@/utils/androidBridge';

/**
 * `unavailable` —— 当前环境保存不了前端生成的文件（App 内没有 Web Share 时就是这样）。
 * 调用方必须给一条可操作的出路，**不能报成功、也不能写成功操作日志**。
 */
export type FileDeliveryResult = 'shared' | 'downloaded' | 'cancelled' | 'unavailable';

/**
 * 当前环境能否真正保存前端生成的文件。
 *
 * App 内 blob 是死路（见文件头说明），所以只有 Web Share 可用时才算能保存。
 * 这个判断原来只写在 NoteHeader 里，日历导出那条路没有，于是在 App 内原生弹
 * 「无法开始下载」的同时网页报「已下载」—— 这类知识必须留在交付层，别再各处自己判。
 */
export function canSaveGeneratedFile(): boolean {
  return canShareGeneratedFile() || !isLightNoteAndroidApp();
}

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

/**
 * Blob/文本 → 纯 base64（不含 data URI 前缀）。
 *
 * 文本也先包成 Blob 再交给 FileReader，免得自己处理 UTF-8 编码（btoa 遇到中文直接抛）。
 * 上传给服务端换下载票据的两条路（笔记导出、待办日历）共用这一份。
 */
export function encodeFileContentToBase64(content: string | Blob, mimeType: string): Promise<string> {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: `${mimeType};charset=utf-8` });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const separator = result.indexOf(',');
      // readAsDataURL 结果形如 `data:<mime>;base64,<payload>`，只取 payload
      resolve(separator >= 0 ? result.slice(separator + 1) : '');
    };
    reader.readAsDataURL(blob);
  });
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

  /*
   * App 内到这一步就是死路，必须如实回报：以前照样 createObjectURL + anchor.click()，
   * 然后无条件 return 'downloaded'，于是原生弹「无法开始下载」的同一秒，网页报「已下载」，
   * 还往操作日志里写了一条成功。落不了盘就说落不了盘，出路交给调用方。
   */
  if (!canSaveGeneratedFile()) return 'unavailable';

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

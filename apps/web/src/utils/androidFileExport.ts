/**
 * 轻笺 Android App 内的导出落盘通道。
 *
 * App 的 WebView 没有 Web Share，`a[download]` 点 `blob:` 虽然会进原生下载监听，却在
 * `WebViewSupport.download` 的 isHttpUrl 那一关被挡掉（只弹「无法开始下载」，不落盘），
 * 所以前端生成好的导出件在 App 内本来无处可去（见 utils/fileDelivery.ts 顶部说明）。
 * 这里把内容换成一个短时 http 地址，交给已有的 `{type:'download'}` 桥 →
 * 系统 DownloadManager 存进「下载」目录，并复用系统下载通知（含通知栏进度）。
 * 「开始/完成」的文字提示由调用方自己给（导出这条链路是 NoteHeader 的 message）——
 * 原生那两条系统 Toast 已经移除，否则和网页提示重复播报同一件事。
 *
 * 走服务端中转而不是让原生直接写盘，是为了不必改原生、不必等用户升级 APK：
 * 现存 1.0.0 装机量都能立刻用上。后续原生补了直写通道，这里就退化成老版本兜底。
 */

import { apiBasePost } from '@/http/request';
import { postAndroidMessage } from '@/utils/androidBridge';
import { encodeFileContentToBase64 } from '@/utils/fileDelivery';

export type NoteExportFormat = 'md' | 'html' | 'pdf' | 'zip' | 'png' | 'json';

export type AndroidExportOutcome =
  | { ok: true }
  /**
   * too_large  —— 超出服务端单件上限，调用方应给「内容过大」的专门提示而不是笼统失败；
   * request_failed —— 换票据失败（离线、被限流、笔记归属校验不过）；
   * bridge_failed  —— 桥不可用或原生拒收，调用方应退回剪贴板等降级路径。
   */
  | { ok: false; reason: 'too_large' | 'request_failed' | 'bridge_failed'; message?: string };


/**
 * 把导出件送进 App 的系统下载目录。
 * 成功仅表示已交给 DownloadManager 排队——真正的落盘结果由原生的下载通知告知用户，
 * 前端无法（也不该）等它完成。
 */
export async function deliverExportViaAndroidBridge(options: {
  noteId: string;
  content: string | Blob;
  fileName: string;
  format: NoteExportFormat;
  mimeType: string;
}): Promise<AndroidExportOutcome> {
  const { noteId, content, fileName, format, mimeType } = options;

  let contentBase64: string;
  try {
    contentBase64 = await encodeFileContentToBase64(content, mimeType);
  } catch (error) {
    console.error('导出内容编码失败:', error);
    return { ok: false, reason: 'request_failed' };
  }
  if (!contentBase64) return { ok: false, reason: 'request_failed' };

  let res;
  try {
    // silent:失败提示由调用方按导出语境给（含「内容过大」这类专门文案），避免和全局错误提示重复弹
    res = await apiBasePost(
      '/api/note/exportFile',
      { id: noteId, format, fileName, contentBase64 },
      { silent: true },
    );
  } catch (error) {
    console.error('获取导出下载地址失败:', error);
    return { ok: false, reason: 'request_failed' };
  }

  if (res?.status === 413) return { ok: false, reason: 'too_large', message: res?.msg };
  if (res?.status !== 200 || !res?.data?.downloadUrl) {
    return { ok: false, reason: 'request_failed', message: res?.msg };
  }

  // 必须拼成绝对地址:原生 WebViewSupport.download 第一步就是 isHttpUrl 校验,
  // 相对路径会被直接判成非法下载并弹「下载失败」。
  const downloadUrl = new URL(String(res.data.downloadUrl), window.location.origin).toString();
  const delivered = postAndroidMessage({
    type: 'download',
    url: downloadUrl,
    fileName: String(res.data.fileName || fileName),
  });

  return delivered ? { ok: true } : { ok: false, reason: 'bridge_failed' };
}

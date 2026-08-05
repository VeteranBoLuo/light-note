/**
 * 图片预览「保存」按钮的判定与命名规则。
 *
 * 抽成纯函数是为了能直接测：这里出错的表现是存下来的文件打不开（后缀与内容不符）、
 * 或者在 App 里给出一个点了没反应的按钮，都不容易在页面上一眼看出来。
 */

/** DownloadManager 只收 http(s)，data:/blob: 都不行 */
export function isHttpImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

/*
 * data:/blob: 图（目前只有 mermaid 图表走这条路）在轻笺 Android App 内存不下来：
 * 原生 DownloadManager 只接受 http(s)（见 WebViewSupport.download 的 isHttpUrl 校验），
 * 而 WebView 对 data:/blob: 的 `<a download>` 又不触发 DownloadListener —— 两条路都堵死。
 * 与其给一个点了没反应的按钮，不如在 App 内直接不显示；浏览器里这类图仍可正常保存。
 */
export function canSaveImage(src: string | null | undefined, isAndroidApp: boolean): boolean {
  if (!src) return false;
  return isHttpImageSrc(src) || !isAndroidApp;
}

/** data URL 的 MIME 子类型 → 扩展名。svg+xml 这种带后缀的要取前半段。 */
function extensionFromDataUrl(src: string): string | null {
  const match = /^data:image\/([a-z0-9.+-]+)/i.exec(src);
  if (!match) return null;
  const subtype = match[1].toLowerCase();
  // image/svg+xml → svg；image/jpeg 习惯写成 jpg
  const normalized = subtype.split('+')[0];
  if (normalized === 'jpeg') return 'jpg';
  return /^[a-z0-9]{2,5}$/.test(normalized) ? normalized : null;
}

/**
 * 推导保存用的文件名。
 *
 * 头像等 OBS 对象名可能不带扩展名，补一个才好被相册/文件管理器识别；
 * data URL 没有文件名，按 MIME 取扩展名（SVG 图表存成 .png 会打不开）。
 * `now` 可注入，便于测试。
 */
export function deriveImageFileName(src: string, now: number = Date.now()): string {
  const fallbackExtension = extensionFromDataUrl(src) || 'png';
  const fallback = `light-note-image-${now}.${fallbackExtension}`;
  if (!isHttpImageSrc(src)) return fallback;
  try {
    const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    const path = new URL(src, origin).pathname;
    const last = decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
    if (!last) return fallback;
    return /\.[a-z0-9]{2,5}$/i.test(last) ? last : `${last}.png`;
  } catch {
    // 非法 URL（极少见，但 refreshViewer 的 src 来自多处调用方）不该让保存按钮直接抛错
    return fallback;
  }
}

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

/** `data:image/*;base64,` 走原生直写通道（DownloadManager 不收 data URL） */
export function isBase64ImageSrc(src: string): boolean {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(src);
}

/*
 * 能不能给出「保存图片」按钮。
 *
 * 曾经这里把 App 内的 data URL 一律排除，理由是 DownloadManager 只收 http(s)、
 * WebView 对 data:/blob: 的 `<a download>` 也不触发下载。但轻笺的头像恰恰是
 * `data:image/jpeg;base64,...` 存在库里的 —— 结果「保存头像」这个最主要的场景
 * 一个都覆盖不到，用户看到的就是「按钮根本没出现」。
 *
 * 现在 base64 图片交给原生 base64 直写（image.save 桥），所以 App 内也放开。
 * 仍然排除的是 blob:：它既不是 http 也拿不到字节，两条路都走不通。
 */
export function canSaveImage(src: string | null | undefined, isAndroidApp: boolean): boolean {
  if (!src) return false;
  if (!isAndroidApp) return true;
  return isHttpImageSrc(src) || isBase64ImageSrc(src);
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

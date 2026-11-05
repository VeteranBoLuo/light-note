export function createLocalId(prefix: string) {
  const suffix =
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}:${suffix}`;
}

export function formatToolboxBytes(bytes: number) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function safeDownloadBaseName(fileName: string, fallback = 'lightnote-output') {
  const stripped = String(fileName || '')
    .replace(/\.[^.]+$/u, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '-')
    .trim()
    .slice(0, 120);
  return stripped || fallback;
}

/** Reserve the final archive name, including generated suffixes and case-insensitive collisions. */
export function reserveToolboxFileName(fileName: string, usedNames: Set<string>) {
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : '';
  let name = fileName;
  let suffix = 2;
  const key = (value: string) => value.normalize('NFC').toLowerCase();
  while (usedNames.has(key(name))) name = `${base}-${suffix++}${extension}`;
  usedNames.add(key(name));
  return name;
}

export const TOOLBOX_LOCAL_DELIVERY_EVENT = 'lightnote:toolbox-local-delivery';

/**
 * 下载链接是浏览器文件保存能力的底层适配，不是页面可见控件；交互入口仍统一由 BButton 提供。
 */
export function downloadToolboxBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.dispatchEvent(new Event(TOOLBOX_LOCAL_DELIVERY_EVENT));
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

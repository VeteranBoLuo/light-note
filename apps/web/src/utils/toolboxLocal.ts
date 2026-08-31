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
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function svgDimensions(svg: string) {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const element = document.documentElement;
  const viewBox = String(element.getAttribute('viewBox') || '')
    .trim()
    .split(/\s+/u)
    .map(Number);
  if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2]! > 0 && viewBox[3]! > 0) {
    return { width: viewBox[2]!, height: viewBox[3]! };
  }
  const width = Number.parseFloat(element.getAttribute('width') || '');
  const height = Number.parseFloat(element.getAttribute('height') || '');
  return {
    width: Number.isFinite(width) && width > 0 ? width : 1200,
    height: Number.isFinite(height) && height > 0 ? height : 800,
  };
}

/** 将本地生成的自包含 SVG 导出为 PNG；限制总像素，避免大图耗尽移动端内存。 */
export async function toolboxSvgToPng(svg: string, scale = 2) {
  const dimensions = svgDimensions(svg);
  const maxPixels = 24_000_000;
  const requestedScale = Math.min(4, Math.max(1, Number(scale) || 1));
  const pixelScale = Math.sqrt(maxPixels / Math.max(1, dimensions.width * dimensions.height));
  const resolvedScale = Math.min(requestedScale, pixelScale);
  const width = Math.max(1, Math.round(dimensions.width * resolvedScale));
  const height = Math.max(1, Math.round(dimensions.height * resolvedScale));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG_ENCODE_FAILED'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

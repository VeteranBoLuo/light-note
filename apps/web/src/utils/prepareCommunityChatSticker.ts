const SUPPORTED_STICKER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const WEBP_TYPE = 'image/webp';
const OUTPUT_PROFILES = [
  { maxEdge: 1600, quality: 0.9 },
  { maxEdge: 1600, quality: 0.84 },
  { maxEdge: 1280, quality: 0.9 },
  { maxEdge: 1280, quality: 0.84 },
  { maxEdge: 1024, quality: 0.86 },
] as const;

export interface PreparedCommunityChatSticker {
  file: File;
  compressed: boolean;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('CUSTOM_STICKER_IMAGE_DECODE_FAILED'));
    };
    image.src = objectUrl;
  });
}

function renderImage(image: HTMLImageElement, maxEdge: number): HTMLCanvasElement {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error('CUSTOM_STICKER_IMAGE_SIZE_INVALID');
  }

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('CUSTOM_STICKER_CANVAS_UNAVAILABLE');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function encodeCanvas(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('CUSTOM_STICKER_IMAGE_ENCODE_FAILED'))),
      type,
      quality,
    );
  });
}

function replaceFileExtension(fileName: string, contentType: string) {
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'webp';
  const baseName = fileName.replace(/\.[^./\\]+$/u, '') || 'sticker';
  return `${baseName}.${extension}`;
}

function toFile(blob: Blob, source: File) {
  return new File([blob], replaceFileExtension(source.name, blob.type), {
    type: blob.type,
    lastModified: source.lastModified,
  });
}

/**
 * 仅在原图超过账号表情上限时压缩，避免对已合格图片进行无意义的二次有损编码。
 * 优先使用 WebP（可保留 PNG 透明通道），从高质量方案开始逐级尝试；
 * 如果浏览器不支持 WebP，则 PNG 保持透明，JPEG 继续使用 JPEG 回退。
 */
export async function prepareCommunityChatSticker(
  source: File,
  maxBytes: number,
): Promise<PreparedCommunityChatSticker> {
  if (!source || !SUPPORTED_STICKER_TYPES.has(source.type)) {
    throw new Error('CUSTOM_STICKER_IMAGE_TYPE_INVALID');
  }
  if (!Number.isFinite(maxBytes) || maxBytes < 1) {
    throw new Error('CUSTOM_STICKER_MAX_BYTES_INVALID');
  }
  if (source.size <= maxBytes) {
    return { file: source, compressed: false };
  }

  const image = await loadImage(source);
  let smallestBlob: Blob | null = null;
  let previousEdge = -1;
  let canvas: HTMLCanvasElement | null = null;
  let webpSupported = true;
  let lastPngFallbackEdge = -1;

  for (const profile of OUTPUT_PROFILES) {
    if (!webpSupported && source.type === 'image/png' && profile.maxEdge === lastPngFallbackEdge) continue;
    if (profile.maxEdge !== previousEdge) {
      canvas = renderImage(image, profile.maxEdge);
      previousEdge = profile.maxEdge;
    }
    if (!canvas) continue;

    let blob: Blob;
    if (webpSupported) {
      blob = await encodeCanvas(canvas, WEBP_TYPE, profile.quality);
      webpSupported = blob.type === WEBP_TYPE;
    } else {
      blob = await encodeCanvas(canvas, source.type === 'image/png' ? 'image/png' : 'image/jpeg', profile.quality);
    }
    if (!webpSupported) {
      const fallbackType = source.type === 'image/png' ? 'image/png' : 'image/jpeg';
      blob = blob.type === fallbackType ? blob : await encodeCanvas(canvas, fallbackType, profile.quality);
      if (fallbackType === 'image/png') lastPngFallbackEdge = profile.maxEdge;
    }

    if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
    if (blob.size <= maxBytes) return { file: toFile(blob, source), compressed: true };
  }

  if (!smallestBlob) {
    throw new Error('CUSTOM_STICKER_IMAGE_ENCODE_FAILED');
  }
  return { file: toFile(smallestBlob, source), compressed: true };
}

import { safeDownloadBaseName } from '@/utils/toolboxLocal';

export const IMAGE_OPTIMIZER_MAX_FILES = 20;
export const IMAGE_OPTIMIZER_MAX_BYTES = 80 * 1024 * 1024;
export const IMAGE_OPTIMIZER_MAX_OUTPUT_PIXELS = 24_000_000;
export type ImageOutputFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageOptimizerOptions {
  format: ImageOutputFormat;
  quality: number;
  maxDimension: number | null;
}

export interface OptimizedImage {
  fileName: string;
  originalName: string;
  originalSize: number;
  outputSize: number;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  blob: Blob;
  previewUrl: string;
}

export class ImageOptimizerError extends Error {
  constructor(
    public readonly code:
      'INVALID_TYPE' | 'TOO_MANY' | 'TOO_LARGE' | 'TOO_MANY_PIXELS' | 'DECODE_FAILED' | 'ENCODE_FAILED',
  ) {
    super(code);
    this.name = 'ImageOptimizerError';
  }
}

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function inferredImageType(file: File) {
  const declared = String(file.type || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (declared) return declared;
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return '';
}

export function validateImageFiles(files: File[]) {
  if (files.length > IMAGE_OPTIMIZER_MAX_FILES) throw new ImageOptimizerError('TOO_MANY');
  if (files.some((file) => !ACCEPTED_IMAGE_TYPES.has(inferredImageType(file)))) {
    throw new ImageOptimizerError('INVALID_TYPE');
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > IMAGE_OPTIMIZER_MAX_BYTES) {
    throw new ImageOptimizerError('TOO_LARGE');
  }
}

function extensionFor(format: ImageOutputFormat) {
  if (format === 'image/jpeg') return 'jpg';
  if (format === 'image/png') return 'png';
  return 'webp';
}

async function decodeImage(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Safari / old WebView fall through to HTMLImageElement.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => undefined };
  } catch {
    throw new ImageOptimizerError('DECODE_FAILED');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, format: ImageOutputFormat, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageOptimizerError('ENCODE_FAILED'))),
      format,
      format === 'image/png' ? undefined : Math.min(1, Math.max(0.1, quality)),
    );
  });
}

export async function optimizeImage(file: File, options: ImageOptimizerOptions): Promise<OptimizedImage> {
  validateImageFiles([file]);
  const decoded = await decodeImage(file);
  try {
    if (!options.maxDimension && decoded.width * decoded.height > IMAGE_OPTIMIZER_MAX_OUTPUT_PIXELS) {
      throw new ImageOptimizerError('TOO_MANY_PIXELS');
    }
    const limit = options.maxDimension && options.maxDimension > 0 ? options.maxDimension : Infinity;
    const dimensionRatio = limit / Math.max(decoded.width, decoded.height);
    const pixelRatio = Math.sqrt(IMAGE_OPTIMIZER_MAX_OUTPUT_PIXELS / Math.max(1, decoded.width * decoded.height));
    const ratio = Math.min(1, dimensionRatio, pixelRatio);
    const width = Math.max(1, Math.round(decoded.width * ratio));
    const height = Math.max(1, Math.round(decoded.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: options.format !== 'image/jpeg' });
    if (!context) throw new ImageOptimizerError('ENCODE_FAILED');
    if (options.format === 'image/jpeg') {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(decoded.source, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, options.format, options.quality);
    return {
      fileName: `${safeDownloadBaseName(file.name)}-optimized.${extensionFor(options.format)}`,
      originalName: file.name,
      originalSize: file.size,
      outputSize: blob.size,
      originalWidth: decoded.width,
      originalHeight: decoded.height,
      width,
      height,
      blob,
      previewUrl: URL.createObjectURL(blob),
    };
  } finally {
    decoded.close();
  }
}

export function releaseOptimizedImages(images: OptimizedImage[]) {
  images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
}

export async function bundleOptimizedImages(images: OptimizedImage[]) {
  const { default: JSZip } = await import('jszip');
  const archive = new JSZip();
  const usedNames = new Map<string, number>();
  for (const image of images) {
    const seen = usedNames.get(image.fileName) || 0;
    usedNames.set(image.fileName, seen + 1);
    const dot = image.fileName.lastIndexOf('.');
    const name =
      seen && dot > 0 ? `${image.fileName.slice(0, dot)}-${seen + 1}${image.fileName.slice(dot)}` : image.fileName;
    archive.file(name, image.blob);
  }
  return archive.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

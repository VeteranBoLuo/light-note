import { optimizeImage, releaseOptimizedImages } from './imageOptimizer';

export const NOTE_IMAGE_OPTIMIZATION = Object.freeze({
  minBytes: 300 * 1024,
  savedBytes: 50 * 1024,
  savedRatio: 0.15,
  maxEdge: 2560,
  quality: 0.9,
});
export const noteImageOptimizationEnabled = () =>
  String(import.meta.env.VITE_NOTE_IMAGE_OPTIMIZATION_ENABLED) !== 'false';
let queue: Promise<unknown> = Promise.resolve();

// 在分配解码像素前读取 JPEG SOF；不能确认格式、尺寸或长图时保留原件。
export function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  for (let p = 2; p + 4 < bytes.length;) {
    if (bytes[p] !== 0xff) return null;
    while (bytes[p] === 0xff) p++;
    const marker = bytes[p++];
    if (marker === 0xda || marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const size = bytes[p] * 256 + bytes[p + 1];
    if (size < 2 || p + size > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (size < 8) return null;
      const height = bytes[p + 3] * 256 + bytes[p + 4];
      const width = bytes[p + 5] * 256 + bytes[p + 6];
      return width && height ? { width, height } : null;
    }
    p += size;
  }
  return null;
}
export async function prepareNoteImage(
  blob: Blob,
  fileName: string,
  original = false,
): Promise<{ file: Blob; fileName: string }> {
  const fallback = { file: blob, fileName };
  if (
    original ||
    !noteImageOptimizationEnabled() ||
    blob.type !== 'image/jpeg' ||
    blob.size < NOTE_IMAGE_OPTIMIZATION.minBytes ||
    blob.size > 20 * 1024 * 1024
  )
    return fallback;
  const work = async () => {
    let optimized: Awaited<ReturnType<typeof optimizeImage>> | undefined;
    try {
      const dimensions = jpegDimensions(new Uint8Array(await blob.slice(0, 512 * 1024).arrayBuffer()));
      if (
        !dimensions ||
        dimensions.width * dimensions.height > 64_000_000 ||
        Math.max(dimensions.width, dimensions.height) / Math.min(dimensions.width, dimensions.height) > 3
      )
        return fallback;
      optimized = await optimizeImage(new File([blob], fileName, { type: blob.type }), {
        format: 'image/webp',
        quality: NOTE_IMAGE_OPTIMIZATION.quality,
        maxDimension: NOTE_IMAGE_OPTIMIZATION.maxEdge,
      });
      const saved = blob.size - optimized.blob.size;
      if (
        optimized.blob.type !== 'image/webp' ||
        saved < NOTE_IMAGE_OPTIMIZATION.savedBytes ||
        saved / blob.size < NOTE_IMAGE_OPTIMIZATION.savedRatio
      )
        return fallback;
      return { file: optimized.blob, fileName: `${fileName.replace(/\.[^.]+$/, '')}.webp` };
    } catch {
      return fallback;
    } finally {
      if (optimized) releaseOptimizedImages([optimized]);
    }
  };
  const result = queue.then(work, work);
  queue = result.catch(() => undefined);
  return result;
}

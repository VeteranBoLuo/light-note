import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { safeImageSize } from '../safeImageSize.js';
import { buildFilePreviewChildEnv } from './runtime.js';

export const IMAGE_PREVIEW_POLICY = Object.freeze({
  version: 1,
  maxBytes: 80 * 1024 * 1024,
  maxPixels: 64_000_000,
  smallBytes: 300 * 1024,
  thumbnailEdge: 720,
  displayEdge: 2560,
  longWidth: 1440,
  displayPixels: 16_000_000,
  thumbnailQuality: 78,
  displayQuality: 88,
  timeout: 20_000,
});
export const isImageStrategy = (strategy) => ['image_thumbnail', 'image_display'].includes(strategy);
export function imagePreviewsEnabled(sourceType, env = process.env) {
  const key = sourceType === 'community_chat_image' ? 'CHAT_IMAGE_PREVIEWS_ENABLED' : 'CLOUD_IMAGE_PREVIEWS_ENABLED';
  return !['0', 'false', 'off'].includes(String(env[key] ?? 'true').toLowerCase());
}
const failure = (code) => Object.assign(new Error(code), { code, status: 400 });
export function imagePreviewDescriptor(file, strategy) {
  if (!isImageStrategy(strategy)) throw failure('FILE_PREVIEW_STRATEGY_INVALID');
  const mime = String(file.file_type || '').toLowerCase();
  const extension = String(file.file_name || '')
    .split('.')
    .pop()
    .toLowerCase();
  if (
    !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime) &&
    !['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension)
  )
    throw failure('FILE_PREVIEW_UNSUPPORTED');
  return { format: { id: 'raster-image', strategy, previewType: 'image' }, extension };
}

// 按容器块读取动画标记，不扫描压缩像素中的偶然字符串。
export function imageIsAnimated(buffer, type) {
  if (type === 'gif') {
    let p = 13 + (buffer[10] & 0x80 ? 3 * 2 ** ((buffer[10] & 7) + 1) : 0);
    let frames = 0;
    const skipBlocks = () => {
      while (p < buffer.length) {
        const n = buffer[p++];
        if (!n) return;
        p += n;
      }
    };
    while (p < buffer.length) {
      const marker = buffer[p++];
      if (marker === 0x3b) break;
      if (marker === 0x21) {
        p++;
        skipBlocks();
      } else if (marker === 0x2c) {
        if (++frames > 1) return true;
        if (p + 9 > buffer.length) return false;
        const flags = buffer[p + 8];
        p += 9;
        if (flags & 0x80) p += 3 * 2 ** ((flags & 7) + 1);
        p++;
        skipBlocks();
      } else break;
    }
    return false;
  }
  if (type === 'png') {
    for (let p = 8; p + 12 <= buffer.length;) {
      const size = buffer.readUInt32BE(p);
      if (p + size + 12 > buffer.length) break;
      if (buffer.toString('ascii', p + 4, p + 8) === 'acTL') return true;
      p += size + 12;
    }
  }
  if (type === 'webp') {
    for (let p = 12; p + 8 <= buffer.length;) {
      const size = buffer.readUInt32LE(p + 4);
      if (p + size + 8 > buffer.length) break;
      if (['ANIM', 'ANMF'].includes(buffer.toString('ascii', p, p + 4))) return true;
      p += size + 8 + (size % 2);
    }
  }
  return false;
}

export async function convertImagePreview({
  buffer,
  strategy,
  bin = process.env.NOTE_IMAGE_MAGICK_BIN || 'convert',
  runner = promisify(execFile),
}) {
  const policy = IMAGE_PREVIEW_POLICY;
  if (!isImageStrategy(strategy)) throw failure('FILE_PREVIEW_STRATEGY_INVALID');
  if (!buffer.length || buffer.length > policy.maxBytes) throw failure('FILE_SIZE_INVALID');
  let dimensions;
  try {
    dimensions = safeImageSize(buffer);
  } catch {
    throw failure('FILE_CONTENT_INVALID');
  }
  const { type } = dimensions;
  const rotated = [5, 6, 7, 8].includes(Number(dimensions.orientation));
  const width = rotated ? dimensions.height : dimensions.width;
  const height = rotated ? dimensions.width : dimensions.height;
  if (!['jpg', 'png', 'gif', 'webp'].includes(type) || !width || !height || width * height > policy.maxPixels) {
    throw failure('IMAGE_PREVIEW_DIMENSIONS_INVALID');
  }
  const animated = imageIsAnimated(buffer, type);
  const thumbnail = strategy === 'image_thumbnail';
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'light-note-image-preview-'));
  try {
    const source = path.join(temp, `source.${type}`);
    const output = path.join(temp, 'preview.webp');
    await fs.writeFile(source, buffer, { mode: 0o600 });
    let geometry = `${thumbnail ? policy.thumbnailEdge : policy.displayEdge}x${thumbnail ? policy.thumbnailEdge : policy.displayEdge}>`;
    if (!thumbnail && Math.max(width, height) / Math.min(width, height) > 3) {
      const ratio = Math.min(1, policy.longWidth / width, Math.sqrt(policy.displayPixels / (width * height)));
      geometry = `${Math.max(1, Math.floor(width * ratio))}x${Math.max(1, Math.floor(height * ratio))}>`;
    }
    const env = buildFilePreviewChildEnv(temp);
    Object.assign(env, {
      MAGICK_MEMORY_LIMIT: '128MiB',
      MAGICK_MAP_LIMIT: '256MiB',
      MAGICK_DISK_LIMIT: '512MiB',
      MAGICK_THREAD_LIMIT: '1',
    });
    await runner(
      bin,
      [
        `${source}[0]`,
        '-auto-orient',
        '-colorspace',
        'sRGB',
        '-strip',
        '-thumbnail',
        geometry,
        '-quality',
        String(thumbnail ? policy.thumbnailQuality : policy.displayQuality),
        '-define',
        'webp:method=4',
        ...(!thumbnail && type === 'png' ? ['-define', 'webp:lossless=true'] : []),
        output,
      ],
      { timeout: policy.timeout, maxBuffer: 256 * 1024, windowsHide: true, env },
    );
    const outputStat = await fs.stat(output);
    if (!outputStat.size || outputStat.size > policy.maxBytes) throw failure('IMAGE_PREVIEW_OUTPUT_INVALID');
    const result = await fs.readFile(output);
    const size = safeImageSize(result);
    if (size.type !== 'webp' || !size.width || !size.height || size.width * size.height > policy.displayPixels)
      throw failure('IMAGE_PREVIEW_OUTPUT_INVALID');
    if (result.length >= buffer.length) {
      if (!animated && buffer.length <= policy.smallBytes) return { mode: 'source', width, height, animated };
      throw failure('IMAGE_PREVIEW_NO_BENEFIT');
    }
    return { mode: 'derived', buffer: result, width: size.width, height: size.height, animated };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

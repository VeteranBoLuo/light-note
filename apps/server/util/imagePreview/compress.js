import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeImageSize } from '../safeImageSize.js';
import { detectImageFormat } from './format.js';
import { validateHeifSource } from './heif.js';
import { buildFilePreviewChildEnv } from '../filePreview/runtime.js';

import { classifyImageError } from './errors.js';
import { CARD_IMAGE_PROFILE } from '@lightnote/shared';
import { createWorkerResourceGate } from '../workerResourceGate.js';
export const CARD_PROFILE = CARD_IMAGE_PROFILE;
export const COMMUNITY_IMAGE_PREVIEW_PROFILE = Object.freeze({
  width: 1600,
  height: 6000,
  pixels: 6_000_000,
  losslessMaxBytes: 512 * 1024,
  quality: 88,
});
const communityImageGate = createWorkerResourceGate(1);
let communityImageRequests = 0;
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
export function imageError(code) {
  return Object.assign(new Error(code), { code });
}
export function validateSource(buffer) {
  if (!buffer.length || buffer.length > MAX_SOURCE_BYTES) throw imageError('IMAGE_SOURCE_SIZE_LIMIT');
  if (detectImageFormat(buffer)?.type === 'heif') return validateHeifSource(buffer);
  if (!detectImageFormat(buffer)?.thumbnailSupported) throw imageError('IMAGE_SOURCE_UNSUPPORTED');
  let size;
  try {
    size = safeImageSize(buffer);
  } catch {
    throw imageError('IMAGE_SOURCE_UNSUPPORTED');
  }
  if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(size.type)) throw imageError('IMAGE_SOURCE_UNSUPPORTED');
  return size;
}
export function validatePreview(buffer) {
  const size = safeImageSize(buffer);
  if (size.type !== 'webp' || Math.max(size.width, size.height) > 720 || buffer.length > CARD_PROFILE.maxBytes) {
    throw imageError('IMAGE_OUTPUT_INVALID');
  }
  return size;
}
export async function compressCardImage(buffer, options = {}) {
  return compressImage(buffer, options);
}

export async function convertImageDisplay(buffer, options = {}) {
  if (detectImageFormat(buffer)?.type !== 'heif') throw imageError('IMAGE_SOURCE_UNSUPPORTED');
  return compressImage(buffer, { ...options, cropLongImage: false, display: true });
}

/** Uploads are already limited to 5 MiB / 20 MP. Keep full images and readable screenshot edges. */
export async function compressCommunityImage(buffer, options = {}) {
  if (buffer.length > 5 * 1024 * 1024) throw imageError('IMAGE_SOURCE_SIZE_LIMIT');
  // Bound admission as well as decoder resources; a busy uploader can retain its original.
  if (communityImageRequests >= 4) throw imageError('IMAGE_PROCESS_BUSY');
  communityImageRequests += 1;
  const now = options.now || Date.now;
  const deadline = now() + 10_000;
  try {
    return await communityImageGate(() =>
      compressImage(buffer, {
        ...options,
        now,
        budgetMs: Math.max(0, deadline - now()),
        cropLongImage: false,
        community: true,
      }),
    );
  } finally {
    communityImageRequests -= 1;
  }
}

async function compressImage(
  buffer,
  {
    runner = promisify(execFile),
    now = Date.now,
    budgetMs = 60_000,
    cropLongImage = true,
    display = false,
    community = false,
  } = {},
) {
  const source = validateSource(buffer);
  const maxEdge = display ? 4096 : 720;
  const maxBytes = display ? 8 * 1024 * 1024 : CARD_PROFILE.maxBytes;
  const heifOptions = source.type === 'heic' ? ['-define', 'heic:primary-image=true'] : [];
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-image-preview-'));
  const input = path.join(dir, `source.${source.type}`);
  const intermediate = path.join(dir, 'small.miff');
  const output = path.join(dir, 'card.webp');
  const deadline = now() + Math.min(60_000, Math.max(0, budgetMs));
  const env = {
    ...buildFilePreviewChildEnv(dir),
    MAGICK_MEMORY_LIMIT: '128MiB',
    MAGICK_MAP_LIMIT: '256MiB',
    MAGICK_DISK_LIMIT: '2GiB',
    MAGICK_THREAD_LIMIT: '1',
    MAGICK_TEMPORARY_PATH: dir,
  };
  const run = async (args, stage) => {
    const remaining = deadline - now();
    if (remaining <= 0) throw imageError('IMAGE_PROCESS_TIMEOUT');
    try {
      return await runner(process.env.NOTE_IMAGE_MAGICK_BIN || process.env.AI_OCR_MAGICK_BIN || 'convert', args, {
        timeout: remaining,
        killSignal: 'SIGKILL',
        maxBuffer: 128 * 1024,
        env,
        windowsHide: true,
      });
    } catch (error) {
      throw imageError(classifyImageError(error, stage));
    }
  };
  try {
    await fs.writeFile(input, buffer, { mode: 0o600 });
    // Ping reads geometry/orientation without allocating the full pixel cache.
    const header = await run(
      [...heifOptions, '-ping', `${input}[0]`, '-format', '%w %h %[orientation]', 'info:'],
      'decode',
    );
    const [rawWidth, rawHeight, orientation] = String(header.stdout).trim().split(/\s+/);
    const rotated = ['LeftTop', 'RightTop', 'RightBottom', 'LeftBottom'].includes(orientation);
    const width = Number(rotated ? rawHeight : rawWidth);
    const height = Number(rotated ? rawWidth : rawHeight);
    if (!(width > 0 && height > 0)) throw imageError('IMAGE_DECODE_FAILED');
    const profile = COMMUNITY_IMAGE_PREVIEW_PROFILE;
    const ratio = community
      ? Math.min(1, profile.width / width, profile.height / height, Math.sqrt(profile.pixels / (width * height)))
      : 1;
    const previewWidth = Math.max(1, Math.floor(width * ratio));
    const previewHeight = Math.max(1, Math.floor(height * ratio));
    // Small existing JPEG/WebP uploads have already paid a lossy encoding cost.
    if (community && ratio === 1 && (source.type === 'webp' || (source.type === 'jpg' && buffer.length <= 256 * 1024)))
      return null;
    const long = cropLongImage && height / width > 3;
    const presentation = long ? 'long_top' : 'full';
    await run(
      [
        ...heifOptions,
        ...(!community && !long && ['jpg', 'jpeg'].includes(source.type) ? ['-define', 'jpeg:size=1440x1440'] : []),
        `${input}[0]`,
        '-auto-orient',
        ...(long ? ['-gravity', 'NorthWest', '-crop', `${width}x${Math.floor(width * 1.5)}+0+0`, '+repage'] : []),
        '-thumbnail',
        community ? `${previewWidth}x${previewHeight}>` : `${maxEdge}x${maxEdge}>`,
        ...(source.type === 'heic' || community
          ? ['-profile', fileURLToPath(new URL('./sRGB.icc', import.meta.url)), '-colorspace', 'sRGB']
          : []),
        '-strip',
        '-depth',
        '8',
        intermediate,
      ],
      'decode',
    );
    if (community) {
      const readOutput = async () => {
        const body = await fs.readFile(output);
        const dimensions = safeImageSize(body);
        if (
          dimensions.type !== 'webp' ||
          dimensions.width > profile.width ||
          dimensions.height > profile.height ||
          dimensions.width * dimensions.height > profile.pixels ||
          body.length > 5 * 1024 * 1024
        )
          throw imageError('IMAGE_OUTPUT_INVALID');
        return ratio === 1 && body.length >= buffer.length
          ? null
          : { body, ...dimensions, sourceBytes: buffer.length, presentation: 'full' };
      };
      if (source.type === 'png') {
        await run(
          [intermediate, '-define', 'webp:lossless=true', '-quality', '100', '-define', 'webp:method=4', output],
          'encode',
        );
        if ((await fs.stat(output)).size <= profile.losslessMaxBytes) return readOutput();
      }
      await run(
        [
          intermediate,
          '-define',
          'webp:lossless=false',
          '-quality',
          String(profile.quality),
          '-define',
          'webp:method=4',
          output,
        ],
        'encode',
      );
      return readOutput();
    }
    for (const edge of display ? [4096, 3276, 2621, 2097, 1677, 1342] : [720, 576, 460, 368, 294, 235]) {
      for (const quality of display ? [86, 78, 70] : [76, 68, 60]) {
        await run(
          [
            intermediate,
            '-thumbnail',
            `${edge}x${edge}>`,
            '-quality',
            String(quality),
            '-define',
            'webp:method=4',
            output,
          ],
          'encode',
        );
        if ((await fs.stat(output)).size > maxBytes) continue;
        const body = await fs.readFile(output);
        const dimensions = safeImageSize(body);
        if (dimensions.type !== 'webp' || Math.max(dimensions.width, dimensions.height) > maxEdge)
          throw imageError('IMAGE_OUTPUT_INVALID');
        return { body, ...dimensions, sourceBytes: buffer.length, presentation };
      }
    }
    throw imageError('IMAGE_OUTPUT_SIZE_LIMIT');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

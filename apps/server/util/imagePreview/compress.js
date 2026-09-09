import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { safeImageSize } from '../safeImageSize.js';
import { buildFilePreviewChildEnv } from '../filePreview/runtime.js';

import { classifyImageError } from './errors.js';
import { CARD_IMAGE_PROFILE } from '@lightnote/shared';
export const CARD_PROFILE = CARD_IMAGE_PROFILE;
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
export function imageError(code) {
  return Object.assign(new Error(code), { code });
}
export function validateSource(buffer) {
  if (!buffer.length || buffer.length > MAX_SOURCE_BYTES) throw imageError('IMAGE_SOURCE_SIZE_LIMIT');
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
export async function compressCardImage(buffer, { runner = promisify(execFile), now = Date.now } = {}) {
  const source = validateSource(buffer);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-image-preview-'));
  const input = path.join(dir, `source.${source.type}`);
  const intermediate = path.join(dir, 'small.miff');
  const output = path.join(dir, 'card.webp');
  const deadline = now() + 60_000;
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
    const header = await run(['-ping', `${input}[0]`, '-format', '%w %h %[orientation]', 'info:'], 'decode');
    const [rawWidth, rawHeight, orientation] = String(header.stdout).trim().split(/\s+/);
    const rotated = ['LeftTop', 'RightTop', 'RightBottom', 'LeftBottom'].includes(orientation);
    const width = Number(rotated ? rawHeight : rawWidth);
    const height = Number(rotated ? rawWidth : rawHeight);
    if (!(width > 0 && height > 0)) throw imageError('IMAGE_DECODE_FAILED');
    const long = height / width > 3;
    const presentation = long ? 'long_top' : 'full';
    await run(
      [
        ...(!long && ['jpg', 'jpeg'].includes(source.type) ? ['-define', 'jpeg:size=1440x1440'] : []),
        `${input}[0]`,
        '-auto-orient',
        ...(long ? ['-gravity', 'NorthWest', '-crop', `${width}x${Math.floor(width * 1.5)}+0+0`, '+repage'] : []),
        '-thumbnail',
        '720x720>',
        '-strip',
        '-depth',
        '8',
        intermediate,
      ],
      'decode',
    );
    for (const edge of [720, 576, 460, 368, 294, 235]) {
      for (const quality of [76, 68, 60]) {
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
        if ((await fs.stat(output)).size > CARD_PROFILE.maxBytes) continue;
        const body = await fs.readFile(output);
        return { body, ...validatePreview(body), sourceBytes: buffer.length, presentation };
      }
    }
    throw imageError('IMAGE_OUTPUT_SIZE_LIMIT');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { safeImageSize } from '../safeImageSize.js';
import { buildFilePreviewChildEnv } from '../filePreview/runtime.js';

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
  if (size.width * size.height > 64_000_000) throw imageError('IMAGE_SOURCE_PIXEL_LIMIT');
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
  const output = path.join(dir, 'card.webp');
  const deadline = now() + 30_000;
  try {
    await fs.writeFile(input, buffer, { mode: 0o600 });
    const env = {
      ...buildFilePreviewChildEnv(dir),
      MAGICK_MEMORY_LIMIT: '128MiB',
      MAGICK_MAP_LIMIT: '256MiB',
      MAGICK_DISK_LIMIT: '512MiB',
      MAGICK_THREAD_LIMIT: '1',
    };
    for (const edge of [720, 576, 460, 368, 294, 235]) {
      for (const quality of [76, 68, 60]) {
        const remaining = deadline - now();
        if (remaining <= 0) throw imageError('IMAGE_PROCESS_TIMEOUT');
        await runner(
          process.env.NOTE_IMAGE_MAGICK_BIN || process.env.AI_OCR_MAGICK_BIN || 'convert',
          [
            `${input}[0]`,
            '-auto-orient',
            '-strip',
            '-thumbnail',
            `${edge}x${edge}>`,
            '-quality',
            String(quality),
            '-define',
            'webp:method=4',
            output,
          ],
          { timeout: remaining, maxBuffer: 128 * 1024, env, windowsHide: true },
        );
        const stat = await fs.stat(output);
        if (stat.size > CARD_PROFILE.maxBytes) continue;
        const body = await fs.readFile(output);
        const dimensions = validatePreview(body);
        return { body, ...dimensions, sourceBytes: buffer.length };
      }
    }
    throw imageError('IMAGE_OUTPUT_SIZE_LIMIT');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

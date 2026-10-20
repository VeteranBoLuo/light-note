import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import fs from 'node:fs/promises';
import { convertImageDisplay } from './compress.js';
import { buildFilePreviewChildEnv } from '../filePreview/runtime.js';
import { validatePreview } from './compress.js';
export async function inspectImagePreviewRuntime({ runner = promisify(execFile), heif = false } = {}) {
  const bin = process.env.NOTE_IMAGE_MAGICK_BIN || process.env.AI_OCR_MAGICK_BIN || 'convert';
  try {
    const { stdout } = await runner(bin, ['-size', '1x1', 'xc:transparent', 'webp:-'], {
      timeout: 5000,
      maxBuffer: 256 * 1024,
      encoding: 'buffer',
      env: buildFilePreviewChildEnv(os.tmpdir()),
    });
    validatePreview(Buffer.from(stdout));
    if (heif) {
      const fixture = await fs.readFile(new URL('./fixtures/primary.heic', import.meta.url));
      await convertImageDisplay(fixture, { runner, budgetMs: 5000 });
    }
    return { ready: true, errorCode: null };
  } catch {
    return { ready: false, errorCode: 'IMAGE_RUNTIME_UNAVAILABLE' };
  }
}

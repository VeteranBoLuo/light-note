import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildFilePreviewChildEnv } from '../filePreview/runtime.js';
import { compressCardImage, imageError, MAX_SOURCE_BYTES } from './compress.js';
import { copySourceToFile } from './sourceCopy.js';

const binary = () => process.env.PDF_PREVIEW_PDFTOPPM_BIN || 'pdftoppm';

// Only the first page is rasterized, bounded to the card edge; no URL, credential or filename reaches the child.
export async function readPdfCover(locator, metadata, readRange, { runner = promisify(execFile) } = {}) {
  const size = Number(metadata.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SOURCE_BYTES) throw imageError('IMAGE_PDF_SIZE_LIMIT');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-pdf-cover-'));
  const input = path.join(dir, 'source.pdf');
  const output = path.join(dir, 'page.png');
  const deadline = Date.now() + 60_000;
  try {
    const revision = await copySourceToFile(locator, size, readRange, input);
    try {
      await runner(
        binary(),
        ['-f', '1', '-l', '1', '-singlefile', '-png', '-scale-to', '720', input, path.join(dir, 'page')],
        {
          timeout: Math.max(1, Math.min(20_000, deadline - Date.now())),
          killSignal: 'SIGKILL',
          maxBuffer: 128 * 1024,
          env: buildFilePreviewChildEnv(dir),
          windowsHide: true,
        },
      );
    } catch (error) {
      if (error.code === 'ENOENT') throw imageError('IMAGE_RUNTIME_UNAVAILABLE');
      if (error.killed || error.code === 'ETIMEDOUT') throw imageError('IMAGE_PROCESS_TIMEOUT');
      throw imageError('IMAGE_PDF_RENDER_FAILED');
    }
    const stat = await fs.stat(output).catch(() => {
      throw imageError('IMAGE_PDF_RENDER_FAILED');
    });
    if (!stat.size || stat.size > 4 * 1024 * 1024) throw imageError('IMAGE_PDF_RENDER_FAILED');
    const preview = await compressCardImage(await fs.readFile(output), {
      budgetMs: Math.min(15000, deadline - Date.now()),
      cropLongImage: false,
    });
    return {
      body: preview.body,
      preview: { ...preview, presentation: 'full' },
      revision,
      version: metadata.version,
      sourceSize: size,
    };
  } catch (error) {
    if (['TimeoutError', 'AbortError'].includes(error.name)) throw imageError('IMAGE_PROCESS_TIMEOUT');
    throw error;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function inspectPdfPreviewRuntime({ runner = promisify(execFile) } = {}) {
  try {
    await runner(binary(), ['-v'], { timeout: 5000, maxBuffer: 64 * 1024, env: buildFilePreviewChildEnv(os.tmpdir()) });
    return { ready: true, errorCode: null };
  } catch {
    return { ready: false, errorCode: 'IMAGE_RUNTIME_UNAVAILABLE' };
  }
}

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { safeImageSize } from '../safeImageSize.js';

const execFileAsync = promisify(execFile);
const MAGICK_BIN = String(process.env.AI_OCR_MAGICK_BIN || 'convert').trim();
const PREPROCESS_TIMEOUT_MS = 45_000;
const MAX_BUFFER = 4 * 1024 * 1024;
const MAX_TOTAL_PREPARED_BYTES = 30 * 1024 * 1024;
const TILE_PIXEL_THRESHOLD = 1_500_000;
const OUTPUT_EDGE = 2400;
const MAX_INPUT_PIXELS = (() => {
  const configured = Number(process.env.AI_OCR_MAX_PIXELS || 24_000_000);
  return Number.isFinite(configured) ? Math.min(60_000_000, Math.max(1_000_000, Math.trunc(configured))) : 24_000_000;
})();

export const VISION_PREPROCESS_VERSION = 1;

const TYPE_BY_EXTENSION = Object.freeze({
  '.png': 'png',
  '.jpg': 'jpg',
  '.jpeg': 'jpg',
  '.webp': 'webp',
});

const MIME_BY_TYPE = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
});

function preprocessError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function inspectInput(buffer, extension) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw preprocessError('FILE_CONTENT_INVALID', '图片内容为空或已经损坏');
  }
  const expectedType = TYPE_BY_EXTENSION[String(extension || '').toLowerCase()];
  if (!expectedType) throw preprocessError('UNSUPPORTED_FILE_TYPE', '图片格式不受支持');
  let dimensions;
  try {
    dimensions = safeImageSize(buffer);
  } catch (error) {
    throw preprocessError('FILE_CONTENT_INVALID', '图片内容无法识别或已经损坏', error);
  }
  const width = Number(dimensions.width || 0);
  const height = Number(dimensions.height || 0);
  if (dimensions.type !== expectedType || !width || !height) {
    throw preprocessError('FILE_CONTENT_INVALID', '图片扩展名与实际内容不一致');
  }
  if (width * height > MAX_INPUT_PIXELS) {
    throw preprocessError('OCR_IMAGE_TOO_LARGE', `图片像素不能超过 ${MAX_INPUT_PIXELS.toLocaleString('en-US')}`);
  }
  return { type: dimensions.type, width, height };
}

function childProcessEnv(temporaryDirectory, env = process.env) {
  const childEnv = {};
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'SYSTEMROOT', 'WINDIR', 'LD_LIBRARY_PATH']) {
    if (env[key]) childEnv[key] = String(env[key]);
  }
  childEnv.TMPDIR = temporaryDirectory;
  childEnv.TMP = temporaryDirectory;
  childEnv.TEMP = temporaryDirectory;
  childEnv.MAGICK_MEMORY_LIMIT = '192MiB';
  childEnv.MAGICK_MAP_LIMIT = '384MiB';
  childEnv.MAGICK_DISK_LIMIT = '768MiB';
  childEnv.MAGICK_THREAD_LIMIT = '1';
  return childEnv;
}

async function runMagick(runner, args, temporaryDirectory, signal) {
  return runner(MAGICK_BIN, args, {
    encoding: 'utf8',
    timeout: PREPROCESS_TIMEOUT_MS,
    signal,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
    killSignal: 'SIGKILL',
    env: childProcessEnv(temporaryDirectory),
  });
}

function preparedImage(buffer, label) {
  const dimensions = safeImageSize(buffer);
  return Object.freeze({
    buffer,
    mimeType: MIME_BY_TYPE[dimensions.type] || 'image/jpeg',
    width: Number(dimensions.width || 0),
    height: Number(dimensions.height || 0),
    label,
  });
}

async function generateTile({ fullPath, outputPath, geometry, runner, temporaryDirectory, signal }) {
  await runMagick(
    runner,
    [fullPath, '-crop', geometry, '+repage', '-strip', '-quality', '92', outputPath],
    temporaryDirectory,
    signal,
  );
  return readFile(outputPath);
}

/**
 * DeepSeek 会把大图压到固定视觉预算。对大图额外提供两个带重叠的分区，比猜测证件边界后硬裁切更稳：
 * 全图保留上下文，分区保留小字细节，且不会丢掉位于边缘的正文。
 */
export async function prepareImagesForVision(
  buffer,
  { extension, signal, runner = execFileAsync, tempRoot = os.tmpdir() } = {},
) {
  if (signal?.aborted) {
    if (signal.reason) throw signal.reason;
    throw new DOMException('请求已取消', 'AbortError');
  }
  const source = inspectInput(buffer, extension);
  const fallback = () => ({
    images: [
      Object.freeze({
        buffer,
        mimeType: MIME_BY_TYPE[source.type] || 'application/octet-stream',
        width: source.width,
        height: source.height,
        label: '原图',
      }),
    ],
    preprocessVersion: VISION_PREPROCESS_VERSION,
    warnings: ['VISION_PREPROCESS_UNAVAILABLE'],
  });
  const temporaryDirectory = await mkdtemp(path.join(tempRoot, 'light-note-vision-'));
  try {
    const inputPath = path.join(temporaryDirectory, `input${String(extension || '').toLowerCase()}`);
    const fullPath = path.join(temporaryDirectory, 'full.jpg');
    await writeFile(inputPath, buffer, { mode: 0o600 });
    try {
      await runMagick(
        runner,
        [
          `${inputPath}[0]`,
          '-auto-orient',
          '-strip',
          '-colorspace',
          'sRGB',
          '-background',
          'white',
          '-alpha',
          'remove',
          '-alpha',
          'off',
          '-resize',
          `${OUTPUT_EDGE}x${OUTPUT_EDGE}>`,
          '-interlace',
          'none',
          '-quality',
          '92',
          fullPath,
        ],
        temporaryDirectory,
        signal,
      );
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error;
      return fallback();
    }
    const fullBuffer = await readFile(fullPath);
    const full = preparedImage(fullBuffer, '自动旋转后的完整图片');
    const images = [full];
    if (full.width * full.height >= TILE_PIXEL_THRESHOLD && Math.min(full.width, full.height) >= 700) {
      const horizontal = full.width >= full.height;
      const longEdge = horizontal ? full.width : full.height;
      const shortEdge = horizontal ? full.height : full.width;
      const tileLongEdge = Math.min(longEdge, Math.ceil(longEdge * 0.58));
      const offset = Math.max(0, longEdge - tileLongEdge);
      const firstGeometry = horizontal ? `${tileLongEdge}x${shortEdge}+0+0` : `${shortEdge}x${tileLongEdge}+0+0`;
      const secondGeometry = horizontal
        ? `${tileLongEdge}x${shortEdge}+${offset}+0`
        : `${shortEdge}x${tileLongEdge}+0+${offset}`;
      try {
        const first = await generateTile({
          fullPath,
          outputPath: path.join(temporaryDirectory, 'tile-1.jpg'),
          geometry: firstGeometry,
          runner,
          temporaryDirectory,
          signal,
        });
        const second = await generateTile({
          fullPath,
          outputPath: path.join(temporaryDirectory, 'tile-2.jpg'),
          geometry: secondGeometry,
          runner,
          temporaryDirectory,
          signal,
        });
        if (fullBuffer.length + first.length + second.length <= MAX_TOTAL_PREPARED_BYTES) {
          images.push(preparedImage(first, horizontal ? '左侧细节' : '上半部分细节'));
          images.push(preparedImage(second, horizontal ? '右侧细节' : '下半部分细节'));
        }
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error;
        // 完整自动旋转图已经可用，分区增强失败不应让主识别退化到原图。
      }
    }
    return { images, preprocessVersion: VISION_PREPROCESS_VERSION, warnings: [] };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export const imageVisionPreprocessInternals = Object.freeze({
  MAX_INPUT_PIXELS,
  MAX_TOTAL_PREPARED_BYTES,
  TILE_PIXEL_THRESHOLD,
  inspectInput,
});

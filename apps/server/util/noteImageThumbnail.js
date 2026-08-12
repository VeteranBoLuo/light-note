import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { imageSize } from 'image-size';
import { NOTE_IMAGE_DIR } from './noteImages.js';

const execFileAsync = promisify(execFile);
const SUPPORTED_TYPES = new Set(['png', 'jpg', 'webp', 'gif']);
const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 64_000_000;
const THUMBNAIL_WIDTH = 720;
const THUMBNAIL_QUALITY = 76;
const THUMBNAIL_TIMEOUT_MS = 20_000;
const THUMBNAIL_MAX_BYTES = 512 * 1024;
const FAILURE_RETRY_MS = 5 * 60 * 1000;
const failedAt = new Map();
const pending = new Map();
let queueTail = Promise.resolve();
let runtimeBlockedUntil = 0;

export const NOTE_IMAGE_THUMBNAIL_DIR = path.resolve(
  String(process.env.NOTE_IMAGE_THUMBNAIL_DIR || '/www/wwwroot/note-image-thumbnails').trim(),
);

function safeSource(url, imageRoot = NOTE_IMAGE_DIR) {
  let parsed;
  try {
    parsed = new URL(String(url || ''), 'https://boluo66.top');
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.hostname !== 'boluo66.top') return null;
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (!pathname.startsWith('/uploads/')) return null;
  const fileName = path.basename(pathname);
  if (
    !fileName ||
    pathname !== `/uploads/${fileName}` ||
    fileName.includes('\0') ||
    fileName.includes('[') ||
    fileName.includes(']') ||
    !SUPPORTED_EXTENSIONS.has(path.extname(fileName).toLowerCase())
  ) {
    return null;
  }
  return {
    fileName,
    filePath: path.join(imageRoot || '/www/wwwroot/images', fileName),
    canonicalUrl: `https://boluo66.top/uploads/${fileName}`,
  };
}

export function thumbnailKeyForNoteImageUrl(url) {
  const source = safeSource(url);
  return source ? createHash('sha256').update(source.fileName).digest('hex') : '';
}

export function noteImageThumbnailPathname(url) {
  const key = thumbnailKeyForNoteImageUrl(url);
  return key ? `/api/note/image-thumbnail/${key}.webp?source=${encodeURIComponent(String(url || ''))}` : '';
}

function allowedChildEnv(temporaryDirectory, env = process.env) {
  const childEnv = {};
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'SYSTEMROOT', 'WINDIR', 'LD_LIBRARY_PATH']) {
    if (env[key]) childEnv[key] = String(env[key]);
  }
  childEnv.TMPDIR = temporaryDirectory;
  childEnv.TMP = temporaryDirectory;
  childEnv.TEMP = temporaryDirectory;
  childEnv.MAGICK_MEMORY_LIMIT = '128MiB';
  childEnv.MAGICK_MAP_LIMIT = '256MiB';
  childEnv.MAGICK_DISK_LIMIT = '512MiB';
  childEnv.MAGICK_THREAD_LIMIT = '1';
  return childEnv;
}

async function generateThumbnail(sourceUrl, outputPath, { runner = execFileAsync, imageRoot = NOTE_IMAGE_DIR } = {}) {
  const source = safeSource(sourceUrl, imageRoot);
  if (!source) throw Object.assign(new Error('NOTE_IMAGE_SOURCE_INVALID'), { code: 'NOTE_IMAGE_SOURCE_INVALID' });
  const stat = await fs.stat(source.filePath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_SOURCE_BYTES) {
    throw Object.assign(new Error('NOTE_IMAGE_SOURCE_TOO_LARGE'), { code: 'NOTE_IMAGE_SOURCE_TOO_LARGE' });
  }
  const buffer = await fs.readFile(source.filePath);
  if (buffer.length !== stat.size) {
    throw Object.assign(new Error('NOTE_IMAGE_SOURCE_CHANGED'), { code: 'NOTE_IMAGE_SOURCE_CHANGED' });
  }
  let dimensions;
  try {
    dimensions = imageSize(buffer);
  } catch {
    throw Object.assign(new Error('NOTE_IMAGE_SOURCE_INVALID'), { code: 'NOTE_IMAGE_SOURCE_INVALID' });
  }
  const width = Number(dimensions.width || 0);
  const height = Number(dimensions.height || 0);
  const type = String(dimensions.type || '').toLowerCase();
  if (!SUPPORTED_TYPES.has(type) || !width || !height || width * height > MAX_SOURCE_PIXELS) {
    throw Object.assign(new Error('NOTE_IMAGE_SOURCE_INVALID'), { code: 'NOTE_IMAGE_SOURCE_INVALID' });
  }

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'light-note-card-thumb-'));
  const temporaryOutput = path.join(temporaryDirectory, 'preview.webp');
  const magickBin = String(process.env.NOTE_IMAGE_MAGICK_BIN || process.env.AI_OCR_MAGICK_BIN || 'convert').trim();
  try {
    try {
      await runner(
        magickBin,
        [
          `${source.filePath}[0]`,
          '-auto-orient',
          '-strip',
          '-thumbnail',
          `${THUMBNAIL_WIDTH}x${THUMBNAIL_WIDTH}>`,
          '-quality',
          String(THUMBNAIL_QUALITY),
          '-define',
          'webp:method=4',
          temporaryOutput,
        ],
        {
          timeout: THUMBNAIL_TIMEOUT_MS,
          maxBuffer: 512 * 1024,
          windowsHide: true,
          env: allowedChildEnv(temporaryDirectory),
        },
      );
    } catch (error) {
      if (
        error?.code === 'ENOENT' ||
        /no encode delegate.{0,80}webp|webp.{0,80}no encode delegate/iu.test(error?.stderr)
      ) {
        const runtimeError = new Error('NOTE_IMAGE_THUMBNAIL_RUNTIME_UNAVAILABLE');
        runtimeError.code = 'NOTE_IMAGE_THUMBNAIL_RUNTIME_UNAVAILABLE';
        runtimeError.cause = error;
        throw runtimeError;
      }
      throw error;
    }
    const preview = await fs.readFile(temporaryOutput);
    const previewSize = imageSize(preview);
    if (
      previewSize.type !== 'webp' ||
      !Number(previewSize.width || 0) ||
      !Number(previewSize.height || 0) ||
      preview.length <= 0 ||
      preview.length > THUMBNAIL_MAX_BYTES
    ) {
      throw Object.assign(new Error('NOTE_IMAGE_THUMBNAIL_INVALID'), { code: 'NOTE_IMAGE_THUMBNAIL_INVALID' });
    }
    const outputDirectory = path.dirname(outputPath);
    const stagingPath = path.join(outputDirectory, `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`);
    await fs.mkdir(outputDirectory, { recursive: true, mode: 0o750 });
    try {
      await fs.writeFile(stagingPath, preview, { mode: 0o640, flag: 'wx' });
      // 生成完成后再原子替换正式文件，跨进程同时冷启动也不会让请求读到半张图片。
      await fs.rename(stagingPath, outputPath);
    } finally {
      await fs.unlink(stagingPath).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function enqueue(key, task) {
  if (pending.has(key)) return pending.get(key);
  const promise = queueTail
    .catch(() => {})
    .then(task)
    .finally(() => pending.delete(key));
  pending.set(key, promise);
  queueTail = promise.catch(() => {});
  return promise;
}

export async function ensureNoteImageThumbnail(
  sourceUrl,
  { runner = execFileAsync, imageRoot = NOTE_IMAGE_DIR, thumbnailRoot = NOTE_IMAGE_THUMBNAIL_DIR } = {},
) {
  const key = thumbnailKeyForNoteImageUrl(sourceUrl);
  if (!key) return null;
  const outputPath = path.join(thumbnailRoot, `${key}.webp`);
  try {
    await fs.access(outputPath, fsConstants.R_OK);
    return outputPath;
  } catch {
    // 首次访问继续生成。
  }
  if (Date.now() < runtimeBlockedUntil) return null;
  const lastFailure = failedAt.get(key) || 0;
  if (Date.now() - lastFailure < FAILURE_RETRY_MS) return null;
  return enqueue(key, async () => {
    try {
      await fs.access(outputPath, fsConstants.R_OK);
      return outputPath;
    } catch {
      // 排队期间仍未由其他请求生成，当前任务负责生成。
    }
    try {
      await generateThumbnail(sourceUrl, outputPath, { runner, imageRoot });
      failedAt.delete(key);
      return outputPath;
    } catch (error) {
      if (error?.code === 'NOTE_IMAGE_THUMBNAIL_RUNTIME_UNAVAILABLE') {
        runtimeBlockedUntil = Date.now() + FAILURE_RETRY_MS;
      }
      failedAt.delete(key);
      failedAt.set(key, Date.now());
      while (failedAt.size > 500) failedAt.delete(failedAt.keys().next().value);
      return null;
    }
  });
}

export async function getExistingNoteImageThumbnailPath(key, { thumbnailRoot = NOTE_IMAGE_THUMBNAIL_DIR } = {}) {
  const normalized = String(key || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) return null;
  const filePath = path.join(thumbnailRoot, `${normalized}.webp`);
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size > 0 && stat.size <= THUMBNAIL_MAX_BYTES ? filePath : null;
  } catch {
    return null;
  }
}

export async function resolveOwnedNoteThumbnailSource({ key, sourceUrl, userId, db }) {
  const normalized = String(key || '').toLowerCase();
  if (!userId || !/^[a-f0-9]{64}$/u.test(normalized)) return '';
  const source = safeSource(sourceUrl);
  if (!source || thumbnailKeyForNoteImageUrl(source.canonicalUrl) !== normalized) return '';
  const encodedFileName = encodeURIComponent(source.fileName);
  const candidateUrls = [
    ...new Set([
      source.canonicalUrl,
      `https://boluo66.top/uploads/${encodedFileName}`,
      `http://boluo66.top/uploads/${source.fileName}`,
      `http://boluo66.top/uploads/${encodedFileName}`,
    ]),
  ];
  const [rows] = await db.query(
    `SELECT ni.url
       FROM note_images ni
       JOIN note n ON n.id = ni.note_id
      WHERE ni.url IN (${candidateUrls.map(() => '?').join(',')})
        AND n.create_by = ?
        AND n.del_flag = 0`,
    [...candidateUrls, userId],
  );
  return rows.length ? source.canonicalUrl : '';
}

export async function deleteNoteImageThumbnail(sourceUrl, { thumbnailRoot = NOTE_IMAGE_THUMBNAIL_DIR } = {}) {
  const key = thumbnailKeyForNoteImageUrl(sourceUrl);
  if (!key) return false;
  try {
    await fs.unlink(path.join(thumbnailRoot, `${key}.webp`));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function clearNoteImageThumbnailRuntimeState() {
  failedAt.clear();
  pending.clear();
  queueTail = Promise.resolve();
  runtimeBlockedUntil = 0;
}

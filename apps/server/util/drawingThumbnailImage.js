import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DRAWING_THUMBNAIL_RENDERER_VERSION } from '@lightnote/shared/drawing-note';
import { safeImageSize } from './safeImageSize.js';

export const DRAWING_THUMBNAIL_WIDTH = 480;
export const DRAWING_THUMBNAIL_HEIGHT = 270;
export const DRAWING_THUMBNAIL_MAX_BYTES = 256 * 1024;
const PRODUCTION_DRAWING_THUMBNAIL_DIR = '/www/wwwroot/drawing-note-thumbnails';
const LOCAL_DRAWING_THUMBNAIL_DIR = fileURLToPath(new URL('../.runtime/drawing-note-thumbnails', import.meta.url));

export function resolveDefaultDrawingThumbnailDir({
  configured = process.env.DRAWING_THUMBNAIL_DIR,
  productionRootExists = existsSync('/www/wwwroot'),
} = {}) {
  const configuredPath = String(configured || '').trim();
  if (configuredPath) return path.resolve(configuredPath);
  return productionRootExists ? PRODUCTION_DRAWING_THUMBNAIL_DIR : LOCAL_DRAWING_THUMBNAIL_DIR;
}

function thumbnailPrefix(userId, noteId) {
  return createHash('sha256')
    .update(`${String(userId)}\0${String(noteId)}`)
    .digest('hex');
}

function normalizedRendererVersion(value) {
  const rendererVersion = Number(value);
  return Number.isSafeInteger(rendererVersion) && rendererVersion > 0 ? rendererVersion : 0;
}

export function drawingThumbnailFileName({
  userId,
  noteId,
  revision,
  rendererVersion = DRAWING_THUMBNAIL_RENDERER_VERSION,
}) {
  const normalizedRevision = Number(revision);
  const normalizedVersion = normalizedRendererVersion(rendererVersion);
  if (!userId || !noteId || !Number.isSafeInteger(normalizedRevision) || normalizedRevision < 1 || !normalizedVersion) {
    return '';
  }
  const suffix = normalizedVersion === 1 ? `${normalizedRevision}` : `v${normalizedVersion}-${normalizedRevision}`;
  return `${thumbnailPrefix(userId, noteId)}-${suffix}.webp`;
}

export function decodeDrawingThumbnailDataUrl(value) {
  const raw = String(value || '');
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/u.exec(raw);
  if (!match || match[1].length > Math.ceil(DRAWING_THUMBNAIL_MAX_BYTES / 3) * 4 + 4) return null;
  const image = Buffer.from(match[1], 'base64');
  if (!image.length || image.length > DRAWING_THUMBNAIL_MAX_BYTES) return null;
  try {
    const dimensions = safeImageSize(image);
    if (
      dimensions.type !== 'webp' ||
      dimensions.width !== DRAWING_THUMBNAIL_WIDTH ||
      dimensions.height !== DRAWING_THUMBNAIL_HEIGHT
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return image;
}

export function drawingThumbnailPath({
  userId,
  noteId,
  revision,
  rendererVersion = DRAWING_THUMBNAIL_RENDERER_VERSION,
  root = resolveDefaultDrawingThumbnailDir(),
}) {
  const fileName = drawingThumbnailFileName({ userId, noteId, revision, rendererVersion });
  return fileName ? path.join(root, fileName) : '';
}

export async function saveDrawingThumbnail(
  { userId, noteId, revision, rendererVersion = DRAWING_THUMBNAIL_RENDERER_VERSION, image },
  { root = resolveDefaultDrawingThumbnailDir() } = {},
) {
  const filePath = drawingThumbnailPath({ userId, noteId, revision, rendererVersion, root });
  if (!filePath || !Buffer.isBuffer(image) || !image.length || image.length > DRAWING_THUMBNAIL_MAX_BYTES) {
    throw Object.assign(new Error('DRAWING_THUMBNAIL_INVALID'), { code: 'DRAWING_THUMBNAIL_INVALID' });
  }
  await fs.mkdir(root, { recursive: true, mode: 0o750 });
  const stagingPath = path.join(root, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(stagingPath, image, { mode: 0o640, flag: 'wx' });
    await fs.rename(stagingPath, filePath);
  } finally {
    await fs.unlink(stagingPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  return filePath;
}

export async function removeDrawingThumbnailFile(filePath) {
  if (!filePath) return;
  await fs.unlink(filePath).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
}

export async function cleanupOtherDrawingThumbnailRevisions(
  { userId, noteId, keepRevision, keepRendererVersion = DRAWING_THUMBNAIL_RENDERER_VERSION },
  { root = resolveDefaultDrawingThumbnailDir() } = {},
) {
  const keepFileName = drawingThumbnailFileName({
    userId,
    noteId,
    revision: keepRevision,
    rendererVersion: keepRendererVersion,
  });
  if (!keepFileName) return;
  const prefix = `${thumbnailPrefix(userId, noteId)}-`;
  const normalizedKeepRevision = Number(keepRevision);
  const normalizedKeepRendererVersion = normalizedRendererVersion(keepRendererVersion);
  let names;
  try {
    names = await fs.readdir(root);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  await Promise.all(
    names
      .filter((name) => {
        if (!name.startsWith(prefix) || !name.endsWith('.webp') || name === keepFileName) return false;
        const suffix = name.slice(prefix.length, -'.webp'.length);
        const versioned = /^v(\d+)-(\d+)$/u.exec(suffix);
        const rendererVersion = versioned ? Number(versioned[1]) : 1;
        const revision = Number(versioned?.[2] || suffix);
        if (!Number.isSafeInteger(revision) || revision < 1) return false;
        // 只删除更旧正文，或同一正文下更旧的渲染器；较新的并发保存绝不能被慢请求清掉。
        return (
          revision < normalizedKeepRevision ||
          (revision === normalizedKeepRevision && rendererVersion < normalizedKeepRendererVersion)
        );
      })
      .map((name) => removeDrawingThumbnailFile(path.join(root, name))),
  );
}

export async function getExistingDrawingThumbnailPath(
  { userId, noteId, revision, rendererVersion = DRAWING_THUMBNAIL_RENDERER_VERSION },
  { root = resolveDefaultDrawingThumbnailDir() } = {},
) {
  const filePath = drawingThumbnailPath({ userId, noteId, revision, rendererVersion, root });
  if (!filePath) return null;
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size > 0 && stat.size <= DRAWING_THUMBNAIL_MAX_BYTES ? filePath : null;
  } catch {
    return null;
  }
}

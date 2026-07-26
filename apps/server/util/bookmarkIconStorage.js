import path from 'node:path';

export const DEFAULT_UPLOAD_DIR = '/www/wwwroot/images';
const BOOKMARK_ICON_EXTENSION_PATTERN = '(?:png|svg|jpe?g|gif|webp|ico)';
const SHARED_BOOKMARK_ICON_PATTERN = new RegExp(
  `^bookmark-icon-[a-f0-9]{64}\\.${BOOKMARK_ICON_EXTENSION_PATTERN}$`,
  'i',
);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Worker 落盘目录。允许本地预览通过环境变量改到临时目录，
 * 线上未配置时仍沿用既有 uploads 目录。
 */
export function resolveBookmarkIconUploadDir(env = process.env) {
  const configured = String(env?.BOOKMARK_ICON_UPLOAD_DIR || '').trim();
  return path.resolve(configured || DEFAULT_UPLOAD_DIR);
}

/**
 * /uploads 的静态目录按优先级返回：
 * 先找图标 Worker 的自定义目录，再回退到既有上传目录。
 */
export function getUploadStaticDirectories(env = process.env) {
  return [...new Set([resolveBookmarkIconUploadDir(env), path.resolve(DEFAULT_UPLOAD_DIR)])];
}

/**
 * 从站内图标 URL 中提取受控文件名。
 * 同时兼容：
 * - 新版全局内容寻址：bookmark-icon-{sha256}.{ext}
 * - 旧版书签私有文件：bookmark-{bookmarkId}[-{hash}].{ext}
 */
export function getStoredBookmarkIconFileName(iconUrl, bookmarkId = '') {
  if (!iconUrl) return '';
  try {
    const pathname = new URL(iconUrl, 'https://light-note.local').pathname;
    if (!pathname.startsWith('/uploads/')) return '';

    const encodedFileName = pathname.slice('/uploads/'.length);
    if (!encodedFileName || encodedFileName.includes('/')) return '';

    const fileName = decodeURIComponent(encodedFileName);
    if (!fileName || fileName.includes('/') || fileName.includes('\\') || path.basename(fileName) !== fileName) {
      return '';
    }

    if (SHARED_BOOKMARK_ICON_PATTERN.test(fileName)) return fileName;
    if (!bookmarkId) return '';

    const legacyPattern = new RegExp(
      `^bookmark-${escapeRegExp(bookmarkId)}(?:-[a-f0-9]{12})?\\.${BOOKMARK_ICON_EXTENSION_PATTERN}$`,
      'i',
    );
    return legacyPattern.test(fileName) ? fileName : '';
  } catch {
    return '';
  }
}

export function resolveStoredBookmarkIcon(iconUrl, bookmarkId = '', env = process.env) {
  const fileName = getStoredBookmarkIconFileName(iconUrl, bookmarkId);
  if (!fileName) return null;
  return {
    fileName,
    filePath: path.join(resolveBookmarkIconUploadDir(env), fileName),
    pathname: `/uploads/${fileName}`,
    shared: SHARED_BOOKMARK_ICON_PATTERN.test(fileName),
  };
}

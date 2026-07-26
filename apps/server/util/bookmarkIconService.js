/**
 * 轻笺书签图标 - 获取服务
 *
 * 职责：
 * 1. 管理 favicon 抓取的并发与去重
 * 2. 不持有数据库连接期间发起网络请求
 * 3. 根据 favicon-api 结构化错误码决定 icon_checked_at 更新策略
 * 4. 失败后自动重试一次（短等待）
 */

import pool from '../db/index.js';
import { bookmarkIconLimiter } from './bookmarkIconLimiter.js';
import { fetchFaviconFromApi, normalizeOrigin, isRetryableError, isPermanentError } from './bookmarkIconClient.js';
import path from 'path';
import fsP from 'fs/promises';
import { createHash, randomUUID } from 'crypto';
import { resolveBookmarkIconUploadDir, resolveStoredBookmarkIcon } from './bookmarkIconStorage.js';

// ── 环境变量 ──────────────────────────────────────────────
const BOOKMARK_ICON_AFTER_SAVE_COOLDOWN_MS = 60 * 60 * 1000;
export const BOOKMARK_ICON_UPLOAD_DIR = resolveBookmarkIconUploadDir();
const IMG_RETRY_DELAY_MIN = 800;
const IMG_RETRY_DELAY_MAX = 1500;

// ── 常量 ──────────────────────────────────────────────────
const imageMimeTypes = {
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

// ── 状态：同进程内 Origin 去重 ────────────────────────────
const inFlightOrigins = new Map(); // originKey -> Promise<result>

/**
 * 处理一批书签的图标抓取，不持有数据库连接
 *
 * @param {Array<{id:string, url:string, icon_url:string, icon_checked_at:Date|null}>} bookmarks
 * @param {string} userId - 当前用户 ID，用于权限校验
 * @returns {Promise<Array<{id:string, iconUrl?:string, iconCheckedAt:string, changed:boolean, errorCode?:string}>>}
 */
export async function processBookmarkIcons(bookmarks, userId) {
  if (!bookmarks?.length) return [];

  // 1. 按 Origin 去重
  const originMap = new Map(); // originKey -> { bookmarkIds: Set, bookmarks: [] }
  for (const bm of bookmarks) {
    const originKey = normalizeOrigin(bm.url);
    if (!originKey) {
      // URL 无法解析——标记为永久失败但不阻塞
      continue;
    }
    if (!originMap.has(originKey)) {
      originMap.set(originKey, { bookmarkIds: new Set(), bookmarks: [] });
    }
    const entry = originMap.get(originKey);
    entry.bookmarkIds.add(bm.id);
    entry.bookmarks.push(bm);
  }

  const originResults = new Map(); // originKey -> fetch result or error

  // 2. 并发发起所有 Origin 的请求（受全局并发限制）
  const originEntries = [...originMap.entries()];
  const fetchPromises = originEntries.map(async ([originKey, entry]) => {
    // 检查 inFlight 去重
    const existing = inFlightOrigins.get(originKey);
    if (existing) {
      const result = await existing;
      originResults.set(originKey, result);
      return;
    }

    const fetchPromise = (async () => {
      const release = await bookmarkIconLimiter.acquire();
      try {
        // 首次请求
        const firstResult = await fetchFaviconFromApi(entry.bookmarks[0].url);

        // 如果失败且可重试，做一次短重试
        if (!firstResult.ok && firstResult.retryable) {
          const delay = IMG_RETRY_DELAY_MIN + Math.random() * (IMG_RETRY_DELAY_MAX - IMG_RETRY_DELAY_MIN);
          await new Promise((r) => setTimeout(r, delay));
          const retryResult = await fetchFaviconFromApi(entry.bookmarks[0].url);
          return retryResult;
        }

        return firstResult;
      } finally {
        release();
        inFlightOrigins.delete(originKey);
      }
    })();

    inFlightOrigins.set(originKey, fetchPromise);
    const result = await fetchPromise;
    originResults.set(originKey, result);
  });

  // 等待所有并发请求完成
  await Promise.all(fetchPromises);

  // 3. 写回数据库（此时不持有连接，需要重新获取）
  const resultsByBookmark = [];
  for (const bm of bookmarks) {
    const originKey = normalizeOrigin(bm.url);
    if (!originKey) {
      resultsByBookmark.push({
        id: bm.id,
        iconUrl: bm.icon_url || '',
        iconCheckedAt: new Date().toISOString(),
        changed: false,
        errorCode: 'INVALID_URL',
      });
      continue;
    }

    const fetchResult = originResults.get(originKey);
    const now = new Date().toISOString();

    if (!fetchResult || !fetchResult.ok) {
      // 失败处理
      const errorCode = fetchResult?.errorCode || 'INTERNAL_ERROR';
      if (isRetryableError(errorCode)) {
        // retryable：不更新 icon_checked_at
        resultsByBookmark.push({
          id: bm.id,
          iconUrl: bm.icon_url || '',
          iconCheckedAt: bm.icon_checked_at || now,
          changed: false,
          errorCode,
        });
      } else if (isPermanentError(errorCode)) {
        // 永久失败（INVALID_URL / PRIVATE_ADDRESS）：不反复自动请求
        resultsByBookmark.push({
          id: bm.id,
          iconUrl: bm.icon_url || '',
          iconCheckedAt: now,
          changed: false,
          errorCode,
        });
      } else {
        // ICON_NOT_FOUND：更新检查时间
        resultsByBookmark.push({
          id: bm.id,
          iconUrl: bm.icon_url || '',
          iconCheckedAt: now,
          changed: false,
          errorCode,
        });
      }
      continue;
    }

    // 成功——写入磁盘
    const saved = await saveIconToDisk(bm, fetchResult, userId);
    resultsByBookmark.push({
      id: bm.id,
      iconUrl: saved.iconUrl,
      iconCheckedAt: now,
      changed: saved.changed,
      checked: true,
      oldIconUrl: saved.oldIconUrl,
    });
  }

  // 4. 分批写回数据库（短连接）
  try {
    await batchUpdateIconResults(resultsByBookmark, userId);
  } finally {
    const cleanupItems = resultsByBookmark
      .filter((result) => result.changed)
      .flatMap((result) => [
        { id: result.id, iconUrl: result.oldIconUrl },
        { id: result.id, iconUrl: result.iconUrl },
      ])
      .filter((item) => item.iconUrl);
    await cleanupBookmarkIconFiles(cleanupItems).catch(() => {});
  }

  return resultsByBookmark.map(({ oldIconUrl: _oldIconUrl, ...result }) => result);
}

// ── 保存图标到磁盘 ──────────────────────────────────────
/**
 * 将图标内容写入磁盘。
 * 新文件按完整内容哈希全局共享，旧版 bookmark-{id} 文件仍可平滑迁移。
 * 失败时抛出稳定错误，不得返回 changed:false 假装成功。
 */
export async function saveIconToDisk(bookmark, fetchResult) {
  if (!fetchResult?.buffer?.length) {
    const error = new Error('BOOKMARK_ICON_EMPTY_BUFFER');
    error.code = 'BOOKMARK_ICON_EMPTY_BUFFER';
    throw error;
  }

  let tempPath = '';
  let finalPath = '';
  try {
    let fileExtension = 'png';
    const mimeType = Object.entries(imageMimeTypes).find(([key]) => fetchResult.contentType?.includes(key))?.[1];
    if (mimeType) fileExtension = mimeType;

    const oldIconUrl = String(bookmark.icon_url || '').trim();
    const oldStoredIcon = resolveStoredBookmarkIcon(oldIconUrl, bookmark.id);
    const contentHash = createHash('sha256').update(fetchResult.buffer).digest('hex');
    const fileName = `bookmark-icon-${contentHash}.${fileExtension}`;
    finalPath = path.join(BOOKMARK_ICON_UPLOAD_DIR, fileName);
    tempPath = path.join(BOOKMARK_ICON_UPLOAD_DIR, `.bookmark-icon-${contentHash}-${randomUUID()}.tmp`);

    await fsP.mkdir(BOOKMARK_ICON_UPLOAD_DIR, { recursive: true });

    const existingFinalBuffer = await fsP.readFile(finalPath).catch(() => null);
    if (!existingFinalBuffer || !existingFinalBuffer.equals(fetchResult.buffer)) {
      await fsP.writeFile(tempPath, fetchResult.buffer);
      await fsP.rename(tempPath, finalPath);
    }

    const imageUrl = `/uploads/${fileName}`;

    return {
      iconUrl: imageUrl,
      changed: oldIconUrl !== imageUrl,
      oldIconUrl,
      oldFilePath: oldStoredIcon?.filePath || '',
      newFilePath: finalPath,
    };
  } catch (cause) {
    if (tempPath) await fsP.unlink(tempPath).catch(() => {});
    const error = new Error('BOOKMARK_ICON_PERSIST_FAILED');
    error.code = 'BOOKMARK_ICON_PERSIST_FAILED';
    error.cause = cause;
    throw error;
  }
}

/**
 * 批量删除已经没有活动书签引用的站内图标。
 * 先统一查询引用再删除，避免批量删除时产生 N+1 查询；任何外部 URL 或不受控文件名都会跳过。
 */
export async function cleanupBookmarkIconFiles(bookmarks = [], { db = pool } = {}) {
  const candidates = new Map();
  for (const bookmark of bookmarks || []) {
    const iconUrl = String(bookmark?.iconUrl || bookmark?.icon_url || '').trim();
    const bookmarkId = String(bookmark?.id || bookmark?.bookmarkId || '').trim();
    const stored = resolveStoredBookmarkIcon(iconUrl, bookmarkId);
    if (!stored) continue;

    const candidate = candidates.get(stored.fileName) || {
      ...stored,
      iconUrls: new Set(),
    };
    candidate.iconUrls.add(iconUrl);
    candidate.iconUrls.add(stored.pathname);
    candidates.set(stored.fileName, candidate);
  }

  if (candidates.size === 0) {
    return { deleted: 0, kept: 0, skipped: bookmarks?.length || 0, failed: 0 };
  }

  const referencedFileNames = new Set();
  const urlToFileName = new Map();
  for (const candidate of candidates.values()) {
    for (const iconUrl of candidate.iconUrls) {
      if (iconUrl) urlToFileName.set(iconUrl, candidate.fileName);
    }
  }

  const iconUrls = [...urlToFileName.keys()];
  const QUERY_CHUNK_SIZE = 200;
  for (let index = 0; index < iconUrls.length; index += QUERY_CHUNK_SIZE) {
    const chunk = iconUrls.slice(index, index + QUERY_CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT icon_url
       FROM bookmark
       WHERE del_flag = 0
         AND icon_url IN (${placeholders})`,
      chunk,
    );
    for (const row of rows || []) {
      const fileName = urlToFileName.get(String(row.icon_url || '').trim());
      if (fileName) referencedFileNames.add(fileName);
    }
  }

  let deleted = 0;
  let kept = 0;
  let failed = 0;
  for (const candidate of candidates.values()) {
    if (referencedFileNames.has(candidate.fileName)) {
      kept += 1;
      continue;
    }
    try {
      await fsP.unlink(candidate.filePath);
      deleted += 1;
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      failed += 1;
    }
  }

  return {
    deleted,
    kept,
    skipped: Math.max((bookmarks?.length || 0) - candidates.size, 0),
    failed,
  };
}

/**
 * 数据库提交成功后清理被替换的旧图标；共享图标仍有其他引用时会保留。
 */
export async function cleanupPreviousBookmarkIcon(oldIconUrl, bookmarkId, newIconUrl = '') {
  const oldStored = resolveStoredBookmarkIcon(oldIconUrl, bookmarkId);
  if (!oldStored) return { deleted: 0, kept: 0, skipped: 1, failed: 0 };
  const newStored = resolveStoredBookmarkIcon(newIconUrl, bookmarkId);
  if (newStored?.fileName === oldStored.fileName) {
    return { deleted: 0, kept: 1, skipped: 0, failed: 0 };
  }
  return cleanupBookmarkIconFiles([{ id: bookmarkId, iconUrl: oldIconUrl }]);
}

export async function checkBookmarkIconStorageWritable() {
  const probePath = path.join(BOOKMARK_ICON_UPLOAD_DIR, `.bookmark-icon-runtime-${randomUUID()}.tmp`);
  try {
    await fsP.mkdir(BOOKMARK_ICON_UPLOAD_DIR, { recursive: true });
    await fsP.writeFile(probePath, '');
    await fsP.unlink(probePath);
    return { ok: true };
  } catch {
    await fsP.unlink(probePath).catch(() => {});
    return { ok: false, errorCode: 'BOOKMARK_ICON_STORAGE_UNWRITABLE' };
  }
}

// ── 批量写回数据库 ──────────────────────────────────────
async function batchUpdateIconResults(results, userId) {
  if (!results?.length) return;

  const updateQueries = [];

  for (const r of results) {
    const hasNewIcon = r.changed && r.iconUrl;
    const isSuccessfulCheck = r.checked === true;
    const isNotFound = !r.changed && r.errorCode === 'ICON_NOT_FOUND';
    const isPermanent = r.errorCode && isPermanentError(r.errorCode);

    if (hasNewIcon) {
      // 成功获取新图标：更新 icon_url 和 icon_checked_at
      updateQueries.push(
        pool.query('UPDATE bookmark SET icon_url=?, icon_checked_at=NOW() WHERE id=? AND user_id=? AND del_flag=0', [
          r.iconUrl,
          r.id,
          userId,
        ]),
      );
    } else if (isSuccessfulCheck) {
      // 内容哈希与现有图标一致时也要推进检查时间，避免每次列表刷新都重复抓取。
      updateQueries.push(
        pool.query('UPDATE bookmark SET icon_checked_at=NOW() WHERE id=? AND user_id=? AND del_flag=0', [r.id, userId]),
      );
    } else if (isNotFound) {
      // 明确无图标：仅更新检查时间
      updateQueries.push(
        pool.query('UPDATE bookmark SET icon_checked_at=NOW() WHERE id=? AND user_id=? AND del_flag=0', [r.id, userId]),
      );
    } else if (isPermanent) {
      // 永久失败：也更新检查时间（避免反复请求）
      updateQueries.push(
        pool.query('UPDATE bookmark SET icon_checked_at=NOW() WHERE id=? AND user_id=? AND del_flag=0', [r.id, userId]),
      );
    }
    // retryable 错误：不更新任何时间戳，保留原有重试窗口
  }

  if (updateQueries.length > 0) {
    await Promise.all(updateQueries);
  }
}

export function isBookmarkIconCheckRecent(checkedAt, now = Date.now()) {
  if (!checkedAt) return false;
  const timestamp = checkedAt instanceof Date ? checkedAt.getTime() : Date.parse(String(checkedAt).replace(' ', 'T'));
  return Number.isFinite(timestamp) && now - timestamp < BOOKMARK_ICON_AFTER_SAVE_COOLDOWN_MS;
}

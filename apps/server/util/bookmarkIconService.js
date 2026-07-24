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
import fs from 'fs';
import fsP from 'fs/promises';
import { createHash, randomUUID } from 'crypto';

// ── 环境变量 ──────────────────────────────────────────────
const BOOKMARK_ICON_AFTER_SAVE_COOLDOWN_MS = 60 * 60 * 1000;
const BOOKMARK_ICON_UPLOAD_DIR = '/www/wwwroot/images';
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
          if (retryResult.ok) return retryResult;
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
      resultsByBookmark.push({ id: bm.id, iconUrl: bm.icon_url || '', iconCheckedAt: new Date().toISOString(), changed: false, stale: true });
      continue;
    }

    const fetchResult = originResults.get(originKey);
    const now = new Date().toISOString();

    if (!fetchResult || !fetchResult.ok) {
      // 失败处理
      const errorCode = fetchResult?.errorCode || 'INTERNAL_ERROR';
      if (isRetryableError(errorCode)) {
        // retryable：不更新 icon_checked_at
        resultsByBookmark.push({ id: bm.id, iconUrl: bm.icon_url || '', iconCheckedAt: bm.icon_checked_at || now, changed: false, errorCode });
      } else if (isPermanentError(errorCode)) {
        // 永久失败（INVALID_URL / PRIVATE_ADDRESS）：不反复自动请求
        resultsByBookmark.push({ id: bm.id, iconUrl: bm.icon_url || '', iconCheckedAt: now, changed: false, errorCode });
      } else {
        // ICON_NOT_FOUND：更新检查时间
        resultsByBookmark.push({ id: bm.id, iconUrl: bm.icon_url || '', iconCheckedAt: now, changed: false, errorCode });
      }
      continue;
    }

    // 成功——写入磁盘
    const saved = await saveIconToDisk(bm, fetchResult, userId);
    resultsByBookmark.push({
      id: bm.id,
      iconUrl: saved.iconUrl,
      iconCheckedAt: saved.iconCheckedAt,
      changed: saved.changed,
    });
  }

  // 4. 分批写回数据库（短连接）
  await batchUpdateIconResults(resultsByBookmark, userId);

  return resultsByBookmark;
}

// ── 保存图标到磁盘 ──────────────────────────────────────
/**
 * 将图标内容写入磁盘。返回 {iconUrl, changed, oldFilePath, newFilePath}。
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

    // 检查内容是否与已有图标相同
    const oldFilePath = getLocalBookmarkIconPath(bookmark.icon_url, bookmark.id);
    if (oldFilePath) {
      const existingBuffer = await fsP.readFile(oldFilePath).catch(() => null);
      if (existingBuffer && existingBuffer.equals(fetchResult.buffer)) {
        return { iconUrl: bookmark.icon_url || '', changed: false, oldFilePath, newFilePath: oldFilePath };
      }
    }

    // 内容寻址文件名
    const contentHash = createHash('sha256').update(fetchResult.buffer).digest('hex').slice(0, 12);
    const fileName = `bookmark-${bookmark.id}-${contentHash}.${fileExtension}`;
    finalPath = path.join(BOOKMARK_ICON_UPLOAD_DIR, fileName);
    tempPath = path.join(BOOKMARK_ICON_UPLOAD_DIR, `.bookmark-${bookmark.id}-${randomUUID()}.tmp`);

    await fsP.mkdir(BOOKMARK_ICON_UPLOAD_DIR, { recursive: true });

    const existingFinalBuffer = await fsP.readFile(finalPath).catch(() => null);
    if (!existingFinalBuffer || !existingFinalBuffer.equals(fetchResult.buffer)) {
      await fsP.writeFile(tempPath, fetchResult.buffer);
      await fsP.rename(tempPath, finalPath);
    }

    const imageUrl = `/uploads/${fileName}`;

    return { iconUrl: imageUrl, changed: true, oldFilePath, newFilePath: finalPath };
  } catch (cause) {
    if (tempPath) await fsP.unlink(tempPath).catch(() => {});
    const error = new Error('BOOKMARK_ICON_PERSIST_FAILED');
    error.code = 'BOOKMARK_ICON_PERSIST_FAILED';
    error.cause = cause;
    throw error;
  }
}

/**
 * 数据库提交成功后清理旧图标文件。
 */
export async function cleanupPreviousBookmarkIcon(oldFilePath, newFilePath) {
  if (!oldFilePath || oldFilePath === newFilePath) return;
  await fsP.unlink(oldFilePath).catch(() => {});
}

// ── 批量写回数据库 ──────────────────────────────────────
async function batchUpdateIconResults(results, userId) {
  if (!results?.length) return;

  const updateQueries = [];

  for (const r of results) {
    const hasNewIcon = r.changed && r.iconUrl;
    const isNotFound = !r.changed && r.errorCode === 'ICON_NOT_FOUND';
    const isRetryable = r.errorCode && isRetryableError(r.errorCode);
    const isPermanent = r.errorCode && isPermanentError(r.errorCode);

    if (hasNewIcon) {
      // 成功获取新图标：更新 icon_url 和 icon_checked_at
      updateQueries.push(
        pool.query(
          'UPDATE bookmark SET icon_url=?, icon_checked_at=NOW() WHERE id=? AND user_id=? AND del_flag=0',
          [r.iconUrl, r.id, userId],
        ),
      );
    } else if (isNotFound) {
      // 明确无图标：仅更新检查时间
      updateQueries.push(
        pool.query(
          'UPDATE bookmark SET icon_checked_at=NOW() WHERE id=? AND user_id=? AND del_flag=0',
          [r.id, userId],
        ),
      );
    } else if (isPermanent) {
      // 永久失败：也更新检查时间（避免反复请求）
      updateQueries.push(
        pool.query(
          'UPDATE bookmark SET icon_checked_at=NOW() WHERE id=? AND user_id=? AND del_flag=0',
          [r.id, userId],
        ),
      );
    }
    // retryable 错误：不更新任何时间戳，保留原有重试窗口
  }

  if (updateQueries.length > 0) {
    await Promise.all(updateQueries);
  }
}

// ── 工具函数 ────────────────────────────────────────────
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLocalBookmarkIconPath(iconUrl, bookmarkId) {
  if (!iconUrl || !bookmarkId) return '';
  try {
    const pathname = new URL(iconUrl, 'https://light-note.local').pathname;
    if (!pathname.startsWith('/uploads/')) return '';
    const fileName = path.basename(decodeURIComponent(pathname));
    const validName = new RegExp(
      `^bookmark-${escapeRegExp(bookmarkId)}(?:-[a-f0-9]{12})?\\.(?:png|svg|jpe?g|gif|webp|ico)$`,
      'i',
    );
    return validName.test(fileName) ? path.join(BOOKMARK_ICON_UPLOAD_DIR, fileName) : '';
  } catch {
    return '';
  }
}

export function isBookmarkIconCheckRecent(checkedAt, now = Date.now()) {
  if (!checkedAt) return false;
  const timestamp = checkedAt instanceof Date ? checkedAt.getTime() : Date.parse(String(checkedAt).replace(' ', 'T'));
  return Number.isFinite(timestamp) && now - timestamp < BOOKMARK_ICON_AFTER_SAVE_COOLDOWN_MS;
}

import pool from '../../db/index.js';
import { insertData } from '../agent/data.js';
import { stableAgentErrorCode } from '../agent/logSafety.js';
import { createIconBatch } from '../bookmarkIconBatchService.js';
import { EXPLICIT_WEB_READ_MAX_BYTES, fetchWebMeta } from '../fetchWebMeta.js';
import { enqueueResources } from '../resourceInbox.js';
import { RESOURCE_TYPE, insertResourceTagRelations, validateUserTags } from '../resourceTags.js';
import { archiveBookmarkBackground } from '../snapshot.js';
import { ensureTag } from './tagService.js';
import { triggerResourceCreateEffects } from './resourceCreateEffects.js';
import { inspectBookmarkUrl, requireBookmarkUrl } from '../bookmarkUrl.js';
import { actionIdempotencyUuid } from '../agent/actionIdempotency.js';
import { createBookmarkExactUrlHash } from './bookmarkExactUrlService.js';

export function normalizeBookmarkUrl(value) {
  return requireBookmarkUrl(value).canonicalUrl;
}

export function shouldResetBookmarkIcon(existingUrl, nextUrl) {
  const existingResolution = inspectBookmarkUrl(existingUrl, { allowTextExtraction: false });
  const nextResolution = inspectBookmarkUrl(nextUrl, { allowTextExtraction: false });
  const existing = existingResolution.canonicalUrl || String(existingUrl || '').trim();
  const next = nextResolution.canonicalUrl || String(nextUrl || '').trim();
  try {
    // favicon 通常跟站点主机绑定。同域名仅路径、参数或 http/https 变化时继续复用，
    // 域名（含端口）变化才立即判定旧图标失效。
    return new URL(existing).host.toLowerCase() !== new URL(next).host.toLowerCase();
  } catch {
    return existing !== next;
  }
}

function cleanBookmarkFields(bookmark, { userId, url, name, description, id }) {
  const fields = { ...(id ? { id } : {}), name, url, description, userId };
  if (bookmark?.iconUrl !== undefined) fields.iconUrl = bookmark.iconUrl;
  if (bookmark?.sort !== undefined && Number.isFinite(Number(bookmark.sort))) fields.sort = Number(bookmark.sort);
  if (bookmark?.isTop !== undefined) fields.isTop = Number(bookmark.isTop) === 1 ? 1 : 0;
  const data = insertData(fields);
  // Buffer 不能经过通用 key-transform（会被展开成普通对象），因此在转换后补入二进制列。
  data.url_exact_hash = createBookmarkExactUrlHash(url);
  return data;
}

const MAX_DUPLICATE_NAME_SUFFIX = 99;
const CAPTURE_METADATA_TIMEOUT_MS = 5000;

/** 快速收集只读取网页元信息，不启动浏览器或 AI；总时限也覆盖重定向和网络重试。 */
async function readCaptureMetadata(url, signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CAPTURE_METADATA_TIMEOUT_MS);
  try {
    return await fetchWebMeta(url, {
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      timeout: CAPTURE_METADATA_TIMEOUT_MS,
      renderFallback: false,
    });
  } catch (error) {
    // 用户取消仍须中止；网站超时或抓取异常只影响元信息，不能阻止收藏。
    if (signal?.aborted) throw error;
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 为同名书签找一个「名称 (2)」形式的可用名称；序号用尽返回 null，由调用方按同名报错。
 *
 * 只给自动命名入口使用：网页标题可能相同，读取失败也可能回退到相同域名或分享标题。
 * 用户手动填写名称的入口仍保持同名报错。
 * 比较按小写进行，与数据库默认的不区分大小写排序规则一致。
 */
async function findAvailableBookmarkName(connection, { userId, name }) {
  const base = name.slice(0, 255 - ` (${MAX_DUPLICATE_NAME_SUFFIX})`.length).trim();
  const [rows] = await connection.query(
    'SELECT name FROM bookmark WHERE user_id = ? AND del_flag = 0 AND name LIKE ?',
    [userId, `${base.replace(/[\\%_]/g, '\\$&')} (%)`],
  );
  const used = new Set((rows || []).map((row) => String(row.name || '').toLocaleLowerCase()));
  for (let index = 2; index <= MAX_DUPLICATE_NAME_SUFFIX; index += 1) {
    const candidate = `${base} (${index})`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return null;
}

function bookmarkServiceError(code, message, details = {}, httpStatus = 400) {
  const error = new Error(message);
  error.code = code;
  error.httpStatus = httpStatus;
  error.details = details;
  return error;
}

async function findOwnedBookmarkById(db, { userId, bookmarkId }) {
  const [rows] = await db.query(
    'SELECT id, name, url FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0 LIMIT 1',
    [bookmarkId, userId],
  );
  return rows[0] || null;
}

function formatIdempotentReplay(bookmark, { addToInbox = false, inbox = null } = {}) {
  return {
    id: bookmark.id,
    name: bookmark.name,
    url: bookmark.url,
    tags: [],
    duplicate: false,
    idempotentReplay: true,
    addedToInbox: Boolean(addToInbox),
    ...(inbox ? { inbox } : {}),
    snapshotScheduled: false,
  };
}

export async function createBookmark({
  userId,
  userRole,
  bookmark = {},
  tagIds = [],
  tagNames = [],
  tagSource = 'manual',
  addToInbox = false,
  inboxSource = 'quick_capture',
  duplicateToInbox = false,
  fillMetadata = false,
  captureMetadata = false,
  saveSnapshot = true,
  signal,
  request,
  suppressUserRewards = false,
  idempotencyKey = null,
  suffixDuplicateName = false,
} = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少用户');
  const url = requireBookmarkUrl(bookmark.url).canonicalUrl;
  if (url.length > 255) throw new Error('URL_TOO_LONG: 网址不能超过 255 个字符');
  let name = String(bookmark.name || '').trim();
  let description = String(bookmark.description || '').trim();
  const normalizedTagIds = [...new Set((Array.isArray(tagIds) ? tagIds : []).map(String).filter(Boolean))];
  const normalizedTagNames = [
    ...new Map(
      (Array.isArray(tagNames) ? tagNames : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .map((item) => [item.toLocaleLowerCase(), item]),
    ).values(),
  ];
  if (normalizedTagIds.length + normalizedTagNames.length > 4) {
    throw bookmarkServiceError('TOO_MANY_TAGS', '最多选择 4 个标签');
  }

  const idempotentBookmarkId = actionIdempotencyUuid(idempotencyKey, 'bookmark');
  if (idempotentBookmarkId) {
    const existing = await findOwnedBookmarkById(pool, { userId, bookmarkId: idempotentBookmarkId });
    if (existing) return formatIdempotentReplay(existing, { addToInbox });
  }

  // 外网读取在事务及连接借出前完成，慢站点不占用数据库连接。
  if (captureMetadata || (fillMetadata && (!name || !description))) {
    const meta = captureMetadata
      ? await readCaptureMetadata(url, signal)
      : await fetchWebMeta(url, {
          signal,
          maxContentBytes: EXPLICIT_WEB_READ_MAX_BYTES,
          renderFallback: true,
        });
    if (meta.ok) {
      if (captureMetadata || !name) name = String(meta.title || '').trim() || name;
      if (!description) description = String(meta.description || '').trim();
    }
  }
  if (signal?.aborted) throw signal.reason || Object.assign(new Error('请求已取消'), { name: 'AbortError' });
  name = (name || (captureMetadata ? new URL(url).hostname.replace(/^www\./, '') : url)).slice(0, 255);
  description = description.slice(0, 255);

  const connection = await pool.getConnection();
  let data;
  let attachedTagNames = [];
  let transactionError = null;
  try {
    await connection.beginTransaction();
    const [urlDuplicates] = await connection.query(
      'SELECT id, name FROM bookmark WHERE user_id = ? AND url = ? AND del_flag = 0 LIMIT 1',
      [userId, url],
    );
    if (urlDuplicates.length) {
      if (idempotentBookmarkId && String(urlDuplicates[0].id) === String(idempotentBookmarkId)) {
        let inbox = null;
        if (addToInbox) {
          inbox = await enqueueResources(connection, {
            userId,
            items: [{ resourceType: 'bookmark', resourceId: String(urlDuplicates[0].id) }],
            source: inboxSource,
          });
        }
        await connection.commit();
        return formatIdempotentReplay(
          { ...urlDuplicates[0], url },
          { addToInbox, inbox },
        );
      }
      if (addToInbox && duplicateToInbox) {
        const inbox = await enqueueResources(connection, {
          userId,
          items: [{ resourceType: 'bookmark', resourceId: String(urlDuplicates[0].id) }],
          source: 'duplicate_requeue',
        });
        await connection.commit();
        return {
          id: urlDuplicates[0].id,
          name: urlDuplicates[0].name,
          url,
          duplicate: true,
          addedToInbox: true,
          inbox,
          tags: [],
        };
      }
      throw bookmarkServiceError(
        'DUPLICATE_URL',
        `该网址已收藏为「${urlDuplicates[0].name}」`,
        { duplicate: { id: String(urlDuplicates[0].id), name: urlDuplicates[0].name, url } },
        409,
      );
    }
    const [nameDuplicates] = await connection.query(
      'SELECT id FROM bookmark WHERE user_id = ? AND name = ? AND del_flag = 0 LIMIT 1',
      [userId, name],
    );
    if (nameDuplicates.length) {
      const availableName = suffixDuplicateName
        ? await findAvailableBookmarkName(connection, { userId, name })
        : null;
      if (!availableName) {
        throw bookmarkServiceError(
          'DUPLICATE_NAME',
          `书签「${name}」已存在`,
          { duplicate: { id: String(nameDuplicates[0].id), name } },
          409,
        );
      }
      name = availableName;
    }

    data = cleanBookmarkFields(bookmark, {
      userId,
      url,
      name,
      description,
      id: idempotentBookmarkId,
    });
    await connection.query('INSERT INTO bookmark SET ?', [data]);

    const validTagIds = await validateUserTags(connection, { tagIds: normalizedTagIds, userId });
    const ensuredTagIds = [];
    for (const rawName of normalizedTagNames.map((item) => String(item || '').trim()).filter(Boolean)) {
      const tag = await ensureTag({ userId, name: rawName, connection });
      ensuredTagIds.push(tag.id);
      attachedTagNames.push(tag.name);
    }
    await insertResourceTagRelations(connection, {
      tagIds: [...validTagIds, ...ensuredTagIds],
      resourceType: RESOURCE_TYPE.BOOKMARK,
      resourceId: data.id,
      userId,
      source: tagSource,
    });
    if (addToInbox) {
      await enqueueResources(connection, {
        userId,
        items: [{ resourceType: 'bookmark', resourceId: data.id }],
        source: inboxSource,
      });
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    transactionError = error;
  } finally {
    connection.release();
  }

  if (transactionError && idempotentBookmarkId) {
    try {
      const existing = await findOwnedBookmarkById(pool, { userId, bookmarkId: idempotentBookmarkId });
      if (existing) return formatIdempotentReplay(existing, { addToInbox });
    } catch {
      // 保留原始事务异常；调用方使用同一幂等键重试时仍能安全恢复。
    }
  }
  if (transactionError) throw transactionError;

  if (!data.icon_url) {
    try {
      await createIconBatch(userId, [{ id: data.id, url }]);
    } catch (error) {
      // 书签主事务已经提交。图标补全属于可恢复的后台任务，入队失败不能让前端误判收藏失败。
      console.error('[bookmark-icon] 新书签补全任务创建失败 code=%s', stableAgentErrorCode(error));
    }
  }

  try {
    await triggerResourceCreateEffects({
      request,
      userId,
      userRole,
      resourceType: 'bookmark',
      resourceId: data.id,
      url,
      suppressUserRewards,
    });
  } catch {
    // 书签已经提交；成长、转化与知识缓存失效都属于旁路副作用，
    // 任何同步异常都不能把一次成功收藏伪装成 500，诱导用户重试并撞上重复书签。
  }
  const snapshotScheduled = saveSnapshot ? await archiveBookmarkBackground(userId, data.id) : false;
  return {
    id: data.id,
    name,
    url,
    tags: attachedTagNames,
    duplicate: false,
    addedToInbox: Boolean(addToInbox),
    snapshotScheduled,
  };
}

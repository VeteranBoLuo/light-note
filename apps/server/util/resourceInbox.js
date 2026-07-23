import crypto from 'node:crypto';
import { decodeOffsetCursor, encodeOffsetCursor, normalizePageLimit } from './pageCursor.js';

export const RESOURCE_TYPES = Object.freeze(['bookmark', 'note', 'file']);
export const INBOX_SOURCES = Object.freeze(['quick_capture', 'manual', 'duplicate_requeue', 'admin_demo']);

const INBOX_PAGE_CURSOR_SCOPE = 'inbox';
const INBOX_SORT_SQL = Object.freeze({
  newest: 'i.create_time DESC, i.id DESC',
  oldest: 'i.create_time ASC, i.id ASC',
});
const RESOURCE_UNION_SQL = `
  SELECT CONVERT('bookmark' USING utf8) COLLATE utf8_general_ci AS resource_type,
         CONVERT(CAST(b.id AS CHAR) USING utf8) COLLATE utf8_general_ci AS resource_id,
         CONVERT(b.user_id USING utf8) COLLATE utf8_general_ci AS user_id,
         CONVERT(b.name USING utf8mb4) COLLATE utf8mb4_unicode_ci AS title,
         CONVERT(LEFT(COALESCE(b.description, ''), 1000) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS summary,
         CONVERT(b.url USING utf8mb4) COLLATE utf8mb4_unicode_ci AS detail,
         b.create_time AS resource_create_time
    FROM bookmark b WHERE b.del_flag = 0
  UNION ALL
  SELECT CONVERT('note' USING utf8) COLLATE utf8_general_ci,
         CONVERT(CAST(n.id AS CHAR) USING utf8) COLLATE utf8_general_ci,
         CONVERT(n.create_by USING utf8) COLLATE utf8_general_ci,
         CONVERT(n.title USING utf8mb4) COLLATE utf8mb4_unicode_ci,
         CONVERT(LEFT(COALESCE(n.content, ''), 1000) USING utf8mb4) COLLATE utf8mb4_unicode_ci,
         CONVERT(n.type USING utf8mb4) COLLATE utf8mb4_unicode_ci,
         n.create_time
    FROM note n WHERE n.del_flag = 0
  UNION ALL
  SELECT CONVERT('file' USING utf8) COLLATE utf8_general_ci,
         CONVERT(CAST(f.id AS CHAR) USING utf8) COLLATE utf8_general_ci,
         CONVERT(f.create_by USING utf8) COLLATE utf8_general_ci,
         CONVERT(f.file_name USING utf8mb4) COLLATE utf8mb4_unicode_ci,
         CONVERT(COALESCE(f.file_type, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci,
         CONVERT(CAST(COALESCE(f.folder_id, '') AS CHAR) USING utf8mb4) COLLATE utf8mb4_unicode_ci,
         f.create_time
    FROM files f WHERE f.del_flag = 0`;

const RESOURCE_OWNERSHIP = Object.freeze({
  bookmark: { table: 'bookmark', owner: 'user_id' },
  note: { table: 'note', owner: 'create_by' },
  file: { table: 'files', owner: 'create_by' },
});

export function normalizeResourceType(value) {
  const type = String(value || '').toLowerCase();
  return RESOURCE_TYPES.includes(type) ? type : null;
}

export function normalizeInboxSource(value, fallback = 'manual') {
  const source = String(value || fallback).toLowerCase();
  return INBOX_SOURCES.includes(source) ? source : null;
}

export function normalizeInboxItems(items, limit = 50) {
  if (!Array.isArray(items) || items.length === 0 || items.length > limit) return null;
  const normalized = [];
  const seen = new Set();
  for (const item of items) {
    const resourceType = normalizeResourceType(item?.resourceType ?? item?.resource_type);
    const resourceId = String(item?.resourceId ?? item?.resource_id ?? '').trim();
    if (!resourceType || !resourceId || resourceId.length > 255) return null;
    const key = `${resourceType}:${resourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ resourceType, resourceId });
  }
  return normalized.length > 0 ? normalized : null;
}

function inboxListError() {
  const error = new Error('无效的筛选或排序参数');
  error.code = 'INBOX_LIST_PARAMS_INVALID';
  return error;
}

function normalizeInboxListOptions(input = {}) {
  const rawType = String(input.type ?? input.resourceType ?? 'all').toLowerCase();
  const type = rawType === 'all' ? 'all' : normalizeResourceType(rawType);
  const sort = String(input.sort || 'newest').toLowerCase();
  if (!type || !INBOX_SORT_SQL[sort]) throw inboxListError();

  const keyword = String(input.keyword || '')
    .trim()
    .slice(0, 100);
  const paginated = input.limit !== undefined || input.cursor !== undefined;
  const limit = paginated ? normalizePageLimit(input.limit, { defaultLimit: 20, maxLimit: 50 }) : null;
  const offset = paginated ? decodeOffsetCursor(input.cursor, INBOX_PAGE_CURSOR_SCOPE) : 0;
  const view = input.view === 'summary' ? 'summary' : 'full';
  const includeTotal = input.includeTotal !== false;
  return { type, sort, keyword, paginated, limit, offset, view, includeTotal };
}

/**
 * 待整理列表的唯一查询入口。资源本体通过 UNION 后再与关系表 INNER JOIN，
 * 因此已删除、不可用或不属于当前主体的资源不会出现在页面或 Agent 结果中。
 * full 视图供页面渲染；summary 视图刻意不选择 note 正文、书签 URL 等敏感字段。
 */
export async function listInboxResources(db, { userId, ...input } = {}) {
  const ownerId = String(userId || '').trim();
  if (!ownerId) {
    return {
      items: [],
      total: 0,
      nextCursor: null,
      pendingTotal: 0,
      typeTotals: { bookmark: 0, note: 0, file: 0 },
    };
  }
  const { type, sort, keyword, paginated, limit, offset, view, includeTotal } = normalizeInboxListOptions(input);
  const where = [`i.user_id = ?`, `i.status = 'pending'`];
  const params = [ownerId];
  if (type !== 'all') {
    where.push('i.resource_type = ?');
    params.push(type);
  }
  if (keyword) {
    where.push('(r.title LIKE ? OR r.summary LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like);
  }
  const fromSql = `FROM resource_inbox i
    INNER JOIN (${RESOURCE_UNION_SQL}) r
      ON r.resource_type = i.resource_type
     AND r.resource_id = i.resource_id
     AND r.user_id = i.user_id
    WHERE ${where.join(' AND ')}`;
  const selectedFields =
    view === 'summary'
      ? `i.resource_type AS resourceType, i.resource_id AS resourceId,
          i.source, i.create_time AS collectedAt, r.title, r.resource_create_time AS resourceCreatedAt`
      : `i.resource_type AS resourceType, i.resource_id AS resourceId,
          i.source, i.create_time AS collectedAt,
          r.title, r.summary, r.detail, r.resource_create_time AS resourceCreatedAt`;
  const pageSql = `SELECT ${selectedFields}
       ${fromSql}
      ORDER BY ${INBOX_SORT_SQL[sort]}${paginated ? ' LIMIT ? OFFSET ?' : ''}`;
  const pageParams = paginated ? [...params, limit + 1, offset] : params;
  const [[rows], countResult, counts] = await Promise.all([
    db.query(pageSql, pageParams),
    includeTotal ? db.query(`SELECT COUNT(*) AS total ${fromSql}`, params) : null,
    queryPendingCount(db, ownerId),
  ]);
  const hasMore = paginated && rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map((item) => ({
      ...item,
      resourceType: normalizeResourceType(item.resourceType) || item.resourceType,
      resourceId: String(item.resourceId),
      title: item.title || '未命名资源',
    })),
    total: includeTotal ? Number(countResult?.[0]?.[0]?.total || 0) : page.length,
    nextCursor: hasMore ? encodeOffsetCursor(INBOX_PAGE_CURSOR_SCOPE, offset + page.length) : null,
    ...counts,
  };
}

export async function assertResourcesOwned(connection, { userId, items }) {
  const owned = new Set();
  for (const type of RESOURCE_TYPES) {
    const ids = items.filter((item) => item.resourceType === type).map((item) => item.resourceId);
    if (ids.length === 0) continue;
    const mapping = RESOURCE_OWNERSHIP[type];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await connection.query(
      `SELECT CAST(id AS CHAR) AS id FROM ${mapping.table} WHERE ${mapping.owner} = ? AND del_flag = 0 AND id IN (${placeholders})`,
      [userId, ...ids],
    );
    rows.forEach((row) => owned.add(`${type}:${String(row.id)}`));
  }
  const missing = items.filter((item) => !owned.has(`${item.resourceType}:${item.resourceId}`));
  if (missing.length > 0) {
    const error = new Error('资源不存在或无权操作');
    error.code = 'INBOX_RESOURCE_FORBIDDEN';
    throw error;
  }
}

export async function enqueueResources(connection, { userId, items, source = 'manual' }) {
  const normalizedSource = normalizeInboxSource(source);
  if (!normalizedSource) throw new Error('无效的待整理来源');
  await assertResourcesOwned(connection, { userId, items });

  let added = 0;
  let reopened = 0;
  let ignored = 0;
  for (const item of items) {
    const [existingRows] = await connection.query(
      'SELECT status FROM resource_inbox WHERE user_id = ? AND resource_type = ? AND resource_id = ? FOR UPDATE',
      [userId, item.resourceType, item.resourceId],
    );
    if (existingRows.length === 0) {
      await connection.query('INSERT INTO resource_inbox SET ?', [
        {
          id: crypto.randomUUID(),
          user_id: userId,
          resource_type: item.resourceType,
          resource_id: item.resourceId,
          status: 'pending',
          source: normalizedSource,
        },
      ]);
      added += 1;
    } else if (existingRows[0].status === 'completed') {
      await connection.query(
        `UPDATE resource_inbox
           SET status = 'pending', source = ?, complete_time = NULL,
               create_time = CURRENT_TIMESTAMP, update_time = CURRENT_TIMESTAMP
         WHERE user_id = ? AND resource_type = ? AND resource_id = ?`,
        [normalizedSource, userId, item.resourceType, item.resourceId],
      );
      reopened += 1;
    } else {
      ignored += 1;
    }
  }
  return { added, reopened, ignored };
}

export async function completeResources(connection, { userId, items }) {
  await assertResourcesOwned(connection, { userId, items });
  let completed = 0;
  for (const type of RESOURCE_TYPES) {
    const ids = items.filter((item) => item.resourceType === type).map((item) => item.resourceId);
    if (ids.length === 0) continue;
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await connection.query(
      `UPDATE resource_inbox
          SET status = 'completed', complete_time = CURRENT_TIMESTAMP
        WHERE user_id = ? AND resource_type = ? AND status = 'pending'
          AND resource_id IN (${placeholders})`,
      [userId, type, ...ids],
    );
    completed += Number(result.affectedRows || 0);
  }
  return { completed };
}

export async function removeInboxRelations(connection, { userId, items }) {
  let removed = 0;
  for (const type of RESOURCE_TYPES) {
    const ids = items.filter((item) => item.resourceType === type).map((item) => item.resourceId);
    if (ids.length === 0) continue;
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await connection.query(
      `DELETE FROM resource_inbox WHERE user_id = ? AND resource_type = ? AND resource_id IN (${placeholders})`,
      [userId, type, ...ids],
    );
    removed += Number(result.affectedRows || 0);
  }
  return removed;
}

export async function queryPendingCount(connection, userId) {
  const [rows] = await connection.query(
    `SELECT resource_type AS resourceType, COUNT(*) AS total
       FROM resource_inbox
      WHERE user_id = ? AND status = 'pending'
      GROUP BY resource_type`,
    [userId],
  );
  const typeTotals = { bookmark: 0, note: 0, file: 0 };
  rows.forEach((row) => {
    if (Object.prototype.hasOwnProperty.call(typeTotals, row.resourceType)) {
      typeTotals[row.resourceType] = Number(row.total || 0);
    }
  });
  return {
    pendingTotal: Object.values(typeTotals).reduce((sum, total) => sum + total, 0),
    typeTotals,
  };
}

/**
 * 给模块列表回填待整理状态。resource_inbox 只是工作流关系，查询失败不应影响资源主列表，
 * 因此调用方负责 catch 并保留这里预先写入的 false 默认值。
 */
export async function attachPendingStatus(connection, { userId, resourceType, items, idKey = 'id' }) {
  const type = normalizeResourceType(resourceType);
  const list = Array.isArray(items) ? items : [];
  list.forEach((item) => {
    item.isPending = false;
  });
  if (!type || list.length === 0) return list;

  const ids = [...new Set(list.map((item) => String(item?.[idKey] ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) return list;
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT resource_id AS resourceId
       FROM resource_inbox
      WHERE user_id = ? AND resource_type = ? AND status = 'pending'
        AND resource_id IN (${placeholders})`,
    [userId, type, ...ids],
  );
  const pendingIds = new Set(rows.map((row) => String(row.resourceId)));
  list.forEach((item) => {
    item.isPending = pendingIds.has(String(item?.[idKey] ?? ''));
  });
  return list;
}

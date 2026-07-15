import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { ensureNotVisitor } from '../util/auth.js';
import {
  completeResources,
  enqueueResources,
  normalizeInboxItems,
  normalizeInboxSource,
  normalizeResourceType,
  queryPendingCount,
} from '../util/resourceInbox.js';
import { queryTodoPendingCount } from '../util/services/todoService.js';

async function withActionCounts(counts, userId) {
  const todoPendingTotal = await queryTodoPendingCount(pool, userId);
  return { ...counts, todoPendingTotal, actionTotal: Number(counts.pendingTotal || 0) + todoPendingTotal };
}

const SORT_SQL = Object.freeze({ newest: 'i.create_time DESC', oldest: 'i.create_time ASC' });

function sendInboxError(res, error) {
  const status = error?.code === 'INBOX_RESOURCE_FORBIDDEN' ? 403 : 500;
  if (status === 500) console.error('[inbox] 请求失败:', error?.message || error);
  return res.send(resultData(null, status, status === 403 ? error.message : '待整理服务暂时不可用，请稍后重试'));
}

export async function countInbox(req, res) {
  try {
    res.send(resultData(await withActionCounts(await queryPendingCount(pool, req.user.id), req.user.id)));
  } catch (error) {
    sendInboxError(res, error);
  }
}

export async function listInbox(req, res) {
  try {
    const typeValue = String(req.body?.type || 'all').toLowerCase();
    const type = typeValue === 'all' ? 'all' : normalizeResourceType(typeValue);
    const sort = String(req.body?.sort || 'newest').toLowerCase();
    const keyword = String(req.body?.keyword || '').trim().slice(0, 100);
    if (!type || !SORT_SQL[sort]) {
      return res.send(resultData(null, 400, '无效的筛选或排序参数'));
    }

    const resourceUnion = `
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
    const where = [`i.user_id = ?`, `i.status = 'pending'`];
    const params = [req.user.id];
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
      INNER JOIN (${resourceUnion}) r
        ON r.resource_type = i.resource_type
       AND r.resource_id = i.resource_id
       AND r.user_id = i.user_id
      WHERE ${where.join(' AND ')}`;
    const [items] = await pool.query(
      `SELECT i.resource_type AS resourceType, i.resource_id AS resourceId,
              i.source, i.create_time AS collectedAt,
              r.title, r.summary, r.detail, r.resource_create_time AS resourceCreatedAt
         ${fromSql}
        ORDER BY ${SORT_SQL[sort]}`,
      params,
    );
    const counts = await withActionCounts(await queryPendingCount(pool, req.user.id), req.user.id);
    res.send(
      resultData({
        items,
        total: items.length,
        ...counts,
      }),
    );
  } catch (error) {
    sendInboxError(res, error);
  }
}

export async function enqueueInbox(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const items = normalizeInboxItems(req.body?.items);
  const source = normalizeInboxSource(req.body?.source, 'manual');
  if (!items || !source) return res.send(resultData(null, 400, '无效的资源列表或来源'));
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const result = await enqueueResources(connection, { userId: req.user.id, items, source });
    await connection.commit();
    res.send(resultData(result));
  } catch (error) {
    if (connection) await connection.rollback();
    sendInboxError(res, error);
  } finally {
    connection?.release();
  }
}

export async function completeInbox(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const items = normalizeInboxItems(req.body?.items);
  if (!items) return res.send(resultData(null, 400, '无效的资源列表'));
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const result = await completeResources(connection, { userId: req.user.id, items });
    await connection.commit();
    res.send(resultData(result));
  } catch (error) {
    if (connection) await connection.rollback();
    sendInboxError(res, error);
  } finally {
    connection?.release();
  }
}

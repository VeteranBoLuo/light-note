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

const SORT_SQL = Object.freeze({ newest: 'i.create_time DESC', oldest: 'i.create_time ASC' });

function sendInboxError(res, error) {
  const status = error?.code === 'INBOX_RESOURCE_FORBIDDEN' ? 403 : 500;
  if (status === 500) console.error('[inbox] 请求失败:', error?.message || error);
  return res.send(resultData(null, status, status === 403 ? error.message : '待整理服务暂时不可用，请稍后重试'));
}

export async function countInbox(req, res) {
  try {
    res.send(resultData(await queryPendingCount(pool, req.user.id)));
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
    const currentPage = Math.max(1, Number.parseInt(req.body?.currentPage, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.body?.pageSize, 10) || 20));
    if (!type || !SORT_SQL[sort]) {
      return res.send(resultData(null, 400, '无效的筛选或排序参数'));
    }

    const resourceUnion = `
      SELECT 'bookmark' AS resource_type, CAST(b.id AS CHAR) AS resource_id,
             b.user_id, b.name AS title, LEFT(COALESCE(b.description, ''), 1000) AS summary,
             b.url AS detail, b.create_time AS resource_create_time
        FROM bookmark b WHERE b.del_flag = 0
      UNION ALL
      SELECT 'note', CAST(n.id AS CHAR), n.create_by, n.title,
             LEFT(COALESCE(n.content, ''), 1000), n.type, n.create_time
        FROM note n WHERE n.del_flag = 0
      UNION ALL
      SELECT 'file', CAST(f.id AS CHAR), f.create_by, f.file_name,
             COALESCE(f.file_type, ''), CAST(COALESCE(f.folder_id, '') AS CHAR), f.create_time
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
    const [totalRows] = await pool.query(`SELECT COUNT(*) AS total ${fromSql}`, params);
    const offset = (currentPage - 1) * pageSize;
    const [items] = await pool.query(
      `SELECT i.resource_type AS resourceType, i.resource_id AS resourceId,
              i.source, i.create_time AS collectedAt,
              r.title, r.summary, r.detail, r.resource_create_time AS resourceCreatedAt
         ${fromSql}
        ORDER BY ${SORT_SQL[sort]}
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const counts = await queryPendingCount(pool, req.user.id);
    res.send(
      resultData({
        items,
        total: Number(totalRows[0]?.total || 0),
        ...counts,
        currentPage,
        pageSize,
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
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await enqueueResources(connection, { userId: req.user.id, items, source });
    await connection.commit();
    res.send(resultData(result));
  } catch (error) {
    await connection.rollback();
    sendInboxError(res, error);
  } finally {
    connection.release();
  }
}

export async function completeInbox(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  const items = normalizeInboxItems(req.body?.items);
  if (!items) return res.send(resultData(null, 400, '无效的资源列表'));
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await completeResources(connection, { userId: req.user.id, items });
    await connection.commit();
    res.send(resultData(result));
  } catch (error) {
    await connection.rollback();
    sendInboxError(res, error);
  } finally {
    connection.release();
  }
}

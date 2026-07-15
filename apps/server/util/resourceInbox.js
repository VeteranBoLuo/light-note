import crypto from 'node:crypto';

export const RESOURCE_TYPES = Object.freeze(['bookmark', 'note', 'file']);
export const INBOX_SOURCES = Object.freeze(['quick_capture', 'manual', 'duplicate_requeue', 'admin_demo']);

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

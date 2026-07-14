import pool from '../../db/index.js';
import { parseTimeRange } from '../agent/timeRange.js';

export const TRASH_TABLE_CONFIG = {
  bookmark: { table: 'bookmark', userIdField: 'user_id' },
  note: { table: 'note', userIdField: 'create_by' },
  file: { table: 'files', userIdField: 'create_by' },
};

export function normalizeRestoreFilters(args = {}) {
  const type = String(args.type || args.resourceType || '').trim();
  const id = String(args.id || '').trim();
  const ids = Array.isArray(args.ids)
    ? [...new Set(args.ids.map((value) => String(value || '').trim()).filter(Boolean))]
    : [];
  const time = parseTimeRange(args.timeRange);
  if (!type && !id && !ids.length && !time) {
    throw new Error('FILTER_REQUIRED: 至少需要提供资源类型、资源 ID 或有效时间范围');
  }
  if (type && !TRASH_TABLE_CONFIG[type]) throw new Error('INVALID_TYPE: 不支持的资源类型');
  if ((id || ids.length) && !type) throw new Error('TYPE_REQUIRED: 按 ID 恢复时必须同时指定资源类型');
  if (ids.length > 100) throw new Error('TOO_MANY_IDS: 单次最多恢复 100 项');
  return { id, ids, time, types: type ? [type] : Object.keys(TRASH_TABLE_CONFIG) };
}

function buildWhere(config, filters, userId) {
  let where = `${config.userIdField} = ? AND del_flag = 1`;
  const params = [userId];
  if (filters.id) {
    where += ' AND id = ?';
    params.push(filters.id);
  } else if (filters.ids.length) {
    where += ` AND id IN (${filters.ids.map(() => '?').join(',')})`;
    params.push(...filters.ids);
  }
  if (filters.time) {
    where += ' AND deleted_at >= ? AND deleted_at <= ?';
    params.push(filters.time.start, filters.time.end);
  }
  return { where, params };
}

export async function previewTrashRestore({ userId, filters: rawFilters } = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少用户');
  const filters = normalizeRestoreFilters(rawFilters);
  const items = [];
  for (const type of filters.types) {
    const config = TRASH_TABLE_CONFIG[type];
    const { where, params } = buildWhere(config, filters, userId);
    const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM \`${config.table}\` WHERE ${where}`, params);
    items.push({ type, count: Number(rows[0]?.count || 0) });
  }
  return { items, total: items.reduce((sum, item) => sum + item.count, 0) };
}

export async function restoreTrashResources({ userId, filters: rawFilters } = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少用户');
  const filters = normalizeRestoreFilters(rawFilters);
  const connection = await pool.getConnection();
  const results = [];
  try {
    await connection.beginTransaction();
    for (const type of filters.types) {
      const config = TRASH_TABLE_CONFIG[type];
      const { where, params } = buildWhere(config, filters, userId);
      const [result] = await connection.query(
        `UPDATE \`${config.table}\` SET del_flag = 0, deleted_at = NULL WHERE ${where}`,
        params,
      );
      if (result.affectedRows > 0) results.push({ type, count: result.affectedRows });
    }
    await connection.commit();
    return results;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

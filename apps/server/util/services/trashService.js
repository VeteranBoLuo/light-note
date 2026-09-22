import { buildObjectKey } from '../obsClient.js';
import { uniqueCloudFileName } from './cloudFileNameService.js';
import pool from '../../db/index.js';
import { resolveAgentTimeRange } from '../agent/timeRange.js';
import { invalidatePersonalKnowledgeCache } from '../personalKnowledgeSearch.js';
import { previewOwnedNoteTrashRestore, restoreOwnedNoteTrash } from './noteTreeService.js';

export const TRASH_TABLE_CONFIG = {
  bookmark: { table: 'bookmark', userIdField: 'user_id' },
  note: { table: 'note', userIdField: 'create_by' },
  file: { table: 'files', userIdField: 'create_by' },
};

export function normalizeRestoreFilters(args = {}, context = {}) {
  const restoreAll = args.all === true;
  const type = String(args.type || args.resourceType || '').trim();
  const id = String(args.id || '').trim();
  const ids = Array.isArray(args.ids)
    ? [...new Set(args.ids.map((value) => String(value || '').trim()).filter(Boolean))]
    : [];
  const time = resolveAgentTimeRange(args, 'timeRange', { context, label: '删除时间' });
  if (!restoreAll && !type && !id && !ids.length && !time) {
    throw new Error('FILTER_REQUIRED: 至少需要提供资源类型、资源 ID 或有效时间范围');
  }
  if (type && !TRASH_TABLE_CONFIG[type]) throw new Error('INVALID_TYPE: 不支持的资源类型');
  if ((id || ids.length) && !type) throw new Error('TYPE_REQUIRED: 按 ID 恢复时必须同时指定资源类型');
  if (ids.length > 100) throw new Error('TOO_MANY_IDS: 单次最多恢复 100 项');
  return { id, ids, time, restoreAll, types: type ? [type] : Object.keys(TRASH_TABLE_CONFIG) };
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
    where += ' AND deleted_at >= ? AND deleted_at < ?';
    params.push(filters.time.start, filters.time.endExclusive);
  }
  return { where, params };
}

export async function previewTrashRestore({ userId, filters: rawFilters, context = {} } = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少用户');
  const filters = normalizeRestoreFilters(rawFilters, context);
  const items = [];
  for (const type of filters.types) {
    if (type === 'note') {
      const notePreview = await previewOwnedNoteTrashRestore({
        userId,
        ids: filters.id ? [filters.id] : filters.ids,
        time: filters.time,
        restoreAll: filters.restoreAll || (!filters.id && !filters.ids.length && !filters.time),
      });
      items.push({ type, count: notePreview.count });
      continue;
    }
    const config = TRASH_TABLE_CONFIG[type];
    const { where, params } = buildWhere(config, filters, userId);
    const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM \`${config.table}\` WHERE ${where}`, params);
    items.push({ type, count: Number(rows[0]?.count || 0) });
  }
  return { items, total: items.reduce((sum, item) => sum + item.count, 0) };
}

export async function restoreTrashResources({ userId, filters: rawFilters, context = {} } = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少用户');
  const filters = normalizeRestoreFilters(rawFilters, context);
  const connection = await pool.getConnection();
  const results = [];
  let noteRestored = false;
  try {
    await connection.beginTransaction();
    if (filters.types.includes('file')) {
      await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
    }
    for (const type of filters.types) {
      if (type === 'note') {
        const restored = await restoreOwnedNoteTrash(connection, {
          userId,
          ids: filters.id ? [filters.id] : filters.ids,
          time: filters.time,
          restoreAll: filters.restoreAll || (!filters.id && !filters.ids.length && !filters.time),
        });
        if (restored.count > 0) {
          noteRestored = true;
          results.push({ type, count: restored.count, rerootedCount: restored.rerootedCount });
        }
        continue;
      }
      const config = TRASH_TABLE_CONFIG[type];
      const { where, params } = buildWhere(config, filters, userId);
      if (type === 'file') {
        const [files] = await connection.query(
          `SELECT id, file_name FROM files WHERE ${where} ORDER BY id FOR UPDATE`,
          params,
        );
        let count = 0;
        for (const file of files) {
          const name = await uniqueCloudFileName(connection, userId, file.file_name, { includeDeleted: false });
          // 恢复只分配展示名，保留对象地址、稳定 ID 和所有图片引用。
          const [result] = await connection.query(
            "UPDATE files SET file_name = ?, obs_key = COALESCE(NULLIF(obs_key, ''), ?), del_flag = 0, deleted_at = NULL WHERE id = ? AND create_by = ? AND del_flag = 1",
            [name, buildObjectKey(userId, file.file_name), file.id, userId],
          );
          count += result.affectedRows;
        }
        if (count) results.push({ type, count });
        continue;
      }
      const [result] = await connection.query(
        `UPDATE \`${config.table}\` SET del_flag = 0, deleted_at = NULL WHERE ${where}`,
        params,
      );
      if (result.affectedRows > 0) results.push({ type, count: result.affectedRows });
    }
    await connection.commit();
    if (noteRestored) await invalidatePersonalKnowledgeCache(userId);
    return results;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

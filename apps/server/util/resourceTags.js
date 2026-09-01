import pool from '../db/index.js';

export const RESOURCE_TYPE = {
  BOOKMARK: 'bookmark',
  NOTE: 'note',
  FILE: 'file',
  TAG: 'tag',
};

export const normalizeTagIds = (tagIds = []) => {
  if (!Array.isArray(tagIds)) return [];
  return [...new Set(tagIds.map((id) => String(id || '').trim()).filter(Boolean))];
};

export const insertResourceTagRelations = async (
  connection,
  { tagIds = [], resourceType, resourceId, userId, source = 'manual' },
) => {
  const normalizedTagIds = normalizeTagIds(tagIds);
  if (!normalizedTagIds.length) return 0;

  const values = normalizedTagIds.map((tagId) => [tagId, resourceType, String(resourceId), userId, source]);
  const [result] = await connection.query(
    `INSERT IGNORE INTO resource_tag_relations (tag_id, resource_type, resource_id, user_id, source) VALUES ?`,
    [values],
  );
  return result.affectedRows || 0;
};

export const replaceResourceTagRelations = async (
  connection,
  { tagIds = [], resourceType, resourceId, userId, source = 'manual' },
) => {
  if (!userId) throw new Error('缺少资源归属用户');
  await connection.query(
    'DELETE FROM resource_tag_relations WHERE resource_type = ? AND resource_id = ? AND user_id = ?',
    [resourceType, String(resourceId), userId],
  );

  return insertResourceTagRelations(connection, {
    tagIds,
    resourceType,
    resourceId,
    userId,
    source,
  });
};

export const insertTagResourceRelations = async (
  connection,
  { tagId, resourceType, resourceIds = [], userId, source = 'manual' },
) => {
  const normalizedResourceIds = normalizeTagIds(resourceIds);
  if (!tagId || !normalizedResourceIds.length) return 0;

  const values = normalizedResourceIds.map((resourceId) => [tagId, resourceType, String(resourceId), userId, source]);
  const [result] = await connection.query(
    `INSERT IGNORE INTO resource_tag_relations (tag_id, resource_type, resource_id, user_id, source) VALUES ?`,
    [values],
  );
  return result.affectedRows || 0;
};

export const replaceTagResourceRelations = async (
  connection,
  { tagId, resourceType, resourceIds = [], userId, source = 'manual' },
) => {
  if (!userId) throw new Error('缺少资源归属用户');
  await connection.query('DELETE FROM resource_tag_relations WHERE tag_id = ? AND resource_type = ? AND user_id = ?', [
    tagId,
    resourceType,
    userId,
  ]);

  return insertTagResourceRelations(connection, {
    tagId,
    resourceType,
    resourceIds,
    userId,
    source,
  });
};

export const validateUserTags = async (connection, { tagIds = [], userId }) => {
  const normalizedTagIds = normalizeTagIds(tagIds);
  if (!normalizedTagIds.length) return [];

  const placeholders = normalizedTagIds.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT id FROM tag WHERE id IN (${placeholders}) AND user_id = ? AND del_flag = 0`,
    [...normalizedTagIds, userId],
  );

  if (rows.length !== normalizedTagIds.length) {
    throw new Error('包含无效标签');
  }

  return normalizedTagIds;
};

const RESOURCE_OWNER_CONFIG = {
  [RESOURCE_TYPE.BOOKMARK]: { table: 'bookmark', ownerField: 'user_id' },
  [RESOURCE_TYPE.NOTE]: { table: 'note', ownerField: 'create_by' },
  [RESOURCE_TYPE.FILE]: { table: 'files', ownerField: 'create_by' },
};

export const validateUserResources = async (connection, { resourceIds = [], resourceType, userId }) => {
  const normalizedResourceIds = normalizeTagIds(resourceIds);
  if (!normalizedResourceIds.length) return [];
  const config = RESOURCE_OWNER_CONFIG[resourceType];
  if (!config) throw new Error('不支持的资源类型');
  const placeholders = normalizedResourceIds.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT id FROM \`${config.table}\` WHERE id IN (${placeholders}) AND ${config.ownerField} = ? AND del_flag = 0`,
    [...normalizedResourceIds, userId],
  );
  if (rows.length !== normalizedResourceIds.length) throw new Error('包含无权访问或不存在的资源');
  return normalizedResourceIds;
};

/**
 * 标签编辑保存时允许丢弃“原本已关联、但当前已删除”的历史关系，避免不可见旧 ID 阻断保存。
 * 新提交且不属于当前用户的资源仍严格拒绝，不能用容错逻辑放宽归属边界。
 */
export const validateEditableTagResources = async (connection, { tagId, resourceIds = [], resourceType, userId }) => {
  const normalizedResourceIds = normalizeTagIds(resourceIds);
  if (!normalizedResourceIds.length) return [];
  const config = RESOURCE_OWNER_CONFIG[resourceType];
  if (!config) throw new Error('不支持的资源类型');

  const placeholders = normalizedResourceIds.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT id FROM \`${config.table}\` WHERE id IN (${placeholders}) AND ${config.ownerField} = ? AND del_flag = 0`,
    [...normalizedResourceIds, userId],
  );
  const activeIds = new Set((rows || []).map((row) => String(row.id)));
  const unavailableIds = normalizedResourceIds.filter((id) => !activeIds.has(id));
  if (!unavailableIds.length) return normalizedResourceIds;

  const unavailablePlaceholders = unavailableIds.map(() => '?').join(',');
  const [existingRelations] = await connection.query(
    `SELECT resource_id
       FROM resource_tag_relations
      WHERE tag_id = ? AND resource_type = ? AND user_id = ?
        AND resource_id IN (${unavailablePlaceholders})`,
    [tagId, resourceType, userId, ...unavailableIds],
  );
  const staleRelationIds = new Set((existingRelations || []).map((row) => String(row.resource_id)));
  if (unavailableIds.some((id) => !staleRelationIds.has(id))) {
    throw new Error('包含无权访问或不存在的资源');
  }
  return normalizedResourceIds.filter((id) => activeIds.has(id));
};

export const queryTagsForResource = async ({ resourceType, resourceId }) => {
  const [rows] = await pool.query(
    `
      SELECT t.*
      FROM tag t
      INNER JOIN resource_tag_relations r ON r.tag_id = t.id
      WHERE r.resource_type = ?
        AND r.resource_id = ?
        AND t.del_flag = 0
      ORDER BY t.sort, t.create_time DESC
    `,
    [resourceType, String(resourceId)],
  );
  return rows;
};

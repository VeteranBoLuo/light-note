import pool from '../db/index.js';

export const RESOURCE_TYPE = {
  BOOKMARK: 'bookmark',
  NOTE: 'note',
  FILE: 'file',
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
  await connection.query('DELETE FROM resource_tag_relations WHERE resource_type = ? AND resource_id = ?', [
    resourceType,
    String(resourceId),
  ]);

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
  await connection.query('DELETE FROM resource_tag_relations WHERE tag_id = ? AND resource_type = ?', [
    tagId,
    resourceType,
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

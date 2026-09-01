import { normalizeTagIds, validateUserTags } from '../resourceTags.js';

export const TAGGABLE_RESOURCE_TYPES = Object.freeze(['bookmark', 'note', 'file']);
const OWNER_CONFIG = Object.freeze({
  bookmark: { table: 'bookmark', owner: 'user_id' },
  note: { table: 'note', owner: 'create_by' },
  file: { table: 'files', owner: 'create_by' },
});

function normalizeItems(items = []) {
  const unique = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const type = String(item?.type || item?.resourceType || '').trim();
    const id = String(item?.id || item?.resourceId || '').trim();
    if (TAGGABLE_RESOURCE_TYPES.includes(type) && id) unique.set(`${type}:${id}`, { type, id });
  });
  return [...unique.values()];
}

function chunks(items, size = 200) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function queryOwnedResourceIds(db, { userId, type, ids }) {
  const config = OWNER_CONFIG[type];
  if (!config || !ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id FROM \`${config.table}\`
      WHERE \`${config.owner}\` = ? AND del_flag = 0 AND id IN (${placeholders})`,
    [userId, ...ids],
  );
  return rows.map((row) => String(row.id));
}

async function existingRelationCount(db, { userId, type, resourceIds, tagIds }) {
  if (!resourceIds.length || !tagIds.length) return 0;
  const resourcePlaceholders = resourceIds.map(() => '?').join(',');
  const tagPlaceholders = tagIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
       FROM resource_tag_relations
      WHERE user_id = ? AND resource_type = ?
        AND resource_id IN (${resourcePlaceholders})
        AND tag_id IN (${tagPlaceholders})`,
    [userId, type, ...resourceIds, ...tagIds],
  );
  return Number(rows?.[0]?.total || 0);
}

async function addRelations(db, { userId, type, resourceIds, tagIds, source = 'manual' }) {
  const values = resourceIds.flatMap((resourceId) =>
    tagIds.map((tagId) => [tagId, type, resourceId, userId, source]),
  );
  if (!values.length) return 0;
  const [result] = await db.query(
    'INSERT IGNORE INTO resource_tag_relations (tag_id, resource_type, resource_id, user_id, source) VALUES ?',
    [values],
  );
  return Number(result?.affectedRows || 0);
}

async function removeRelations(db, { userId, type, resourceIds, tagIds }) {
  if (!resourceIds.length || !tagIds.length) return 0;
  const resourcePlaceholders = resourceIds.map(() => '?').join(',');
  const tagPlaceholders = tagIds.map(() => '?').join(',');
  const [result] = await db.query(
    `DELETE FROM resource_tag_relations
      WHERE user_id = ? AND resource_type = ?
        AND resource_id IN (${resourcePlaceholders})
        AND tag_id IN (${tagPlaceholders})`,
    [userId, type, ...resourceIds, ...tagIds],
  );
  return Number(result?.affectedRows || 0);
}

export async function batchWriteResourceTags(
  db,
  { userId, items: rawItems, tagIds: rawTagIds, action, source = 'manual' },
) {
  if (!['add', 'remove'].includes(action)) throw Object.assign(new Error('缺少有效操作类型'), { code: 'TAG_ACTION_INVALID' });
  const items = normalizeItems(rawItems);
  if (!items.length) throw Object.assign(new Error('未选择可编辑资源'), { code: 'TAG_RESOURCE_EMPTY' });
  const tagIds = normalizeTagIds(rawTagIds);
  if (!tagIds.length) throw Object.assign(new Error('请至少选择一个标签'), { code: 'TAG_SELECTION_EMPTY' });
  const validTagIds = await validateUserTags(db, { tagIds, userId });
  const grouped = Object.fromEntries(TAGGABLE_RESOURCE_TYPES.map((type) => [type, []]));
  items.forEach((item) => grouped[item.type].push(item.id));

  let affectedRelationCount = 0;
  let existingRelationTotal = 0;
  let validItemCount = 0;
  const typeStats = [];
  for (const type of TAGGABLE_RESOURCE_TYPES) {
    const requestedIds = grouped[type];
    if (!requestedIds.length) continue;
    const validIds = [];
    for (const requestedChunk of chunks(requestedIds)) {
      validIds.push(...(await queryOwnedResourceIds(db, { userId, type, ids: requestedChunk })));
    }
    let affected = 0;
    let existed = 0;
    for (const resourceIds of chunks(validIds)) {
      existed += await existingRelationCount(db, { userId, type, resourceIds, tagIds: validTagIds });
      affected +=
        action === 'add'
          ? await addRelations(db, { userId, type, resourceIds, tagIds: validTagIds, source })
          : await removeRelations(db, { userId, type, resourceIds, tagIds: validTagIds });
    }
    validItemCount += validIds.length;
    existingRelationTotal += existed;
    affectedRelationCount += affected;
    typeStats.push({
      type,
      requestedCount: requestedIds.length,
      validCount: validIds.length,
      affectedRelationCount: affected,
    });
  }
  const totalPairs = validItemCount * validTagIds.length;
  return {
    action,
    requestedItemCount: items.length,
    validItemCount,
    invalidItemCount: Math.max(items.length - validItemCount, 0),
    requestedTagCount: tagIds.length,
    validTagCount: validTagIds.length,
    affectedRelationCount,
    skippedRelationCount:
      action === 'add'
        ? Math.max(totalPairs - affectedRelationCount, 0)
        : Math.max(totalPairs - existingRelationTotal, 0),
    typeStats,
  };
}

export async function mergeBookmarkTags(db, { userId, keepBookmarkId, sourceBookmarkIds }) {
  const sourceIds = [...new Set(sourceBookmarkIds.map(String).filter((id) => id && id !== keepBookmarkId))];
  if (!sourceIds.length) return 0;
  const placeholders = sourceIds.map(() => '?').join(',');
  const [result] = await db.query(
    `INSERT IGNORE INTO resource_tag_relations (tag_id, resource_type, resource_id, user_id, source)
     SELECT relations.tag_id, 'bookmark', ?, ?, 'organize_merge'
       FROM resource_tag_relations relations
       INNER JOIN tag ON tag.id = relations.tag_id AND tag.user_id = ? AND tag.del_flag = 0
      WHERE relations.user_id = ? AND relations.resource_type = 'bookmark'
        AND relations.resource_id IN (${placeholders})`,
    [keepBookmarkId, userId, userId, userId, ...sourceIds],
  );
  return Number(result?.affectedRows || 0);
}

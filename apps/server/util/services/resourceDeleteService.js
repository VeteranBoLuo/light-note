import pool from '../../db/index.js';
import { cleanupBookmarkIconFiles } from '../bookmarkIconService.js';
import { invalidatePersonalKnowledgeCache } from '../personalKnowledgeSearch.js';
import { removeInboxRelations } from '../resourceInbox.js';
import { queryOwnedResourceIds } from './resourceTagWriteService.js';

export const DELETABLE_RESOURCE_TYPES = Object.freeze(['bookmark', 'note', 'file', 'tag']);

function normalizeItems(items = []) {
  const unique = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const type = String(item?.type || item?.resourceType || '').trim();
    const id = String(item?.id || item?.resourceId || '').trim();
    if (DELETABLE_RESOURCE_TYPES.includes(type) && id) unique.set(`${type}:${id}`, { type, id });
  });
  return [...unique.values()];
}

function chunks(items, size = 200) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function queryOwnedIds(db, { userId, type, ids }) {
  if (type !== 'tag') return queryOwnedResourceIds(db, { userId, type, ids });
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT id FROM tag WHERE user_id = ? AND del_flag = 0 AND id IN (${placeholders})`,
    [userId, ...ids],
  );
  return rows.map((row) => String(row.id));
}

/** 在调用方事务内只写权威删除状态，旁路副作用随结果返回、提交后再执行。 */
export async function softDeleteResources(db, { userId, items: rawItems }) {
  const items = normalizeItems(rawItems);
  const grouped = Object.fromEntries(DELETABLE_RESOURCE_TYPES.map((type) => [type, []]));
  items.forEach((item) => grouped[item.type].push(item.id));
  const bookmarkIcons = [];
  const typeStats = [];
  let validItemCount = 0;
  let affectedItemCount = 0;

  for (const type of DELETABLE_RESOURCE_TYPES) {
    const requestedIds = grouped[type];
    if (!requestedIds.length) continue;
    let validCount = 0;
    let affectedCount = 0;
    for (const requestedChunk of chunks(requestedIds)) {
      const validIds = await queryOwnedIds(db, { userId, type, ids: requestedChunk });
      validCount += validIds.length;
      if (!validIds.length) continue;
      const placeholders = validIds.map(() => '?').join(',');
      let result;
      if (type === 'bookmark') {
        const [rows] = await db.query(
          `SELECT id, icon_url AS iconUrl FROM bookmark
            WHERE user_id = ? AND del_flag = 0 AND id IN (${placeholders})`,
          [userId, ...validIds],
        );
        bookmarkIcons.push(...rows);
        [result] = await db.query(
          `UPDATE bookmark SET del_flag = 1, deleted_at = NOW(), icon_url = NULL
            WHERE user_id = ? AND del_flag = 0 AND id IN (${placeholders})`,
          [userId, ...validIds],
        );
      } else if (type === 'note') {
        [result] = await db.query(
          `UPDATE note SET del_flag = 1, deleted_at = NOW()
            WHERE create_by = ? AND del_flag = 0 AND id IN (${placeholders})`,
          [userId, ...validIds],
        );
      } else if (type === 'file') {
        [result] = await db.query(
          `UPDATE files SET del_flag = 1, deleted_at = NOW()
            WHERE create_by = ? AND del_flag = 0 AND id IN (${placeholders})`,
          [userId, ...validIds],
        );
      } else {
        await db.query(
          `DELETE FROM resource_tag_relations WHERE user_id = ? AND tag_id IN (${placeholders})`,
          [userId, ...validIds],
        );
        [result] = await db.query(
          `DELETE FROM tag WHERE user_id = ? AND del_flag = 0 AND id IN (${placeholders})`,
          [userId, ...validIds],
        );
      }
      if (type !== 'tag') {
        await removeInboxRelations(db, {
          userId,
          items: validIds.map((id) => ({ resourceType: type, resourceId: id })),
        });
      }
      affectedCount += Number(result?.affectedRows || 0);
    }
    validItemCount += validCount;
    affectedItemCount += affectedCount;
    typeStats.push({
      type,
      requestedCount: requestedIds.length,
      validCount,
      affectedItemCount: affectedCount,
    });
  }
  return {
    requestedItemCount: items.length,
    validItemCount,
    invalidItemCount: Math.max(items.length - validItemCount, 0),
    affectedItemCount,
    typeStats,
    sideEffects: { userId, bookmarkIcons, invalidateSearch: affectedItemCount > 0 },
  };
}

export async function runResourceDeleteSideEffects(sideEffects = {}) {
  const bookmarkIcons = Array.isArray(sideEffects.bookmarkIcons) ? sideEffects.bookmarkIcons : [];
  if (bookmarkIcons.length) await cleanupBookmarkIconFiles(bookmarkIcons, { db: pool }).catch(() => {});
  if (sideEffects.invalidateSearch && sideEffects.userId) {
    void invalidatePersonalKnowledgeCache(sideEffects.userId);
  }
}

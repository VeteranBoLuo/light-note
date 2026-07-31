import { rankRelatedTags } from '../tagRelationScore.js';

/**
 * 标签相关度的唯一查询入口。相关标签由「共同资源」自动推导,
 * 不再读取用户手工维护的 tag_relations,保证标签详情、单标签图谱与全局地图口径一致。
 */

const DEFAULT_LIMIT = 8;
/** 候选集上限:先按共现数取头部,再在内存里归一化评分,避免为每个候选发单独 SQL。 */
const CANDIDATE_LIMIT = 60;

function normalizeLimit(value, fallback = DEFAULT_LIMIT) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(50, Math.floor(limit));
}

/** 某标签下的资源总数(书签/笔记/文件合计),用于相似度归一化的分母。 */
async function queryTagResourceCounts(db, userId, tagIds) {
  if (!tagIds.length) return new Map();
  const placeholders = tagIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT tag_id AS tagId, COUNT(*) AS total
       FROM resource_tag_relations
      WHERE user_id = ? AND tag_id IN (${placeholders})
      GROUP BY tag_id`,
    [userId, ...tagIds],
  );
  return new Map(rows.map((row) => [String(row.tagId), Number(row.total || 0)]));
}

/**
 * 取与 tagId 共享资源的候选标签及共现数。
 * 共现键是 resource_type + resource_id,不同类型下相同 ID 不会被误判为同一资源。
 */
async function queryCoOccurrence(db, userId, tagId) {
  const [rows] = await db.query(
    `SELECT
        candidate.tag_id AS id,
        t.name AS name,
        t.icon_url AS iconUrl,
        COUNT(*) AS sharedCount
       FROM resource_tag_relations center
       INNER JOIN resource_tag_relations candidate
          ON candidate.user_id = center.user_id
         AND candidate.resource_type = center.resource_type
         AND candidate.resource_id = center.resource_id
         AND candidate.tag_id <> center.tag_id
       INNER JOIN tag t
          ON t.id = candidate.tag_id AND t.user_id = center.user_id AND t.del_flag = 0
      WHERE center.user_id = ? AND center.tag_id = ?
      GROUP BY candidate.tag_id, t.name, t.icon_url
      ORDER BY sharedCount DESC, t.sort, t.create_time DESC
      LIMIT ?`,
    [userId, tagId, CANDIDATE_LIMIT],
  );
  return rows;
}

/**
 * 获取某个标签的自动相关标签。
 * @returns {Promise<Array<{id,name,iconUrl,sharedCount,sourceResourceCount,targetResourceCount,similarity,reason}>>}
 */
export async function getDerivedRelatedTags(db, { userId, tagId, limit = DEFAULT_LIMIT, minSimilarity = 0 } = {}) {
  const ownerId = String(userId || '').trim();
  const centerTagId = String(tagId || '').trim();
  if (!ownerId || !centerTagId) return [];

  const candidates = await queryCoOccurrence(db, ownerId, centerTagId);
  if (!candidates.length) return [];

  const counts = await queryTagResourceCounts(db, ownerId, [
    centerTagId,
    ...candidates.map((row) => String(row.id)),
  ]);

  return rankRelatedTags(
    candidates.map((row) => ({
      id: String(row.id),
      name: row.name,
      iconUrl: row.iconUrl,
      sharedCount: Number(row.sharedCount || 0),
      targetResourceCount: counts.get(String(row.id)) || 0,
    })),
    {
      sourceResourceCount: counts.get(centerTagId) || 0,
      limit: normalizeLimit(limit),
      minSimilarity,
    },
  );
}

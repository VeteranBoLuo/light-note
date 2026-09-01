import pool from '../../db/index.js';

const TAG_RESOURCE_TYPES = new Set(['bookmark', 'note', 'file']);

function requiredText(value, code) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  return normalized;
}

/**
 * 以标签关系表为唯一事实源解析完整、仍存活的标签资源范围。
 * 这里只生成候选 ID；owner 与当前版本继续交给 AI Context Resolver 的统一资源校验。
 */
export async function resolveTagAnalysisScope(database = pool, { userId: rawUserId, tagId: rawTagId } = {}) {
  const userId = requiredText(rawUserId, 'USER_REQUIRED');
  const tagId = requiredText(rawTagId, 'TAG_REQUIRED');
  const [tagRows] = await database.query(
    `SELECT id, name, description
       FROM tag
      WHERE id = ? AND user_id = ? AND del_flag = 0
      LIMIT 1`,
    [tagId, userId],
  );
  if (!tagRows?.length) return null;

  const [relationRows] = await database.query(
    `SELECT r.resource_type, r.resource_id
       FROM resource_tag_relations r
       LEFT JOIN bookmark b
         ON r.resource_type = 'bookmark'
        AND b.id = r.resource_id
        AND b.user_id = r.user_id
        AND b.del_flag = 0
       LEFT JOIN note n
         ON r.resource_type = 'note'
        AND n.id = r.resource_id
        AND n.create_by = r.user_id
        AND n.del_flag = 0
       LEFT JOIN files f
         ON r.resource_type = 'file'
        AND f.id = r.resource_id
        AND f.create_by = r.user_id
        AND f.del_flag = 0
      WHERE r.user_id = ?
        AND r.tag_id = ?
        AND (
          (r.resource_type = 'bookmark' AND b.id IS NOT NULL)
          OR (r.resource_type = 'note' AND n.id IS NOT NULL)
          OR (r.resource_type = 'file' AND f.id IS NOT NULL)
        )
      ORDER BY r.create_time DESC, r.resource_type ASC, r.resource_id DESC`,
    [userId, tagId],
  );

  const seen = new Set();
  const resourceRefs = [];
  for (const row of relationRows || []) {
    const type = String(row?.resource_type || '');
    const id = String(row?.resource_id || '').trim();
    const key = `${type}:${id}`;
    if (!TAG_RESOURCE_TYPES.has(type) || !id || seen.has(key)) continue;
    seen.add(key);
    resourceRefs.push(Object.freeze({ type, id }));
  }
  const tag = tagRows[0];
  return Object.freeze({
    tag: Object.freeze({
      id: String(tag.id),
      name: String(tag.name || ''),
      description: String(tag.description || ''),
    }),
    resourceRefs: Object.freeze(resourceRefs),
  });
}

export const tagAnalysisScopeInternals = Object.freeze({ TAG_RESOURCE_TYPES });

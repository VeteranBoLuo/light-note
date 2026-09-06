import { REVIEW_RESOURCE_DEFINITIONS, resolveDailyReviewBookmarkUrl } from './dailyReviewCandidateService.js';

export const DAILY_BRIEF_CONNECTION_DEFINITION = Object.freeze([
  'resource_connection',
  '新旧资料关联',
  'Related recent and older resources',
  '/tag',
]);
const text = (expression) => `CONVERT(${expression} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
const cleanTitle = (value) =>
  String(value || '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 120);

// 与每日回顾共用资源定义和链接校验，但不创建回顾会话、不改变已回顾状态。
// 仅检索账号自己的元数据和真实标签关系；每个资源类型最多读取 24 条。
export function buildBriefConnectionQuery(userId, calendar, tagIds = null) {
  const branches = REVIEW_RESOURCE_DEFINITIONS.map((definition) => {
    const filter = tagIds
      ? `AND relation.tag_id IN (${tagIds.map(() => '?').join(',')})
         AND ${definition.timeExpression} < DATE_SUB(?, INTERVAL 30 DAY)
         AND ${definition.activityExpression} < DATE_SUB(?, INTERVAL 14 DAY)`
      : `AND ${definition.activityExpression} >= ? AND ${definition.activityExpression} < ?`;
    return {
      sql: `(SELECT ${text(`'${definition.type}'`)} AS type,
          ${text(definition.idExpression)} AS id, ${text(definition.titleExpression)} AS title,
          ${text(definition.urlExpression)} AS url, ${text('owned_tag.id')} AS tagId,
          ${text('owned_tag.name')} AS tagName, ${definition.activityExpression} AS activity
        FROM ${definition.table} ${definition.alias}
        INNER JOIN resource_tag_relations relation ON relation.user_id = ?
          AND relation.resource_type = '${definition.type}'
          AND ${text('relation.resource_id')} = ${text(definition.idExpression)}
        INNER JOIN tag owned_tag ON owned_tag.id = relation.tag_id
          AND owned_tag.user_id = ? AND owned_tag.del_flag = 0
        WHERE ${definition.alias}.${definition.ownerColumn} = ? AND ${definition.liveCondition}
          ${filter}
        ORDER BY activity DESC, id ASC, tagId ASC LIMIT 24)`,
      params: [
        userId,
        userId,
        userId,
        ...(tagIds
          ? [...tagIds, calendar.todayStart, calendar.todayStart]
          : [calendar.yesterdayStart, calendar.todayEnd]),
      ],
    };
  });
  return {
    sql: `SELECT * FROM (${branches.map((branch) => branch.sql).join(' UNION ALL ')}) candidates
      ORDER BY activity DESC, type ASC, id ASC, tagId ASC LIMIT 24`,
    params: branches.flatMap((branch) => branch.params),
  };
}

function source(row) {
  const title = cleanTitle(row.title);
  const id = String(row.id || '');
  if (!title || !id) return null;
  const url = row.type === 'bookmark' ? resolveDailyReviewBookmarkUrl(row.url) : null;
  if (row.type === 'bookmark' && !url) return null;
  return { type: row.type, id, title, ...(url ? { url } : {}) };
}

export async function compileBriefConnection(database, userId, calendar) {
  const [id, zh, en, route] = DAILY_BRIEF_CONNECTION_DEFINITION;
  const english = calendar.locale === 'en-US';
  const empty = { id, label: english ? en : zh, route, count: 0, samples: [], sources: [] };
  const recentQuery = buildBriefConnectionQuery(userId, calendar);
  const [recent] = await database.query(recentQuery.sql, recentQuery.params);
  const eligible = recent.filter((row) => source(row) && cleanTitle(row.tagName));
  const tagIds = [...new Set(eligible.map((row) => String(row.tagId)))];
  if (!tagIds.length) return empty;
  const olderQuery = buildBriefConnectionQuery(userId, calendar, tagIds);
  const [older] = await database.query(olderQuery.sql, olderQuery.params);
  for (const current of eligible) {
    const past = older.find(
      (row) =>
        String(row.tagId) === String(current.tagId) &&
        !(row.type === current.type && String(row.id) === String(current.id)) &&
        source(row),
    );
    if (!past) continue;
    const sources = [source(current), source(past)];
    const tagName = cleanTitle(current.tagName);
    return {
      ...empty,
      count: 1,
      sources,
      tagName,
      route: `/tag/${encodeURIComponent(String(current.tagId))}`,
      // 这是可核验的标签依据，不宣称模型已经阅读正文或确认了语义相关性。
      samples: [
        english
          ? `“${sources[0].title}” and the older “${sources[1].title}” share the tag “${tagName}”`
          : `近期的《${sources[0].title}》与较早的《${sources[1].title}》同属「${tagName}」标签`,
      ],
    };
  }
  return empty;
}

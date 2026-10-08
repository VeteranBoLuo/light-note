import { buildSearchSeek, searchOrderKeys, searchSeekScope } from './searchSeekPagination.js';

// Within a relevance tier, retain the original type order and each type's list order.
const ORDER_KEYS = [
  { sql: 'score', direction: 'DESC' },
  { sql: 'kind_order', direction: 'ASC' },
  { sql: 'title_match', direction: 'DESC' },
  { sql: 'pinned', direction: 'DESC' },
  { sql: 'position', direction: 'ASC' },
  { sql: 'due_missing', direction: 'ASC' },
  { sql: 'due', direction: 'ASC', date: true },
  { sql: 'activity', direction: 'DESC', date: true },
  { sql: 'numeric_id', direction: 'DESC', id: true },
  { sql: 'id', direction: 'DESC', id: true },
];

// Unlike LIKE-based candidate matching, relevance treats % and _ as literal characters
// and does not promote accent-insensitive matches to exact-title matches.
function literalPosition(column) {
  return `LOCATE(CONVERT(LOWER(?) USING utf8mb4) COLLATE utf8mb4_bin, CONVERT(LOWER(TRIM(COALESCE(${column}, ''))) USING utf8mb4) COLLATE utf8mb4_bin)`;
}

function relevanceScore(type, definition, keyword, userId, idColumn) {
  const params = [keyword, keyword, keyword];
  const title = `CONVERT(LOWER(TRIM(COALESCE(${definition.titleColumn}, ''))) USING utf8mb4) COLLATE utf8mb4_bin`;
  let sql = `CASE WHEN ${title} = CONVERT(LOWER(?) USING utf8mb4) COLLATE utf8mb4_bin THEN 100
    WHEN ${literalPosition(definition.titleColumn)} = 1 THEN 80
    WHEN ${literalPosition(definition.titleColumn)} > 0 THEN 60`;
  if (type !== 'tag') {
    const tags =
      type === 'todo'
        ? `SELECT 1 FROM todo_tag_relations rank_rel INNER JOIN tag rank_tag ON rank_tag.id=rank_rel.tag_id AND rank_tag.user_id=rank_rel.user_id
         WHERE rank_rel.target_type='todo' AND rank_rel.target_id=${idColumn} AND rank_rel.user_id=?`
        : `SELECT 1 FROM resource_tag_relations rank_rel INNER JOIN tag rank_tag ON rank_tag.id=rank_rel.tag_id AND rank_tag.user_id=rank_rel.user_id
         WHERE rank_rel.resource_type='${type}' AND rank_rel.resource_id=${idColumn} AND rank_rel.user_id=?`;
    sql += ` WHEN EXISTS (${tags} AND rank_tag.del_flag=0 AND ${literalPosition('rank_tag.name')} > 0) THEN 50`;
    params.push(userId, keyword);
  }
  if (definition.url) {
    sql += ` WHEN ${literalPosition(definition.url)} > 0 THEN 40`;
    params.push(keyword);
  }
  if (definition.description) {
    sql += ` WHEN ${literalPosition(definition.description)} > 0 THEN 30`;
    params.push(keyword);
  }
  sql += ' ELSE 10 END';
  if (type === 'todo') sql = `(${sql}) + IF(t.status='completed', 0, 2)`;
  return { sql, params };
}

export function buildRelevantSearchQuery({
  userId,
  options,
  selectedTypes,
  definitions,
  filters,
  cursor,
  offset,
  pageSize,
}) {
  const params = [];
  const union = selectedTypes.map((type, index) => {
    const definition = definitions[type];
    const filter = filters[type];
    const score = relevanceScore(type, definition, options.keyword, userId, filter.idColumn);
    const titleKey = searchOrderKeys({
      sort: 'relevance',
      keyword: options.keyword,
      titleColumn: definition.titleColumn,
      updatedColumn: definition.updatedColumn,
      fallbackOrder: definition.fallbackOrder,
      idColumn: filter.idColumn,
    })[0];
    params.push(...score.params, ...titleKey.params, ...filter.params);
    return `SELECT CONVERT(${filter.idColumn} USING utf8mb4) COLLATE utf8mb4_unicode_ci AS id,
      CONVERT('${type}' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS type,
      ${score.sql} AS score, ${index} AS kind_order, ${titleKey.sql} AS title_match,
      ${definition.pin || '0'} AS pinned, ${definition.position || '0'} AS position,
      ${type === 'todo' ? 't.due_at IS NULL' : '0'} AS due_missing,
      ${type === 'todo' ? 't.due_at' : 'CAST(NULL AS DATETIME)'} AS due,
      ${definition.updatedColumn} AS activity,
      ${type === 'file' ? 'CAST(files.id AS UNSIGNED)' : '0'} AS numeric_id
      FROM ${filter.fromSql} WHERE ${filter.whereSql}`;
  });
  const scope = searchSeekScope(userId, options, selectedTypes, 'relevance');
  const seek = buildSearchSeek(ORDER_KEYS, {
    orderedSeekScope: scope,
    cursorSeek: cursor?.seek,
    offset,
    pageSize: pageSize + 1,
  });
  return {
    scope,
    sql: `SELECT ${seek.projection} id,type,score FROM (${union.join(' UNION ALL ')}) ranked_search
      WHERE 1=1 ${seek.where} ORDER BY ${ORDER_KEYS.map((key) => `${key.sql} ${key.direction}`).join(', ')} ${seek.limitSql}`,
    params: [...seek.selectParams, ...params, ...seek.whereParams, ...seek.limitParams],
  };
}

export function relevanceReason(score) {
  return (
    { 100: 'title_exact', 80: 'title_prefix', 60: 'title', 50: 'tag', 40: 'url', 30: 'description', 10: 'content' }[
      Math.floor(Number(score) / 10) * 10
    ] || 'content'
  );
}

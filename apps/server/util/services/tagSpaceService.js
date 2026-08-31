import { getDerivedRelatedTags } from './tagRelationService.js';

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 50;
const MAX_PAGE = 1_000_000;
const TAG_SPACE_FILTERS = new Set(['all', 'bookmark', 'note', 'file', 'empty']);
const TAG_SPACE_SORTS = new Set(['default', 'recent', 'resourceDesc', 'nameAsc']);
const TAG_SPACE_RESOURCE_TYPES = new Set(['all', 'bookmark', 'note', 'file']);
const TAG_SPACE_RESOURCE_SORTS = new Set(['updated', 'added']);
const TAG_SPACE_UNION_COLLATION = 'utf8mb4_unicode_ci';

function normalizeUnionText(expression) {
  return `CONVERT(${expression} USING utf8mb4) COLLATE ${TAG_SPACE_UNION_COLLATION}`;
}

const LIVE_RESOURCE_STATS_JOIN = `
  LEFT JOIN (
    SELECT
      r.tag_id,
      SUM(CASE WHEN r.resource_type = 'bookmark' AND b.id IS NOT NULL THEN 1 ELSE 0 END) AS bookmark_count,
      SUM(CASE WHEN r.resource_type = 'note' AND n.id IS NOT NULL THEN 1 ELSE 0 END) AS note_count,
      SUM(CASE WHEN r.resource_type = 'file' AND f.id IS NOT NULL THEN 1 ELSE 0 END) AS file_count,
      MAX(
        CASE
          WHEN r.resource_type = 'bookmark' AND b.id IS NOT NULL THEN b.create_time
          WHEN r.resource_type = 'note' AND n.id IS NOT NULL THEN COALESCE(n.update_time, n.create_time)
          WHEN r.resource_type = 'file' AND f.id IS NOT NULL THEN f.create_time
          ELSE NULL
        END
      ) AS last_activity_time
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
    GROUP BY r.tag_id
  ) stats ON stats.tag_id = t.id
`;

const TAG_BASE_COLUMNS = `
  t.id,
  t.name,
  t.description,
  t.icon_url,
  t.sort,
  t.create_time,
  COALESCE(stats.bookmark_count, 0) AS bookmark_count,
  COALESCE(stats.note_count, 0) AS note_count,
  COALESCE(stats.file_count, 0) AS file_count,
  stats.last_activity_time
`;

const TAG_PREVIEW_COLUMNS = `
  (
    SELECT JSON_OBJECT(
      'type', 'bookmark',
      'id', b.id,
      'title', b.name
    )
    FROM resource_tag_relations r
    INNER JOIN bookmark b
      ON b.id = r.resource_id
     AND b.user_id = r.user_id
     AND b.del_flag = 0
    WHERE r.user_id = ?
      AND r.tag_id = t.id
      AND r.resource_type = 'bookmark'
    ORDER BY b.is_top DESC, b.sort, b.create_time DESC, b.id DESC
    LIMIT 1
  ) AS bookmark_preview,
  (
    SELECT JSON_OBJECT(
      'type', 'note',
      'id', n.id,
      'title', n.title
    )
    FROM resource_tag_relations r
    INNER JOIN note n
      ON n.id = r.resource_id
     AND n.create_by = r.user_id
     AND n.del_flag = 0
    WHERE r.user_id = ?
      AND r.tag_id = t.id
      AND r.resource_type = 'note'
    ORDER BY n.is_top DESC, n.sort, COALESCE(n.update_time, n.create_time) DESC, n.id DESC
    LIMIT 1
  ) AS note_preview,
  (
    SELECT JSON_OBJECT(
      'type', 'file',
      'id', f.id,
      'title', f.file_name
    )
    FROM resource_tag_relations r
    INNER JOIN files f
      ON f.id = r.resource_id
     AND f.create_by = r.user_id
     AND f.del_flag = 0
    WHERE r.user_id = ?
      AND r.tag_id = t.id
      AND r.resource_type = 'file'
    ORDER BY f.create_time DESC, f.id DESC
    LIMIT 1
  ) AS file_preview
`;

const TAG_SUMMARY_COLUMNS = `${TAG_BASE_COLUMNS}, ${TAG_PREVIEW_COLUMNS}`;

function toPositiveInteger(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function normalizeKeyword(value) {
  return String(value || '')
    .trim()
    .slice(0, 100);
}

function escapeLike(value) {
  return value.replace(/[!%_]/g, (char) => `!${char}`);
}

function normalizeFilter(value) {
  const filter = String(value || 'all');
  return TAG_SPACE_FILTERS.has(filter) ? filter : 'all';
}

function normalizeSort(value) {
  const sort = String(value || 'recent');
  return TAG_SPACE_SORTS.has(sort) ? sort : 'recent';
}

function normalizeResourceType(value) {
  const type = String(value || 'all');
  return TAG_SPACE_RESOURCE_TYPES.has(type) ? type : 'all';
}

function normalizeResourceSort(value) {
  const sort = String(value || 'updated');
  return TAG_SPACE_RESOURCE_SORTS.has(sort) ? sort : 'updated';
}

function normalizePreview(value) {
  let preview = value;
  if (Buffer.isBuffer(preview)) preview = preview.toString('utf8');
  if (typeof preview === 'string') {
    try {
      preview = JSON.parse(preview);
    } catch {
      return null;
    }
  }
  if (!preview || typeof preview !== 'object' || !preview.id) return null;
  const type = String(preview.type || '');
  if (!['bookmark', 'note', 'file'].includes(type)) return null;
  return {
    type,
    id: String(preview.id),
    title: String(preview.title || ''),
  };
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSnippet(value, keyword, maxLength = 160) {
  const text = stripHtml(value);
  if (!text) return '';
  const normalizedKeyword = normalizeKeyword(keyword).toLowerCase();
  if (!normalizedKeyword) return text.slice(0, maxLength);
  const matchIndex = text.toLowerCase().indexOf(normalizedKeyword);
  if (matchIndex < 0) return text.slice(0, maxLength);
  const start = Math.max(0, matchIndex - Math.floor(maxLength / 3));
  const end = Math.min(text.length, start + maxLength);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

function normalizeSummaryRow(row) {
  const bookmark = Math.max(0, Number(row?.bookmark_count || 0));
  const note = Math.max(0, Number(row?.note_count || 0));
  const file = Math.max(0, Number(row?.file_count || 0));
  return {
    id: String(row?.id || ''),
    name: String(row?.name || ''),
    description: String(row?.description || ''),
    iconUrl: row?.icon_url || '',
    sort: Number(row?.sort || 0),
    createTime: row?.create_time || null,
    lastActivityTime: row?.last_activity_time || null,
    counts: {
      bookmark,
      note,
      file,
      total: bookmark + note + file,
    },
    previewResources: [
      normalizePreview(row?.bookmark_preview),
      normalizePreview(row?.note_preview),
      normalizePreview(row?.file_preview),
    ].filter(Boolean),
  };
}

function buildKeywordCondition(keyword, params) {
  if (!keyword) return '';
  const like = `%${escapeLike(keyword)}%`;
  params.push(like, like);
  return " AND (t.name LIKE ? ESCAPE '!' OR t.description LIKE ? ESCAPE '!')";
}

function filterCondition(filter) {
  if (filter === 'bookmark') return 'COALESCE(stats.bookmark_count, 0) > 0';
  if (filter === 'note') return 'COALESCE(stats.note_count, 0) > 0';
  if (filter === 'file') return 'COALESCE(stats.file_count, 0) > 0';
  if (filter === 'empty') {
    return `(
      COALESCE(stats.bookmark_count, 0)
      + COALESCE(stats.note_count, 0)
      + COALESCE(stats.file_count, 0)
    ) = 0`;
  }
  return `(
    COALESCE(stats.bookmark_count, 0)
    + COALESCE(stats.note_count, 0)
    + COALESCE(stats.file_count, 0)
  ) > 0`;
}

function sortExpression(sort) {
  if (sort === 'recent') {
    return 'stats.last_activity_time IS NULL ASC, stats.last_activity_time DESC, t.sort, t.create_time DESC, t.id DESC';
  }
  if (sort === 'resourceDesc') {
    return `(
      COALESCE(stats.bookmark_count, 0)
      + COALESCE(stats.note_count, 0)
      + COALESCE(stats.file_count, 0)
    ) DESC, t.name ASC, t.id ASC`;
  }
  if (sort === 'nameAsc') return 't.name ASC, t.id ASC';
  return 't.sort, t.create_time DESC, t.id DESC';
}

async function queryFacetSummary(db, { userId, keyword = '' }) {
  const normalizedKeyword = normalizeKeyword(keyword);
  const params = [userId, userId];
  const keywordCondition = buildKeywordCondition(normalizedKeyword, params);
  const [rows] = await db.query(
    `SELECT
       COUNT(*) AS tag_count,
       SUM(CASE WHEN (
         COALESCE(stats.bookmark_count, 0)
         + COALESCE(stats.note_count, 0)
         + COALESCE(stats.file_count, 0)
       ) > 0 THEN 1 ELSE 0 END) AS active_count,
       SUM(CASE WHEN COALESCE(stats.bookmark_count, 0) > 0 THEN 1 ELSE 0 END) AS bookmark_count,
       SUM(CASE WHEN COALESCE(stats.note_count, 0) > 0 THEN 1 ELSE 0 END) AS note_count,
       SUM(CASE WHEN COALESCE(stats.file_count, 0) > 0 THEN 1 ELSE 0 END) AS file_count
     FROM tag t
     ${LIVE_RESOURCE_STATS_JOIN}
     WHERE t.user_id = ? AND t.del_flag = 0${keywordCondition}`,
    params,
  );
  const row = rows?.[0] || {};
  const tagCount = Math.max(0, Number(row.tag_count || 0));
  const active = Math.max(0, Number(row.active_count || 0));
  return {
    tagCount,
    active,
    empty: Math.max(0, tagCount - active),
    bookmark: Math.max(0, Number(row.bookmark_count || 0)),
    note: Math.max(0, Number(row.note_count || 0)),
    file: Math.max(0, Number(row.file_count || 0)),
  };
}

async function queryCoveredResourceCounts(db, userId) {
  const [rows] = await db.query(
    `SELECT
       COUNT(DISTINCT CASE WHEN r.resource_type = 'bookmark' AND b.id IS NOT NULL THEN r.resource_id END) AS bookmark_count,
       COUNT(DISTINCT CASE WHEN r.resource_type = 'note' AND n.id IS NOT NULL THEN r.resource_id END) AS note_count,
       COUNT(DISTINCT CASE WHEN r.resource_type = 'file' AND f.id IS NOT NULL THEN r.resource_id END) AS file_count
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
     WHERE r.user_id = ?`,
    [userId],
  );
  const row = rows?.[0] || {};
  return {
    bookmark: Math.max(0, Number(row.bookmark_count || 0)),
    note: Math.max(0, Number(row.note_count || 0)),
    file: Math.max(0, Number(row.file_count || 0)),
  };
}

function buildResourceBranch(type, { userId, tagId, keyword }) {
  const like = `%${escapeLike(keyword)}%`;
  if (type === 'bookmark') {
    const params = [userId, tagId];
    const keywordSql = keyword
      ? " AND (b.name LIKE ? ESCAPE '!' OR b.description LIKE ? ESCAPE '!' OR b.url LIKE ? ESCAPE '!')"
      : '';
    if (keyword) params.push(like, like, like);
    return {
      sql: `SELECT
        ${normalizeUnionText("'bookmark'")} AS resource_type,
        ${normalizeUnionText('b.id')} AS id,
        ${normalizeUnionText('b.name')} AS title,
        ${normalizeUnionText("COALESCE(NULLIF(b.description, ''), b.url)")} AS summary,
        ${normalizeUnionText('b.url')} AS url,
        ${normalizeUnionText('b.icon_url')} AS icon_url,
        NULL AS file_type,
        NULL AS file_size,
        NULL AS folder_name,
        b.create_time,
        b.create_time AS update_time,
        r.create_time AS added_time
      FROM resource_tag_relations r
      INNER JOIN bookmark b
        ON b.id = r.resource_id
       AND b.user_id = r.user_id
       AND b.del_flag = 0
      WHERE r.user_id = ?
        AND r.tag_id = ?
        AND r.resource_type = 'bookmark'${keywordSql}`,
      params,
    };
  }

  if (type === 'note') {
    const params = [userId, tagId];
    const keywordSql = keyword
      ? " AND (n.title LIKE ? ESCAPE '!' OR (COALESCE(n.type, 'html') <> 'drawing' AND n.content LIKE ? ESCAPE '!'))"
      : '';
    if (keyword) params.push(like, like);
    return {
      sql: `SELECT
        ${normalizeUnionText("'note'")} AS resource_type,
        ${normalizeUnionText('n.id')} AS id,
        ${normalizeUnionText('n.title')} AS title,
        ${normalizeUnionText("IF(COALESCE(n.type, 'html') = 'drawing', '', LEFT(n.content, 800))")} AS summary,
        NULL AS url,
        NULL AS icon_url,
        NULL AS file_type,
        NULL AS file_size,
        NULL AS folder_name,
        n.create_time,
        COALESCE(n.update_time, n.create_time) AS update_time,
        r.create_time AS added_time
      FROM resource_tag_relations r
      INNER JOIN note n
        ON n.id = r.resource_id
       AND n.create_by = r.user_id
       AND n.del_flag = 0
      WHERE r.user_id = ?
        AND r.tag_id = ?
        AND r.resource_type = 'note'${keywordSql}`,
      params,
    };
  }

  const params = [userId, tagId];
  const keywordSql = keyword
    ? " AND (f.file_name LIKE ? ESCAPE '!' OR f.file_type LIKE ? ESCAPE '!' OR folders.name LIKE ? ESCAPE '!')"
    : '';
  if (keyword) params.push(like, like, like);
  return {
    sql: `SELECT
      ${normalizeUnionText("'file'")} AS resource_type,
      ${normalizeUnionText('f.id')} AS id,
      ${normalizeUnionText('f.file_name')} AS title,
      ${normalizeUnionText('folders.name')} AS summary,
      NULL AS url,
      NULL AS icon_url,
      ${normalizeUnionText('f.file_type')} AS file_type,
      f.file_size,
      ${normalizeUnionText('folders.name')} AS folder_name,
      f.create_time,
      f.create_time AS update_time,
      r.create_time AS added_time
    FROM resource_tag_relations r
    INNER JOIN files f
      ON f.id = r.resource_id
     AND f.create_by = r.user_id
     AND f.del_flag = 0
    LEFT JOIN folders
      ON folders.id = f.folder_id
     AND folders.create_by = r.user_id
     AND folders.del_flag = 0
    WHERE r.user_id = ?
      AND r.tag_id = ?
      AND r.resource_type = 'file'${keywordSql}`,
    params,
  };
}

function buildResourceUnion({ userId, tagId, keyword, type }) {
  const selectedTypes = type === 'all' ? ['bookmark', 'note', 'file'] : [type];
  const branches = selectedTypes.map((resourceType) => buildResourceBranch(resourceType, { userId, tagId, keyword }));
  return {
    sql: branches.map((branch) => branch.sql).join('\nUNION ALL\n'),
    params: branches.flatMap((branch) => branch.params),
  };
}

async function queryResourceTags(db, { userId, items }) {
  if (!items.length) return new Map();
  const groups = new Map();
  items.forEach((item) => {
    const type = String(item.resource_type || '');
    const id = String(item.id || '');
    if (!type || !id) return;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(id);
  });
  const conditions = [];
  const params = [userId, userId];
  for (const [type, ids] of groups.entries()) {
    conditions.push(`(r.resource_type = ? AND r.resource_id IN (${ids.map(() => '?').join(', ')}))`);
    params.push(type, ...ids);
  }
  if (!conditions.length) return new Map();
  const [rows] = await db.query(
    `SELECT r.resource_type, r.resource_id, t.id, t.name
     FROM resource_tag_relations r
     INNER JOIN tag t
       ON t.id = r.tag_id
      AND t.user_id = ?
      AND t.del_flag = 0
     WHERE r.user_id = ?
       AND (${conditions.join(' OR ')})
     ORDER BY t.sort, t.create_time DESC, t.id DESC`,
    params,
  );
  const result = new Map();
  (rows || []).forEach((row) => {
    const key = `${String(row.resource_type || '')}:${String(row.resource_id || '')}`;
    if (!result.has(key)) result.set(key, []);
    result.get(key).push({ id: String(row.id || ''), name: String(row.name || '') });
  });
  return result;
}

function normalizeResourceRow(row, keyword, tagsByResource) {
  const type = String(row?.resource_type || '');
  const id = String(row?.id || '');
  return {
    id,
    type,
    title: String(row?.title || ''),
    description: buildSnippet(row?.summary, keyword),
    url: type === 'bookmark' ? String(row?.url || '') : '',
    iconUrl: type === 'bookmark' ? String(row?.icon_url || '') : '',
    fileType: type === 'file' ? String(row?.file_type || '') : '',
    fileSize: type === 'file' ? Math.max(0, Number(row?.file_size || 0)) : 0,
    folderName: type === 'file' ? String(row?.folder_name || '') : '',
    createTime: row?.create_time || null,
    updateTime: row?.update_time || row?.create_time || null,
    addedTime: row?.added_time || null,
    tags: tagsByResource.get(`${type}:${id}`) || [],
  };
}

export async function queryTagSpaceResources(
  db,
  { userId, tagId, keyword = '', type = 'all', sort = 'updated', page = 1, pageSize = 20 } = {},
) {
  const ownerId = String(userId || '').trim();
  const normalizedTagId = String(tagId || '').trim();
  if (!ownerId) throw new Error('USER_REQUIRED');
  if (!normalizedTagId) throw new Error('TAG_REQUIRED');

  const [tagRows] = await db.query('SELECT id FROM tag WHERE id = ? AND user_id = ? AND del_flag = 0 LIMIT 1', [
    normalizedTagId,
    ownerId,
  ]);
  if (!tagRows?.length) return null;

  const normalizedKeyword = normalizeKeyword(keyword);
  const normalizedType = normalizeResourceType(type);
  const normalizedSort = normalizeResourceSort(sort);
  const normalizedPage = toPositiveInteger(page, 1, MAX_PAGE);
  const normalizedPageSize = toPositiveInteger(pageSize, 20, MAX_PAGE_SIZE);
  const offset = (normalizedPage - 1) * normalizedPageSize;
  const countUnion = buildResourceUnion({
    userId: ownerId,
    tagId: normalizedTagId,
    keyword: normalizedKeyword,
    type: normalizedType,
  });
  const rowUnion = buildResourceUnion({
    userId: ownerId,
    tagId: normalizedTagId,
    keyword: normalizedKeyword,
    type: normalizedType,
  });
  const orderColumn = normalizedSort === 'added' ? 'added_time' : 'update_time';
  const [countResult, rowResult] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total FROM (${countUnion.sql}) tag_space_resources`, countUnion.params),
    db.query(
      `SELECT *
       FROM (${rowUnion.sql}) tag_space_resources
       ORDER BY ${orderColumn} DESC, resource_type ASC, id DESC
       LIMIT ? OFFSET ?`,
      [...rowUnion.params, normalizedPageSize, offset],
    ),
  ]);
  const rows = rowResult?.[0] || [];
  const tagsByResource = await queryResourceTags(db, { userId: ownerId, items: rows });
  const total = Math.max(0, Number(countResult?.[0]?.[0]?.total || 0));
  return {
    items: rows.map((row) => normalizeResourceRow(row, normalizedKeyword, tagsByResource)),
    total,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    hasMore: normalizedPage * normalizedPageSize < total,
    keyword: normalizedKeyword,
    type: normalizedType,
    sort: normalizedSort,
  };
}

export async function queryTagSpaceList(
  db,
  {
    userId,
    keyword = '',
    filter = 'all',
    sort = 'recent',
    includeEmpty = false,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = {},
) {
  const ownerId = String(userId || '').trim();
  if (!ownerId) throw new Error('USER_REQUIRED');
  const normalizedKeyword = normalizeKeyword(keyword);
  const normalizedFilter = normalizeFilter(filter);
  const normalizedSort = normalizeSort(sort);
  const normalizedIncludeEmpty = includeEmpty === true || String(includeEmpty || '') === '1';
  const normalizedPage = toPositiveInteger(page, 1, MAX_PAGE);
  const normalizedPageSize = toPositiveInteger(pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = (normalizedPage - 1) * normalizedPageSize;

  const rowParams = [ownerId, ownerId, ownerId, ownerId, ownerId];
  const keywordCondition = buildKeywordCondition(normalizedKeyword, rowParams);
  rowParams.push(normalizedPageSize, offset);
  const rowsPromise = db.query(
    `SELECT ${TAG_SUMMARY_COLUMNS}
     FROM tag t
     ${LIVE_RESOURCE_STATS_JOIN}
     WHERE t.user_id = ?
       AND t.del_flag = 0${keywordCondition}
       AND ${normalizedIncludeEmpty && normalizedFilter === 'all' ? '1 = 1' : filterCondition(normalizedFilter)}
     ORDER BY ${sortExpression(normalizedSort)}
     LIMIT ? OFFSET ?`,
    rowParams,
  );
  const scopedFacetsPromise = queryFacetSummary(db, { userId: ownerId, keyword: normalizedKeyword });
  const overallFacetsPromise = normalizedKeyword ? queryFacetSummary(db, { userId: ownerId }) : scopedFacetsPromise;
  const coveredPromise = queryCoveredResourceCounts(db, ownerId);
  const [[rows], scopedFacets, overallFacets, covered] = await Promise.all([
    rowsPromise,
    scopedFacetsPromise,
    overallFacetsPromise,
    coveredPromise,
  ]);

  const total =
    normalizedFilter === 'all'
      ? normalizedIncludeEmpty
        ? scopedFacets.tagCount
        : scopedFacets.active
      : scopedFacets[normalizedFilter];
  return {
    items: (rows || []).map(normalizeSummaryRow),
    total,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    hasMore: normalizedPage * normalizedPageSize < total,
    filter: normalizedFilter,
    sort: normalizedSort,
    keyword: normalizedKeyword,
    includeEmpty: normalizedIncludeEmpty,
    facets: {
      all: normalizedIncludeEmpty ? scopedFacets.tagCount : scopedFacets.active,
      bookmark: scopedFacets.bookmark,
      note: scopedFacets.note,
      file: scopedFacets.file,
      empty: scopedFacets.empty,
    },
    overview: {
      tagTotal: overallFacets.tagCount,
      activeTagTotal: overallFacets.active,
      emptyTagTotal: overallFacets.empty,
      covered,
    },
  };
}

export async function getTagSpaceOverview(db, { userId, tagId, relatedLimit = 8 } = {}) {
  const ownerId = String(userId || '').trim();
  const normalizedTagId = String(tagId || '').trim();
  if (!ownerId || !normalizedTagId) return null;
  const [rows] = await db.query(
    `SELECT ${TAG_BASE_COLUMNS}
     FROM tag t
     ${LIVE_RESOURCE_STATS_JOIN}
     WHERE t.user_id = ? AND t.id = ? AND t.del_flag = 0
     LIMIT 1`,
    [ownerId, ownerId, normalizedTagId],
  );
  if (!rows?.length) return null;
  const relatedTags = await getDerivedRelatedTags(db, {
    userId: ownerId,
    tagId: normalizedTagId,
    limit: relatedLimit,
  });
  return {
    tag: normalizeSummaryRow(rows[0]),
    relatedTags,
  };
}

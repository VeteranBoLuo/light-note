import crypto from 'node:crypto';
import { BOOKMARK_URL_STATE, resolveBookmarkUrlInput } from '@lightnote/shared';

export const DAILY_REVIEW_RESOURCE_TYPES = Object.freeze(['bookmark', 'note', 'file']);
export const DAILY_REVIEW_REASON_CODES = Object.freeze(['on_this_day', 'active_tag', 'buried']);

const CANDIDATE_POOL_LIMIT = 60;
const ACTIVE_TAG_LIMIT = 20;
const DAILY_ITEM_LIMIT = 3;
const MAX_ITEMS_PER_RESOURCE_TYPE = 2;
const UNION_COLLATION = 'utf8mb4_unicode_ci';

const asUnionText = (expression) => `CONVERT(${expression} USING utf8mb4) COLLATE ${UNION_COLLATION}`;
export const dailyReviewBookmarkUrlCondition = (expression) =>
  `LOWER(TRIM(${expression})) REGEXP '^https?://[^[:space:]]+$'`;

export function resolveDailyReviewBookmarkUrl(value) {
  const resolution = resolveBookmarkUrlInput(value, { allowTextExtraction: false });
  return [BOOKMARK_URL_STATE.VALID, BOOKMARK_URL_STATE.NORMALIZED].includes(resolution.state)
    ? resolution.canonicalUrl
    : null;
}

const RESOURCE_DEFINITIONS = Object.freeze([
  {
    type: 'bookmark',
    table: 'bookmark',
    alias: 'b',
    ownerColumn: 'user_id',
    idExpression: 'b.id',
    titleExpression: 'b.name',
    urlExpression: 'b.url',
    timeExpression: 'b.create_time',
    activityExpression: 'b.create_time',
    liveCondition: `b.del_flag = 0 AND ${dailyReviewBookmarkUrlCondition('b.url')}`,
  },
  {
    type: 'note',
    table: 'note',
    alias: 'n',
    ownerColumn: 'create_by',
    idExpression: 'n.id',
    titleExpression: 'n.title',
    urlExpression: 'NULL',
    timeExpression: 'n.create_time',
    activityExpression: 'COALESCE(n.update_time, n.create_time)',
    liveCondition: "n.del_flag = '0'",
  },
  {
    type: 'file',
    table: 'files',
    alias: 'f',
    ownerColumn: 'create_by',
    idExpression: 'CAST(f.id AS CHAR)',
    titleExpression: 'f.file_name',
    urlExpression: 'NULL',
    timeExpression: 'f.create_time',
    activityExpression: 'f.create_time',
    liveCondition: 'f.del_flag = 0',
  },
]);

function assertDate(value) {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('DAILY_REVIEW_DATE_INVALID');
  return date;
}

function normalizeShiftMinutes(value) {
  const minutes = Math.trunc(Number(value || 0));
  if (!Number.isFinite(minutes) || minutes < -1_560 || minutes > 1_560) {
    throw new Error('DAILY_REVIEW_CALENDAR_INVALID');
  }
  return minutes;
}

function localTime(expression, shiftMinutes) {
  return `DATE_ADD(${expression}, INTERVAL ${normalizeShiftMinutes(shiftMinutes)} MINUTE)`;
}

function utcBoundary(accountDateSql, shiftMinutes, dayOffset = 0) {
  const shiftedDate =
    dayOffset === 0
      ? accountDateSql
      : dayOffset > 0
        ? `DATE_ADD(${accountDateSql}, INTERVAL ${dayOffset} DAY)`
        : `DATE_SUB(${accountDateSql}, INTERVAL ${Math.abs(dayOffset)} DAY)`;
  return `DATE_SUB(${shiftedDate}, INTERVAL ${normalizeShiftMinutes(shiftMinutes)} MINUTE)`;
}

function availabilityJoin(definition) {
  return `LEFT JOIN growth_recap_state recap_state
      ON recap_state.user_id = ?
     AND recap_state.resource_type = '${definition.type}'
     AND recap_state.resource_id = ${asUnionText(definition.idExpression)}`;
}

function availabilityWhere(accountDateSql) {
  return `recap_state.dismissed_at IS NULL
    AND (recap_state.snoozed_until IS NULL OR recap_state.snoozed_until <= NOW())
    AND (
      recap_state.last_shown_date IS NULL
      OR recap_state.last_shown_date < DATE_SUB(${accountDateSql}, INTERVAL 29 DAY)
    )`;
}

function candidateProjection(definition, reasonCode, withTag, shiftedCreateTime) {
  return `${asUnionText(`'${definition.type}'`)} AS resource_type,
    ${asUnionText(definition.idExpression)} AS resource_id,
    ${asUnionText(definition.titleExpression)} AS title,
    ${asUnionText(definition.urlExpression)} AS url,
    ${definition.timeExpression} AS create_time,
    ${asUnionText(`DATE_FORMAT(${shiftedCreateTime}, '%Y-%m-%d')`)} AS resource_date,
    ${asUnionText(`'${reasonCode}'`)} AS reason_code,
    ${asUnionText(withTag ? 'reason_tag.id' : 'NULL')} AS reason_tag_id,
    ${asUnionText(withTag ? 'reason_tag.name' : 'NULL')} AS reason_tag_name`;
}

function buildCandidateBranch({ definition, reasonCode, accountDateSql, shiftMinutes, activeTagIds = [] }) {
  const shiftedCreateTime = localTime(definition.timeExpression, shiftMinutes);
  const activeTag = reasonCode === 'active_tag';
  const joins = [];
  const params = [];

  if (activeTag) {
    joins.push(`INNER JOIN resource_tag_relations relation
      ON relation.user_id = ?
     AND relation.resource_type = '${definition.type}'
     AND ${asUnionText('relation.resource_id')} = ${asUnionText(definition.idExpression)}`);
    params.push(null);
    joins.push(`INNER JOIN tag reason_tag
      ON reason_tag.id = relation.tag_id
     AND reason_tag.user_id = ?
     AND reason_tag.del_flag = 0`);
    params.push(null);
  }

  joins.push(availabilityJoin(definition));
  params.push(null);

  let reasonCondition = '';
  if (reasonCode === 'on_this_day') {
    reasonCondition = `MONTH(${shiftedCreateTime}) = MONTH(${accountDateSql})
      AND DAY(${shiftedCreateTime}) = DAY(${accountDateSql})
      AND YEAR(${shiftedCreateTime}) < YEAR(${accountDateSql})
      AND ${definition.timeExpression} < ${utcBoundary(accountDateSql, shiftMinutes)}`;
  } else if (reasonCode === 'active_tag') {
    reasonCondition = `reason_tag.id IN (${activeTagIds.map(() => '?').join(', ')})
      AND ${definition.timeExpression} < ${utcBoundary(accountDateSql, shiftMinutes, -30)}
      AND ${definition.activityExpression} < ${utcBoundary(accountDateSql, shiftMinutes, -14)}`;
  } else {
    reasonCondition = `${definition.timeExpression} < ${utcBoundary(accountDateSql, shiftMinutes, -90)}`;
  }

  params.push(null);
  if (activeTag) params.push(...activeTagIds);

  const baseSql = `SELECT
      ${candidateProjection(definition, reasonCode, activeTag, shiftedCreateTime)}
    FROM ${definition.table} ${definition.alias}
    ${joins.join('\n    ')}
    WHERE ${definition.alias}.${definition.ownerColumn} = ?
      AND ${definition.liveCondition}
      AND ${availabilityWhere(accountDateSql)}
      AND ${reasonCondition}`;
  const sql = activeTag
    ? `SELECT active_resources.resource_type,
              active_resources.resource_id,
              MAX(active_resources.title) AS title,
              MAX(active_resources.url) AS url,
              MAX(active_resources.create_time) AS create_time,
              MAX(active_resources.resource_date) AS resource_date,
              active_resources.reason_code,
              MIN(active_resources.reason_tag_id) AS reason_tag_id,
              ${asUnionText('NULL')} AS reason_tag_name
         FROM (${baseSql}) active_resources
        GROUP BY active_resources.resource_type, active_resources.resource_id, active_resources.reason_code
        ORDER BY MAX(active_resources.create_time) DESC, active_resources.resource_id ASC
        LIMIT ${CANDIDATE_POOL_LIMIT}`
    : `${baseSql}
       ORDER BY ${definition.timeExpression} DESC, ${definition.idExpression} ASC
       LIMIT ${CANDIDATE_POOL_LIMIT}`;

  return {
    sql,
    // null 占位在组合查询时统一替换为 userId，避免把动态 ID 混入 SQL 文本。
    params,
  };
}

export function buildCandidatePoolQuery({ userId, date, shiftMinutes = 0, reasonCode, activeTagIds = [] }) {
  const normalizedDate = assertDate(date);
  if (!DAILY_REVIEW_REASON_CODES.includes(reasonCode)) throw new Error('DAILY_REVIEW_REASON_INVALID');
  const accountDateSql = `DATE '${normalizedDate}'`;
  const normalizedTagIds = [...new Set(activeTagIds.map((id) => String(id || '').trim()).filter(Boolean))].slice(
    0,
    ACTIVE_TAG_LIMIT,
  );
  if (reasonCode === 'active_tag' && !normalizedTagIds.length) return null;
  const branches = RESOURCE_DEFINITIONS.map((definition) =>
    buildCandidateBranch({ definition, reasonCode, accountDateSql, shiftMinutes, activeTagIds: normalizedTagIds }),
  );
  const params = branches.flatMap((branch) => branch.params.map((value) => value ?? String(userId)));
  params.push(`${String(userId)}:${normalizedDate}`);
  return {
    sql: `SELECT candidate_pool.resource_type,
                 candidate_pool.resource_id,
                 MAX(candidate_pool.title) AS title,
                 MAX(candidate_pool.url) AS url,
                 MAX(candidate_pool.create_time) AS create_time,
                 MAX(candidate_pool.resource_date) AS resource_date,
                 candidate_pool.reason_code,
                 MIN(candidate_pool.reason_tag_id) AS reason_tag_id,
                 ${asUnionText('NULL')} AS reason_tag_name
      FROM (
        ${branches.map((branch) => `(${branch.sql})`).join('\n        UNION ALL\n        ')}
      ) candidate_pool
      GROUP BY candidate_pool.resource_type, candidate_pool.resource_id, candidate_pool.reason_code
      ORDER BY CRC32(CONCAT(?, ':', candidate_pool.resource_type, ':', candidate_pool.resource_id)) ASC,
               candidate_pool.resource_type ASC,
               candidate_pool.resource_id ASC
      LIMIT ${CANDIDATE_POOL_LIMIT}`,
    params,
  };
}

export function buildActiveTagsQuery({ userId, date, shiftMinutes = 0 }) {
  const normalizedDate = assertDate(date);
  const accountDateSql = `DATE '${normalizedDate}'`;
  const branches = RESOURCE_DEFINITIONS.map((definition) => {
    return {
      sql: `SELECT relation.tag_id, ${definition.activityExpression} AS activity_time
        FROM ${definition.table} ${definition.alias}
        INNER JOIN resource_tag_relations relation
          ON relation.user_id = ?
         AND relation.resource_type = '${definition.type}'
         AND ${asUnionText('relation.resource_id')} = ${asUnionText(definition.idExpression)}
        WHERE ${definition.alias}.${definition.ownerColumn} = ?
          AND ${definition.liveCondition}
          AND ${definition.activityExpression} >= ${utcBoundary(accountDateSql, shiftMinutes, -13)}
          AND ${definition.activityExpression} < ${utcBoundary(accountDateSql, shiftMinutes, 1)}`,
      params: [String(userId), String(userId)],
    };
  });
  return {
    sql: `SELECT ${asUnionText('recent_activity.tag_id')} AS tag_id,
                 ${asUnionText('MAX(active_tag.name)')} AS tag_name,
                 MAX(recent_activity.activity_time) AS last_activity_time
      FROM (
        ${branches.map((branch) => branch.sql).join('\n        UNION ALL\n        ')}
      ) recent_activity
      INNER JOIN tag active_tag
        ON active_tag.id = recent_activity.tag_id
       AND active_tag.user_id = ?
       AND active_tag.del_flag = 0
      GROUP BY recent_activity.tag_id
      ORDER BY last_activity_time DESC, recent_activity.tag_id ASC
      LIMIT ${ACTIVE_TAG_LIMIT}`,
    params: [...branches.flatMap((branch) => branch.params), String(userId)],
  };
}

function normalizeCandidate(row) {
  const resourceType = String(row?.resource_type || row?.resourceType || '');
  const resourceId = String(row?.resource_id || row?.resourceId || '');
  const reasonCode = String(row?.reason_code || row?.reasonCode || '');
  if (
    !DAILY_REVIEW_RESOURCE_TYPES.includes(resourceType) ||
    !resourceId ||
    !DAILY_REVIEW_REASON_CODES.includes(reasonCode)
  ) {
    return null;
  }
  const bookmarkUrl = resourceType === 'bookmark' ? resolveDailyReviewBookmarkUrl(row?.url) : null;
  if (resourceType === 'bookmark' && !bookmarkUrl) return null;
  const resourceDate = String(row?.resource_date || row?.resourceDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resourceDate)) return null;
  const reasonTagId = String(row?.reason_tag_id || row?.reasonTagId || '').trim() || null;
  const reasonTagName = String(row?.reason_tag_name || row?.reasonTagName || '').trim() || null;
  return {
    resourceType,
    resourceId,
    title: String(row?.title || ''),
    url: bookmarkUrl,
    time: row?.create_time || row?.time || null,
    resourceDate,
    reasonCode,
    reasonTagId,
    reasonTagName,
  };
}

function stableCandidateKey(userId, date, candidate) {
  return crypto
    .createHash('sha256')
    .update([userId, date, candidate.resourceType, candidate.resourceId].join(':'))
    .digest('hex');
}

function stableSort(userId, date, candidates) {
  return candidates
    .map(normalizeCandidate)
    .filter(Boolean)
    .sort((left, right) => {
      const keyOrder = stableCandidateKey(userId, date, left).localeCompare(stableCandidateKey(userId, date, right));
      if (keyOrder) return keyOrder;
      return `${left.resourceType}:${left.resourceId}:${left.reasonTagId || ''}`.localeCompare(
        `${right.resourceType}:${right.resourceId}:${right.reasonTagId || ''}`,
      );
    });
}

export function selectDailyReviewCandidates({ userId, date, onThisDay = [], activeTag = [], buried = [] }) {
  const selected = [];
  const selectedResources = new Set();
  const typeCounts = new Map();
  const usedReasonTags = new Set();

  const canSelect = (candidate) => {
    const resourceKey = `${candidate.resourceType}:${candidate.resourceId}`;
    return (
      !selectedResources.has(resourceKey) &&
      Number(typeCounts.get(candidate.resourceType) || 0) < MAX_ITEMS_PER_RESOURCE_TYPE
    );
  };
  const add = (candidate) => {
    const resourceKey = `${candidate.resourceType}:${candidate.resourceId}`;
    selected.push(candidate);
    selectedResources.add(resourceKey);
    typeCounts.set(candidate.resourceType, Number(typeCounts.get(candidate.resourceType) || 0) + 1);
    if (candidate.reasonTagId) usedReasonTags.add(candidate.reasonTagId);
  };

  for (const pool of [onThisDay, activeTag, buried]) {
    const candidates = stableSort(userId, date, pool);
    // 对标签原因先取尚未使用的标签；不足时再放宽标签重复，但类型上限始终不放宽。
    for (const allowRepeatedTag of [false, true]) {
      for (const candidate of candidates) {
        if (selected.length >= DAILY_ITEM_LIMIT) return selected;
        if (!canSelect(candidate)) continue;
        if (!allowRepeatedTag && candidate.reasonTagId && usedReasonTags.has(candidate.reasonTagId)) continue;
        add(candidate);
      }
    }
    if (selected.length >= DAILY_ITEM_LIMIT) break;
  }
  return selected;
}

async function queryCandidates(db, input) {
  const query = buildCandidatePoolQuery(input);
  if (!query) return [];
  const [rows] = await db.query(query.sql, query.params);
  return Array.isArray(rows) ? rows : [];
}

export async function loadDailyReviewCandidates({ db, userId, calendar, date }) {
  const activeTagsQuery = buildActiveTagsQuery({ userId, date, shiftMinutes: calendar.shiftMinutes });
  const [activeTagRows] = await db.query(activeTagsQuery.sql, activeTagsQuery.params);
  const activeTagIds = (activeTagRows || []).map((row) => String(row.tag_id || row.tagId || '')).filter(Boolean);

  // 同一事务连接不并发发查询，避免 mysql2 connection 上的隐式排队掩盖事务边界。
  const onThisDay = await queryCandidates(db, {
    userId,
    date,
    shiftMinutes: calendar.shiftMinutes,
    reasonCode: 'on_this_day',
  });
  const activeTag = activeTagIds.length
    ? await queryCandidates(db, {
        userId,
        date,
        shiftMinutes: calendar.shiftMinutes,
        reasonCode: 'active_tag',
        activeTagIds,
      })
    : [];
  const buried = await queryCandidates(db, {
    userId,
    date,
    shiftMinutes: calendar.shiftMinutes,
    reasonCode: 'buried',
  });
  return selectDailyReviewCandidates({ userId, date, onThisDay, activeTag, buried });
}

export const DAILY_REVIEW_CANDIDATE_LIMITS = Object.freeze({
  activeTags: ACTIVE_TAG_LIMIT,
  candidatePool: CANDIDATE_POOL_LIMIT,
  dailyItems: DAILY_ITEM_LIMIT,
  perResourceType: MAX_ITEMS_PER_RESOURCE_TYPE,
});

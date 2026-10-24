import pool from '../../db/index.js';
import { queryTagMatches } from '../services/tagSpaceService.js';
import {
  SEARCH_ORDER_DEFINITIONS,
  SEARCH_FILTER_BY_TYPE,
  SEARCH_QUERY_BY_TYPE,
  GLOBAL_SEARCH_TYPES,
  normalizeSearchTypes,
  normalizeSearchSort,
  normalizeSearchDate,
  normalizeSearchTagNames,
  groupItems,
  querySearchTagOptions,
  diversifySuggestItems,
} from '../services/resourceSearchService.js';
import { relevanceScore, relevanceReason } from '../searchRelevancePagination.js';
import { buildSearchSeek, takeSearchSeekRows } from '../searchSeekPagination.js';
import { access, digest, fail, fields, ready } from './core.js';
import { dto, readSummaryColumns, readJoins, visibleSql } from './read.js';

// Bound all read queries in one search, including nested note metadata reads.
// Access/schema checks retain the original DB object and run before this scope is created.
export function searchQueryScope(database, concurrency = 3) {
  let active = 0;
  const waiting = [];
  return {
    async query(...args) {
      await new Promise((resolve) => {
        const enter = () => {
          active++;
          resolve();
        };
        if (active < concurrency) enter();
        else waiting.push(enter);
      });
      try {
        return await database.query(...args);
      } finally {
        active--;
        waiting.shift()?.();
      }
    },
  };
}

const cast = (sql) => `CONVERT(${sql} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
export function combinedOrder(options) {
  const keys = [{ sql: 'kind_order', direction: 'ASC' }];
  if (options.sort === 'name') keys.push({ sql: 'title_sort', direction: 'ASC' });
  else if (options.sort === 'updated') keys.push({ sql: 'activity', direction: 'DESC', date: true });
  else {
    if (options.keyword) keys.unshift({ sql: 'score', direction: 'DESC' });
    keys.push(
      { sql: 'pinned', direction: 'DESC' },
      { sql: 'position', direction: 'ASC' },
      { sql: 'due_missing', direction: 'ASC' },
      { sql: 'due', direction: 'ASC', date: true },
      { sql: 'activity', direction: 'DESC', date: true },
    );
  }
  return [
    ...keys,
    { sql: 'numeric_id', direction: 'DESC' },
    { sql: 'id', direction: 'DESC', id: true },
    { sql: 'origin', direction: 'ASC' },
  ];
}
function publicFilter(user, kind, options) {
  const where = [visibleSql(), 'p.owner_id<>?', 'p.kind=?'],
    params = [user.id, user.id, user.id, kind];
  if (options.keyword) {
    where.push('(LOCATE(?,r.title)>0 OR LOCATE(?,r.body)>0 OR LOCATE(?,r.url)>0 OR LOCATE(?,r.description)>0)');
    params.push(options.keyword, options.keyword, options.keyword, options.keyword);
  }
  if (options.date !== 'all') {
    const days = { '7d': 7, '30d': 30, '365d': 365 }[options.date];
    where.push(`p.published_at>=DATE_SUB(NOW(),INTERVAL ${days} DAY)`);
  }
  return { fromSql: readJoins.slice(5), whereSql: where.join(' AND '), params };
}
export function combinedBranches(user, types, options, source = 'all') {
  const branches = [];
  for (const [index, type] of types.entries()) {
    if (source !== 'public') {
      const d = SEARCH_ORDER_DEFINITIONS[type],
        filter = SEARCH_FILTER_BY_TYPE[type](user.id, options);
      const rank = options.keyword
        ? relevanceScore(type, d, options.keyword, user.id, filter.idColumn)
        : { sql: '0', params: [] };
      branches.push({
        type,
        origin: 'personal',
        filter,
        sql: `SELECT ${cast(filter.idColumn)} AS id,${cast(`'${type}'`)} AS type,${cast("'personal'")} AS origin,${rank.sql} AS score,${index} AS kind_order,${cast(`LOWER(COALESCE(${d.titleColumn},''))`)} AS title_sort,${d.pin || '0'} AS pinned,${d.position || '0'} AS position,${type === 'todo' ? 't.due_at IS NULL' : '0'} AS due_missing,${type === 'todo' ? 't.due_at' : 'CAST(NULL AS DATETIME)'} AS due,COALESCE(${d.updatedColumn},'1970-01-01 00:00:00') AS activity,${type === 'file' ? `CAST(${filter.idColumn} AS UNSIGNED)` : '0'} AS numeric_id FROM ${filter.fromSql} WHERE ${filter.whereSql}`,
        params: [...rank.params, ...filter.params],
      });
    }
    if (source !== 'personal' && ['note', 'bookmark'].includes(type)) {
      const filter = publicFilter(user, type, options),
        d = {
          titleColumn: 'r.title',
          url: type === 'bookmark' ? 'r.url' : null,
          description: type === 'bookmark' ? 'r.description' : 'r.body',
        };
      const rank = options.keyword
        ? relevanceScore(type, d, options.keyword, user.id, 'p.public_id', { includeTags: false })
        : { sql: '0', params: [] };
      branches.push({
        type,
        origin: 'public',
        filter,
        sql: `SELECT ${cast('p.public_id')} AS id,${cast(`'${type}'`)} AS type,${cast("'public'")} AS origin,${rank.sql} AS score,${index} AS kind_order,${cast('LOWER(r.title)')} AS title_sort,0 AS pinned,0 AS position,0 AS due_missing,CAST(NULL AS DATETIME) AS due,p.published_at AS activity,0 AS numeric_id FROM ${filter.fromSql} WHERE ${filter.whereSql}`,
        params: [...rank.params, ...filter.params],
      });
    }
  }
  return branches;
}
export async function rankedPage(
  db,
  user,
  types,
  options,
  { cursor = null, limit = 40, source = 'all', offset = 0 } = {},
) {
  const branches = combinedBranches(user, types, options, source);
  if (!branches.length) return { rows: [], hasMore: false, nextCursor: null };
  const scope = digest({
    user: user.id,
    types,
    source,
    keyword: options.keyword,
    sort: options.sort,
    date: options.date,
    tagNames: options.tagNames,
    untagged: options.untagged,
    fileExtensions: options.fileExtensions,
    todoStatus: options.todoStatus,
    todoPriorities: options.todoPriorities,
    todoDue: options.todoDue,
  });
  const keys = combinedOrder(options);
  let seek;
  try {
    seek = buildSearchSeek(keys, { orderedSeekScope: scope, cursorSeek: cursor?.seek, offset, pageSize: limit + 1 });
  } catch {
    fail('CURSOR_INVALID', 400);
  }
  const [rows] = await db.query(
    `SELECT ${seek.projection}id,type,origin,score FROM (${branches.map((b) => b.sql).join(' UNION ALL ')}) combined_search WHERE 1=1 ${seek.where} ORDER BY ${keys.map((k) => `${k.sql} ${k.direction}`).join(',')} ${seek.limitSql}`,
    [...seek.selectParams, ...branches.flatMap((b) => b.params), ...seek.whereParams, ...seek.limitParams],
  );
  const anchors = takeSearchSeekRows(rows),
    page = rows.slice(0, limit);
  return {
    rows: page,
    hasMore: rows.length > limit,
    nextCursor:
      rows.length > limit
        ? { type: 'all', offset: offset + page.length, seek: { v: 1, scope, values: anchors[page.length - 1] } }
        : null,
  };
}
async function hydrate(db, user, rows, options, lang) {
  const byKey = new Map();
  const groups = new Map();
  for (const r of rows)
    if (r.origin === 'personal') {
      if (!groups.has(r.type)) groups.set(r.type, []);
      groups.get(r.type).push(r.id);
    }
  const personal = [...groups].map(async ([type, ids]) => {
    const result = await SEARCH_QUERY_BY_TYPE[type](
      user.id,
      { ...options, database: db, materialIds: ids, pageSize: ids.length, offset: 0 },
      lang,
      true,
      false,
    );
    for (const item of result.items) byKey.set(`personal:${type}:${item.id}`, { ...item, origin: 'personal' });
  });
  const ids = rows.filter((r) => r.origin === 'public').map((r) => r.id);
  const published = async () => {
    if (!ids.length) return;
    // Recheck visibility after ranking. Only summaries leave MySQL for list rows.
    const [items] = await db.query(
      `SELECT ${readSummaryColumns} ${readJoins} WHERE p.public_id IN (${ids.map(() => '?').join(',')}) AND ${visibleSql()}`,
      [...ids, user.id, user.id],
    );
    for (const row of items) {
      const resource = dto(row);
      byKey.set(`public:${row.kind}:${row.public_id}`, {
        origin: 'public',
        id: row.public_id,
        type: row.kind,
        title: row.title,
        description: resource.summary,
        route: `/public-resources/${row.public_id}`,
        publicResource: resource,
      });
    }
  };
  await Promise.all([...personal, published()]);
  return rows.flatMap((r) => {
    const item = byKey.get(`${r.origin}:${r.type}:${r.id}`);
    return item ? [{ ...item, matchReason: relevanceReason(r.score), snippet: item.description || '' }] : [];
  });
}
async function metadata(db, user, options, source) {
  const branches = combinedBranches(
    user,
    GLOBAL_SEARCH_TYPES.filter((t) => t !== 'tag'),
    options,
    source,
  );
  // One round trip for exact counts; each branch still covers its complete visible set.
  const countsPromise = db.query(
    branches
      .map(
        (branch) =>
          `SELECT ? AS type,? AS origin,COUNT(*) AS count FROM ${branch.filter.fromSql} WHERE ${branch.filter.whereSql}`,
      )
      .join(' UNION ALL '),
    branches.flatMap((branch) => [branch.type, branch.origin, ...branch.filter.params]),
  );
  const [[counts], tagOptions, tagMatches] = await Promise.all([
    countsPromise,
    querySearchTagOptions(user.id, db),
    options.keyword && source !== 'public'
      ? queryTagMatches(db, { userId: user.id, keyword: options.keyword, limit: 8 })
      : [],
  ]);
  const typeTotals = Object.fromEntries(GLOBAL_SEARCH_TYPES.map((t) => [t, 0])),
    personalTypeTotals = { ...typeTotals };
  let publicTotal = 0,
    personalTotal = 0;
  for (const row of counts) {
    const count = Number(row.count);
    typeTotals[row.type] += count;
    if (row.origin === 'public') publicTotal += count;
    else {
      personalTotal += count;
      personalTypeTotals[row.type] += count;
    }
  }
  return {
    total: Object.values(typeTotals).reduce((sum, count) => sum + count, 0),
    typeTotals,
    personalTypeTotals,
    publicTotal,
    personalTotal,
    tagOptions,
    tagMatches,
  };
}
export async function combinedSearch({ user, input = {}, db = pool, env = process.env, lang = 'zh-CN' }) {
  await access(db, user);
  await ready(db, env);
  db = searchQueryScope(db);
  fields(input, [
    'keyword',
    'types',
    'type',
    'sort',
    'date',
    'tags',
    'untagged',
    'fileExtensions',
    'todoStatus',
    'todoPriorities',
    'todoDue',
    'cursor',
    'pageSize',
    'includeMetadata',
    'mode',
    'suggestLayout',
    'sourceType',
    'source',
  ]);
  const keyword = String(input.keyword || '').trim();
  if (keyword.length > 200) fail('INVALID_INPUT');
  const types = normalizeSearchTypes(input.types, input.type),
    source = input.source || 'all';
  if (!['all', 'personal', 'public'].includes(source)) fail('INVALID_INPUT');
  const mode = input.mode === 'suggest' ? 'suggest' : 'full';
  const selected = mode === 'full' ? types.filter((t) => t !== 'tag') : types;
  const options = {
    keyword,
    sort: normalizeSearchSort(input.sort),
    date: normalizeSearchDate(input.date),
    tagNames: normalizeSearchTagNames(input.tags),
    untagged: input.untagged === true,
    fileExtensions: Array.isArray(input.fileExtensions)
      ? input.fileExtensions.filter((v) => typeof v === 'string' && /^[a-z0-9]{1,10}$/.test(v)).slice(0, 20)
      : [],
    todoStatus: input.todoStatus,
    todoPriorities: input.todoPriorities,
    todoDue: input.todoDue,
  };
  if (mode === 'suggest') {
    const groupLimit = keyword ? 5 : 3,
      grouped = input.suggestLayout === 'grouped';
    const pages = await Promise.all(
      selected.map((type) =>
        rankedPage(db, user, [type], { ...options, sort: 'relevance' }, { source, limit: grouped ? groupLimit : 8 }),
      ),
    );
    const hasMore = pages.some((page) => page.hasMore);
    const rows = pages.flatMap((page) =>
      page.rows.map((row, index) => ({ ...row, _rank: index, _boost: row.type === input.sourceType ? 3 : 0 })),
    );
    rows.sort(
      (a, b) =>
        b.score + b._boost - (a.score + a._boost) ||
        a._rank - b._rank ||
        selected.indexOf(a.type) - selected.indexOf(b.type),
    );
    const picked = grouped ? rows : diversifySuggestItems(rows, 8, 3);
    const items = await hydrate(db, user, picked, options, lang);
    return { keyword, items, groups: groupItems(items, lang), hasMore: hasMore || rows.length > picked.length };
  }
  if (input.cursor && (!input.cursor.seek || typeof input.cursor !== 'object')) fail('CURSOR_INVALID');
  const limit = Math.max(1, Math.min(40, Math.trunc(Number(input.pageSize) || 40))),
    offset = Math.max(0, Math.trunc(Number(input.cursor?.offset) || 0));
  const results = async () => {
    const page = await rankedPage(db, user, selected, options, { source, limit, cursor: input.cursor, offset });
    return {
      keyword,
      items: await hydrate(db, user, page.rows, options, lang),
      pageSize: limit,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  };
  const [result, totals] = await Promise.all([
    results(),
    input.includeMetadata !== false ? metadata(db, user, options, source) : {},
  ]);
  return Object.assign(result, totals);
}

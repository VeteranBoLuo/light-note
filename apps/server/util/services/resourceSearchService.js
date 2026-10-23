import pool from '../../db/index.js';
import { buildRelevantSearchQuery, relevanceReason } from '../searchRelevancePagination.js';
import {
  searchSeekScope,
  searchOrderKeys,
  buildSearchSeek,
  searchSeekIndexHint,
  takeSearchSeekRows,
} from '../searchSeekPagination.js';
import { formatDateTime } from '../dateTime.js';
import { resolveFileCategory } from '../fileCategory.js';
import { resolveOwnedNoteSearchMetadata } from './noteTreeService.js';
import { appendResourceTagFilters } from './resourceInventoryService.js';

export const SEARCH_TYPES = ['bookmark', 'note', 'file', 'tag'];

export const GLOBAL_SEARCH_TYPES = [...SEARCH_TYPES, 'todo'];

export const BATCH_EDITABLE_TYPES = ['bookmark', 'note', 'file'];

export const SUGGEST_TOTAL_LIMIT = 8;

export const SUGGEST_PER_TYPE_LIMIT = 3;

export const TODO_STATUSES = ['pending', 'completed'];

export const TODO_DUE_FILTERS = ['overdue', 'today', '7d', 'none'];

export const TYPE_LABELS = {
  'zh-CN': {
    bookmark: '书签',
    note: '笔记',
    file: '文件',
    tag: '标签',
    todo: '待办',
  },
  'en-US': {
    bookmark: 'Bookmarks',
    note: 'Notes',
    file: 'Files',
    tag: 'Tags',
    todo: 'Todos',
  },
};

export const SEARCH_TEXTS = {
  'zh-CN': {
    unnamedBookmark: '未命名书签',
    unnamedNote: '未命名文档',
    unnamedFile: '未命名文件',
    unnamedTag: '未命名标签',
    openNote: '打开笔记查看正文内容',
    fileInFolder: '位于 {folder}',
    cloudFile: '云空间文件',
    tagDescription: '查看该标签下关联的书签与内容',
    relatedBookmarks: '{count} 个关联内容',
    unnamedTodo: '未命名待办',
    todoPending: '未完成',
    todoCompleted: '已完成',
    todoOverdue: '已逾期',
    todoNoDue: '无截止时间',
    todoPriorityLow: '低优先级',
    todoPriorityNormal: '中优先级',
    todoPriorityHigh: '高优先级',
    todoReferences: '参考资料 {count}',
  },
  'en-US': {
    unnamedBookmark: 'Untitled Bookmark',
    unnamedNote: 'Untitled Note',
    unnamedFile: 'Untitled File',
    unnamedTag: 'Untitled Tag',
    openNote: 'Open the note to view its content',
    fileInFolder: 'In {folder}',
    cloudFile: 'Cloud file',
    tagDescription: 'View bookmarks and content associated with this tag',
    relatedBookmarks: '{count} related items',
    unnamedTodo: 'Untitled Todo',
    todoPending: 'Pending',
    todoCompleted: 'Completed',
    todoOverdue: 'Overdue',
    todoNoDue: 'No due date',
    todoPriorityLow: 'Low priority',
    todoPriorityNormal: 'Normal priority',
    todoPriorityHigh: 'High priority',
    todoReferences: '{count} references',
  },
};

export const FILE_CATEGORY_LABELS = {
  'zh-CN': {
    image: '图片',
    video: '视频',
    audio: '音频',
    pdf: 'PDF',
    word: 'Word',
    excel: 'Excel',
    ppt: 'PPT',
    text: '文本',
    compress: '压缩包',
    other: '其他',
  },
  'en-US': {
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    pdf: 'PDF',
    word: 'Word',
    excel: 'Excel',
    ppt: 'PPT',
    text: 'Text',
    compress: 'Compress',
    other: 'Other',
  },
};

export function toText(value) {
  return String(value ?? '').trim();
}

export function stripHtml(value) {
  return toText(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSnippet(text, keyword, len = 140) {
  const plain = toText(text);
  const kw = toText(keyword);
  if (!kw) return plain.slice(0, len);
  const idx = plain.toLowerCase().indexOf(kw.toLowerCase());
  if (idx < 0) return plain.slice(0, len);
  const start = Math.max(0, idx - Math.floor(len / 3));
  let snip = plain.slice(start, start + len);
  if (start > 0) snip = '…' + snip;
  if (start + len < plain.length) snip = snip + '…';
  return snip;
}

export function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date) return formatDateTime(value).slice(0, 10); // 本地时区,避免 UTC 差一天
  const text = toText(value);
  return text.length > 10 ? text.slice(0, 10) : text;
}

export function normalizeLimit(value, fallback = 12, max = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export function normalizePage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(Math.floor(parsed), 1_000_000);
}

export function normalizeSearchOffset(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Math.floor(parsed), 10_000_000);
}

export function normalizeSearchType(value, allowedTypes = GLOBAL_SEARCH_TYPES) {
  const type = toText(value);
  return allowedTypes.includes(type) ? type : 'all';
}

export function normalizeSearchTypes(value, legacyType) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const selected = [...new Set(values.map((item) => normalizeSearchType(item)).filter((type) => type !== 'all'))];
  if (selected.length) return GLOBAL_SEARCH_TYPES.filter((type) => selected.includes(type));
  const legacy = normalizeSearchType(legacyType);
  return legacy === 'all' ? [...SEARCH_TYPES] : [legacy];
}

export function normalizeOrderedCursor(value, selectedTypes) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rawType = normalizeSearchType(raw.type);
  if (selectedTypes.length === 1) {
    const selectedType = selectedTypes[0];
    return {
      type: selectedType,
      ...(raw.seek ? { seek: raw.seek } : {}),
      offset: rawType === selectedType || rawType === 'all' ? normalizeSearchOffset(raw.offset) : 0,
    };
  }
  return {
    type: selectedTypes.includes(rawType) ? rawType : selectedTypes[0],
    ...(raw.seek ? { seek: raw.seek } : {}),
    offset: normalizeSearchOffset(raw.offset),
  };
}

export function searchItemRelevance(item, keyword) {
  const query = toText(keyword).toLowerCase();
  if (!query) return { score: 0, reason: '' };
  const title = toText(item.title).toLowerCase();
  const description = toText(item.description).toLowerCase();
  const url = toText(item.url || item.raw?.url).toLowerCase();
  const tags = (Array.isArray(item.tags) ? item.tags : [])
    .map((tag) => toText(tag?.name || tag))
    .join(' ')
    .toLowerCase();
  // 未完成待办只在同一匹配档位内轻微提前(档位间隔 10 以上),
  // 不会让低相关度的未完成待办压过标题完全匹配的已完成待办。
  const pending = item.type === 'todo' && toText(item.status) === 'pending' ? 2 : 0;
  if (title === query) return { score: 100 + pending, reason: 'title_exact' };
  if (title.startsWith(query)) return { score: 80 + pending, reason: 'title_prefix' };
  if (title.includes(query)) return { score: 60 + pending, reason: 'title' };
  if (tags.includes(query)) return { score: 50 + pending, reason: 'tag' };
  if (url.includes(query)) return { score: 40 + pending, reason: 'url' };
  if (description.includes(query)) return { score: 30 + pending, reason: 'description' };
  return { score: 10 + pending, reason: 'content' };
}

export async function queryRelevantSearchItems({
  userId,
  options,
  lang,
  cursor,
  offset,
  pageSize,
  selectedTypes = SEARCH_TYPES,
}) {
  const db = options.database || pool;
  const query = buildRelevantSearchQuery({
    userId,
    options,
    selectedTypes,
    cursor,
    offset,
    pageSize,
    definitions: SEARCH_ORDER_DEFINITIONS,
    filters: Object.fromEntries(selectedTypes.map((type) => [type, SEARCH_FILTER_BY_TYPE[type](userId, options)])),
  });
  const [rows] = await db.query(query.sql, query.params);
  const anchors = takeSearchSeekRows(rows);
  const page = rows.slice(0, pageSize);
  const hydrated = await Promise.all(
    selectedTypes.map((type) => {
      const ids = page.filter((item) => item.type === type).map((item) => item.id);
      return ids.length
        ? SEARCH_QUERY_BY_TYPE[type](
            userId,
            { ...options, materialIds: ids, pageSize: ids.length, offset: 0 },
            lang,
            true,
            false,
          )
        : { items: [] };
    }),
  );
  const byKey = new Map(hydrated.flatMap((result) => result.items).map((item) => [`${item.type}:${item.id}`, item]));
  return {
    items: page.flatMap((row) => {
      const item = byKey.get(`${row.type}:${row.id}`);
      return item ? [{ ...item, matchReason: relevanceReason(row.score), snippet: item.description || '' }] : [];
    }),
    nextCursor:
      rows.length > pageSize
        ? {
            type: 'all',
            offset: offset + page.length,
            seek: { v: 1, scope: query.scope, values: anchors[page.length - 1] },
          }
        : null,
  };
}

export function normalizeSearchSort(value) {
  const sort = toText(value);
  return ['relevance', 'updated', 'name'].includes(sort) ? sort : 'relevance';
}

export function normalizeSearchDate(value) {
  const date = toText(value);
  return ['7d', '30d', '365d'].includes(date) ? date : 'all';
}

export function normalizeSearchTagNames(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => toText(item).slice(0, 255)).filter(Boolean))].slice(0, 24);
}

export function buildDateCondition(column, date) {
  const days = {
    '7d': 7,
    '30d': 30,
    '365d': 365,
  }[date];
  return days ? `${column} >= DATE_SUB(NOW(), INTERVAL ${days} DAY)` : '';
}

export const SEARCH_ORDER_DEFINITIONS = {
  bookmark: {
    titleColumn: 'b.name',
    updatedColumn: 'b.create_time',
    fallbackOrder: 'b.is_top DESC, b.sort, b.create_time DESC',
    idColumn: 'b.id',
    pin: 'b.is_top',
    position: 'b.sort',
    description: 'b.description',
    url: 'b.url',
  },
  note: {
    titleColumn: 'n.title',
    updatedColumn: 'COALESCE(n.update_time, n.create_time)',
    fallbackOrder: 'n.is_top DESC, n.sort, COALESCE(n.update_time, n.create_time) DESC',
    idColumn: 'n.id',
    pin: 'n.is_top',
    position: 'n.sort',
    description: "IF(n.type = 'drawing', '', n.content)",
  },
  file: {
    titleColumn: 'files.file_name',
    updatedColumn: 'files.create_time',
    fallbackOrder: 'files.create_time DESC',
    idColumn: 'files.id',
    description: 'folders.name',
  },
  tag: {
    titleColumn: 't.name',
    updatedColumn: 't.create_time',
    fallbackOrder: 't.sort, t.create_time DESC',
    idColumn: 't.id',
    position: 't.sort',
    description: 't.description',
  },
  todo: {
    titleColumn: 't.title',
    updatedColumn: 't.update_time',
    fallbackOrder: "(t.status = 'pending') DESC, t.due_at IS NULL ASC, t.due_at ASC, t.update_time DESC",
    idColumn: 't.id',
    pin: "(t.status = 'pending')",
    description: 't.description',
  },
};

export function buildSearchOrder(input) {
  const keys = searchOrderKeys(input);
  return {
    keys,
    sql: keys.map((key) => `${key.sql} ${key.direction}`).join(', '),
    params: keys.flatMap((key) => key.params || []),
  };
}

export function groupItems(items, lang) {
  const labels = TYPE_LABELS[normalizeLang(lang)];
  return GLOBAL_SEARCH_TYPES.map((type) => ({
    type,
    label: labels[type],
    items: items.filter((item) => item.type === type),
  })).filter((group) => group.items.length > 0);
}

export function buildLike(keyword) {
  return `%${keyword}%`;
}

export function normalizeLang(value) {
  return value === 'en-US' ? 'en-US' : 'zh-CN';
}

export function formatFileSizeMb(value) {
  if (!value) return '';
  return `${(Number(value) / 1024 / 1024).toFixed(2)} MB`;
}

export function formatFileSearchExtra(item, lang) {
  const category = resolveFileCategory({
    fileName: item.file_name,
    fileType: item.file_type,
  });
  const categoryLabel = FILE_CATEGORY_LABELS[normalizeLang(lang)][category] || FILE_CATEGORY_LABELS['zh-CN'].other;
  const size = formatFileSizeMb(item.file_size);
  return [categoryLabel, size].filter(Boolean).join(' · ');
}

export function getSearchText(lang) {
  return SEARCH_TEXTS[normalizeLang(lang)];
}

export function formatText(template, params = {}) {
  return Object.entries(params).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template);
}

export function buildBookmarkSearchFilter(userId, options) {
  const { keyword, tagNames, untagged, date } = options;
  const where = ['b.user_id = ?', 'b.del_flag = 0'];
  const params = [userId];
  if (options.materialIds?.length) {
    where.push(`b.id IN (${options.materialIds.map(() => '?').join(',')})`);
    params.push(...options.materialIds);
  }
  const like = buildLike(keyword);
  if (keyword) {
    where.push(`
      (
        b.name LIKE ?
        OR b.description LIKE ?
        OR b.url LIKE ?
        OR EXISTS (
          SELECT 1
          FROM resource_tag_relations keyword_rel
          INNER JOIN tag keyword_tag ON keyword_tag.id = keyword_rel.tag_id
          WHERE keyword_rel.resource_type = 'bookmark'
            AND keyword_rel.resource_id = b.id
            AND keyword_rel.user_id = ?
            AND keyword_tag.user_id = ?
            AND keyword_tag.del_flag = 0
            AND keyword_tag.name LIKE ?
        )
      )
    `);
    params.push(like, like, like, userId, userId, like);
  }
  appendResourceTagFilters({
    where,
    params,
    alias: 'b',
    resourceType: 'bookmark',
    tagNames,
    untagged,
    userId,
  });
  const dateCondition = buildDateCondition('b.create_time', date);
  if (dateCondition) where.push(dateCondition);
  return { fromSql: 'bookmark b', idColumn: 'b.id', whereSql: where.join(' AND '), params };
}

export function buildNoteSearchFilter(userId, options) {
  const { keyword, tagNames, untagged, date } = options;
  const where = ['n.create_by = ?', 'n.del_flag = 0'];
  const params = [userId];
  if (options.materialIds?.length) {
    where.push(`n.id IN (${options.materialIds.map(() => '?').join(',')})`);
    params.push(...options.materialIds);
  }
  const like = buildLike(keyword);
  if (keyword) {
    where.push(`
      (
        n.title LIKE ?
        OR (COALESCE(n.type, 'html') <> 'drawing' AND n.content LIKE ?)
        OR EXISTS (
          SELECT 1
          FROM resource_tag_relations keyword_rel
          INNER JOIN tag keyword_tag ON keyword_tag.id = keyword_rel.tag_id
          WHERE keyword_rel.resource_type = 'note'
            AND keyword_rel.resource_id = n.id
            AND keyword_rel.user_id = ?
            AND keyword_tag.user_id = ?
            AND keyword_tag.del_flag = 0
            AND keyword_tag.name LIKE ?
        )
      )
    `);
    params.push(like, like, userId, userId, like);
  }
  appendResourceTagFilters({
    where,
    params,
    alias: 'n',
    resourceType: 'note',
    tagNames,
    untagged,
    userId,
  });
  const dateCondition = buildDateCondition('COALESCE(n.update_time, n.create_time)', date);
  if (dateCondition) where.push(dateCondition);
  return { fromSql: 'note n', idColumn: 'n.id', whereSql: where.join(' AND '), params };
}

export function buildFileSearchFilter(userId, options) {
  const { keyword, tagNames, untagged, date } = options;
  const where = ['files.create_by = ?', 'files.del_flag = 0'];
  const params = [userId];
  if (options.fileExtensions?.length) {
    where.push(
      `LOWER(SUBSTRING_INDEX(files.file_name, '.', -1)) IN (${options.fileExtensions.map(() => '?').join(',')})`,
    );
    params.push(...options.fileExtensions);
  }
  if (options.materialIds?.length) {
    where.push(`files.id IN (${options.materialIds.map(() => '?').join(',')})`);
    params.push(...options.materialIds);
  }
  const like = buildLike(keyword);
  if (keyword) {
    where.push(`
      (
        files.file_name LIKE ?
        OR files.file_type LIKE ?
        OR folders.name LIKE ?
        OR EXISTS (
          SELECT 1
          FROM resource_tag_relations keyword_rel
          INNER JOIN tag keyword_tag ON keyword_tag.id = keyword_rel.tag_id
          WHERE keyword_rel.resource_type = 'file'
            AND keyword_rel.resource_id = files.id
            AND keyword_rel.user_id = ?
            AND keyword_tag.user_id = ?
            AND keyword_tag.del_flag = 0
            AND keyword_tag.name LIKE ?
        )
      )
    `);
    params.push(like, like, like, userId, userId, like);
  }
  appendResourceTagFilters({
    where,
    params,
    alias: 'files',
    resourceType: 'file',
    tagNames,
    untagged,
    userId,
  });
  const dateCondition = buildDateCondition('files.create_time', date);
  if (dateCondition) where.push(dateCondition);
  return {
    fromSql: 'files LEFT JOIN folders ON files.folder_id = folders.id',
    idColumn: 'files.id',
    whereSql: where.join(' AND '),
    params,
  };
}

export function buildTagSearchFilter(userId, options) {
  const { keyword, tagNames, untagged, date } = options;
  const where = ['t.user_id = ?', 't.del_flag = 0'];
  const params = [userId];
  if (options.materialIds?.length) {
    where.push(`t.id IN (${options.materialIds.map(() => '?').join(',')})`);
    params.push(...options.materialIds);
  }
  if (keyword) {
    where.push('(t.name LIKE ? OR t.description LIKE ?)');
    const like = buildLike(keyword);
    params.push(like, like);
  }
  if (tagNames.length) {
    where.push(`t.name IN (${tagNames.map(() => '?').join(', ')})`);
    params.push(...tagNames);
  }
  if (untagged) where.push('1 = 0');
  const dateCondition = buildDateCondition('t.create_time', date);
  if (dateCondition) where.push(dateCondition);
  return { fromSql: 'tag t', idColumn: 't.id', whereSql: where.join(' AND '), params };
}

export const SEARCH_FILTER_BY_TYPE = {
  bookmark: buildBookmarkSearchFilter,
  note: buildNoteSearchFilter,
  file: buildFileSearchFilter,
  tag: buildTagSearchFilter,
  todo: buildTodoSearchFilter,
};

export async function queryBookmarks(userId, options, lang, includeItems, includeTotal = true) {
  const db = options.database || pool;
  const { keyword, sort } = options;
  const { whereSql, params } = buildBookmarkSearchFilter(userId, options);
  const countPromise = includeTotal
    ? db.query(`SELECT COUNT(*) AS total FROM bookmark b WHERE ${whereSql}`, params)
    : null;

  let rows = [];
  if (includeItems) {
    const order = buildSearchOrder({ sort, keyword, ...SEARCH_ORDER_DEFINITIONS.bookmark });
    const seek = buildSearchSeek(order.keys, options);
    const [result] = await db.query(
      `
        SELECT ${seek.projection}
          b.*,
          (
            SELECT JSON_ARRAYAGG(JSON_OBJECT('id', t.id, 'name', t.name))
            FROM tag t
            INNER JOIN resource_tag_relations tb
              ON t.id = tb.tag_id AND tb.resource_type = 'bookmark'
            WHERE tb.resource_id = b.id
              AND tb.user_id = ?
              AND t.user_id = ?
              AND t.del_flag = 0
          ) AS tag_list
        FROM bookmark b ${searchSeekIndexHint('bookmark', options)}
        WHERE ${whereSql}${seek.where}
        ORDER BY ${order.sql}
        ${seek.limitSql}
      `,
      [...seek.selectParams, userId, userId, ...params, ...seek.whereParams, ...order.params, ...seek.limitParams],
    );
    rows = result;
  }
  const [totalRows] = countPromise ? await countPromise : [[]];
  const text = getSearchText(lang);
  const seekValues = takeSearchSeekRows(rows);
  return {
    seekValues,
    total: Number(totalRows?.[0]?.total || 0),
    items: rows.map((item) => ({
      id: toText(item.id),
      type: 'bookmark',
      title: toText(item.name) || text.unnamedBookmark,
      description: buildSnippet(toText(item.description) || toText(item.url), keyword),
      extra: '',
      tags: Array.isArray(item.tag_list) ? item.tag_list : [],
      url: toText(item.url),
      route: '/home',
      iconUrl: item.icon_url || '',
      raw: item,
    })),
  };
}

export async function queryNotes(userId, options, lang, includeItems, includeTotal = true) {
  const db = options.database || pool;
  const { keyword, sort } = options;
  const { whereSql, params } = buildNoteSearchFilter(userId, options);
  const countPromise = includeTotal ? db.query(`SELECT COUNT(*) AS total FROM note n WHERE ${whereSql}`, params) : null;

  let rows = [];
  let treeMetadata = new Map();
  if (includeItems) {
    const order = buildSearchOrder({ sort, keyword, ...SEARCH_ORDER_DEFINITIONS.note });
    const seek = buildSearchSeek(order.keys, options);
    const [result] = await db.query(
      `
        SELECT ${seek.projection}
          n.id,
          n.title,
          IF(n.type = 'drawing', '', n.content) AS content,
          n.create_by,
          n.update_by,
          n.del_flag,
          n.sort,
          n.is_top,
          n.create_time,
          n.update_time,
          n.deleted_at,
          n.type,
          n.revision,
          n.parent_id,
          n.tree_delete_batch_id,
          (
            SELECT JSON_ARRAYAGG(JSON_OBJECT('id', nt.id, 'name', nt.name))
            FROM resource_tag_relations ntr
            INNER JOIN tag nt ON ntr.tag_id = nt.id
            WHERE ntr.resource_type = 'note'
              AND ntr.resource_id = n.id
              AND ntr.user_id = ?
              AND nt.user_id = ?
              AND nt.del_flag = 0
          ) AS tags
        FROM note n
        WHERE ${whereSql}${seek.where}
        ORDER BY ${order.sql}
        ${seek.limitSql}
      `,
      [...seek.selectParams, userId, userId, ...params, ...seek.whereParams, ...order.params, ...seek.limitParams],
    );
    rows = result;
    // Paths and subtree counts are scoped to the returned page; descendants are never hydrated as search results.
    treeMetadata = await resolveOwnedNoteSearchMetadata({ userId, noteIds: rows.map((row) => row.id), db });
  }
  const [totalRows] = countPromise ? await countPromise : [[]];
  const text = getSearchText(lang);
  const seekValues = takeSearchSeekRows(rows);
  return {
    seekValues,
    total: Number(totalRows?.[0]?.total || 0),
    items: rows.map((item) => {
      const id = toText(item.id);
      const metadata = treeMetadata.get(id);
      const path = (metadata?.items || [])
        .slice(0, -1)
        .map((node) => toText(node.title) || text.unnamedNote)
        .join(' / ');
      const childCount = metadata?.childCount || 0;
      const descendantCount = metadata?.descendantCount || 0;
      return {
        id,
        type: 'note',
        title: toText(item.title) || text.unnamedNote,
        description:
          item.type === 'drawing' ? text.openNote : buildSnippet(stripHtml(item.content), keyword) || text.openNote,
        extra: normalizeDate(item.update_time || item.create_time),
        tags: Array.isArray(item.tags) ? item.tags : [],
        route: `/noteLibrary/${item.id}`,
        path,
        childCount,
        descendantCount,
        raw: item,
      };
    }),
  };
}

export async function queryFiles(userId, options, lang, includeItems, includeTotal = true) {
  const db = options.database || pool;
  const { keyword, sort } = options;
  const { whereSql, params } = buildFileSearchFilter(userId, options);
  const countPromise = includeTotal
    ? db.query(
        `SELECT COUNT(*) AS total FROM files LEFT JOIN folders ON files.folder_id = folders.id WHERE ${whereSql}`,
        params,
      )
    : null;

  let rows = [];
  if (includeItems) {
    const order = buildSearchOrder({ sort, keyword, ...SEARCH_ORDER_DEFINITIONS.file });
    const seek = buildSearchSeek(order.keys, options);
    const [result] = await db.query(
      `
        SELECT ${seek.projection} files.*, folders.name AS folder_name,
          (
            SELECT JSON_ARRAYAGG(JSON_OBJECT('id', ft.id, 'name', ft.name))
            FROM resource_tag_relations ftr
            INNER JOIN tag ft ON ftr.tag_id = ft.id
            WHERE ftr.resource_type = 'file'
              AND ftr.resource_id = files.id
              AND ftr.user_id = ?
              AND ft.user_id = ?
              AND ft.del_flag = 0
          ) AS tags
        FROM files ${searchSeekIndexHint('file', options)}
        LEFT JOIN folders ON files.folder_id = folders.id
        WHERE ${whereSql}${seek.where}
        ORDER BY ${order.sql}
        ${seek.limitSql}
      `,
      [...seek.selectParams, userId, userId, ...params, ...seek.whereParams, ...order.params, ...seek.limitParams],
    );
    rows = result;
  }
  const [totalRows] = countPromise ? await countPromise : [[]];
  const text = getSearchText(lang);
  const seekValues = takeSearchSeekRows(rows);
  return {
    seekValues,
    total: Number(totalRows?.[0]?.total || 0),
    items: rows.map((item) => ({
      id: toText(item.id),
      type: 'file',
      title: toText(item.file_name) || text.unnamedFile,
      description: item.folder_name ? formatText(text.fileInFolder, { folder: item.folder_name }) : text.cloudFile,
      category: resolveFileCategory({
        fileName: item.file_name,
        fileType: item.file_type,
      }),
      tags: Array.isArray(item.tags) ? item.tags : [],
      extra: formatFileSearchExtra(item, lang),
      route: '/cloudSpace',
      raw: item,
    })),
  };
}

export async function queryTags(userId, options, lang, includeItems, includeTotal = true) {
  const db = options.database || pool;
  const { keyword, sort } = options;
  const { whereSql, params } = buildTagSearchFilter(userId, options);
  const countPromise = includeTotal ? db.query(`SELECT COUNT(*) AS total FROM tag t WHERE ${whereSql}`, params) : null;

  let rows = [];
  if (includeItems) {
    const order = buildSearchOrder({ sort, keyword, ...SEARCH_ORDER_DEFINITIONS.tag });
    const seek = buildSearchSeek(order.keys, options);
    const [result] = await db.query(
      `
        SELECT ${seek.projection} t.*, COUNT(r.resource_id) AS resource_count
        FROM tag t
        LEFT JOIN resource_tag_relations r ON t.id = r.tag_id AND r.user_id = ?
        WHERE ${whereSql}${seek.where}
        GROUP BY t.id
        ORDER BY ${order.sql}
        ${seek.limitSql}
      `,
      [...seek.selectParams, userId, ...params, ...seek.whereParams, ...order.params, ...seek.limitParams],
    );
    rows = result;
  }
  const [totalRows] = countPromise ? await countPromise : [[]];
  const text = getSearchText(lang);
  const seekValues = takeSearchSeekRows(rows);
  return {
    seekValues,
    total: Number(totalRows?.[0]?.total || 0),
    items: rows.map((item) => ({
      id: toText(item.id),
      type: 'tag',
      title: toText(item.name) || text.unnamedTag,
      description: toText(item.description) || text.tagDescription,
      extra: formatText(text.relatedBookmarks, { count: Number(item.resource_count || 0) }),
      route: `/tag/${item.id}`,
      iconUrl: item.icon_url,
      raw: item,
    })),
  };
}

export function normalizeTodoStatus(value) {
  const status = toText(value);
  return TODO_STATUSES.includes(status) ? status : 'all';
}

export function normalizeTodoPriorities(value) {
  if (!Array.isArray(value)) return [];
  const selected = [...new Set(value.map((item) => Number(item)).filter((item) => [0, 1, 2].includes(item)))];
  return selected.length === 3 ? [] : selected.sort();
}

export function normalizeTodoDue(value) {
  const due = toText(value);
  return TODO_DUE_FILTERS.includes(due) ? due : 'all';
}

export function buildTodoDueCondition(due) {
  if (due === 'overdue') return "t.due_at IS NOT NULL AND t.due_at < NOW() AND t.status = 'pending'";
  if (due === 'today') return 't.due_at IS NOT NULL AND DATE(t.due_at) = CURDATE()';
  if (due === '7d')
    return 't.due_at IS NOT NULL AND t.due_at >= NOW() AND t.due_at < DATE_ADD(CURDATE(), INTERVAL 8 DAY)';
  if (due === 'none') return 't.due_at IS NULL';
  return '';
}

export function formatTodoDueText(dueAt) {
  if (!dueAt) return '';
  const date = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(date.getTime())) return '';
  return formatDateTime(date).slice(0, 16);
}

export function buildTodoExtra(item, text) {
  const parts = [];
  const isPending = toText(item.status) !== 'completed';
  const dueText = formatTodoDueText(item.due_at);
  const overdue = isPending && item.due_at && new Date(item.due_at).getTime() < Date.now();
  parts.push(overdue ? text.todoOverdue : isPending ? text.todoPending : text.todoCompleted);
  parts.push(dueText || text.todoNoDue);
  if (Number(item.priority) === 2) parts.push(text.todoPriorityHigh);
  else if (Number(item.priority) === 0) parts.push(text.todoPriorityLow);
  const referenceCount = Number(item.reference_count || 0);
  if (referenceCount > 0) parts.push(formatText(text.todoReferences, { count: referenceCount }));
  return parts.filter(Boolean).join(' · ');
}

export function buildTodoSearchFilter(userId, options) {
  const { keyword, tagNames, untagged, date } = options;
  const todoStatus = normalizeTodoStatus(options.todoStatus);
  const todoPriorities = normalizeTodoPriorities(options.todoPriorities);
  const todoDue = normalizeTodoDue(options.todoDue);
  const where = ['t.user_id = ?', 't.del_flag = 0'];
  const params = [userId];
  if (options.materialIds?.length) {
    where.push(`t.id IN (${options.materialIds.map(() => '?').join(',')})`);
    params.push(...options.materialIds);
  }
  if (keyword) {
    const like = buildLike(keyword);
    where.push(
      `(t.title LIKE ? OR t.description LIKE ? OR EXISTS (SELECT 1 FROM todo_tag_relations tr INNER JOIN tag tg ON tg.id = tr.tag_id AND tg.user_id = tr.user_id AND tg.del_flag = 0 WHERE tr.target_type = 'todo' AND tr.target_id = t.id AND tr.user_id = t.user_id AND tg.name LIKE ?))`,
    );
    params.push(like, like, like);
  }
  // 全局搜索沿用资料的任一标签命中语义；工作区采用全部标签命中。
  const tagExists = `SELECT 1 FROM todo_tag_relations tr INNER JOIN tag tg ON tg.id = tr.tag_id AND tg.user_id = tr.user_id AND tg.del_flag = 0 WHERE tr.target_type = 'todo' AND tr.target_id = t.id AND tr.user_id = t.user_id`;
  if (tagNames.length) {
    where.push(`EXISTS (${tagExists} AND tg.name IN (${tagNames.map(() => '?').join(', ')}))`);
    params.push(...tagNames);
  }
  if (untagged) where.push(`NOT EXISTS (${tagExists})`);
  if (todoStatus !== 'all') {
    where.push('t.status = ?');
    params.push(todoStatus);
  }
  if (todoPriorities.length) {
    where.push(`t.priority IN (${todoPriorities.map(() => '?').join(', ')})`);
    params.push(...todoPriorities);
  }
  const dueCondition = buildTodoDueCondition(todoDue);
  if (dueCondition) where.push(dueCondition);
  const dateCondition = buildDateCondition('t.update_time', date);
  if (dateCondition) where.push(dateCondition);
  const whereSql = where.join(' AND ');
  return { fromSql: 'todo_items t', idColumn: 't.id', whereSql, params };
}

export async function queryTodos(userId, options, lang, includeItems, includeTotal = true) {
  const db = options.database || pool;
  const { keyword, sort } = options;
  const { whereSql, params } = buildTodoSearchFilter(userId, options);
  const countPromise = includeTotal
    ? db.query(`SELECT COUNT(*) AS total FROM todo_items t WHERE ${whereSql}`, params)
    : null;

  let rows = [];
  if (includeItems) {
    const order = buildSearchOrder({ sort, keyword, ...SEARCH_ORDER_DEFINITIONS.todo });
    const seek = buildSearchSeek(order.keys, options);
    const [result] = await db.query(
      `
        SELECT ${seek.projection}
          t.id,
          t.title,
          t.description,
          t.status,
          t.priority,
          t.due_at,
          t.completed_at,
          t.update_time,
          (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', tg.id, 'name', tg.name)) FROM todo_tag_relations tr INNER JOIN tag tg ON tg.id = tr.tag_id AND tg.user_id = tr.user_id AND tg.del_flag = 0 WHERE tr.target_type = 'todo' AND tr.target_id = t.id AND tr.user_id = t.user_id) AS tags,
          (
            SELECT COUNT(*)
            FROM todo_resource_refs r
            WHERE r.todo_id = t.id AND r.user_id = ?
          ) AS reference_count
        FROM todo_items t
        WHERE ${whereSql}${seek.where}
        ORDER BY ${order.sql}
        ${seek.limitSql}
      `,
      [...seek.selectParams, userId, ...params, ...seek.whereParams, ...order.params, ...seek.limitParams],
    );
    rows = result;
  }
  const [totalRows] = countPromise ? await countPromise : [[]];
  const text = getSearchText(lang);
  const seekValues = takeSearchSeekRows(rows);
  return {
    seekValues,
    total: Number(totalRows?.[0]?.total || 0),
    items: rows.map((item) => ({
      id: toText(item.id),
      type: 'todo',
      tags: Array.isArray(item.tags) ? item.tags : typeof item.tags === 'string' ? JSON.parse(item.tags) : [],
      title: toText(item.title) || text.unnamedTodo,
      description: buildSnippet(toText(item.description), keyword),
      extra: buildTodoExtra(item, text),
      status: toText(item.status) === 'completed' ? 'completed' : 'pending',
      priority: Number(item.priority ?? 1),
      dueAt: item.due_at ? formatDateTime(new Date(item.due_at)) : null,
      completedAt: item.completed_at ? formatDateTime(new Date(item.completed_at)) : null,
      referenceCount: Number(item.reference_count || 0),
      route: `/inbox?tab=todo&todoId=${encodeURIComponent(toText(item.id))}`,
      raw: {
        ...item,
        tags: Array.isArray(item.tags) ? item.tags : typeof item.tags === 'string' ? JSON.parse(item.tags) : [],
      },
    })),
  };
}

export const SEARCH_QUERY_BY_TYPE = {
  bookmark: queryBookmarks,
  note: queryNotes,
  file: queryFiles,
  tag: queryTags,
  todo: queryTodos,
};

export async function queryGlobalMaterialItems({ userId, options, lang, selectedTypes, cursor, pageSize }) {
  const db = options.database || pool;
  const definitions = {
    bookmark: { time: 'b.create_time', title: 'b.name', description: 'b.description', url: 'b.url' },
    note: {
      time: 'COALESCE(n.update_time, n.create_time)',
      title: 'n.title',
      description: "IF(n.type = 'drawing', '', n.content)",
    },
    file: { time: 'files.create_time', title: 'files.file_name' },
  };
  const types = selectedTypes.filter((type) => definitions[type]);
  const params = [];
  const keyword = options.keyword;
  const union = types.map((type) => {
    const filter = SEARCH_FILTER_BY_TYPE[type](userId, options);
    const definition = definitions[type];
    // Same relevance tiers as global search, evaluated before LIMIT rather than sorting a sampled page.
    let score = '0';
    if (keyword) {
      const tags = `EXISTS (SELECT 1 FROM resource_tag_relations rank_rel INNER JOIN tag rank_tag ON rank_tag.id = rank_rel.tag_id WHERE rank_rel.resource_type = '${type}' AND rank_rel.resource_id = ${filter.idColumn} AND rank_rel.user_id = ? AND rank_tag.user_id = ? AND rank_tag.del_flag = 0 AND LOWER(rank_tag.name) LIKE LOWER(?))`;
      score = `CASE WHEN LOWER(${definition.title}) = LOWER(?) THEN 100 WHEN LOWER(${definition.title}) LIKE LOWER(?) THEN 80 WHEN LOWER(${definition.title}) LIKE LOWER(?) THEN 60 WHEN ${tags} THEN 50`;
      params.push(keyword, `${keyword}%`, buildLike(keyword), userId, userId, buildLike(keyword));
      if (definition.url) {
        score += ` WHEN LOWER(${definition.url}) LIKE LOWER(?) THEN 40`;
        params.push(buildLike(keyword));
      }
      if (definition.description) {
        score += ` WHEN LOWER(${definition.description}) LIKE LOWER(?) THEN 30`;
        params.push(buildLike(keyword));
      }
      score += ' ELSE 10 END';
    }
    params.push(...filter.params);
    return `SELECT CONVERT(${filter.idColumn} USING utf8mb4) COLLATE utf8mb4_unicode_ci AS id, CONVERT('${type}' USING utf8mb4) COLLATE utf8mb4_unicode_ci AS type, COALESCE(${definition.time}, '1970-01-01 00:00:00') AS activity, ${score} AS score FROM ${filter.fromSql} WHERE ${filter.whereSql}`;
  });
  if (!union.length) return { items: [], nextCursor: null };
  let seek = '';
  if (cursor) {
    const { score, time, resourceType, id } = cursor;
    if (
      ![0, 10, 30, 40, 50, 60, 80, 100].includes(score) ||
      !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(time)) ||
      !types.includes(resourceType) ||
      typeof id !== 'string' ||
      !id ||
      id.length > 255
    ) {
      throw Object.assign(new Error('Invalid material cursor'), { code: 'SEARCH_CURSOR_INVALID' });
    }
    seek =
      'WHERE score < ? OR (score = ? AND (activity < ? OR (activity = ? AND (type < ? OR (type = ? AND id < ?)))))';
    params.push(score, score, time, time, resourceType, resourceType, id);
  }
  const [rows] = await db.query(
    `SELECT id, type, DATE_FORMAT(activity, '%Y-%m-%d %H:%i:%s') AS activity, score FROM (${union.join(' UNION ALL ')}) material ${seek} ORDER BY score DESC, activity DESC, type DESC, id DESC LIMIT ?`,
    [...params, pageSize + 1],
  );
  const page = rows.slice(0, pageSize);
  const hydrated = await Promise.all(
    types.map((type) => {
      const ids = page.filter((item) => item.type === type).map((item) => item.id);
      return ids.length
        ? SEARCH_QUERY_BY_TYPE[type](
            userId,
            { ...options, materialIds: ids, pageSize: ids.length, offset: 0 },
            lang,
            true,
            false,
          )
        : { items: [] };
    }),
  );
  const byKey = new Map(hydrated.flatMap((result) => result.items).map((item) => [`${item.type}:${item.id}`, item]));
  const last = page.at(-1);
  return {
    items: page.map((item) => byKey.get(`${item.type}:${item.id}`)).filter(Boolean),
    nextCursor:
      rows.length > pageSize && last
        ? {
            type: 'all',
            offset: 0,
            score: Number(last.score),
            time: last.activity,
            resourceType: last.type,
            id: last.id,
          }
        : null,
  };
}

export async function queryOrderedSearchItems({ userId, options, lang, selectedTypes, cursor, pageSize }) {
  const orderedTypes = selectedTypes;
  let typeIndex = Math.max(0, orderedTypes.indexOf(cursor.type));
  let typeOffset = cursor.offset;
  let typeSeek = cursor.seek;
  let remaining = pageSize;
  const items = [];
  let nextCursor = null;

  while (remaining > 0 && typeIndex < orderedTypes.length) {
    const type = orderedTypes[typeIndex];
    const seekScope = searchSeekScope(userId, options, selectedTypes, type);
    const queryType = SEARCH_QUERY_BY_TYPE[type];
    // 多取一条只用于判断当前类型是否仍有下一页；额外行不会进入响应，
    // 新游标按完整排序键续查；offset 保留供旧游标及元数据进度兼容。
    const result = await queryType(
      userId,
      {
        ...options,
        pageSize: remaining + 1,
        offset: typeOffset,
        orderedSeekScope: seekScope,
        cursorSeek: typeSeek,
      },
      lang,
      true,
      false,
    );
    const pageItems = result.items.slice(0, remaining);
    items.push(...pageItems);
    typeOffset += pageItems.length;
    remaining -= pageItems.length;

    if (result.items.length > pageItems.length) {
      const values = result.seekValues?.[pageItems.length - 1];
      nextCursor = { type, offset: typeOffset, ...(values ? { seek: { v: 1, scope: seekScope, values } } : {}) };
      break;
    }

    typeIndex += 1;
    typeOffset = 0;
    typeSeek = undefined;
    if (remaining === 0 && typeIndex < orderedTypes.length) {
      nextCursor = { type: orderedTypes[typeIndex], offset: 0 };
    }
  }

  return {
    items,
    nextCursor,
  };
}

export function diversifySuggestItems(rankedItems, totalLimit, perTypeLimit) {
  const picked = [];
  const overflow = [];
  const countByType = new Map();
  rankedItems.forEach((item) => {
    const used = countByType.get(item.type) || 0;
    if (picked.length < totalLimit && used < perTypeLimit) {
      countByType.set(item.type, used + 1);
      picked.push(item);
      return;
    }
    overflow.push(item);
  });
  for (const item of overflow) {
    if (picked.length >= totalLimit) break;
    picked.push(item);
  }
  return picked;
}

export const SOURCE_TYPE_BOOST = 3;

export async function querySuggestItems({ userId, options, lang, selectedTypes, sourceType, suggestLayout }) {
  const candidateLimit = 10;
  const results = await Promise.all(
    selectedTypes.map((type) =>
      SEARCH_QUERY_BY_TYPE[type](userId, { ...options, pageSize: candidateLimit, offset: 0 }, lang, true, false),
    ),
  );
  const ranked = results
    .flatMap((result) => result.items)
    .map((item, index) => {
      const relevance = searchItemRelevance(item, options.keyword);
      return {
        ...item,
        matchReason: relevance.reason,
        snippet: item.description || '',
        _score: relevance.score + (sourceType && item.type === sourceType ? SOURCE_TYPE_BOOST : 0),
        _stableIndex: index,
      };
    })
    .sort((a, b) => b._score - a._score || a._stableIndex - b._stableIndex);
  // PC 分组各自保留名额；不把其他组的空缺补给单一类型。
  const countByType = new Map();
  const groupLimit = options.keyword ? 5 : 3;
  const picked =
    suggestLayout === 'grouped'
      ? ranked.filter((item) => {
          const count = countByType.get(item.type) || 0;
          if (count >= groupLimit) return false;
          countByType.set(item.type, count + 1);
          return true;
        })
      : diversifySuggestItems(ranked, SUGGEST_TOTAL_LIMIT, SUGGEST_PER_TYPE_LIMIT);
  return {
    items: picked.map(({ _score, _stableIndex, ...item }) => item),
    hasMore: ranked.length > picked.length,
  };
}

export function buildOrderedHasMoreByType(typeTotals, selectedTypes, nextCursor) {
  const result = Object.fromEntries(GLOBAL_SEARCH_TYPES.map((type) => [type, false]));
  if (!nextCursor) return result;
  if (selectedTypes.length === 1) {
    const selectedType = selectedTypes[0];
    result[selectedType] =
      nextCursor.type === selectedType && nextCursor.offset < Number(typeTotals[selectedType] || 0);
    return result;
  }

  const cursorIndex = selectedTypes.indexOf(nextCursor.type);
  GLOBAL_SEARCH_TYPES.forEach((type) => {
    const selectedIndex = selectedTypes.indexOf(type);
    if (selectedIndex < 0 || selectedIndex < cursorIndex) return;
    if (selectedIndex === cursorIndex) {
      result[type] = nextCursor.offset < Number(typeTotals[type] || 0);
      return;
    }
    result[type] = Number(typeTotals[type] || 0) > 0;
  });
  return result;
}

export async function querySearchTagOptions(userId, db = pool) {
  const [rows] = await db.query(
    `SELECT name
     FROM tag
     WHERE user_id = ? AND del_flag = 0
     ORDER BY sort, create_time DESC, id DESC
     LIMIT 500`,
    [userId],
  );
  return rows.map((item) => toText(item.name)).filter(Boolean);
}

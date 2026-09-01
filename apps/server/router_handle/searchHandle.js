import pool from '../db/index.js';
import { resultData, formatDateTime } from '../util/common.js';
import { resolveFileCategory } from '../util/fileCategory.js';
import { normalizeTagIds } from '../util/resourceTags.js';
import { ensureNotVisitor } from '../util/auth.js';
import { enqueueResources } from '../util/resourceInbox.js';
import {
  getNoteTreeChildren,
  loadOwnedNoteTree,
  resolveNoteBreadcrumbFromSnapshot,
} from '../util/services/noteTreeService.js';
import { appendResourceTagFilters } from '../util/services/resourceInventoryService.js';
import {
  batchWriteResourceTags,
  queryOwnedResourceIds,
} from '../util/services/resourceTagWriteService.js';
import {
  DELETABLE_RESOURCE_TYPES,
  runResourceDeleteSideEffects,
  softDeleteResources,
} from '../util/services/resourceDeleteService.js';

// 资源类型与全局搜索类型必须分开:待办只能被搜索到,不进资源选择器、标签操作和待整理。
// 未显式声明 types 的历史调用方(资源选择器、提及选择器、桌面下拉)继续只拿到资源四类。
const SEARCH_TYPES = ['bookmark', 'note', 'file', 'tag'];
const GLOBAL_SEARCH_TYPES = [...SEARCH_TYPES, 'todo'];
const BATCH_EDITABLE_TYPES = ['bookmark', 'note', 'file'];
const BATCH_DELETE_TYPES = [...DELETABLE_RESOURCE_TYPES];
// 快捷搜索层:总量与单类型上限,避免一种类型占满最佳匹配
const SUGGEST_TOTAL_LIMIT = 8;
const SUGGEST_PER_TYPE_LIMIT = 3;
const TODO_STATUSES = ['pending', 'completed'];
const TODO_DUE_FILTERS = ['overdue', 'today', '7d', 'none'];
// 单次批量操作保持为一笔短事务，既覆盖管理页常见的大批量操作，也避免超长 IN 查询拖慢数据库。
const MAX_BATCH_DELETE_ITEMS = 1000;
const BATCH_CHUNK_SIZE = 200;
const TYPE_LABELS = {
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

const SEARCH_TEXTS = {
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

const FILE_CATEGORY_LABELS = {
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

function toText(value) {
  return String(value ?? '').trim();
}

function stripHtml(value) {
  return toText(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 摘要:优先展示命中关键词附近的一段(而非从头截),对齐知识库搜索体验
function buildSnippet(text, keyword, len = 140) {
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

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date) return formatDateTime(value).slice(0, 10); // 本地时区,避免 UTC 差一天
  const text = toText(value);
  return text.length > 10 ? text.slice(0, 10) : text;
}

function normalizeLimit(value, fallback = 12, max = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function normalizePage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(Math.floor(parsed), 1_000_000);
}

function normalizeSearchOffset(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Math.floor(parsed), 10_000_000);
}

function normalizeSearchType(value, allowedTypes = GLOBAL_SEARCH_TYPES) {
  const type = toText(value);
  return allowedTypes.includes(type) ? type : 'all';
}

// 只有调用方显式声明 types 时才可能包含待办;缺省仍是资源四类,
// 因此资源选择器、提及选择器和桌面搜索下拉不会因为本次改动突然多出待办。
function normalizeSearchTypes(value, legacyType) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const selected = [...new Set(values.map((item) => normalizeSearchType(item)).filter((type) => type !== 'all'))];
  if (selected.length) return GLOBAL_SEARCH_TYPES.filter((type) => selected.includes(type));
  const legacy = normalizeSearchType(legacyType);
  return legacy === 'all' ? [...SEARCH_TYPES] : [legacy];
}

function normalizeOrderedCursor(value, selectedTypes) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rawType = normalizeSearchType(raw.type);
  if (selectedTypes.length === 1) {
    const selectedType = selectedTypes[0];
    return {
      type: selectedType,
      offset: rawType === selectedType || rawType === 'all' ? normalizeSearchOffset(raw.offset) : 0,
    };
  }
  return {
    type: selectedTypes.includes(rawType) ? rawType : selectedTypes[0],
    offset: normalizeSearchOffset(raw.offset),
  };
}

function searchItemRelevance(item, keyword) {
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

async function queryRelevantSearchItems({ userId, options, lang, offset, pageSize, selectedTypes = SEARCH_TYPES }) {
  const candidateLimit = Math.min(offset + pageSize + 1, 500);
  const results = await Promise.all(
    selectedTypes.map((type) =>
      SEARCH_QUERY_BY_TYPE[type](
        userId,
        {
          ...options,
          pageSize: candidateLimit,
          offset: 0,
        },
        lang,
        true,
        false,
      ),
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
        _score: relevance.score,
        _stableIndex: index,
      };
    })
    .sort((a, b) => b._score - a._score || a._stableIndex - b._stableIndex);
  const items = ranked.slice(offset, offset + pageSize).map(({ _score, _stableIndex, ...item }) => item);
  return {
    items,
    nextCursor: ranked.length > offset + pageSize ? { type: 'all', offset: offset + items.length } : null,
  };
}

function normalizeSearchSort(value) {
  const sort = toText(value);
  return ['relevance', 'updated', 'name'].includes(sort) ? sort : 'relevance';
}

function normalizeSearchDate(value) {
  const date = toText(value);
  return ['7d', '30d', '365d'].includes(date) ? date : 'all';
}

function normalizeSearchTagNames(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => toText(item).slice(0, 255)).filter(Boolean))].slice(0, 24);
}

function buildDateCondition(column, date) {
  const days = {
    '7d': 7,
    '30d': 30,
    '365d': 365,
  }[date];
  return days ? `${column} >= DATE_SUB(NOW(), INTERVAL ${days} DAY)` : '';
}

function buildSearchOrder({ sort, keyword, titleColumn, updatedColumn, fallbackOrder, idColumn }) {
  if (sort === 'name') {
    return {
      sql: `LOWER(COALESCE(${titleColumn}, '')) ASC, ${idColumn} DESC`,
      params: [],
    };
  }
  if (sort === 'updated') {
    return {
      sql: `${updatedColumn} DESC, ${idColumn} DESC`,
      params: [],
    };
  }
  if (keyword) {
    return {
      sql: `
        CASE
          WHEN LOWER(COALESCE(${titleColumn}, '')) = LOWER(?) THEN 3
          WHEN LOWER(COALESCE(${titleColumn}, '')) LIKE LOWER(?) THEN 2
          WHEN LOWER(COALESCE(${titleColumn}, '')) LIKE LOWER(?) THEN 1
          ELSE 0
        END DESC,
        ${fallbackOrder},
        ${idColumn} DESC
      `,
      params: [keyword, `${keyword}%`, `%${keyword}%`],
    };
  }
  return {
    sql: `${fallbackOrder}, ${idColumn} DESC`,
    params: [],
  };
}

function groupItems(items, lang) {
  const labels = TYPE_LABELS[normalizeLang(lang)];
  return GLOBAL_SEARCH_TYPES.map((type) => ({
    type,
    label: labels[type],
    items: items.filter((item) => item.type === type),
  })).filter((group) => group.items.length > 0);
}

function buildLike(keyword) {
  return `%${keyword}%`;
}

function normalizeLang(value) {
  return value === 'en-US' ? 'en-US' : 'zh-CN';
}

function formatFileSizeMb(value) {
  if (!value) return '';
  return `${(Number(value) / 1024 / 1024).toFixed(2)} MB`;
}

function formatFileSearchExtra(item, lang) {
  const category = resolveFileCategory({
    fileName: item.file_name,
    fileType: item.file_type,
  });
  const categoryLabel = FILE_CATEGORY_LABELS[normalizeLang(lang)][category] || FILE_CATEGORY_LABELS['zh-CN'].other;
  const size = formatFileSizeMb(item.file_size);
  return [categoryLabel, size].filter(Boolean).join(' · ');
}

function getSearchText(lang) {
  return SEARCH_TEXTS[normalizeLang(lang)];
}

function formatText(template, params = {}) {
  return Object.entries(params).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template);
}

function normalizeBatchAction(value) {
  return value === 'remove' ? 'remove' : value === 'add' ? 'add' : '';
}

function buildBookmarkSearchFilter(userId, options) {
  const { keyword, tagNames, untagged, date } = options;
  const where = ['b.user_id = ?', 'b.del_flag = 0'];
  const params = [userId];
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

function buildNoteSearchFilter(userId, options) {
  const { keyword, tagNames, untagged, date } = options;
  const where = ['n.create_by = ?', 'n.del_flag = 0'];
  const params = [userId];
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

function buildFileSearchFilter(userId, options) {
  const { keyword, tagNames, untagged, date } = options;
  const where = ['files.create_by = ?', 'files.del_flag = 0'];
  const params = [userId];
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

function buildTagSearchFilter(userId, options) {
  const { keyword, tagNames, untagged, date } = options;
  const where = ['t.user_id = ?', 't.del_flag = 0'];
  const params = [userId];
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

const SEARCH_FILTER_BY_TYPE = {
  bookmark: buildBookmarkSearchFilter,
  note: buildNoteSearchFilter,
  file: buildFileSearchFilter,
  tag: buildTagSearchFilter,
};

function normalizeSelectionItems(items, allowedTypes) {
  if (!Array.isArray(items)) return [];
  const merged = new Map();
  items.forEach((item) => {
    const type = toText(item?.type);
    const id = toText(item?.id);
    if (!allowedTypes.includes(type) || !id) return;
    merged.set(`${type}:${id}`, { type, id });
  });
  return Array.from(merged.values());
}

function normalizeSelectionQuery(value = {}) {
  const query = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    keyword: toText(query.keyword).slice(0, 200),
    types: normalizeSearchTypes(query.types, query.type).filter((type) => SEARCH_TYPES.includes(type)),
    sort: normalizeSearchSort(query.sort),
    date: normalizeSearchDate(query.date),
    tagNames: normalizeSearchTagNames(query.tags),
    untagged: query.untagged === true || String(query.untagged || '') === '1',
  };
}

function summarizeSelectionItems(items) {
  const typeCounts = Object.fromEntries(SEARCH_TYPES.map((type) => [type, 0]));
  items.forEach((item) => {
    if (typeCounts[item.type] !== undefined) typeCounts[item.type] += 1;
  });
  return {
    total: items.length,
    typeCounts,
    editableCount: typeCounts.bookmark + typeCounts.note + typeCounts.file,
    inboxCount: typeCounts.bookmark + typeCounts.note + typeCounts.file,
    deleteCount: items.length,
  };
}

async function resolveBatchSelection(db, { userId, body, allowedTypes }) {
  const selection = body?.selection;
  if (selection?.mode !== 'allMatching') {
    return {
      mode: 'explicit',
      items: normalizeSelectionItems(body?.items || selection?.items, allowedTypes),
    };
  }

  const query = normalizeSelectionQuery(selection.query);
  const selectedTypes = query.types.filter((type) => allowedTypes.includes(type));
  const excluded = new Set(
    normalizeSelectionItems(selection.excludedItems, allowedTypes).map((item) => `${item.type}:${item.id}`),
  );
  const items = [];
  for (const type of selectedTypes) {
    const filter = SEARCH_FILTER_BY_TYPE[type](userId, query);
    const [rows] = await db.query(
      `SELECT ${filter.idColumn} AS id FROM ${filter.fromSql} WHERE ${filter.whereSql}`,
      filter.params,
    );
    rows.forEach((row) => {
      const id = toText(row.id);
      if (id && !excluded.has(`${type}:${id}`)) items.push({ type, id });
    });
  }
  return { mode: 'allMatching', items, query };
}

function chunkItems(items, size = BATCH_CHUNK_SIZE) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function queryBookmarks(userId, options, lang, includeItems, includeTotal = true) {
  const { keyword, sort, pageSize, offset } = options;
  const { whereSql, params } = buildBookmarkSearchFilter(userId, options);
  const countPromise = includeTotal
    ? pool.query(`SELECT COUNT(*) AS total FROM bookmark b WHERE ${whereSql}`, params)
    : null;

  let rows = [];
  if (includeItems) {
    const order = buildSearchOrder({
      sort,
      keyword,
      titleColumn: 'b.name',
      updatedColumn: 'b.create_time',
      fallbackOrder: 'b.is_top DESC, b.sort, b.create_time DESC',
      idColumn: 'b.id',
    });
    const [result] = await pool.query(
      `
        SELECT
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
        FROM bookmark b
        WHERE ${whereSql}
        ORDER BY ${order.sql}
        LIMIT ? OFFSET ?
      `,
      [userId, userId, ...params, ...order.params, pageSize, offset],
    );
    rows = result;
  }
  const [totalRows] = countPromise ? await countPromise : [[]];
  const text = getSearchText(lang);
  return {
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

async function queryNotes(userId, options, lang, includeItems, includeTotal = true) {
  const { keyword, sort, pageSize, offset } = options;
  const { whereSql, params } = buildNoteSearchFilter(userId, options);
  const countPromise = includeTotal
    ? pool.query(`SELECT COUNT(*) AS total FROM note n WHERE ${whereSql}`, params)
    : null;

  let rows = [];
  let treeSnapshot = null;
  if (includeItems) {
    const order = buildSearchOrder({
      sort,
      keyword,
      titleColumn: 'n.title',
      updatedColumn: 'COALESCE(n.update_time, n.create_time)',
      fallbackOrder: 'n.is_top DESC, n.sort, COALESCE(n.update_time, n.create_time) DESC',
      idColumn: 'n.id',
    });
    const [result] = await pool.query(
      `
        SELECT
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
        WHERE ${whereSql}
        ORDER BY ${order.sql}
        LIMIT ? OFFSET ?
      `,
      [userId, userId, ...params, ...order.params, pageSize, offset],
    );
    rows = result;
    // 搜索结果要用路径区分重名页面，并为 AI 目录候选提供权威后代数量。
    // 只读取当前 owner 的轻量树元数据；正文与后代 ID 不进入搜索响应。
    treeSnapshot = await loadOwnedNoteTree(userId);
  }
  const [totalRows] = countPromise ? await countPromise : [[]];
  const text = getSearchText(lang);
  return {
    total: Number(totalRows?.[0]?.total || 0),
    items: rows.map((item) => {
      const id = toText(item.id);
      let path = '';
      let childCount = 0;
      let descendantCount = 0;
      if (treeSnapshot?.nodesById?.has(id)) {
        const breadcrumb = resolveNoteBreadcrumbFromSnapshot(treeSnapshot, id);
        path = breadcrumb
          .slice(0, -1)
          .map((node) => toText(node.title) || text.unnamedNote)
          .join(' / ');
        childCount = getNoteTreeChildren(treeSnapshot, id).length;
        const queue = [...getNoteTreeChildren(treeSnapshot, id)];
        const visited = new Set();
        while (queue.length) {
          const node = queue.shift();
          if (!node || visited.has(node.id)) continue;
          visited.add(node.id);
          descendantCount += 1;
          queue.push(...getNoteTreeChildren(treeSnapshot, node.id));
        }
      }
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

async function queryFiles(userId, options, lang, includeItems, includeTotal = true) {
  const { keyword, sort, pageSize, offset } = options;
  const { whereSql, params } = buildFileSearchFilter(userId, options);
  const countPromise = includeTotal
    ? pool.query(
        `SELECT COUNT(*) AS total FROM files LEFT JOIN folders ON files.folder_id = folders.id WHERE ${whereSql}`,
        params,
      )
    : null;

  let rows = [];
  if (includeItems) {
    const order = buildSearchOrder({
      sort,
      keyword,
      titleColumn: 'files.file_name',
      updatedColumn: 'files.create_time',
      fallbackOrder: 'files.create_time DESC',
      idColumn: 'files.id',
    });
    const [result] = await pool.query(
      `
        SELECT files.*, folders.name AS folder_name,
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
        FROM files
        LEFT JOIN folders ON files.folder_id = folders.id
        WHERE ${whereSql}
        ORDER BY ${order.sql}
        LIMIT ? OFFSET ?
      `,
      [userId, userId, ...params, ...order.params, pageSize, offset],
    );
    rows = result;
  }
  const [totalRows] = countPromise ? await countPromise : [[]];
  const text = getSearchText(lang);
  return {
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

async function queryTags(userId, options, lang, includeItems, includeTotal = true) {
  const { keyword, sort, pageSize, offset } = options;
  const { whereSql, params } = buildTagSearchFilter(userId, options);
  const countPromise = includeTotal
    ? pool.query(`SELECT COUNT(*) AS total FROM tag t WHERE ${whereSql}`, params)
    : null;

  let rows = [];
  if (includeItems) {
    const order = buildSearchOrder({
      sort,
      keyword,
      titleColumn: 't.name',
      updatedColumn: 't.create_time',
      fallbackOrder: 't.sort, t.create_time DESC',
      idColumn: 't.id',
    });
    const [result] = await pool.query(
      `
        SELECT t.*, COUNT(r.resource_id) AS resource_count
        FROM tag t
        LEFT JOIN resource_tag_relations r ON t.id = r.tag_id AND r.user_id = ?
        WHERE ${whereSql}
        GROUP BY t.id
        ORDER BY ${order.sql}
        LIMIT ? OFFSET ?
      `,
      [userId, ...params, ...order.params, pageSize, offset],
    );
    rows = result;
  }
  const [totalRows] = countPromise ? await countPromise : [[]];
  const text = getSearchText(lang);
  return {
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

function normalizeTodoStatus(value) {
  const status = toText(value);
  return TODO_STATUSES.includes(status) ? status : 'all';
}

// 三个优先级全选与不筛选等价，统一收敛成空数组以省掉一次 IN 条件
function normalizeTodoPriorities(value) {
  if (!Array.isArray(value)) return [];
  const selected = [...new Set(value.map((item) => Number(item)).filter((item) => [0, 1, 2].includes(item)))];
  return selected.length === 3 ? [] : selected.sort();
}

function normalizeTodoDue(value) {
  const due = toText(value);
  return TODO_DUE_FILTERS.includes(due) ? due : 'all';
}

function buildTodoDueCondition(due) {
  if (due === 'overdue') return "t.due_at IS NOT NULL AND t.due_at < NOW() AND t.status = 'pending'";
  if (due === 'today') return 't.due_at IS NOT NULL AND DATE(t.due_at) = CURDATE()';
  if (due === '7d')
    return 't.due_at IS NOT NULL AND t.due_at >= NOW() AND t.due_at < DATE_ADD(CURDATE(), INTERVAL 8 DAY)';
  if (due === 'none') return 't.due_at IS NULL';
  return '';
}

function formatTodoDueText(dueAt) {
  if (!dueAt) return '';
  const date = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(date.getTime())) return '';
  return formatDateTime(date).slice(0, 16);
}

function buildTodoExtra(item, text) {
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

// 待办只按 user_id + del_flag 归属过滤;它是行动对象而非资料对象,
// 因此不参与标签筛选、无标签筛选和任何资源批量语义。
async function queryTodos(userId, options, lang, includeItems, includeTotal = true) {
  const { keyword, tagNames, untagged, date, sort, pageSize, offset } = options;
  const todoStatus = normalizeTodoStatus(options.todoStatus);
  const todoPriorities = normalizeTodoPriorities(options.todoPriorities);
  const todoDue = normalizeTodoDue(options.todoDue);
  const where = ['t.user_id = ?', 't.del_flag = 0'];
  const params = [userId];
  if (keyword) {
    const like = buildLike(keyword);
    where.push('(t.title LIKE ? OR t.description LIKE ?)');
    params.push(like, like);
  }
  // 按标签或无标签筛选时待办整体退出结果，而不是被当成"无标签资源"混进来
  if (tagNames.length || untagged) where.push('1 = 0');
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
  const countPromise = includeTotal
    ? pool.query(`SELECT COUNT(*) AS total FROM todo_items t WHERE ${whereSql}`, params)
    : null;

  let rows = [];
  if (includeItems) {
    const order = buildSearchOrder({
      sort,
      keyword,
      titleColumn: 't.title',
      updatedColumn: 't.update_time',
      // 未完成优先只在同一相关度档位内生效，紧接着才是截止时间与更新时间
      fallbackOrder: "(t.status = 'pending') DESC, t.due_at IS NULL ASC, t.due_at ASC, t.update_time DESC",
      idColumn: 't.id',
    });
    const [result] = await pool.query(
      `
        SELECT
          t.id,
          t.title,
          t.description,
          t.status,
          t.priority,
          t.due_at,
          t.completed_at,
          t.update_time,
          (
            SELECT COUNT(*)
            FROM todo_resource_refs r
            WHERE r.todo_id = t.id AND r.user_id = ?
          ) AS reference_count
        FROM todo_items t
        WHERE ${whereSql}
        ORDER BY ${order.sql}
        LIMIT ? OFFSET ?
      `,
      [userId, ...params, ...order.params, pageSize, offset],
    );
    rows = result;
  }
  const [totalRows] = countPromise ? await countPromise : [[]];
  const text = getSearchText(lang);
  return {
    total: Number(totalRows?.[0]?.total || 0),
    items: rows.map((item) => ({
      id: toText(item.id),
      type: 'todo',
      title: toText(item.title) || text.unnamedTodo,
      description: buildSnippet(toText(item.description), keyword),
      extra: buildTodoExtra(item, text),
      status: toText(item.status) === 'completed' ? 'completed' : 'pending',
      priority: Number(item.priority ?? 1),
      dueAt: item.due_at ? formatDateTime(new Date(item.due_at)) : null,
      completedAt: item.completed_at ? formatDateTime(new Date(item.completed_at)) : null,
      referenceCount: Number(item.reference_count || 0),
      route: `/inbox?tab=todo&todoId=${encodeURIComponent(toText(item.id))}`,
      raw: item,
    })),
  };
}

const SEARCH_QUERY_BY_TYPE = {
  bookmark: queryBookmarks,
  note: queryNotes,
  file: queryFiles,
  tag: queryTags,
  todo: queryTodos,
};

async function queryOrderedSearchItems({ userId, options, lang, selectedTypes, cursor, pageSize }) {
  const orderedTypes = selectedTypes;
  let typeIndex = Math.max(0, orderedTypes.indexOf(cursor.type));
  let typeOffset = cursor.offset;
  let remaining = pageSize;
  const items = [];
  let nextCursor = null;

  while (remaining > 0 && typeIndex < orderedTypes.length) {
    const type = orderedTypes[typeIndex];
    const queryType = SEARCH_QUERY_BY_TYPE[type];
    // 多取一条只用于判断当前类型是否仍有下一页；额外行不会进入响应，
    // 下一批会从当前已返回数量对应的 offset 继续读取。
    const result = await queryType(
      userId,
      {
        ...options,
        pageSize: remaining + 1,
        offset: typeOffset,
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
      nextCursor = { type, offset: typeOffset };
      break;
    }

    typeIndex += 1;
    typeOffset = 0;
    if (remaining === 0 && typeIndex < orderedTypes.length) {
      nextCursor = { type: orderedTypes[typeIndex], offset: 0 };
    }
  }

  return {
    items,
    nextCursor,
  };
}

// 快捷层做轻度类型均衡：先按相关度排序，再限制单类型条数，
// 其他类型没有匹配时用超出上限的高相关结果补足总数，同类型内部保持原相关度顺序。
function diversifySuggestItems(rankedItems, totalLimit, perTypeLimit) {
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

/**
 * 当前页面只影响排序，不改变搜索范围：在待办页搜索时待办稍微靠前，
 * 但仍然展示书签、笔记、文件和标签。加权值必须小于相关度档位间隔（10），
 * 否则会变成事实上的局部搜索。
 */
const SOURCE_TYPE_BOOST = 3;

// 快捷搜索：只取少量候选、不统计 typeTotals/tagOptions，保证每次输入的请求足够轻
async function querySuggestItems({ userId, options, lang, selectedTypes, sourceType }) {
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
  const picked = diversifySuggestItems(ranked, SUGGEST_TOTAL_LIMIT, SUGGEST_PER_TYPE_LIMIT);
  return {
    items: picked.map(({ _score, _stableIndex, ...item }) => item),
    hasMore: ranked.length > picked.length,
  };
}

function buildOrderedHasMoreByType(typeTotals, selectedTypes, nextCursor) {
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

async function querySearchTagOptions(userId) {
  const [rows] = await pool.query(
    `SELECT name
     FROM tag
     WHERE user_id = ? AND del_flag = 0
     ORDER BY sort, create_time DESC, id DESC
     LIMIT 500`,
    [userId],
  );
  return rows.map((item) => toText(item.name)).filter(Boolean);
}

export const globalSearch = async (req, res) => {
  try {
    const userId = (req.resourceUser || req.user)?.id;
    if (!userId) return res.send(resultData(null, 400, '缺少用户信息'));

    const keyword = toText(req.body?.keyword || req.body?.filters?.keyword).slice(0, 200);
    const mode = req.body?.mode === 'suggest' ? 'suggest' : 'full';
    const paginationMode = req.body?.paginationMode === 'ordered' ? 'ordered' : 'perType';
    const page = normalizePage(req.body?.page ?? req.body?.currentPage);
    const pageSize = normalizeLimit(
      req.body?.pageSize ?? req.body?.limitPerType,
      paginationMode === 'ordered' ? 40 : 12,
      paginationMode === 'ordered' ? 40 : 50,
    );
    const selectedTypes = normalizeSearchTypes(req.body?.types, req.body?.type);
    const lang = normalizeLang(req.headers['x-lang']);
    const options = {
      keyword,
      page,
      pageSize,
      offset: (page - 1) * pageSize,
      sort: normalizeSearchSort(req.body?.sort),
      date: normalizeSearchDate(req.body?.date),
      tagNames: normalizeSearchTagNames(req.body?.tags),
      untagged: req.body?.untagged === true || String(req.body?.untagged || '') === '1',
      todoStatus: req.body?.todoStatus,
      todoPriorities: req.body?.todoPriority ?? req.body?.todoPriorities,
      todoDue: req.body?.todoDue,
    };

    if (mode === 'suggest') {
      // 只接受合法资源/待办类型，未知值按无来源处理
      const rawSourceType = toText(req.body?.sourceType);
      const sourceType = GLOBAL_SEARCH_TYPES.includes(rawSourceType) ? rawSourceType : '';
      const suggest = await querySuggestItems({ userId, options, lang, selectedTypes, sourceType });
      return res.send(
        resultData({
          keyword,
          items: suggest.items,
          groups: groupItems(suggest.items, lang),
          hasMore: suggest.hasMore,
        }),
      );
    }

    if (paginationMode === 'ordered') {
      const cursor = normalizeOrderedCursor(req.body?.cursor, selectedTypes);
      const includeMetadata = req.body?.includeMetadata !== false;
      const useGlobalRelevance = Boolean(keyword) && options.sort === 'relevance' && selectedTypes.length > 1;
      const relevanceOffset = req.body?.cursor?.type === 'all' ? normalizeSearchOffset(req.body.cursor.offset) : 0;
      const orderedItemsPromise = useGlobalRelevance
        ? queryRelevantSearchItems({
            userId,
            options,
            lang,
            offset: relevanceOffset,
            pageSize,
            selectedTypes,
          })
        : queryOrderedSearchItems({
            userId,
            options,
            lang,
            selectedTypes,
            cursor,
            pageSize,
          });
      const metadataPromise = includeMetadata
        ? Promise.all([
            queryBookmarks(userId, options, lang, false),
            queryNotes(userId, options, lang, false),
            queryFiles(userId, options, lang, false),
            queryTags(userId, options, lang, false),
            // 待办统计只在调用方显式请求待办时才执行，既有资源调用方不承担这次查询
            selectedTypes.includes('todo')
              ? queryTodos(userId, options, lang, false)
              : Promise.resolve({ total: 0, items: [] }),
            querySearchTagOptions(userId),
          ])
        : Promise.resolve(null);
      const [orderedResult, metadata] = await Promise.all([orderedItemsPromise, metadataPromise]);

      const response = {
        keyword,
        items: orderedResult.items,
        groups: groupItems(orderedResult.items, lang),
        pageSize,
        nextCursor: orderedResult.nextCursor,
        hasMore: Boolean(orderedResult.nextCursor),
      };
      if (metadata) {
        const [bookmarkResult, noteResult, fileResult, tagResult, todoResult, tagOptions] = metadata;
        const typeTotals = {
          bookmark: bookmarkResult.total,
          note: noteResult.total,
          file: fileResult.total,
          tag: tagResult.total,
          todo: todoResult.total,
        };
        Object.assign(response, {
          total: Object.values(typeTotals).reduce((sum, count) => sum + Number(count || 0), 0),
          typeTotals,
          tagOptions,
          hasMoreByType: buildOrderedHasMoreByType(typeTotals, selectedTypes, orderedResult.nextCursor),
        });
      }
      return res.send(resultData(response));
    }

    const [bookmarkResult, noteResult, fileResult, tagResult, todoResult, tagOptions] = await Promise.all([
      queryBookmarks(userId, options, lang, selectedTypes.includes('bookmark')),
      queryNotes(userId, options, lang, selectedTypes.includes('note')),
      queryFiles(userId, options, lang, selectedTypes.includes('file')),
      queryTags(userId, options, lang, selectedTypes.includes('tag')),
      // 同 ordered 模式：未显式请求待办时完全不查 todo_items
      selectedTypes.includes('todo')
        ? queryTodos(userId, options, lang, true)
        : Promise.resolve({ total: 0, items: [] }),
      querySearchTagOptions(userId),
    ]);
    const resultMap = {
      bookmark: bookmarkResult,
      note: noteResult,
      file: fileResult,
      tag: tagResult,
      todo: todoResult,
    };
    const items = GLOBAL_SEARCH_TYPES.flatMap((type) => resultMap[type].items);
    const typeTotals = Object.fromEntries(GLOBAL_SEARCH_TYPES.map((type) => [type, resultMap[type].total]));
    const hasMoreByType = Object.fromEntries(
      GLOBAL_SEARCH_TYPES.map((type) => [
        type,
        selectedTypes.includes(type) && page * pageSize < resultMap[type].total,
      ]),
    );

    return res.send(
      resultData({
        keyword,
        items,
        groups: groupItems(items, lang),
        total: Object.values(typeTotals).reduce((sum, count) => sum + Number(count || 0), 0),
        typeTotals,
        tagOptions,
        page,
        pageSize,
        hasMoreByType,
        hasMore: Object.values(hasMoreByType).some(Boolean),
      }),
    );
  } catch (error) {
    console.error('[search] global search failed code=%s', String(error?.code || 'GLOBAL_SEARCH_FAILED'));
    return res.send(resultData(null, 500, '统一搜索暂时不可用，请稍后重试'));
  }
};

export const previewBatchSelection = async (req, res) => {
  try {
    const userId = (req.resourceUser || req.user)?.id;
    if (!userId) return res.send(resultData(null, 401, '请先登录'));
    const resolved = await resolveBatchSelection(pool, {
      userId,
      body: req.body,
      allowedTypes: BATCH_DELETE_TYPES,
    });
    if (!resolved.items.length) return res.send(resultData(null, 400, '当前筛选下没有可批量处理的资源'));
    return res.send(
      resultData({
        mode: resolved.mode,
        ...summarizeSelectionItems(resolved.items),
      }),
    );
  } catch (error) {
    console.error('[search] batch selection preview failed code=%s', String(error?.code || 'BATCH_PREVIEW_FAILED'));
    return res.send(resultData(null, 500, '无法准备批量选择，请稍后重试'));
  }
};

export const batchUpdateResourceTags = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const userId = (req.resourceUser || req.user)?.id;
  if (!userId) return res.send(resultData(null, 401, '请先登录'));
  const action = normalizeBatchAction(req.body?.action);
  const tagIds = normalizeTagIds(req.body?.tagIds || []);
  if (!action) return res.send(resultData(null, 400, '缺少有效操作类型'));
  if (!tagIds.length) return res.send(resultData(null, 400, '请至少选择一个标签'));

  const connection = await pool.getConnection();
  try {
    const selection = await resolveBatchSelection(connection, {
      userId,
      body: req.body,
      allowedTypes: BATCH_EDITABLE_TYPES,
    });
    if (!selection.items.length) return res.send(resultData(null, 400, '未选择可编辑资源'));
    await connection.beginTransaction();
    const result = await batchWriteResourceTags(connection, {
      userId,
      items: selection.items,
      tagIds,
      action,
    });
    await connection.commit();
    res.send(resultData(result));
  } catch (error) {
    await connection.rollback();
    console.error('[search] batch tag update failed code=%s', String(error?.code || 'BATCH_TAG_UPDATE_FAILED'));
    res.send(resultData(null, 500, '批量更新资源标签失败，请稍后重试'));
  } finally {
    connection.release();
  }
};

export const getBatchResourceTagWorkspace = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const userId = (req.resourceUser || req.user)?.id;
    if (!userId) {
      return res.send(resultData(null, 401, '请先登录'));
    }

    const selection = await resolveBatchSelection(connection, {
      userId,
      body: req.body,
      allowedTypes: BATCH_EDITABLE_TYPES,
    });
    const items = selection.items;
    if (!items.length) {
      return res.send(resultData(null, 400, '未选择可编辑资源'));
    }

    const grouped = {
      bookmark: [],
      note: [],
      file: [],
    };
    items.forEach((item) => grouped[item.type].push(item.id));

    const resourceTagsMap = {};
    const tagDedup = new Map();
    const previewItemKeys = new Set(items.slice(0, 100).map((item) => `${item.type}:${item.id}`));

    for (const type of BATCH_EDITABLE_TYPES) {
      const requestedIds = grouped[type];
      if (!requestedIds.length) continue;
      const validIds = [];
      for (const requestedChunk of chunkItems(requestedIds)) {
        validIds.push(...(await queryOwnedResourceIds(connection, { userId, type, ids: requestedChunk })));
      }
      if (!validIds.length) continue;
      for (const validChunk of chunkItems(validIds)) {
        const placeholders = validChunk.map(() => '?').join(',');
        const [rows] = await connection.query(
          `
            SELECT
              r.resource_id AS resourceId,
              t.id AS tagId,
              t.name AS tagName
            FROM resource_tag_relations r
            INNER JOIN tag t ON t.id = r.tag_id
            WHERE r.user_id = ?
              AND r.resource_type = ?
              AND r.resource_id IN (${placeholders})
              AND t.user_id = ?
              AND t.del_flag = 0
            ORDER BY t.sort, t.create_time DESC
          `,
          [userId, type, ...validChunk, userId],
        );

        rows.forEach((row) => {
          const key = `${type}:${toText(row.resourceId)}`;
          const tagItem = { id: toText(row.tagId), name: toText(row.tagName) };
          if (previewItemKeys.has(key)) {
            if (!resourceTagsMap[key]) resourceTagsMap[key] = [];
            resourceTagsMap[key].push(tagItem);
          }
          if (tagItem.id && !tagDedup.has(tagItem.id)) tagDedup.set(tagItem.id, tagItem);
        });
      }
    }

    const [allTags] = await connection.query(
      `
        SELECT id, name
        FROM tag
        WHERE user_id = ? AND del_flag = 0
        ORDER BY sort, create_time DESC
      `,
      [userId],
    );

    res.send(
      resultData({
        items: items.slice(0, 100),
        selectionMode: selection.mode,
        selectionSummary: summarizeSelectionItems(items),
        itemsTruncated: items.length > 100,
        resourceTagsMap,
        selectedResourceTags: Array.from(tagDedup.values()),
        allTags: allTags.map((tag) => ({ id: toText(tag.id), name: toText(tag.name) })),
      }),
    );
  } catch (error) {
    console.error('[search] batch tag workspace failed code=%s', String(error?.code || 'BATCH_TAG_WORKSPACE_FAILED'));
    res.send(resultData(null, 500, '获取批量标签工作台数据失败，请稍后重试'));
  } finally {
    connection.release();
  }
};

export const batchAddResourcesToInbox = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const userId = (req.resourceUser || req.user)?.id;
  if (!userId) return res.send(resultData(null, 401, '请先登录'));
  const connection = await pool.getConnection();
  try {
    const selection = await resolveBatchSelection(connection, {
      userId,
      body: req.body,
      allowedTypes: BATCH_EDITABLE_TYPES,
    });
    if (!selection.items.length) return res.send(resultData(null, 400, '未选择可加入待整理的资源'));

    await connection.beginTransaction();
    const totals = { added: 0, reopened: 0, ignored: 0 };
    for (const itemChunk of chunkItems(selection.items, 50)) {
      const result = await enqueueResources(connection, {
        userId,
        source: 'manual',
        items: itemChunk.map((item) => ({ resourceType: item.type, resourceId: item.id })),
      });
      totals.added += Number(result?.added || 0);
      totals.reopened += Number(result?.reopened || 0);
      totals.ignored += Number(result?.ignored || 0);
    }
    await connection.commit();
    return res.send(resultData({ ...totals, requestedItemCount: selection.items.length }));
  } catch (error) {
    await connection.rollback();
    return res.send(resultData(null, 500, '批量加入待整理失败'));
  } finally {
    connection.release();
  }
};

export const batchDeleteResources = async (req, res) => {
  if (!ensureNotVisitor(req, res)) return;
  const userId = (req.resourceUser || req.user)?.id;
  if (!userId) {
    return res.send(resultData(null, 401, '请先登录'));
  }

  const querySelection = req.body?.selection?.mode === 'allMatching';
  const rawItems = req.body?.items || req.body?.selection?.items;
  if (!querySelection && (!Array.isArray(rawItems) || rawItems.length === 0)) {
    return res.send(resultData(null, 400, '未选择可删除资源'));
  }
  if (!querySelection && rawItems.length > MAX_BATCH_DELETE_ITEMS) {
    return res.send(resultData(null, 400, `单次最多删除 ${MAX_BATCH_DELETE_ITEMS} 项资源`));
  }

  const connection = await pool.getConnection();
  try {
    const selection = await resolveBatchSelection(connection, {
      userId,
      body: req.body,
      allowedTypes: BATCH_DELETE_TYPES,
    });
    const items = selection.items;
    if (!items.length) return res.send(resultData(null, 400, '未选择可删除资源'));
    await connection.beginTransaction();
    const result = await softDeleteResources(connection, { userId, items });
    await connection.commit();
    await runResourceDeleteSideEffects(result.sideEffects);
    const { sideEffects: _sideEffects, ...response } = result;
    res.send(resultData(response));
  } catch (error) {
    await connection.rollback();
    console.error('[search] batch delete failed code=%s', String(error?.code || 'BATCH_DELETE_FAILED'));
    res.send(resultData(null, 500, '批量删除资源失败，请稍后重试'));
  } finally {
    connection.release();
  }
};

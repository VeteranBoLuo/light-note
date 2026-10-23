import { SEARCH_TYPES, GLOBAL_SEARCH_TYPES, BATCH_EDITABLE_TYPES, SUGGEST_TOTAL_LIMIT, SUGGEST_PER_TYPE_LIMIT, TODO_STATUSES, TODO_DUE_FILTERS, TYPE_LABELS, SEARCH_TEXTS, FILE_CATEGORY_LABELS, toText, stripHtml, buildSnippet, normalizeDate, normalizeLimit, normalizePage, normalizeSearchOffset, normalizeSearchType, normalizeSearchTypes, normalizeOrderedCursor, searchItemRelevance, queryRelevantSearchItems, normalizeSearchSort, normalizeSearchDate, normalizeSearchTagNames, buildDateCondition, SEARCH_ORDER_DEFINITIONS, buildSearchOrder, groupItems, buildLike, normalizeLang, formatFileSizeMb, formatFileSearchExtra, getSearchText, formatText, buildBookmarkSearchFilter, buildNoteSearchFilter, buildFileSearchFilter, buildTagSearchFilter, SEARCH_FILTER_BY_TYPE, queryBookmarks, queryNotes, queryFiles, queryTags, normalizeTodoStatus, normalizeTodoPriorities, normalizeTodoDue, buildTodoDueCondition, formatTodoDueText, buildTodoExtra, buildTodoSearchFilter, queryTodos, SEARCH_QUERY_BY_TYPE, queryGlobalMaterialItems, queryOrderedSearchItems, diversifySuggestItems, SOURCE_TYPE_BOOST, querySuggestItems, buildOrderedHasMoreByType, querySearchTagOptions } from '../util/services/resourceSearchService.js';
import pool from '../db/index.js';
import { buildRelevantSearchQuery, relevanceReason } from '../util/searchRelevancePagination.js';
import {
  searchSeekScope,
  searchOrderKeys,
  buildSearchSeek,
  searchSeekIndexHint,
  takeSearchSeekRows,
} from '../util/searchSeekPagination.js';
import { MAX_EXPLICIT_RESOURCE_SELECTION } from '@lightnote/shared/resource-selection';
import { resolveExplicitResourceSelection } from '../util/services/resourceSelectionService.js';
import { resolveCloudFolderTagSelection } from '../util/services/cloudFolderTreeService.js';
import { resultData, formatDateTime } from '../util/common.js';
import { resolveFileCategory } from '../util/fileCategory.js';
import { normalizeTagIds } from '../util/resourceTags.js';
import { ensureNotVisitor } from '../util/auth.js';
import { enqueueResources } from '../util/resourceInbox.js';
import { resolveOwnedNoteSearchMetadata } from '../util/services/noteTreeService.js';
import { appendResourceTagFilters } from '../util/services/resourceInventoryService.js';
import { batchWriteResourceTags, queryOwnedResourceIds } from '../util/services/resourceTagWriteService.js';
import {
  DELETABLE_RESOURCE_TYPES,
  runResourceDeleteSideEffects,
  softDeleteResources,
} from '../util/services/resourceDeleteService.js';
import { queryTagMatches } from '../util/services/tagSpaceService.js';

// 资源类型与全局搜索类型必须分开:待办只能被搜索到,不进资源选择器、标签操作和待整理。
// 未显式声明 types 的历史调用方(资源选择器、提及选择器、桌面下拉)继续只拿到资源四类。



const BATCH_DELETE_TYPES = [...DELETABLE_RESOURCE_TYPES];
// 快捷搜索层:总量与单类型上限,避免一种类型占满最佳匹配




// 单次批量操作保持为一笔短事务，既覆盖管理页常见的大批量操作，也避免超长 IN 查询拖慢数据库。
const MAX_BATCH_DELETE_ITEMS = MAX_EXPLICIT_RESOURCE_SELECTION;
const BATCH_CHUNK_SIZE = 200;










// 摘要:优先展示命中关键词附近的一段(而非从头截),对齐知识库搜索体验












// 只有调用方显式声明 types 时才可能包含待办;缺省仍是资源四类,
// 因此资源选择器、提及选择器和桌面搜索下拉不会因为本次改动突然多出待办。


































function normalizeBatchAction(value) {
  return value === 'remove' ? 'remove' : value === 'add' ? 'add' : '';
}











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











// 三个优先级全选与不筛选等价，统一收敛成空数组以省掉一次 IN 条件










// 待办使用独立标签关系参与全局搜索；不进入资料批量语义。






// Full material browsing: rank before pagination, then hydrate only the returned page.




// 快捷层做轻度类型均衡：先按相关度排序，再限制单类型条数，
// 其他类型没有匹配时用超出上限的高相关结果补足总数，同类型内部保持原相关度顺序。


/**
 * 当前页面只影响排序，不改变搜索范围：在待办页搜索时待办稍微靠前，
 * 但仍然展示书签、笔记、文件和标签。加权值必须小于相关度档位间隔（10），
 * 否则会变成事实上的局部搜索。
 */


// 快捷搜索：只取少量候选、不统计 typeTotals/tagOptions，保证每次输入的请求足够轻






export const globalSearch = async (req, res) => {
  try {
    const userId = (req.resourceUser || req.user)?.id;
    if (!userId) return res.send(resultData(null, 400, '缺少用户信息'));

    const keyword = toText(req.body?.keyword || req.body?.filters?.keyword).slice(0, 200);
    const mode = req.body?.mode === 'suggest' ? 'suggest' : 'full';
    const paginationMode = ['ordered', 'global'].includes(req.body?.paginationMode)
      ? req.body.paginationMode
      : 'perType';
    const page = normalizePage(req.body?.page ?? req.body?.currentPage);
    const pageSize = normalizeLimit(
      req.body?.pageSize ?? req.body?.limitPerType,
      paginationMode !== 'perType' ? 40 : 12,
      paginationMode !== 'perType' ? 40 : 50,
    );
    const separateTagMatches =
      mode === 'full' && (req.body?.separateTagMatches === true || String(req.body?.separateTagMatches || '') === '1');
    const requestedTypes = normalizeSearchTypes(req.body?.types, req.body?.type);
    const selectedTypes =
      paginationMode === 'global' || (separateTagMatches && paginationMode !== 'ordered')
        ? requestedTypes.filter((type) => BATCH_EDITABLE_TYPES.includes(type))
        : separateTagMatches
          ? requestedTypes.filter((type) => type !== 'tag')
          : requestedTypes;
    // ordered 查找允许显式请求待办；旧调用与 global 资料分页保持资料范围。
    // 标签始终是独立导航，空的有效范围保持旧调用的资料默认值。
    if (!selectedTypes.length) selectedTypes.push(...BATCH_EDITABLE_TYPES);
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
      fileExtensions: Array.isArray(req.body?.fileExtensions)
        ? [
            ...new Set(
              req.body.fileExtensions
                .map((value) => String(value).toLowerCase())
                .filter((value) => /^[a-z0-9]{1,10}$/.test(value)),
            ),
          ].slice(0, 20)
        : [],
      todoStatus: req.body?.todoStatus,
      todoPriorities: req.body?.todoPriority ?? req.body?.todoPriorities,
      todoDue: req.body?.todoDue,
    };

    if (mode === 'suggest') {
      // 只接受合法资源/待办类型，未知值按无来源处理
      const rawSourceType = toText(req.body?.sourceType);
      const sourceType = GLOBAL_SEARCH_TYPES.includes(rawSourceType) ? rawSourceType : '';
      const suggest = await querySuggestItems({
        userId,
        options,
        lang,
        selectedTypes,
        sourceType,
        suggestLayout: req.body?.suggestLayout === 'grouped' ? 'grouped' : 'compact',
      });
      return res.send(
        resultData({
          keyword,
          items: suggest.items,
          groups: groupItems(suggest.items, lang),
          hasMore: suggest.hasMore,
        }),
      );
    }

    if (paginationMode !== 'perType') {
      const cursor = normalizeOrderedCursor(req.body?.cursor, selectedTypes);
      const useGlobalRelevance = Boolean(keyword) && options.sort === 'relevance' && selectedTypes.length > 1;
      const cursorKind = paginationMode === 'ordered' && useGlobalRelevance ? 'relevance' : cursor.type;
      if (cursor.seek && cursor.seek.scope !== searchSeekScope(userId, options, selectedTypes, cursorKind)) {
        throw Object.assign(new Error('Invalid search cursor scope'), { code: 'SEARCH_CURSOR_INVALID' });
      }
      const includeMetadata = req.body?.includeMetadata !== false;
      const relevanceOffset = req.body?.cursor?.type === 'all' ? normalizeSearchOffset(req.body.cursor.offset) : 0;
      const orderedItemsPromise =
        paginationMode === 'global'
          ? queryGlobalMaterialItems({ userId, options, lang, selectedTypes, cursor: req.body?.cursor, pageSize })
          : useGlobalRelevance
            ? queryRelevantSearchItems({
                userId,
                options,
                lang,
                cursor: req.body?.cursor,
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
            separateTagMatches ? Promise.resolve({ total: 0, items: [] }) : queryTags(userId, options, lang, false),
            // 待办统计只在调用方显式请求待办时才执行，既有资源调用方不承担这次查询
            selectedTypes.includes('todo')
              ? queryTodos(userId, options, lang, false)
              : Promise.resolve({ total: 0, items: [] }),
            querySearchTagOptions(userId),
            separateTagMatches && keyword ? queryTagMatches(pool, { userId, keyword, limit: 8 }) : Promise.resolve([]),
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
        const [bookmarkResult, noteResult, fileResult, tagResult, todoResult, tagOptions, tagMatches] = metadata;
        const typeTotals = {
          bookmark: bookmarkResult.total,
          note: noteResult.total,
          file: fileResult.total,
          tag: tagResult.total,
          todo: todoResult.total,
        };
        Object.assign(response, {
          total: (paginationMode === 'global'
            ? selectedTypes.map((type) => typeTotals[type])
            : Object.values(typeTotals)
          ).reduce((sum, count) => sum + Number(count || 0), 0),
          typeTotals,
          tagOptions,
          tagMatches,
          hasMoreByType: buildOrderedHasMoreByType(typeTotals, selectedTypes, orderedResult.nextCursor),
        });
      }
      return res.send(resultData(response));
    }

    const [bookmarkResult, noteResult, fileResult, tagResult, todoResult, tagOptions, tagMatches] = await Promise.all([
      queryBookmarks(userId, options, lang, selectedTypes.includes('bookmark')),
      queryNotes(userId, options, lang, selectedTypes.includes('note')),
      queryFiles(userId, options, lang, selectedTypes.includes('file')),
      separateTagMatches
        ? Promise.resolve({ total: 0, items: [] })
        : queryTags(userId, options, lang, selectedTypes.includes('tag')),
      // 同 ordered 模式：未显式请求待办时完全不查 todo_items
      selectedTypes.includes('todo')
        ? queryTodos(userId, options, lang, true)
        : Promise.resolve({ total: 0, items: [] }),
      querySearchTagOptions(userId),
      separateTagMatches && keyword ? queryTagMatches(pool, { userId, keyword, limit: 8 }) : Promise.resolve([]),
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
        tagMatches,
        page,
        pageSize,
        hasMoreByType,
        hasMore: Object.values(hasMoreByType).some(Boolean),
      }),
    );
  } catch (error) {
    if (error?.code === 'SEARCH_CURSOR_INVALID') return res.send(resultData(null, 400, '搜索分页标识无效，请重新搜索'));
    console.error('[search] global search failed code=%s', String(error?.code || 'GLOBAL_SEARCH_FAILED'));
    return res.send(resultData(null, 500, '统一搜索暂时不可用，请稍后重试'));
  }
};

export const previewBatchSelection = async (req, res) => {
  try {
    const userId = (req.resourceUser || req.user)?.id;
    if (!userId) return res.send(resultData(null, 401, '请先登录'));
    if (req.body?.folderScope) {
      const resolved = await resolveCloudFolderTagSelection({
        userId,
        folderId: req.body.folderScope.folderId,
        includeDescendants: req.body.folderScope.includeDescendants === true,
        database: pool,
      });
      return res.send(
        resultData({ mode: 'explicit', ...summarizeSelectionItems(resolved.resolvedItems), ...resolved }),
      );
    }
    if (req.body?.includeResolvedItems === true) {
      if (req.body?.selection?.mode !== 'explicit') return res.send(resultData(null, 400, '只支持核对逐项选择'));
      const resolved = await resolveExplicitResourceSelection(pool, userId, req.body.selection.items);
      return res.send(
        resultData({ mode: 'explicit', ...summarizeSelectionItems(resolved.resolvedItems), ...resolved }),
      );
    }
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
    if (error?.code === 'FOLDER_TAG_SELECTION_LIMIT') {
      return res.send(resultData({ code: error.code }, 400, '文件数量超出单次标签操作上限'));
    }
    if (error?.code === 'FOLDER_NOT_FOUND') return res.send(resultData(null, 404, '文件夹不存在或无权限'));
    if (error?.status === 400) return res.send(resultData(null, 400, '无效的资源选择或超出单次上限'));
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
    const tagRelationCounts = {};
    const tagDedup = new Map();
    const previewItemKeys = new Set(items.slice(0, 100).map((item) => `${item.type}:${item.id}`));

    for (const type of BATCH_EDITABLE_TYPES) {
      const requestedIds = grouped[type];
      if (!requestedIds.length) continue;
      const validIds = [];
      for (const requestedChunk of chunkItems(requestedIds)) {
        validIds.push(...(await queryOwnedResourceIds(connection, { userId, type, ids: requestedChunk })));
      }
      if (validIds.length !== requestedIds.length) {
        return res.send(resultData(null, 409, '部分资源已不可用，请返回重新选择'));
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
          tagRelationCounts[tagItem.id] = (tagRelationCounts[tagItem.id] || 0) + 1;
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
        tagRelationCounts,
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
    if (error?.code === 'NOTE_HAS_CHILDREN') {
      return res.send(resultData({ code: error.code }, 409, error.message));
    }
    console.error('[search] batch delete failed code=%s', String(error?.code || 'BATCH_DELETE_FAILED'));
    res.send(resultData(null, 500, '批量删除资源失败，请稍后重试'));
  } finally {
    connection.release();
  }
};

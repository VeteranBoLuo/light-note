/**
 * 资源选择的统一搜索层。
 *
 * 笔记 @提及、AI 上下文、待办参考资料都要「搜账号内资源并选一个」,
 * 三处此前各写了一份防抖 + 竞态处理 + 去重。这里只负责搜索与结果整形,
 * **选中之后写到哪里由各业务适配器决定**(AI 的云文件要走附件解析,笔记要插链接,
 * 待办要存结构化关系),因此本文件不感知任何业务写入逻辑。
 */
import { ref } from 'vue';
import { fetchGlobalSearch, type SearchCursor, type SearchResultItem } from '@/api/search';
import { isResourceSearchType, type ResourceSearchType } from '@/utils/globalSearchTypes';

/**
 * 选择器只接受资料对象。
 * 待办属于 GlobalSearchType 而不是 ResourceSearchType，因此它能被全局搜索找到，
 * 但在类型层面就进不了 @提及、AI 上下文和待办参考资料的候选集。
 */
export type ResourcePickerType = ResourceSearchType;

export interface ResourcePickerItem {
  type: ResourcePickerType;
  id: string;
  title: string;
  path?: string;
  childCount?: number;
  descendantCount?: number;
}

export interface UseResourcePickerSearchOptions {
  /** 允许出现在结果里的资源类型 */
  allowedTypes?: ResourcePickerType[] | (() => ResourcePickerType[] | undefined);
  /** 单次返回上限 */
  limit?: number;
  /** 每种类型最多展示几条 */
  perType?: number;
  /** 只浏览一种资源时，改用游标分页连续加载完整结果。 */
  exhaustiveSingleType?: boolean;
  /** 单类型连续加载的页大小；服务端当前最大支持 40。 */
  singleTypePageSize?: number;
  /** 输入防抖毫秒数 */
  debounceMs?: number;
  /** 需要排除的条目(通常是已选中项),返回 `${type}:${id}` 集合 */
  excludeKeys?: () => Iterable<string>;
}

const DEFAULT_TYPES: ResourcePickerType[] = ['bookmark', 'note', 'file'];

export function resourceItemKey(item: Pick<ResourcePickerItem, 'type' | 'id'>) {
  return `${item.type}:${item.id}`;
}

/** 分组展示时的每类条数上限 */
export const DEFAULT_PER_TYPE = 5;

/**
 * 空关键词是“最近使用”浏览，按更新时间（资源没有更新时间时由服务端回退创建时间）展示；
 * 真正输入关键词后切回相关度，避免新但无关的资源压过精确命中。
 */
export function resolveResourcePickerSort(keyword: string): 'relevance' | 'updated' {
  return String(keyword || '').trim() ? 'relevance' : 'updated';
}

/**
 * 按类型取样并按固定顺序排列(书签 → 笔记 → 文件 → 其它)。
 * 结果保持扁平以便键盘线性导航,由展示层按 type 切分成分组标题。
 * 不做轮转:混排看着乱,分组更易扫读。
 */
export function takePerType<T extends { type: string }>(
  items: T[],
  { perType = DEFAULT_PER_TYPE, order = DEFAULT_TYPES as readonly string[] } = {},
): T[] {
  const buckets = new Map<string, T[]>();
  items.forEach((item) => {
    const list = buckets.get(item.type);
    if (list) list.push(item);
    else buckets.set(item.type, [item]);
  });
  const picked: T[] = [];
  order.forEach((type) => {
    const list = buckets.get(type);
    if (list) picked.push(...list.slice(0, perType));
  });
  // order 之外的类型(例如标签)追加在后面,不丢结果
  buckets.forEach((list, type) => {
    if (!order.includes(type)) picked.push(...list.slice(0, perType));
  });
  return picked;
}

export function useResourcePickerSearch(options: UseResourcePickerSearchOptions = {}) {
  const resolveAllowedTypes = () => {
    const configured = typeof options.allowedTypes === 'function' ? options.allowedTypes() : options.allowedTypes;
    return configured?.length ? configured : DEFAULT_TYPES;
  };
  const limit = Math.max(1, Number(options.limit) || 12);
  const perType = Math.max(1, Number(options.perType) || DEFAULT_PER_TYPE);
  const singleTypePageSize = Math.min(40, Math.max(1, Number(options.singleTypePageSize) || 40));
  const debounceMs = Math.max(0, Number(options.debounceMs ?? 280));

  const results = ref<ResourcePickerItem[]>([]);
  const loading = ref(false);
  const searchFailed = ref(false);
  const loadingMore = ref(false);
  const loadMoreFailed = ref(false);
  const hasMore = ref(false);
  const total = ref(0);
  const activeIndex = ref(0);

  let debounceTimer: number | null = null;
  // 请求序号:输入快时后端可能乱序返回,只接受最后一次结果
  let requestId = 0;
  let nextCursor: SearchCursor | null = null;
  let orderedBrowse = false;
  let browseKeyword = '';
  let browseTypes: ResourcePickerType[] = [];
  let browseSort: 'relevance' | 'updated' = 'updated';

  function clearDebounce() {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function normalizeItems(
    items: SearchResultItem[],
    allowedTypes: ResourcePickerType[],
    existingKeys: Iterable<string> = [],
  ) {
    const excluded = new Set(options.excludeKeys?.() || []);
    const seen = new Set(existingKeys);
    return items
      .filter((item) => isResourceSearchType(item.type) && allowedTypes.includes(item.type as ResourcePickerType))
      .map((item) => ({
        type: item.type as ResourcePickerType,
        id: String(item.id || ''),
        title: String(item.title || ''),
        ...(item.type === 'note'
          ? {
              path: String(item.path || ''),
              childCount: Math.max(0, Number(item.childCount || 0)),
              descendantCount: Math.max(0, Number(item.descendantCount || 0)),
            }
          : {}),
      }))
      .filter((item) => {
        const key = resourceItemKey(item);
        if (!item.id || !item.title || seen.has(key) || excluded.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  async function searchNow(keyword: string) {
    clearDebounce();
    const currentRequest = ++requestId;
    const normalizedKeyword = String(keyword || '');
    const allowedTypes = resolveAllowedTypes();
    const useOrderedBrowse = options.exhaustiveSingleType === true && allowedTypes.length === 1;
    const sort = resolveResourcePickerSort(normalizedKeyword);
    loading.value = true;
    searchFailed.value = false;
    loadingMore.value = false;
    loadMoreFailed.value = false;
    hasMore.value = false;
    total.value = 0;
    nextCursor = null;
    try {
      const data = await fetchGlobalSearch(normalizedKeyword, useOrderedBrowse ? singleTypePageSize : limit, true, {
        sort,
        types: allowedTypes,
        ...(useOrderedBrowse
          ? {
              paginationMode: 'ordered' as const,
              cursor: null,
              includeMetadata: true,
            }
          : {}),
      });
      if (currentRequest !== requestId) return;
      const normalizedItems = normalizeItems(data?.items || [], allowedTypes);
      results.value = useOrderedBrowse
        ? normalizedItems
        : takePerType(normalizedItems, { perType, order: allowedTypes });
      orderedBrowse = useOrderedBrowse;
      browseKeyword = normalizedKeyword;
      browseTypes = [...allowedTypes];
      browseSort = sort;
      nextCursor = useOrderedBrowse ? data.nextCursor || null : null;
      hasMore.value = Boolean(useOrderedBrowse && data.hasMore && nextCursor);
      total.value = useOrderedBrowse
        ? Math.max(results.value.length, Number(data.typeTotals?.[allowedTypes[0]] ?? data.total ?? 0))
        : results.value.length;
      activeIndex.value = 0;
    } catch {
      // 失败态必须与真正的空结果分开；展示层提供就地重试，不打断用户输入。
      if (currentRequest === requestId) {
        results.value = [];
        activeIndex.value = 0;
        orderedBrowse = false;
        searchFailed.value = true;
      }
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
  }

  async function loadMore() {
    if (!orderedBrowse || loading.value || loadingMore.value || !hasMore.value || !nextCursor) return;
    const currentRequest = requestId;
    const cursor = nextCursor;
    loadingMore.value = true;
    loadMoreFailed.value = false;
    try {
      const data = await fetchGlobalSearch(browseKeyword, singleTypePageSize, false, {
        sort: browseSort,
        types: browseTypes,
        paginationMode: 'ordered',
        cursor,
        includeMetadata: false,
      });
      if (currentRequest !== requestId) return;
      const existingKeys = results.value.map(resourceItemKey);
      const additions = normalizeItems(data?.items || [], browseTypes, existingKeys);
      if (additions.length) results.value = [...results.value, ...additions];
      const followingCursor = data.nextCursor || null;
      const cursorAdvanced = JSON.stringify(followingCursor) !== JSON.stringify(cursor);
      nextCursor = followingCursor;
      hasMore.value = Boolean(data.hasMore && followingCursor && cursorAdvanced);
      total.value = Math.max(total.value, results.value.length);
    } catch {
      if (currentRequest === requestId) loadMoreFailed.value = true;
    } finally {
      if (currentRequest === requestId) loadingMore.value = false;
    }
  }

  function retryLoadMore() {
    loadMoreFailed.value = false;
    return loadMore();
  }

  function search(keyword: string) {
    clearDebounce();
    debounceTimer = window.setTimeout(() => void searchNow(keyword), debounceMs);
  }

  function moveActive(offset: number) {
    const total = results.value.length;
    if (!total) return;
    activeIndex.value = (activeIndex.value + offset + total) % total;
  }

  function reset() {
    clearDebounce();
    // 递增序号:让在途请求的结果失效,避免关闭后又被旧结果填充
    requestId += 1;
    results.value = [];
    activeIndex.value = 0;
    loading.value = false;
    searchFailed.value = false;
    loadingMore.value = false;
    loadMoreFailed.value = false;
    hasMore.value = false;
    total.value = 0;
    nextCursor = null;
    orderedBrowse = false;
    browseKeyword = '';
    browseTypes = [];
  }

  return {
    results,
    loading,
    searchFailed,
    loadingMore,
    loadMoreFailed,
    hasMore,
    total,
    activeIndex,
    search,
    searchNow,
    loadMore,
    retryLoadMore,
    moveActive,
    reset,
  };
}

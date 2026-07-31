/**
 * 资源选择的统一搜索层。
 *
 * 笔记 @提及、AI 上下文、待办参考资料都要「搜账号内资源并选一个」,
 * 三处此前各写了一份防抖 + 竞态处理 + 去重。这里只负责搜索与结果整形,
 * **选中之后写到哪里由各业务适配器决定**(AI 的云文件要走附件解析,笔记要插链接,
 * 待办要存结构化关系),因此本文件不感知任何业务写入逻辑。
 */
import { ref } from 'vue';
import { fetchGlobalSearch, type SearchResultItem } from '@/api/search';
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
}

export interface UseResourcePickerSearchOptions {
  /** 允许出现在结果里的资源类型 */
  allowedTypes?: ResourcePickerType[];
  /** 单次返回上限 */
  limit?: number;
  /** 每种类型最多展示几条 */
  perType?: number;
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
  const allowedTypes = options.allowedTypes?.length ? options.allowedTypes : DEFAULT_TYPES;
  const limit = Math.max(1, Number(options.limit) || 12);
  const perType = Math.max(1, Number(options.perType) || DEFAULT_PER_TYPE);
  const debounceMs = Math.max(0, Number(options.debounceMs ?? 280));

  const results = ref<ResourcePickerItem[]>([]);
  const loading = ref(false);
  const activeIndex = ref(0);

  let debounceTimer: number | null = null;
  // 请求序号:输入快时后端可能乱序返回,只接受最后一次结果
  let requestId = 0;

  function clearDebounce() {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  async function searchNow(keyword: string) {
    clearDebounce();
    const currentRequest = ++requestId;
    loading.value = true;
    try {
      const excluded = new Set(options.excludeKeys?.() || []);
      const data = await fetchGlobalSearch(keyword, limit, true);
      if (currentRequest !== requestId) return;
      const seen = new Set<string>();
      results.value = (data?.items || [])
        // 双重过滤：先排除非资料类型（待办），再按调用方允许的类型收敛
        .filter(
          (item: SearchResultItem) =>
            isResourceSearchType(item.type) && allowedTypes.includes(item.type as ResourcePickerType),
        )
        .map((item: SearchResultItem) => ({
          type: item.type as ResourcePickerType,
          id: String(item.id || ''),
          title: String(item.title || ''),
        }))
        .filter((item) => {
          const key = resourceItemKey(item);
          if (!item.id || !item.title || seen.has(key) || excluded.has(key)) return false;
          seen.add(key);
          return true;
        });
      results.value = takePerType(results.value, { perType, order: allowedTypes });
      activeIndex.value = 0;
    } catch {
      // 选择器里的搜索失败按空态处理:全局错误提示会打断用户正在输入的动作
      if (currentRequest === requestId) {
        results.value = [];
        activeIndex.value = 0;
      }
    } finally {
      if (currentRequest === requestId) loading.value = false;
    }
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
  }

  return { results, loading, activeIndex, search, searchNow, moveActive, reset };
}

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

export type ResourcePickerType = 'bookmark' | 'note' | 'file' | 'tag';

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
  /** 输入防抖毫秒数 */
  debounceMs?: number;
  /** 需要排除的条目(通常是已选中项),返回 `${type}:${id}` 集合 */
  excludeKeys?: () => Iterable<string>;
}

const DEFAULT_TYPES: ResourcePickerType[] = ['bookmark', 'note', 'file'];

export function resourceItemKey(item: Pick<ResourcePickerItem, 'type' | 'id'>) {
  return `${item.type}:${item.id}`;
}

/**
 * 按类型轮转取样。
 * 搜索接口是按类型分段返回的(书签在前),直接截断会让选择器里只剩书签;
 * 轮转能保证书签/笔记/文件/标签各露出几条,同类内部保持接口给的顺序(即最新的在前)。
 */
export function interleaveByType<T extends { type: string }>(items: T[], limit: number): T[] {
  const max = Math.max(0, Number(limit) || 0);
  if (!max) return [];
  const buckets = new Map<string, T[]>();
  items.forEach((item) => {
    const list = buckets.get(item.type);
    if (list) list.push(item);
    else buckets.set(item.type, [item]);
  });
  const picked: T[] = [];
  for (let round = 0; picked.length < max; round += 1) {
    let addedThisRound = false;
    for (const list of buckets.values()) {
      const candidate = list[round];
      if (!candidate) continue;
      picked.push(candidate);
      addedThisRound = true;
      if (picked.length >= max) break;
    }
    if (!addedThisRound) break;
  }
  return picked;
}

export function useResourcePickerSearch(options: UseResourcePickerSearchOptions = {}) {
  const allowedTypes = options.allowedTypes?.length ? options.allowedTypes : DEFAULT_TYPES;
  const limit = Math.max(1, Number(options.limit) || 12);
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
        .filter((item: SearchResultItem) => allowedTypes.includes(item.type as ResourcePickerType))
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
      results.value = interleaveByType(results.value, limit);
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

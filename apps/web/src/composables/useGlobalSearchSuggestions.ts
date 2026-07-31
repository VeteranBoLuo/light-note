import { onBeforeUnmount, ref, watch } from 'vue';
import { fetchGlobalSearchSuggestions, type SearchResultItem } from '@/api/search';
import { GLOBAL_SEARCH_TYPES, type GlobalSearchType } from '@/utils/globalSearchTypes';
import { dedupeSearchItems, diversifySearchItems } from '@/utils/globalSearchDiversify';
import { useUserStore } from '@/store';

const DEBOUNCE_MS = 200;

/**
 * 快捷全局搜索取数：防抖、竞态丢弃、取消旧请求、账号隔离。
 *
 * 服务端已经完成相关度排序与类型均衡，这里只做去重和兜底均衡，
 * 避免服务端协议变化时快捷层被单一类型占满。
 */
export function useGlobalSearchSuggestions(
  types: readonly GlobalSearchType[] = GLOBAL_SEARCH_TYPES,
  /** 当前页面的主资源类型：只做同档位内的弱加权，不缩小搜索范围 */
  getSourceType: () => GlobalSearchType | '' = () => '',
) {
  const user = useUserStore();
  const items = ref<SearchResultItem[]>([]);
  const loading = ref(false);
  const failed = ref(false);
  const hasMore = ref(false);
  const lastKeyword = ref('');

  let requestSeq = 0;
  let debounceTimer: number | null = null;
  let controller: AbortController | null = null;

  function cancelPending() {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    controller?.abort();
    controller = null;
  }

  function reset() {
    cancelPending();
    // 递增序号，让已经在途的响应无法再写入状态
    requestSeq += 1;
    items.value = [];
    loading.value = false;
    failed.value = false;
    hasMore.value = false;
    lastKeyword.value = '';
  }

  async function run(keyword: string) {
    const normalized = keyword.trim();
    if (!normalized) {
      reset();
      return;
    }

    cancelPending();
    const seq = ++requestSeq;
    controller = new AbortController();
    const signal = controller.signal;
    loading.value = true;
    failed.value = false;

    try {
      const res = await fetchGlobalSearchSuggestions(normalized, {
        types: [...types],
        sourceType: getSourceType(),
        signal,
      });
      if (seq !== requestSeq) return;
      items.value = diversifySearchItems(dedupeSearchItems(res.items));
      hasMore.value = res.hasMore || res.items.length > items.value.length;
      lastKeyword.value = normalized;
    } catch (error) {
      if (seq !== requestSeq || signal.aborted) return;
      // 网络失败必须显示错误态，不能伪装成「没有匹配结果」
      items.value = [];
      hasMore.value = false;
      failed.value = true;
      lastKeyword.value = normalized;
      console.warn('[globalSearch] suggestions failed', error);
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  }

  function schedule(keyword: string) {
    const normalized = keyword.trim();
    if (!normalized) {
      reset();
      return;
    }
    cancelPending();
    loading.value = true;
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      void run(normalized);
    }, DEBOUNCE_MS);
  }

  // 账号切换后旧结果不能残留
  watch(
    () => [user.id, user.role],
    () => reset(),
  );

  onBeforeUnmount(cancelPending);

  return { items, loading, failed, hasMore, lastKeyword, schedule, run, reset };
}

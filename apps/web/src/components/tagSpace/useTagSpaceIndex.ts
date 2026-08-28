import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import {
  fetchTagSpaces,
  type TagSpaceFilter,
  type TagSpaceListResponse,
  type TagSpaceSort,
  type TagSpaceSummary,
} from '@/api/tagSpace';

const PAGE_SIZE = 24;

const EMPTY_OVERVIEW: TagSpaceListResponse['overview'] = {
  tagTotal: 0,
  activeTagTotal: 0,
  emptyTagTotal: 0,
  covered: { bookmark: 0, note: 0, file: 0 },
};

const EMPTY_FACETS: TagSpaceListResponse['facets'] = {
  all: 0,
  bookmark: 0,
  note: 0,
  file: 0,
};

export function useTagSpaceIndex(
  options: { keyword?: Ref<string>; filter?: Ref<TagSpaceFilter>; sort?: Ref<TagSpaceSort> } = {},
) {
  const keyword = options.keyword || ref('');
  const filter = options.filter || ref<TagSpaceFilter>('all');
  const sort = options.sort || ref<TagSpaceSort>('recent');
  const items = ref<TagSpaceSummary[]>([]);
  const total = ref(0);
  const page = ref(1);
  const facets = ref<TagSpaceListResponse['facets']>({ ...EMPTY_FACETS });
  const overview = ref<TagSpaceListResponse['overview']>({ ...EMPTY_OVERVIEW, covered: { ...EMPTY_OVERVIEW.covered } });
  const loading = ref(false);
  const refreshing = ref(false);
  const loadingMore = ref(false);
  const error = ref(false);
  let requestSequence = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const hasMore = computed(() => items.value.length < total.value);
  const hasData = computed(() => items.value.length > 0);

  async function reload({ silent = false, targetPage = 1 } = {}) {
    const sequence = ++requestSequence;
    const normalizedTargetPage = Math.max(1, Math.min(20, Math.floor(Number(targetPage) || 1)));
    if (silent && items.value.length) refreshing.value = true;
    else loading.value = true;
    error.value = false;
    try {
      const restoredItems = new Map<string, TagSpaceSummary>();
      let finalResult: TagSpaceListResponse | null = null;
      for (let currentPage = 1; currentPage <= normalizedTargetPage; currentPage += 1) {
        const result = await fetchTagSpaces({
          keyword: keyword.value.trim(),
          filter: filter.value,
          sort: sort.value,
          page: currentPage,
          pageSize: PAGE_SIZE,
        });
        if (sequence !== requestSequence) return false;
        result.items.forEach((item) => restoredItems.set(item.id, item));
        finalResult = result;
        if (!result.hasMore) break;
      }
      if (!finalResult) return false;
      items.value = [...restoredItems.values()];
      total.value = finalResult.total;
      page.value = finalResult.page;
      facets.value = finalResult.facets;
      overview.value = finalResult.overview;
      return true;
    } catch (loadError) {
      if (sequence !== requestSequence) return;
      error.value = true;
      if (!silent || !items.value.length) {
        items.value = [];
        total.value = 0;
      }
      console.warn('[tag-space] failed to load index', loadError);
      return false;
    } finally {
      if (sequence === requestSequence) {
        loading.value = false;
        refreshing.value = false;
      }
    }
  }

  async function loadMore() {
    if (loading.value || refreshing.value || loadingMore.value || !hasMore.value) return false;
    const sequence = requestSequence;
    loadingMore.value = true;
    error.value = false;
    try {
      const result = await fetchTagSpaces({
        keyword: keyword.value.trim(),
        filter: filter.value,
        sort: sort.value,
        page: page.value + 1,
        pageSize: PAGE_SIZE,
      });
      if (sequence !== requestSequence) return false;
      const merged = new Map(items.value.map((item) => [item.id, item]));
      result.items.forEach((item) => merged.set(item.id, item));
      items.value = [...merged.values()];
      total.value = result.total;
      page.value = result.page;
      facets.value = result.facets;
      overview.value = result.overview;
      return true;
    } catch (loadError) {
      if (sequence === requestSequence) error.value = true;
      console.warn('[tag-space] failed to load more spaces', loadError);
      return false;
    } finally {
      loadingMore.value = false;
    }
  }

  watch([keyword, filter, sort], () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => reload(), keyword.value.trim() ? 260 : 0);
  });

  onBeforeUnmount(() => {
    requestSequence += 1;
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  return {
    keyword,
    filter,
    sort,
    items,
    page,
    total,
    facets,
    overview,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    hasData,
    reload,
    loadMore,
  };
}

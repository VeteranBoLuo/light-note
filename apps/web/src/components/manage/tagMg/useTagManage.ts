import { computed, ref } from 'vue';
import { apiQueryPost } from '@/http/request.ts';
import { useUserStore } from '@/store';
import {
  buildFilterCounts,
  filterAndSortTags,
  getUniqueResourceCount,
  type TagFilterValue,
  type TagRecord,
  type TagSortValue,
} from './tagManageModel';

export { getTotalResourceCount } from './tagManageModel';
export type { RelatedItem, TagFilterCounts, TagFilterValue, TagRecord, TagSortValue } from './tagManageModel';

export function useTagManage() {
  const user = useUserStore();
  const loading = ref(false);
  /**
   * 静默刷新中（下拉刷新）。
   *
   * 与 loading 分开：移动端标签页整页包在 <b-loading :loading> 里，下拉刷新若复用
   * loading 会整页盖住遮罩、旧列表消失，正是「保留旧数据、只在顶部提示」要避免的。
   */
  const refreshing = ref(false);
  const tags = ref<TagRecord[]>([]);
  const keyword = ref('');
  const activeFilter = ref<TagFilterValue>('all');
  const sortMode = ref<TagSortValue>('default');

  const filterCounts = computed(() => buildFilterCounts(tags.value, keyword.value));
  const visibleTags = computed(() => filterAndSortTags(tags.value, keyword.value, activeFilter.value, sortMode.value));
  const overview = computed(() => ({
    tag: tags.value.length,
    bookmark: getUniqueResourceCount(tags.value, 'bookmarkList'),
    note: getUniqueResourceCount(tags.value, 'noteList'),
    file: getUniqueResourceCount(tags.value, 'fileList'),
  }));

  /**
   * 重新拉取标签列表。
   *
   * silent 用于下拉刷新：只置 refreshing、不动 loading，页面保留旧列表，
   * 顶部指示器负责表达「正在刷新」。不传参时行为与改造前完全一致。
   * 请求失败时保留上一次的 tags，不清空成空列表。
   */
  async function reload(options: { silent?: boolean } = {}) {
    if (options.silent) refreshing.value = true;
    else loading.value = true;
    try {
      const res = await apiQueryPost('/api/bookmark/queryTagList', {
        filters: { userId: user.id },
      });
      if (res.status === 200 && Array.isArray(res.data)) tags.value = res.data;
      else if (!options.silent) tags.value = [];
    } finally {
      loading.value = false;
      refreshing.value = false;
    }
  }

  return {
    loading,
    refreshing,
    tags,
    keyword,
    activeFilter,
    sortMode,
    filterCounts,
    visibleTags,
    overview,
    reload,
  };
}

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

  async function reload() {
    loading.value = true;
    try {
      const res = await apiQueryPost('/api/bookmark/queryTagList', {
        filters: { userId: user.id },
      });
      tags.value = res.status === 200 && Array.isArray(res.data) ? res.data : [];
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
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

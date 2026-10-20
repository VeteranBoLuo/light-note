<template>
  <span class="cloud-file-count-summary">{{ summary }}</span>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';

  const props = defineProps<{
    counts: { direct: number; total: number } | null;
    fileTotal: number;
    allFileCount: number;
    filtered: boolean;
    loading: boolean;
  }>();
  const { t } = useI18n();
  const summary = computed(() => {
    if (props.filtered) {
      const total = props.counts?.total ?? props.allFileCount;
      if (props.loading) {
        if (!props.counts && !props.allFileCount) return t('common.loading');
        return t(props.counts ? 'cloudSpace.filteringFolderFileCount' : 'cloudSpace.filteringAllFileCount', { total });
      }
      return t(props.counts ? 'cloudSpace.filteredFolderFileCount' : 'cloudSpace.filteredAllFileCount', {
        count: props.fileTotal,
        total,
      });
    }
    if (!props.counts)
      return props.loading ? t('common.loading') : t('cloudSpace.fileCount', { count: props.fileTotal });
    return props.counts.direct === props.counts.total
      ? t('cloudSpace.currentFolderFileCount', { count: props.counts.total })
      : t('cloudSpace.folderFileCountDescription', props.counts);
  });
</script>

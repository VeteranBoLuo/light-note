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
    includeDescendants?: boolean;
    folderName?: string;
    compact?: boolean;
  }>();
  const { t } = useI18n();
  const summary = computed(() => {
    if (props.filtered) {
      const total = props.counts
        ? props.includeDescendants
          ? props.counts.total
          : props.counts.direct
        : props.allFileCount;
      if (props.loading) {
        return t('common.loading');
      }
      return t('cloudSpace.scopeFilteredCount', {
        count: props.fileTotal,
        total,
      });
    }
    if (!props.counts)
      return props.loading ? t('common.loading') : t('cloudSpace.fileCount', { count: props.fileTotal });
    if (props.compact)
      return props.loading ? t('common.loading') : t('cloudSpace.fileCount', { count: props.fileTotal });
    if (props.includeDescendants)
      return t('cloudSpace.scopeTreeCount', { folder: props.folderName || '', count: props.counts.total });
    return t('cloudSpace.scopeDirectCount', { count: props.counts.direct });
  });
</script>

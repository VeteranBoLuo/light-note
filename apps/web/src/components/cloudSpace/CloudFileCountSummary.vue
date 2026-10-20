<template>
  <span class="cloud-file-count-summary">{{ summary }}</span>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';

  const props = defineProps<{
    counts: { direct: number; total: number } | null;
    fileTotal: number;
    filtered: boolean;
    loading: boolean;
  }>();
  const { t } = useI18n();
  const result = computed(() =>
    props.loading
      ? t('common.loading')
      : t(props.filtered ? 'cloudSpace.filteredFileCount' : 'cloudSpace.fileCount', { count: props.fileTotal }),
  );
  const summary = computed(() => {
    if (!props.counts) return result.value;
    const folder = t('cloudSpace.folderFileCountSummary', props.counts);
    return props.filtered ? `${result.value} · ${folder}` : folder;
  });
</script>

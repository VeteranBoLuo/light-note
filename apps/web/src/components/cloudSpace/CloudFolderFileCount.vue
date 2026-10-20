<template>
  <BTooltip class="cloud-folder-file-count" :title="description" :aria-label="description">
    {{ totalCount }}
  </BTooltip>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';

  const props = defineProps<{ directCount: number; totalCount: number }>();
  const { t } = useI18n();
  const description = computed(() =>
    t('cloudSpace.folderFileCountDescription', { direct: props.directCount, total: props.totalCount }),
  );
</script>

<style scoped>
  .cloud-folder-file-count {
    flex: 0 0 auto;
    white-space: nowrap;
  }
</style>

<template>
  <BTooltip class="cloud-folder-file-count" :title="description" :aria-label="description">
    {{ directCount
    }}<span v-if="totalCount > directCount" class="cloud-folder-file-count__total">
      · {{ t('cloudSpace.folderFileCountTotal', { count: totalCount }) }}</span
    >
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
    gap: var(--ui-space-4, 4px);
    white-space: nowrap;
  }

  .cloud-folder-file-count__total {
    color: var(--desc-color);
  }
</style>

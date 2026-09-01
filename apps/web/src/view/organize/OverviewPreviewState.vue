<template>
  <div v-if="state === 'error'" class="overview-preview-state is-error" role="status">
    {{ t('organize.overview.previewUnavailable') }}
  </div>
  <div v-else-if="empty" class="overview-preview-state">{{ emptyLabel }}</div>
  <slot v-else />
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';

  defineProps<{
    state?: 'ready' | 'error';
    empty: boolean;
    emptyLabel: string;
  }>();

  const { t } = useI18n();
</script>

<style scoped lang="less">
  .overview-preview-state {
    min-height: 112px;
    display: grid;
    place-items: center;
    padding: 14px;
    box-sizing: border-box;
    color: var(--desc-color);
    font-size: 11px;
    text-align: center;
  }

  .overview-preview-state.is-error {
    color: var(--danger-color, #fe2c55);
  }
</style>

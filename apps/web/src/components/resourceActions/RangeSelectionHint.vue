<template>
  <p
    v-if="controller.desktopHintKey"
    class="range-selection-hint"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    >{{ t(controller.desktopHintKey) }}</p
  >
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { RangeSelectionController } from '@/composables/useRangeSelection';
  defineProps<{ controller: RangeSelectionController }>();
  const { t } = useI18n();
</script>

<style scoped>
  .range-selection-hint {
    position: absolute;
    /* Keep the hint above adjacent sticky group headings. */
    z-index: 4;
    bottom: calc(100% + var(--ui-space-8, 8px));
    left: 0;
    width: max-content;
    max-width: 100%;
    box-sizing: border-box;
    margin: 0;
    padding: var(--ui-space-6, 6px) var(--ui-space-10, 10px);
    border: 1px solid var(--workspace-purple-text);
    border-radius: 8px;
    color: var(--workspace-purple-text);
    background: var(--card-background);
    box-shadow: var(--surface-raised-shadow);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
    pointer-events: none;
  }
</style>

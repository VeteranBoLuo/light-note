<template>
  <BButton
    class="range-selection-toggle"
    :class="{ 'is-active': controller.selecting }"
    :disabled="!controller.available"
    :aria-pressed="controller.selecting"
    @click="controller.toggle()"
    @keydown.esc.stop.prevent="controller.reset()"
    >{{ t(controller.selecting ? 'resourceSelection.range.cancel' : 'resourceSelection.range.start') }}</BButton
  >
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import type { RangeSelectionController } from '@/composables/useRangeSelection';
  defineProps<{ controller: RangeSelectionController }>();
  const { t } = useI18n();
</script>

<style scoped>
  .range-selection-toggle.b_btn.is-active {
    box-shadow: inset 0 0 0 1px var(--workspace-purple-text);
    color: var(--workspace-purple-text);
  }
</style>

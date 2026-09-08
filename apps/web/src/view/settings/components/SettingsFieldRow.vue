<template>
  <div class="settings-field-row" :class="{ 'is-stacked': stacked }">
    <div class="settings-field-row__copy"
      ><strong>{{ label }}</strong
      ><p v-if="description">{{ description }}</p
      ><slot name="feedback"
    /></div>
    <div class="settings-field-row__control"><slot /></div>
  </div>
</template>
<script setup lang="ts">
  defineProps<{ label: string; description?: string; stacked?: boolean }>();
</script>
<style scoped lang="less">
  .settings-field-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 18px 0;
    min-height: 78px;
    border-bottom: 1px solid var(--surface-divider-color, var(--border-color));
    box-sizing: border-box;
  }
  .settings-field-row:last-child {
    border-bottom: 0;
  }
  .settings-field-row__copy {
    min-width: 0;
    flex: 1;
    max-width: 660px;
  }
  strong {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
  }
  p {
    margin: 5px 0 0;
    font-size: 12px;
    line-height: 1.7;
    color: var(--desc-color);
    overflow-wrap: anywhere;
  }
  .settings-field-row__control {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    max-width: 55%;
  }
  .is-stacked {
    flex-wrap: wrap;
  }
  .is-stacked .settings-field-row__control {
    max-width: 100%;
  }
  :global(.settings-page .is-mobile-sub .settings-field-row) {
    gap: 12px;
    padding: 14px 0;
    min-height: 72px;
  }
  :global(.settings-page .is-mobile-sub .is-stacked .settings-field-row__control) {
    width: 100%;
  }
</style>

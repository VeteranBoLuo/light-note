<template>
  <div class="pending-filter-section">
    <div class="filter-section-heading">
      <span class="filter-section-title">{{ t('inbox.filterStatus') }}</span>
      <slot name="actions" />
    </div>
    <BCheckbox :checked="modelValue" controlled @change="$emit('update:modelValue', $event)">
      {{ t('inbox.pendingFilter') }}
    </BCheckbox>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  defineProps<{ modelValue: boolean }>();
  defineEmits<{ 'update:modelValue': [value: boolean] }>();
  const { t } = useI18n();
</script>

<style scoped>
  .pending-filter-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 8px 12px;
    border-bottom: 1px solid var(--surface-divider-color);
    flex-shrink: 0;
  }
  .filter-section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 28px;
    gap: 8px;
  }
  .filter-section-title {
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.5;
  }
  .pending-filter-section :deep(.b-checkbox) {
    min-height: 32px;
  }
</style>

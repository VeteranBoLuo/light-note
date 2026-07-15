<template>
  <span class="inbox-pending-badge">{{ t('inbox.pendingBadge') }}</span>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();
</script>

<style scoped>
  .inbox-pending-badge {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    padding: 2px 7px;
    border-radius: 999px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, var(--background-color));
    font-size: 11px;
    font-weight: 600;
    line-height: 1.5;
    white-space: nowrap;
  }
</style>

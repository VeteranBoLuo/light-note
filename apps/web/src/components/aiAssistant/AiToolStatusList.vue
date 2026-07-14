<template>
  <div v-if="items.length" class="ai-tool-status-list" aria-live="polite">
    <div v-for="item in items" :key="`${item.round || 1}:${item.name}`" class="ai-tool-status" :class="`status-${item.status}`">
      <span class="ai-tool-status__dot" aria-hidden="true"></span>
      <span>{{ t(`ai.tools.${item.name}`, item.name) }}</span>
      <small>{{ statusLabel(item.status) }}</small>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';

  export interface AiToolStatusItem {
    name: string;
    status: 'running' | 'success' | 'error' | 'confirmation_required';
    round?: number;
  }

  defineProps<{ items: AiToolStatusItem[] }>();
  const { t } = useI18n();
  const statusLabel = (status: AiToolStatusItem['status']) =>
    t(`ai.toolStatus.${status}`);
</script>

<style scoped lang="less">
  .ai-tool-status-list { display: flex; flex-wrap: wrap; gap: 6px; margin: -10px 0 18px 44px; }
  .ai-tool-status {
    display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border-radius: 999px;
    background: var(--menu-item-h-bg-color); color: var(--text-color); font-size: 12px;
  }
  .ai-tool-status small { color: var(--desc-color); }
  .ai-tool-status__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--desc-color); }
  .status-running .ai-tool-status__dot { background: #615ced; animation: tool-pulse 1s ease-in-out infinite; }
  .status-success .ai-tool-status__dot { background: #10b981; }
  .status-error .ai-tool-status__dot { background: #ef4444; }
  .status-confirmation_required .ai-tool-status__dot { background: #f59e0b; }
  @keyframes tool-pulse { 50% { opacity: .35; } }
  @media (max-width: 768px) { .ai-tool-status-list { margin-left: 0; } }
</style>

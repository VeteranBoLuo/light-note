<template>
  <div v-if="displayItems.length" class="ai-tool-progress">
    <ReplyLoading v-if="showProgress" :label="progressLabel" />

    <div v-else class="ai-tool-summary">
      <BButton
        class="ai-tool-summary__trigger"
        role="button"
        tabindex="0"
        :aria-expanded="detailsVisible"
        @click="toggleDetails"
        @keydown.enter.prevent="toggleDetails"
        @keydown.space.prevent="toggleDetails"
      >
        <span>{{ summaryLabel }}</span>
        <small>{{ detailsVisible ? t('ai.toolProgress.hideDetails') : t('ai.toolProgress.viewDetails') }}</small>
      </BButton>

      <div v-if="detailsVisible" class="ai-tool-summary__details">
        <div v-for="item in displayItems" :key="item.name" class="ai-tool-summary__item">
          <span class="ai-tool-summary__dot" :class="`status-${item.status}`" aria-hidden="true"></span>
          <span>{{ toolLabel(item.name) }}</span>
          <small>{{ statusLabel(item.status) }}</small>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import ReplyLoading from './ReplyLoading.vue';
  import { AI_WRITE_TOOL_NAMES } from '@/config/aiTools';

  export interface AiToolStatusItem {
    name: string;
    status: 'running' | 'success' | 'error' | 'confirmation_required' | 'interaction_required';
    round?: number;
  }

  const props = defineProps<{
    items: AiToolStatusItem[];
    hasContent?: boolean;
  }>();

  const { t, te } = useI18n();
  const detailsVisible = ref(false);

  const latestItems = computed(() => {
    const latestByName = new Map<string, AiToolStatusItem>();
    props.items.forEach((item) => {
      latestByName.set(item.name, item);
    });
    return [...latestByName.values()];
  });

  const displayItems = computed(() =>
    props.hasContent ? latestItems.value.filter((item) => !AI_WRITE_TOOL_NAMES.has(item.name)) : latestItems.value,
  );

  const runningItem = computed(() => [...displayItems.value].reverse().find((item) => item.status === 'running'));
  const hasRunning = computed(() => Boolean(runningItem.value));
  const showProgress = computed(() => !props.hasContent || hasRunning.value);
  const successCount = computed(() => displayItems.value.filter((item) => item.status === 'success').length);
  const errorCount = computed(() => displayItems.value.filter((item) => item.status === 'error').length);

  function toolLabel(name: string) {
    const key = `ai.tools.${name}`;
    return te(key) ? t(key) : t('ai.tools.generic');
  }

  const progressLabel = computed(() => {
    if (runningItem.value) {
      const key = AI_WRITE_TOOL_NAMES.has(runningItem.value.name)
        ? 'ai.toolProgress.preparingAction'
        : 'ai.toolProgress.reading';
      return t(key, { target: toolLabel(runningItem.value.name) });
    }
    if (displayItems.value.some((item) => item.status === 'confirmation_required')) {
      return t('ai.toolProgress.awaitingConfirmation');
    }
    if (displayItems.value.some((item) => item.status === 'interaction_required')) {
      return t('ai.toolProgress.awaitingChoice');
    }
    if (errorCount.value) {
      return t(
        displayItems.value.every((item) => AI_WRITE_TOOL_NAMES.has(item.name))
          ? 'ai.toolProgress.actionFailed'
          : 'ai.toolProgress.partialFailure',
      );
    }
    return t('ai.toolProgress.preparingAnswer');
  });

  const summaryLabel = computed(() => {
    const total = displayItems.value.length;
    if (errorCount.value) {
      return t('ai.toolProgress.summaryPartial', { success: successCount.value, total });
    }
    return t('ai.toolProgress.summary', { count: total });
  });

  const statusLabel = (status: AiToolStatusItem['status']) => t(`ai.toolStatus.${status}`);

  function toggleDetails() {
    detailsVisible.value = !detailsVisible.value;
  }
</script>

<style scoped lang="less">
  .ai-tool-progress {
    width: 100%;
    margin-top: 6px;
  }

  .ai-tool-summary {
    display: grid;
    justify-items: start;
    gap: 6px;
  }

  .ai-tool-summary__trigger {
    width: auto;
    height: 28px;
    gap: 7px;
    padding: 0 9px;
    border: 0;
    border-radius: 999px;
    color: var(--desc-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--background-color));
    font-size: 12px;
  }

  .ai-tool-summary__trigger:hover,
  .ai-tool-summary__trigger:focus-visible {
    color: var(--text-color);
    background: color-mix(in srgb, var(--primary-color) 13%, var(--background-color));
  }

  .ai-tool-summary__trigger:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--primary-color) 48%, transparent);
    outline-offset: 1px;
  }

  .ai-tool-summary__trigger small {
    color: var(--primary-color);
    font-size: 11px;
  }

  .ai-tool-summary__details {
    display: grid;
    width: min(360px, 100%);
    gap: 5px;
    padding: 8px 10px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 4%, var(--card-background));
    box-sizing: border-box;
  }

  .ai-tool-summary__item {
    display: grid;
    grid-template-columns: 7px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    color: var(--text-color);
    font-size: 12px;
  }

  .ai-tool-summary__item small {
    color: var(--desc-color);
  }

  .ai-tool-summary__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--desc-color);
  }

  .ai-tool-summary__dot.status-running {
    background: var(--primary-color);
  }

  .ai-tool-summary__dot.status-success {
    background: var(--message-success-color);
  }

  .ai-tool-summary__dot.status-error {
    background: var(--message-error-color);
  }

  .ai-tool-summary__dot.status-confirmation_required {
    background: var(--message-warning-color);
  }

  .ai-tool-summary__dot.status-interaction_required {
    background: var(--primary-color);
  }
</style>

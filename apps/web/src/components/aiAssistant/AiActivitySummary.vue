<template>
  <section v-if="visible" class="ai-activity" :aria-label="t('ai.activity.title')">
    <div class="ai-activity__card" role="status">
      <BButton
        v-if="hasExpandableDetails"
        class="ai-activity__toggle"
        :aria-expanded="expanded"
        :aria-label="summary"
        @click="expanded = !expanded"
      >
        <SvgIcon :src="summaryIcon" size="14" aria-hidden="true" />
        <span>{{ summary }}</span>
        <small>{{ t(expanded ? 'ai.activity.hideDetails' : 'ai.activity.showDetails') }}</small>
      </BButton>
      <div v-else class="ai-activity__summary">
        <SvgIcon :src="summaryIcon" size="14" aria-hidden="true" />
        <span>{{ diagnosticItems[0]?.label }}</span>
        <small>{{ t('ai.activity.notCompleted') }}</small>
      </div>
      <div v-if="hasExpandableDetails && expanded" class="ai-activity__details" role="list">
        <div v-for="item in diagnosticItems" :key="item.key" class="ai-activity__item" role="listitem">
          <SvgIcon :src="statusIcon(item.status)" size="14" aria-hidden="true" />
          <span>{{ item.label }}</span>
          <small>{{ t('ai.activity.notCompleted') }}</small>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  interface ToolEvent {
    name: string;
    status: 'running' | 'success' | 'error' | 'confirmation_required' | 'interaction_required';
    round?: number;
  }

  interface ActivityItem {
    key: string;
    label: string;
    meta: string;
    status: 'running' | 'success' | 'warning' | 'error';
  }

  const props = withDefaults(
    defineProps<{
      activity?: Array<Record<string, unknown> | string>;
      toolEvents?: ToolEvent[];
      streaming?: boolean;
    }>(),
    { activity: () => [], toolEvents: () => [], streaming: false },
  );
  const { t } = useI18n();
  const expanded = ref(false);

  function stageLabel(stage: string) {
    const supported = new Set([
      'accepted',
      'planning',
      'retrieving',
      'reading',
      'tool_execution',
      'responding',
      'answering',
      'saving',
      'soft_deadline',
      'completed',
      'failed',
    ]);
    return t(`ai.activity.stages.${supported.has(stage) ? stage : 'working'}`);
  }

  const items = computed<ActivityItem[]>(() => {
    const result: ActivityItem[] = [];
    for (const [index, raw] of props.activity.entries()) {
      if (typeof raw === 'string') {
        result.push({ key: `text:${index}`, label: raw.slice(0, 240), meta: '', status: 'success' });
        continue;
      }
      // 记忆影响有独立、可操作的展示卡；不再把它重复计作内部执行阶段。
      if (raw.event === 'memory_context') continue;
      const stage = String(raw.stage || raw.kind || 'working');
      const elapsedMs = Number(raw.elapsedMs || 0);
      const status = String(raw.status || 'success');
      result.push({
        key: `stage:${stage}:${index}`,
        label: stageLabel(stage),
        meta: elapsedMs > 0 ? t('ai.activity.elapsed', { seconds: Math.max(1, Math.round(elapsedMs / 1000)) }) : '',
        status:
          status === 'error' || stage === 'failed'
            ? 'error'
            : status === 'running' || props.streaming
              ? 'running'
              : 'success',
      });
    }
    for (const tool of props.toolEvents) {
      result.push({
        key: `tool:${tool.name}:${tool.round || 1}`,
        label: t(`ai.tools.${tool.name}`, tool.name),
        meta: t(`ai.toolStatus.${tool.status}`),
        status:
          tool.status === 'error'
            ? 'error'
            : tool.status === 'running'
              ? 'running'
              : tool.status === 'confirmation_required' || tool.status === 'interaction_required'
                ? 'warning'
                : 'success',
      });
    }
    return result;
  });
  // “等待确认 / 等待选择”由下面真正可操作的确认卡、选择卡承接。
  // 不能再把它们包装成另一张“查看详情”卡，否则会把用户的注意力从最终动作上移开。
  // 这里只保留真实失败，并等本轮回答完成后再作为执行回执展示：
  // 流式期间由 ReplyLoading 解释当前阶段，不能让终态卡先于回答正文出现。
  const diagnosticItems = computed(() => items.value.filter((item) => item.status === 'error'));
  const visible = computed(() => !props.streaming && diagnosticItems.value.length > 0);
  const hasExpandableDetails = computed(() => diagnosticItems.value.length > 1);
  const summary = computed(() => t('ai.activity.failedSummary', { count: diagnosticItems.value.length }));
  const summaryIcon = computed(() => icon.message.error);

  function statusIcon(status: ActivityItem['status']) {
    if (status === 'error') return icon.message.error;
    if (status === 'warning') return icon.message.warning;
    if (status === 'running') return icon.ai.thinking;
    return icon.message.success;
  }
</script>

<style scoped lang="less">
  .ai-activity {
    width: min(680px, calc(100% - 44px));
    margin: 0 0 12px 44px;
  }

  .ai-activity__card {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    background: color-mix(in srgb, var(--primary-color) 3%, var(--card-background));
  }

  .ai-activity__summary,
  .ai-activity__toggle {
    width: 100%;
    min-height: 34px;
    display: flex;
    box-sizing: border-box;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    color: var(--desc-color);
    text-align: left;
  }

  .ai-activity__toggle {
    height: auto;
    justify-content: flex-start;
    border: 0 !important;
    border-radius: 0;
    background: transparent;
  }

  .ai-activity__toggle:hover {
    background: var(--hover-background);
  }

  .ai-activity__summary span,
  .ai-activity__toggle span {
    min-width: 0;
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
  }

  .ai-activity__summary small,
  .ai-activity__toggle small,
  .ai-activity__item small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .ai-activity__details {
    display: grid;
    gap: 4px;
    padding: 8px 10px;
    border-top: 1px solid var(--surface-border-color);
    background: color-mix(in srgb, var(--workspace-panel-bg-color, var(--card-background)) 80%, transparent);
  }

  .ai-activity__item {
    display: flex;
    min-height: 24px;
    align-items: center;
    gap: 7px;
    color: var(--text-color);
    font-size: 12px;
  }

  .ai-activity__item span {
    min-width: 0;
    flex: 1;
  }

  @container ai-chat (max-width: 520px) {
    .ai-activity {
      width: 100%;
      margin: 4px 0 12px;
    }

    .ai-activity__toggle {
      min-height: 44px;
    }

    .ai-activity__summary {
      min-height: 44px;
    }
  }
</style>

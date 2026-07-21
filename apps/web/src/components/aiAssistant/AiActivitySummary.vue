<template>
  <section v-if="visible" class="ai-activity" :aria-label="t('ai.activity.title')">
    <BButton class="ai-activity__toggle" :aria-expanded="expanded" :aria-label="summary" @click="expanded = !expanded">
      <SvgIcon :src="summaryIcon" size="14" aria-hidden="true" />
      <span>{{ summary }}</span>
      <small>{{ t('ai.activity.details') }}</small>
    </BButton>
    <div v-if="expanded" class="ai-activity__details" role="list">
      <div v-for="item in items" :key="item.key" class="ai-activity__item" role="listitem">
        <SvgIcon :src="statusIcon(item.status)" size="14" aria-hidden="true" />
        <span>{{ item.label }}</span>
        <small v-if="item.meta">{{ item.meta }}</small>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
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
  const hasError = computed(() => items.value.some((item) => item.status === 'error' || item.status === 'warning'));
  // 只在有失败/需注意(error/warning)时展示——此时活动摘要用于诚实披露过程与失败(方案 §7.4:关键失败不得隐藏)。
  // 干净进行中的进度已由下方 ReplyLoading 阶段文案(如"正在组织回答…")承担,故不再在流式期间弹这张"相关内容/查看
  // 详情"卡:成功场景它与阶段文案+参考来源卡重复,回答完就消失、纯属噪音。
  const visible = computed(() => items.value.length > 0 && hasError.value);
  const summary = computed(() => {
    if (hasError.value) return t('ai.activity.needsAttention', { count: items.value.length });
    if (props.streaming) return items.value.at(-1)?.label || t('ai.activity.inProgress');
    return t('ai.activity.completed', { count: items.value.length });
  });
  const summaryIcon = computed(() =>
    hasError.value ? icon.message.warning : props.streaming ? icon.ai.thinking : icon.message.success,
  );

  function statusIcon(status: ActivityItem['status']) {
    if (status === 'error') return icon.message.error;
    if (status === 'warning') return icon.message.warning;
    if (status === 'running') return icon.ai.thinking;
    return icon.message.success;
  }

  watch(
    hasError,
    (value) => {
      if (value) expanded.value = true;
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .ai-activity {
    display: grid;
    width: min(680px, calc(100% - 44px));
    gap: 6px;
    margin: -8px 0 12px 44px;
  }

  .ai-activity__toggle {
    width: 100%;
    min-height: 34px;
    justify-content: flex-start;
    gap: 7px;
    padding: 0 10px;
    border: 1px solid var(--surface-border-color);
    background: color-mix(in srgb, var(--primary-color) 3%, var(--card-background));
    color: var(--desc-color);
    text-align: left;
  }

  .ai-activity__toggle span {
    min-width: 0;
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
  }

  .ai-activity__toggle small,
  .ai-activity__item small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .ai-activity__details {
    display: grid;
    gap: 4px;
    padding: 8px 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    background: var(--workspace-panel-bg-color, var(--card-background));
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
      margin: 2px 0 12px;
    }

    .ai-activity__toggle {
      min-height: 44px;
    }
  }
</style>

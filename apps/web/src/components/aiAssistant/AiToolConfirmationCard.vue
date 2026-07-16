<template>
  <div class="tool-confirmation-card" :class="`status-${status}`">
    <div class="tool-confirmation-copy">
      <strong>{{ t('ai.confirmationTitle') }}</strong>
      <span>{{ toolLabel }}</span>
      <span class="risk-badge" :class="`risk-${confirmation.riskLevel || 'low'}`">
        {{ t(`ai.risk.${confirmation.riskLevel || 'low'}`) }}
      </span>
      <dl v-if="confirmation.preview" class="operation-preview">
        <template v-if="confirmation.preview.target">
          <dt>{{ t('ai.confirmationTarget') }}</dt>
          <dd>{{ confirmation.preview.target }}</dd>
        </template>
        <template v-if="confirmation.preview.impact">
          <dt>{{ t('ai.confirmationImpact') }}</dt>
          <dd>{{ confirmation.preview.impact }}</dd>
        </template>
      </dl>
      <pre v-if="argsText">{{ argsText }}</pre>
      <small>{{ t('ai.confirmationRemaining', { seconds: remainingSeconds }) }}</small>
    </div>
    <div v-if="status === 'pending'" class="tool-confirmation-actions">
      <BButton size="small" :disabled="loading" @click="cancel">{{ t('common.cancel') }}</BButton>
      <BButton type="primary" size="small" :loading="loading" @click="confirm">{{ t('ai.confirmExecution') }}</BButton>
    </div>
    <span v-else class="tool-confirmation-result">{{ resultText }}</span>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import bMessage from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';

  interface Confirmation {
    token: string;
    id: string;
    sessionId: string;
    toolName: string;
    args: Record<string, unknown>;
    expiresIn: number;
    riskLevel?: 'low' | 'medium' | 'high';
    preview?: { title?: string; target?: string; impact?: string };
  }

  const props = defineProps<{ confirmation: Confirmation }>();
  const emit = defineEmits<{ resolved: [summary: string, sources: any[]] }>();
  const { t } = useI18n();
  const loading = ref(false);
  const status = ref<'pending' | 'confirmed' | 'cancelled' | 'failed' | 'expired'>('pending');
  const resultText = ref('');
  const expiresAt = Date.now() + Math.max(0, Number(props.confirmation.expiresIn || 0)) * 1000;
  const remainingSeconds = ref(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
  let countdownTimer: number | null = null;

  const refreshCountdown = () => {
    remainingSeconds.value = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    if (remainingSeconds.value === 0 && status.value === 'pending') {
      status.value = 'expired';
      resultText.value = t('ai.confirmationExpired');
      if (countdownTimer) window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };

  onMounted(() => {
    refreshCountdown();
    if (status.value === 'pending') countdownTimer = window.setInterval(refreshCountdown, 1000);
  });
  onUnmounted(() => {
    if (countdownTimer) window.clearInterval(countdownTimer);
  });

  const toolLabel = computed(() => t(`ai.tools.${props.confirmation.toolName}`, props.confirmation.toolName));
  const argsText = computed(() => {
    const text = JSON.stringify(props.confirmation.args || {}, null, 2);
    return text === '{}' ? '' : text.slice(0, 1200);
  });

  async function confirm() {
    if (loading.value || status.value !== 'pending' || remainingSeconds.value <= 0) return;
    loading.value = true;
    try {
      const res = await apiBasePost('/api/chat/agent/confirm', {
        confirmationToken: props.confirmation.token,
        sessionId: props.confirmation.sessionId,
      });
      if (res.status !== 200) throw new Error(res.msg || t('ai.confirmationFailed'));
      status.value = 'confirmed';
      resultText.value = res.data?.summary || t('ai.confirmationCompleted');
      emit('resolved', resultText.value, Array.isArray(res.data?.sources) ? res.data.sources : []);
      recordOperation({
        ...OPERATION_LOG_MAP.aiAssistant.confirmTool,
        operation: `确认执行 AI 工具成功【${toolLabel.value}】`,
      });
      bMessage.success(t('ai.confirmationCompleted'));
    } catch (error: any) {
      status.value = 'failed';
      resultText.value = error?.message || t('ai.confirmationFailed');
      bMessage.error(resultText.value);
    } finally {
      loading.value = false;
    }
  }

  async function cancel() {
    if (loading.value || status.value !== 'pending' || remainingSeconds.value <= 0) return;
    loading.value = true;
    try {
      const res = await apiBasePost('/api/chat/agent/confirm/reject', {
        confirmationToken: props.confirmation.token,
        sessionId: props.confirmation.sessionId,
      });
      if (res.status !== 200) throw new Error(res.msg || t('ai.confirmationFailed'));
      status.value = 'cancelled';
      resultText.value = t('ai.confirmationCancelled');
    } catch (error: any) {
      status.value = 'failed';
      resultText.value = error?.message || t('ai.confirmationFailed');
      bMessage.error(resultText.value);
    } finally {
      loading.value = false;
    }
  }
</script>

<style scoped lang="less">
  .tool-confirmation-card {
    margin: -12px 0 20px 44px;
    padding: 14px;
    border: 1px solid rgba(245, 158, 11, 0.45);
    border-radius: 12px;
    background: color-mix(in srgb, var(--background-color) 94%, #f59e0b 6%);
    color: var(--text-color);
  }
  .tool-confirmation-copy {
    display: grid;
    gap: 6px;
    font-size: 13px;
  }
  .risk-badge {
    width: fit-content;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    background: rgba(16, 185, 129, 0.12);
    color: #059669;
  }
  .risk-medium {
    background: rgba(245, 158, 11, 0.14);
    color: #d97706;
  }
  .risk-high {
    background: rgba(239, 68, 68, 0.12);
    color: #dc2626;
  }
  .operation-preview {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 4px 10px;
    margin: 2px 0;
    font-size: 13px;
  }
  .operation-preview dt {
    color: var(--desc-color);
  }
  .operation-preview dd {
    margin: 0;
    word-break: break-word;
  }
  pre {
    max-height: 160px;
    margin: 4px 0;
    padding: 8px;
    overflow: auto;
    border-radius: 8px;
    background: var(--menu-item-h-bg-color);
    white-space: pre-wrap;
    word-break: break-word;
  }
  small,
  .tool-confirmation-result {
    color: var(--desc-color);
  }
  .tool-confirmation-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
  .status-confirmed {
    border-color: rgba(16, 185, 129, 0.45);
  }
  .status-failed {
    border-color: rgba(239, 68, 68, 0.45);
  }
  @media (max-width: 768px) {
    .tool-confirmation-card {
      margin-left: 0;
    }
  }
</style>

<template>
  <div class="tool-confirmation-card" :class="`status-${status}`">
    <div class="tool-confirmation-copy">
      <strong>{{ t('ai.confirmationTitle') }}</strong>
      <span>{{ toolLabel }}</span>
      <span class="risk-badge" :class="`risk-${confirmation.riskLevel || 'low'}`">
        {{ t(`ai.risk.${confirmation.riskLevel || 'low'}`) }}
      </span>
      <dl v-if="displayPreview" class="operation-preview">
        <template v-if="displayPreview.target">
          <dt>{{ t('ai.confirmationTarget') }}</dt>
          <dd>{{ displayPreview.target }}</dd>
        </template>
        <template v-if="displayPreview.impact">
          <dt>{{ t('ai.confirmationImpact') }}</dt>
          <dd>{{ displayPreview.impact }}</dd>
        </template>
        <template v-for="detail in displayPreview.details || []" :key="detail.key">
          <dt>{{ confirmationFieldLabel(detail.key) }}</dt>
          <dd>{{ detail.value }}</dd>
        </template>
      </dl>
      <pre v-if="argsText">{{ argsText }}</pre>
      <small>{{ t('ai.confirmationRemaining', { seconds: remainingSeconds }) }}</small>
      <small v-if="retryNotice" class="confirmation-retry-notice" aria-live="polite">{{ retryNotice }}</small>
    </div>
    <div v-if="status === 'pending'" class="tool-confirmation-actions">
      <BButton
        v-if="allowAlternativeActions"
        size="small"
        :disabled="loading"
        role="button"
        :tabindex="loading ? -1 : 0"
        :aria-disabled="loading"
        @click="cancel"
        @keydown.enter.prevent="cancel"
        @keydown.space.prevent="cancel"
      >
        {{ t('common.cancel') }}
      </BButton>
      <BButton
        v-if="editable && allowAlternativeActions"
        size="small"
        :disabled="loading"
        role="button"
        :tabindex="loading ? -1 : 0"
        :aria-disabled="loading"
        @click="modify"
        @keydown.enter.prevent="modify"
        @keydown.space.prevent="modify"
      >
        {{ t('ai.confirmationModify') }}
      </BButton>
      <BButton
        type="primary"
        size="small"
        :loading="loading"
        role="button"
        :tabindex="loading ? -1 : 0"
        :aria-disabled="loading"
        @click="confirm"
        @keydown.enter.prevent="confirm"
        @keydown.space.prevent="confirm"
      >
        {{ retryNotice ? t('ai.confirmationRetry') : t('ai.confirmExecution') }}
      </BButton>
    </div>
    <span v-else class="tool-confirmation-result" aria-live="polite">{{ resultText }}</span>
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
  import { isEditableAttachmentTool } from '@/config/aiTools';
  import { canAlterPendingConfirmation, isRetryableConfirmationError } from './confirmationRetry';
  import {
    buildLocalizedAttachmentConfirmationPreview,
    type AttachmentConfirmationPreviewLabels,
  } from './attachmentConfirmationPreview';
  import type {
    AiToolConfirmation,
    AiToolConfirmationResolution,
    AiToolConfirmationSettlement,
    AiToolConfirmationSettlementStatus,
  } from '@/types/aiAgent';

  const props = defineProps<{ confirmation: AiToolConfirmation }>();
  const emit = defineEmits<{
    resolved: [resolution: AiToolConfirmationResolution];
    edit: [confirmation: AiToolConfirmation];
    settled: [settlement: AiToolConfirmationSettlement];
  }>();
  const { t, te } = useI18n();
  const loading = ref(false);
  const status = ref<'pending' | 'confirmed' | 'cancelled' | 'failed' | 'expired'>('pending');
  const resultText = ref('');
  const retryNotice = ref('');
  let expiresAt = Date.now() + Math.max(0, Number(props.confirmation.expiresIn || 0)) * 1000;
  const retryWindowMs = 5 * 60 * 1000;
  const remainingSeconds = ref(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
  let countdownTimer: number | null = null;
  let settlementEmitted = false;

  function settle(settlementStatus: AiToolConfirmationSettlementStatus, summary: string) {
    if (settlementEmitted) return;
    settlementEmitted = true;
    emit('settled', {
      confirmationId: props.confirmation.id,
      toolName: props.confirmation.toolName,
      status: settlementStatus,
      summary,
    });
  }

  const stopCountdown = () => {
    if (countdownTimer) window.clearInterval(countdownTimer);
    countdownTimer = null;
  };

  const refreshCountdown = () => {
    remainingSeconds.value = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    if (remainingSeconds.value === 0 && status.value === 'pending') {
      if (loading.value) {
        expiresAt = Date.now() + retryWindowMs;
        remainingSeconds.value = Math.ceil(retryWindowMs / 1000);
        return;
      }
      retryNotice.value = '';
      status.value = 'expired';
      resultText.value = t('ai.confirmationExpired');
      stopCountdown();
      settle('expired', resultText.value);
    }
  };

  onMounted(() => {
    refreshCountdown();
    if (status.value === 'pending') countdownTimer = window.setInterval(refreshCountdown, 1000);
  });
  onUnmounted(() => {
    stopCountdown();
  });

  const toolLabel = computed(() => t(`ai.tools.${props.confirmation.toolName}`, props.confirmation.toolName));
  const editable = computed(() => isEditableAttachmentTool(props.confirmation.toolName));
  const allowAlternativeActions = computed(() => canAlterPendingConfirmation(Boolean(retryNotice.value)));
  const attachmentPreviewLabels = computed<AttachmentConfirmationPreviewLabels>(() => ({
    rootFolder: t('ai.attachmentAction.rootFolder'),
    noDescription: t('ai.attachmentAction.noDescription'),
    unknownValue: t('ai.attachmentAction.unknownValue'),
    saveImpact: t('ai.attachmentAction.preview.saveImpact'),
    saveCreateFolderImpact: t('ai.attachmentAction.preview.saveCreateFolderImpact'),
    saveAlreadySavedImpact: t('ai.attachmentAction.preview.saveAlreadySavedImpact'),
    createImageNoteImpact: t('ai.attachmentAction.preview.createImageNoteImpact'),
  }));
  const displayPreview = computed(
    () =>
      buildLocalizedAttachmentConfirmationPreview(props.confirmation, attachmentPreviewLabels.value) ||
      props.confirmation.preview,
  );
  const argsText = computed(() => {
    if (displayPreview.value?.details?.length) return '';
    const text = JSON.stringify(props.confirmation.args || {}, null, 2);
    return text === '{}' ? '' : text.slice(0, 1200);
  });

  function confirmationFieldLabel(key: string) {
    const translationKey = `ai.confirmationFields.${key}`;
    return te(translationKey) ? t(translationKey) : key;
  }

  function requestErrorMessage(error: any) {
    return error?.response?.data?.msg || error?.message || t('ai.confirmationFailed');
  }

  async function confirm() {
    if (loading.value || status.value !== 'pending' || remainingSeconds.value <= 0) return;
    loading.value = true;
    try {
      const res = await apiBasePost('/api/chat/agent/confirm', {
        confirmationToken: props.confirmation.token,
        sessionId: props.confirmation.sessionId,
      });
      if (res.status !== 200) throw new Error(res.msg || t('ai.confirmationFailed'));
      retryNotice.value = '';
      status.value = 'confirmed';
      stopCountdown();
      resultText.value = res.data?.summary || t('ai.confirmationCompleted');
      emit('resolved', {
        toolName: String(res.data?.toolName || props.confirmation.toolName),
        summary: resultText.value,
        sources: Array.isArray(res.data?.sources) ? res.data.sources : [],
      });
      settle('confirmed', resultText.value);
      recordOperation({
        ...OPERATION_LOG_MAP.aiAssistant.confirmTool,
        operation: `确认执行 AI 工具成功【${toolLabel.value}】`,
      });
      bMessage.success(t('ai.confirmationCompleted'));
    } catch (error: any) {
      if (isRetryableConfirmationError(error)) {
        expiresAt = Math.max(expiresAt, Date.now() + retryWindowMs);
        refreshCountdown();
        retryNotice.value = t('ai.confirmationRetryHint');
        bMessage.warning(retryNotice.value);
        return;
      }
      retryNotice.value = '';
      status.value = 'failed';
      stopCountdown();
      resultText.value = requestErrorMessage(error);
      bMessage.error(resultText.value);
      settle('failed', resultText.value);
    } finally {
      loading.value = false;
    }
  }

  async function rejectPending() {
    if (loading.value || status.value !== 'pending' || remainingSeconds.value <= 0) return;
    loading.value = true;
    try {
      const res = await apiBasePost('/api/chat/agent/confirm/reject', {
        confirmationToken: props.confirmation.token,
        sessionId: props.confirmation.sessionId,
      });
      if (res.status !== 200) throw new Error(res.msg || t('ai.confirmationFailed'));
      stopCountdown();
      return true;
    } catch (error: any) {
      status.value = 'failed';
      stopCountdown();
      resultText.value = requestErrorMessage(error);
      bMessage.error(resultText.value);
      settle('failed', resultText.value);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function cancel() {
    if (!(await rejectPending())) return;
    status.value = 'cancelled';
    resultText.value = t('ai.confirmationCancelled');
    settle('cancelled', resultText.value);
  }

  async function modify() {
    if (!editable.value || !(await rejectPending())) return;
    status.value = 'cancelled';
    resultText.value = t('ai.confirmationEditing');
    settle('editing', resultText.value);
    emit('edit', props.confirmation);
  }
</script>

<style scoped lang="less">
  .tool-confirmation-card {
    width: 100%;
    margin: 0;
    box-sizing: border-box;
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
  .confirmation-retry-notice {
    color: #d97706;
  }
  .tool-confirmation-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
  .tool-confirmation-actions :deep(.b_btn) {
    min-height: 38px;
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
    .tool-confirmation-actions :deep(.b_btn) {
      min-height: 44px;
    }
  }
</style>

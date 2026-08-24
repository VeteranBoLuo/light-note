<template>
  <BModal
    v-model:visible="visible"
    :title="t('settings.ai.usage.detail.title')"
    :show-footer="false"
    width="min(720px, 94vw)"
    height="min(720px, 86vh)"
    content-class="ai-usage-detail-modal__content"
    fullscreen-mobile
  >
    <div v-if="loading && !detail" class="detail-state" role="status" aria-live="polite">
      <BLoading inline :loading="true" :title="t('settings.ai.usage.detail.loading')" />
    </div>

    <div v-else-if="errorCode && !detail" class="detail-state detail-state--error" role="alert">
      <SvgIcon :src="icon.message.warning" size="24" aria-hidden="true" />
      <strong>{{ t('settings.ai.usage.detail.errorTitle') }}</strong>
      <span>{{ t('settings.ai.usage.detail.errorDescription') }}</span>
      <BButton size="small" @click="load(true)">{{ t('settings.ai.usage.retry') }}</BButton>
    </div>

    <div v-else-if="detail" class="usage-call-detail">
      <div v-if="errorCode" class="detail-inline-warning" role="status">
        <SvgIcon :src="icon.message.warning" size="14" aria-hidden="true" />
        {{ t('settings.ai.usage.detail.staleWarning') }}
      </div>

      <section class="detail-overview" aria-labelledby="usage-detail-overview-title">
        <div class="detail-heading">
          <span class="detail-heading-icon">
            <SvgIcon :src="icon.settings.ai" size="18" aria-hidden="true" />
          </span>
          <div>
            <div class="detail-title-row">
              <h3 id="usage-detail-overview-title">{{ actionLabel(detail.execution.labelKey) }}</h3>
              <span class="detail-status" :class="`is-${statusTone(detail.execution.status)}`">
                <SvgIcon :src="statusIcon(detail.execution.status)" size="12" aria-hidden="true" />
                {{ statusLabel(detail.execution.status) }}
              </span>
            </div>
            <p>
              {{ formatDateTime(detail.execution.createdAt) }} · {{ moduleLabel(detail.execution.module) }} ·
              {{ formatDuration(detail.execution.durationMs) }}
            </p>
          </div>
        </div>

        <div class="detail-metrics">
          <div>
            <span>{{ t('settings.ai.usage.detail.userCharged') }}</span>
            <strong>{{ formatNumber(detail.execution.chargedTokens) }}</strong>
            <small>tokens</small>
          </div>
          <div>
            <span>{{ t('settings.ai.usage.detail.providerTotal') }}</span>
            <strong>{{ formatNumber(detail.execution.providerTokens) }}</strong>
            <small>tokens</small>
          </div>
          <div>
            <span>{{ t('settings.ai.usage.detail.platformCovered') }}</span>
            <strong>{{ formatNumber(detail.execution.platformCoveredTokens) }}</strong>
            <small>tokens</small>
          </div>
        </div>
      </section>

      <section class="detail-calls" aria-labelledby="usage-detail-calls-title">
        <div class="detail-section-head">
          <div>
            <h4 id="usage-detail-calls-title">
              {{ t('settings.ai.usage.detail.callsTitle', { n: detail.execution.providerCallCount }) }}
            </h4>
            <p>{{ t('settings.ai.usage.detail.callsHint') }}</p>
          </div>
          <BButton class="detail-refresh" size="small" :loading="loading" @click="load(true)">
            <SvgIcon v-if="!loading" :src="icon.infrastructure.refresh" size="13" aria-hidden="true" />
            {{ t('settings.ai.usage.refresh') }}
          </BButton>
        </div>

        <ol v-if="detail.calls.length" class="call-timeline">
          <li v-for="call in detail.calls" :key="`${call.sequenceNo}-${call.createdAt}`" class="call-item">
            <span class="call-sequence" aria-hidden="true">{{ call.sequenceNo }}</span>
            <article class="call-card">
              <div class="call-head">
                <div>
                  <div class="call-title-row">
                    <strong>{{ stageLabel(call.stageType) }}</strong>
                    <span class="call-status" :class="`is-${statusTone(call.status)}`">
                      {{ statusLabel(call.status) }}
                    </span>
                  </div>
                  <p>{{ providerModel(call) }}</p>
                </div>
                <span class="billing-badge" :class="`is-${call.billingScope}`">
                  {{ billingLabel(call.billingScope) }}
                </span>
              </div>

              <div class="call-token-grid">
                <div>
                  <span>{{ t('settings.ai.usage.detail.inputTokens') }}</span>
                  <strong>{{ formatNumber(call.promptTokens) }}</strong>
                </div>
                <div>
                  <span>{{ t('settings.ai.usage.detail.outputTokens') }}</span>
                  <strong>{{ formatNumber(call.completionTokens) }}</strong>
                </div>
                <div>
                  <span>{{ t('settings.ai.usage.detail.totalTokens') }}</span>
                  <strong>{{ formatNumber(call.totalTokens) }}</strong>
                </div>
                <div>
                  <span>{{ t('settings.ai.usage.detail.duration') }}</span>
                  <strong>{{ formatDuration(call.durationMs) }}</strong>
                </div>
              </div>

              <div v-if="call.triggerReason" class="repair-reason">
                <SvgIcon :src="icon.message.info" size="15" aria-hidden="true" />
                <div>
                  <strong>{{ t('settings.ai.usage.detail.repairReasonTitle') }}</strong>
                  <p>{{ repairReasonLabel(call.triggerReason) }}</p>
                </div>
              </div>

              <div v-if="call.usageStatus === 'missing'" class="usage-missing">
                <SvgIcon :src="icon.message.warning" size="14" aria-hidden="true" />
                <span>
                  {{
                    t('settings.ai.usage.detail.usageMissing', {
                      n: formatNumber(call.estimatedTokens),
                    })
                  }}
                </span>
              </div>

              <div v-if="call.errorCategory" class="call-error">
                <SvgIcon :src="icon.message.error" size="14" aria-hidden="true" />
                {{ errorLabel(call.errorCategory) }}
              </div>
            </article>
          </li>
        </ol>

        <div v-else class="detail-empty">
          <SvgIcon :src="icon.message.info" size="20" aria-hidden="true" />
          {{ t('settings.ai.usage.detail.noCalls') }}
        </div>
      </section>

      <p class="detail-privacy">
        <SvgIcon :src="icon.message.info" size="14" aria-hidden="true" />
        {{ t('settings.ai.usage.detail.privacy') }}
      </p>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  interface UsageExecution {
    id: string;
    module: string;
    labelKey: string;
    createdAt: number;
    status: string;
    providerCallCount: number;
    providerTokens: number;
    chargedTokens: number;
    platformCoveredTokens: number;
    durationMs: number;
  }

  interface ProviderCall {
    sequenceNo: number;
    stageType: 'image_recognition' | 'output_repair' | 'model_generation';
    provider: string | null;
    model: string | null;
    status: string;
    usageStatus: 'reported' | 'missing';
    billingScope: 'user' | 'platform';
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedTokens: number;
    durationMs: number;
    createdAt: number;
    triggerReason: string | null;
    errorCategory: string | null;
  }

  interface UsageDetail {
    execution: UsageExecution;
    calls: ProviderCall[];
  }

  const props = defineProps<{ execution: UsageExecution | null }>();
  const visible = defineModel<boolean>('visible');
  const { t, locale } = useI18n();
  const loading = ref(false);
  const errorCode = ref('');
  const detail = ref<UsageDetail | null>(null);
  const cache = new Map<string, UsageDetail>();
  let requestSequence = 0;

  watch(
    () => [visible.value === true, props.execution?.id || ''] as const,
    ([isVisible, executionId]) => {
      if (!isVisible || !executionId) return;
      const cached = cache.get(executionId);
      detail.value = cached || null;
      errorCode.value = '';
      void load(false);
    },
    { immediate: true },
  );

  async function load(force = false) {
    const executionId = props.execution?.id;
    if (!executionId || !visible.value) return;
    if (!force && cache.has(executionId)) return;
    const current = ++requestSequence;
    loading.value = true;
    errorCode.value = '';
    try {
      const response = await apiBasePost('/api/chat/aiUsageDetail', { executionId }, { silent: true });
      if (current !== requestSequence || executionId !== props.execution?.id) return;
      if (Number(response?.status) !== 200 || !response?.data) throw new Error('AI_USAGE_DETAIL_REQUEST_FAILED');
      const next = response.data as UsageDetail;
      cache.set(executionId, next);
      detail.value = next;
    } catch (error: any) {
      if (current !== requestSequence || executionId !== props.execution?.id) return;
      errorCode.value = String(error?.data?.code || error?.code || 'AI_USAGE_DETAIL_REQUEST_FAILED');
    } finally {
      if (current === requestSequence) loading.value = false;
    }
  }

  function formatNumber(value: unknown) {
    const number = Number(value || 0);
    return new Intl.NumberFormat(locale.value).format(Number.isFinite(number) ? Math.max(0, number) : 0);
  }

  function formatDateTime(value: number) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale.value, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }

  function formatDuration(value: unknown) {
    const milliseconds = Math.max(0, Number(value || 0));
    if (!Number.isFinite(milliseconds)) return '—';
    if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
    return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`;
  }

  function actionLabel(labelKey: string) {
    return t(`settings.ai.usage.actions.${labelKey || 'otherAiAction'}`);
  }

  function moduleLabel(module: string) {
    const allowed = ['note', 'bookmark', 'file', 'todo', 'search', 'help', 'tag'];
    return t(`settings.ai.usage.modules.${allowed.includes(module) ? module : 'other'}`);
  }

  function statusTone(status: string) {
    if (status === 'success') return 'success';
    if (status === 'aborted') return 'neutral';
    if (status === 'partial' || status === 'quota_blocked' || status === 'running') return 'warning';
    return 'error';
  }

  function statusLabel(status: string) {
    const key = ['success', 'partial', 'aborted', 'quota_blocked', 'running'].includes(status) ? status : 'failed';
    return t(`settings.ai.usage.status.${key}`);
  }

  function statusIcon(status: string) {
    if (status === 'success') return icon.message.success;
    if (status === 'aborted') return icon.common.stop;
    if (status === 'partial' || status === 'quota_blocked') return icon.message.warning;
    if (status === 'running') return icon.message.loading;
    return icon.message.error;
  }

  function stageLabel(stage: ProviderCall['stageType']) {
    return t(`settings.ai.usage.detail.stages.${stage}`);
  }

  function billingLabel(scope: ProviderCall['billingScope']) {
    return t(`settings.ai.usage.detail.billing.${scope}`);
  }

  function repairReasonLabel(reason: string) {
    const known = [
      'source_required',
      'source_invalid',
      'coverage_overclaim',
      'too_short',
      'structured_output_missing',
      'structured_output_invalid',
      'other_protocol_check',
      'historical_unknown',
    ];
    return t(`settings.ai.usage.detail.repairReasons.${known.includes(reason) ? reason : 'historical_unknown'}`);
  }

  function errorLabel(category: string) {
    const known = ['timeout', 'aborted', 'quota', 'network', 'provider_failed'];
    return t(`settings.ai.usage.detail.errors.${known.includes(category) ? category : 'provider_failed'}`);
  }

  function providerModel(call: ProviderCall) {
    if (call.provider && call.model) return `${call.provider} · ${call.model}`;
    return call.model || call.provider || t('settings.ai.usage.detail.providerUnknown');
  }
</script>

<style scoped lang="less">
  .detail-state {
    display: flex;
    min-height: 280px;
    align-items: center;
    justify-content: center;
  }

  .detail-state--error {
    flex-direction: column;
    gap: 8px;
    padding: 24px;
    border: 1px solid var(--error-color, #c33f47);
    border-radius: 10px;
    color: var(--desc-color);
    text-align: center;
    font-size: 12px;
  }

  .detail-state--error strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .usage-call-detail {
    min-width: 0;
  }

  .detail-inline-warning,
  .detail-privacy,
  .usage-missing,
  .call-error {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .detail-inline-warning {
    margin-bottom: 10px;
    padding: 8px 10px;
    border: 1px solid var(--warning-color, #a86700);
    border-radius: 8px;
    color: var(--warning-color, #a86700);
    font-size: 11px;
  }

  .detail-overview {
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }

  .detail-heading,
  .detail-title-row,
  .detail-section-head,
  .call-head,
  .call-title-row {
    display: flex;
    align-items: center;
  }

  .detail-heading {
    gap: 10px;
  }

  .detail-heading-icon {
    display: inline-flex;
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--primary-btn-bg-color);
  }

  .detail-title-row {
    flex-wrap: wrap;
    gap: 7px;
  }

  .detail-title-row h3,
  .detail-section-head h4 {
    margin: 0;
    color: var(--text-color);
  }

  .detail-title-row h3 {
    font-size: 14px;
  }

  .detail-heading p,
  .detail-section-head p,
  .call-head p,
  .repair-reason p {
    margin: 3px 0 0;
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.45;
  }

  .detail-status,
  .call-status,
  .billing-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-height: 19px;
    box-sizing: border-box;
    padding: 2px 6px;
    border: 1px solid currentColor;
    border-radius: 999px;
    font-size: 9.5px;
    line-height: 1;
  }

  .is-success {
    color: var(--success-color, #23845b);
  }

  .is-warning {
    color: var(--warning-color, #a86700);
  }

  .is-error {
    color: var(--error-color, #c33f47);
  }

  .is-neutral {
    color: var(--desc-color);
  }

  .detail-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-top: 12px;
  }

  .detail-metrics > div {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 6px;
    padding: 8px 9px;
    border: 1px solid var(--surface-divider-color);
    border-radius: 8px;
  }

  .detail-metrics span {
    grid-column: 1 / -1;
    color: var(--desc-color);
    font-size: 9.5px;
  }

  .detail-metrics strong {
    color: var(--text-color);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .detail-metrics small {
    align-self: end;
    color: var(--desc-color);
    font-size: 8.5px;
  }

  .detail-calls {
    margin-top: 16px;
  }

  .detail-section-head {
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .detail-section-head h4 {
    font-size: 13px;
  }

  .detail-refresh {
    flex: 0 0 auto;
    gap: 5px;
  }

  .call-timeline {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .call-item {
    position: relative;
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr);
    gap: 9px;
  }

  .call-item:not(:last-child)::before {
    position: absolute;
    top: 28px;
    bottom: -12px;
    left: 12px;
    width: 2px;
    background: var(--surface-divider-color);
    content: '';
  }

  .call-sequence {
    z-index: 1;
    display: inline-flex;
    width: 26px;
    height: 26px;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--primary-color);
    border-radius: 50%;
    color: var(--primary-color);
    background: var(--background-color);
    font-size: 10px;
    font-weight: 700;
  }

  .call-card {
    min-width: 0;
    padding: 11px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .call-head {
    justify-content: space-between;
    gap: 10px;
  }

  .call-title-row {
    flex-wrap: wrap;
    gap: 6px;
  }

  .call-title-row > strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .call-head p {
    overflow-wrap: anywhere;
  }

  .billing-badge.is-user {
    color: var(--primary-color);
  }

  .billing-badge.is-platform {
    color: var(--success-color, #23845b);
  }

  .call-token-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    margin-top: 10px;
  }

  .call-token-grid > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 7px;
    border: 1px solid var(--surface-divider-color);
    border-radius: 7px;
  }

  .call-token-grid span {
    color: var(--desc-color);
    font-size: 9px;
  }

  .call-token-grid strong {
    overflow: hidden;
    color: var(--text-color);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
  }

  .repair-reason {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin-top: 9px;
    padding: 8px;
    border: 1px solid var(--primary-color);
    border-radius: 8px;
    color: var(--primary-color);
  }

  .repair-reason > :first-child {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  .repair-reason strong {
    color: var(--text-color);
    font-size: 10.5px;
  }

  .usage-missing,
  .call-error {
    margin-top: 8px;
    padding: 7px 8px;
    border-radius: 7px;
    font-size: 10px;
  }

  .usage-missing {
    border: 1px solid var(--warning-color, #a86700);
    color: var(--warning-color, #a86700);
  }

  .call-error {
    border: 1px solid var(--error-color, #c33f47);
    color: var(--error-color, #c33f47);
  }

  .detail-empty {
    display: flex;
    min-height: 120px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px dashed var(--surface-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .detail-privacy {
    margin: 14px 0 0;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.45;
  }

  .detail-privacy > :first-child {
    flex: 0 0 auto;
    margin-top: 1px;
    color: var(--primary-color);
  }

  @media (max-width: 767px) {
    :global(.ai-usage-detail-modal__content) {
      box-sizing: border-box;
      padding: 12px 16px calc(16px + env(safe-area-inset-bottom)) !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      overscroll-behavior-y: contain;
      touch-action: pan-y;
      -webkit-overflow-scrolling: touch;
    }

    .detail-state {
      min-height: 60vh;
    }

    .detail-metrics {
      grid-template-columns: 1fr;
    }

    .detail-section-head {
      align-items: flex-start;
    }

    .detail-refresh {
      min-height: 44px;
      padding-inline: 12px;
    }

    .call-token-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .call-head {
      align-items: flex-start;
      flex-direction: column;
    }

    .billing-badge {
      min-height: 22px;
    }
  }
</style>

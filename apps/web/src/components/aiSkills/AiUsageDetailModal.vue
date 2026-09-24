<template>
  <BModal
    v-model:visible="visible"
    :title="t('settings.ai.usage.detail.title')"
    :show-footer="false"
    width="min(var(--ui-layout-720, 720px), 94vw)"
    height="min(var(--ui-layout-720, 720px), 86vh)"
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
      <BButton size="small" @click="load()">{{ t('settings.ai.usage.retry') }}</BButton>
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

      <section v-if="isAdminDetail" class="detail-inputs" aria-labelledby="usage-detail-inputs-title">
        <div class="detail-section-head">
          <h4 id="usage-detail-inputs-title">{{ t('settings.ai.usage.detail.inputsTitle') }}</h4>
          <BButton v-if="inputRows.length" size="small" @click="copyInputs">
            {{ t('settings.ai.usage.detail.copyInputs') }}
          </BButton>
        </div>
        <dl v-if="inputRows.length" class="detail-input-list">
          <div v-for="row in inputRows" :key="row.key">
            <dt>{{ t(`settings.ai.usage.detail.inputFields.${row.key}`) }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
        <p v-else class="detail-input-hint">{{ t('settings.ai.usage.detail.inputsUnavailable') }}</p>
        <p v-if="detail.inputDiagnostics?.urlRedacted" class="detail-input-hint">
          {{ t('settings.ai.usage.detail.urlRedacted') }}
        </p>
        <p v-if="copyStatus" class="detail-input-hint" role="status">{{
          t(`settings.ai.usage.detail.${copyStatus}`)
        }}</p>
        <div v-if="detail.failure" class="call-error detail-failure">
          <strong>{{ detail.failure.code }}</strong>
          <span>{{ detail.failure.message }}</span>
          <span v-if="detail.failure.beforeModelCall">{{ t('settings.ai.usage.detail.beforeModelCall') }}</span>
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
          <BButton class="detail-refresh" size="small" :loading="loading" @click="load()">
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
        {{ t(`settings.ai.usage.detail.${isAdminDetail ? 'adminPrivacy' : 'privacy'}`) }}
      </p>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import { aiUsageModuleKey } from '@/components/aiSkills/aiUsageModules';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { copyTextToClipboard } from '@/utils/clipboard';

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
    inputDiagnostics?: Record<string, unknown> | null;
    failure?: { code: string; message: string; beforeModelCall: boolean } | null;
  }

  const props = withDefaults(
    defineProps<{
      execution: UsageExecution | null;
      /** 共用调用链展示；入参摘要仅由管理员本人详情端点提供。 */
      detailEndpoint?: string;
    }>(),
    { detailEndpoint: '/api/chat/aiUsageDetail' },
  );
  const visible = defineModel<boolean>('visible');
  const { t, locale } = useI18n();
  const loading = ref(false);
  const errorCode = ref('');
  const detail = ref<UsageDetail | null>(null);
  const isAdminDetail = computed(() => props.detailEndpoint === '/api/admin/ai-operations/executions/detail');
  const copyStatus = ref('');
  const inputRows = computed(() => {
    if (!isAdminDetail.value) return [];
    const input = detail.value?.inputDiagnostics;
    return ['url', 'pageContextProvided', 'operation', 'detailLevel', 'targetLength', 'resourceTypes']
      .filter((key) => input?.[key] !== undefined && input?.[key] !== null)
      .map((key) => ({
        key,
        value:
          typeof input![key] === 'boolean'
            ? t(`settings.ai.usage.detail.${input![key] ? 'yes' : 'no'}`)
            : Array.isArray(input![key])
              ? (input![key] as string[]).join(', ') || '—'
              : String(input![key]),
      }));
  });

  async function copyInputs() {
    const target = props.execution?.id;
    const ok = await copyTextToClipboard(inputRows.value.map((row) => `${row.key}: ${row.value}`).join('\n'));
    if (target === props.execution?.id && visible.value) copyStatus.value = ok ? 'copied' : 'copyFailed';
  }
  let requestSequence = 0;

  watch(
    () => [visible.value === true, props.execution?.id || '', props.detailEndpoint] as const,
    ([isVisible, executionId]) => {
      ++requestSequence;
      detail.value = null;
      errorCode.value = '';
      copyStatus.value = '';
      loading.value = false;
      if (isVisible && executionId) void load();
    },
    { immediate: true },
  );

  async function load() {
    const executionId = props.execution?.id;
    const endpoint = props.detailEndpoint;
    if (!executionId || !visible.value) return;
    const current = ++requestSequence;
    loading.value = true;
    errorCode.value = '';
    try {
      const response = await apiBasePost(endpoint, { executionId }, { silent: true });
      if (current !== requestSequence || executionId !== props.execution?.id || endpoint !== props.detailEndpoint)
        return;
      if (Number(response?.status) !== 200 || !response?.data) throw new Error('AI_USAGE_DETAIL_REQUEST_FAILED');
      detail.value = response.data as UsageDetail;
    } catch (error: any) {
      if (current !== requestSequence) return;
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
    return t(`settings.ai.usage.modules.${aiUsageModuleKey(module)}`);
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
  .detail-inputs {
    margin-top: var(--ui-space-16, 16px);
  }
  .detail-input-list {
    margin: 0;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
  }
  .detail-input-list > div {
    padding-block: var(--ui-space-6, 6px);
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .detail-input-list dt,
  .detail-input-hint {
    color: var(--desc-color);
  }
  .detail-input-list dd {
    margin: 0;
    color: var(--text-color);
    overflow-wrap: anywhere;
    user-select: text;
  }
  .detail-input-hint {
    font-size: var(--ui-font-11, 11px);
    line-height: 1.6;
  }
  .detail-failure {
    flex-direction: column;
    overflow-wrap: anywhere;
  }

  .detail-state {
    display: flex;
    min-height: var(--ui-layout-280, 280px);
    align-items: center;
    justify-content: center;
  }

  .detail-state--error {
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-24, 24px);
    border: 1px solid var(--error-color, #c33f47);
    border-radius: 10px;
    color: var(--desc-color);
    text-align: center;
    font-size: var(--ui-font-12, 12px);
  }

  .detail-state--error strong {
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
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
    gap: var(--ui-space-6, 6px);
  }

  .detail-inline-warning {
    margin-bottom: var(--ui-space-10, 10px);
    padding: var(--ui-space-8, 8px) var(--ui-space-10, 10px);
    border: 1px solid var(--warning-color, #a86700);
    border-radius: 8px;
    color: var(--warning-color, #a86700);
    font-size: var(--ui-font-11, 11px);
  }

  .detail-overview {
    padding: var(--ui-space-12, 12px);
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
    gap: var(--ui-space-10, 10px);
  }

  .detail-heading-icon {
    display: inline-flex;
    width: var(--ui-layout-38, 38px);
    height: var(--ui-layout-38, 38px);
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--primary-btn-bg-color);
  }

  .detail-title-row {
    flex-wrap: wrap;
    gap: var(--ui-space-7, 7px);
  }

  .detail-title-row h3,
  .detail-section-head h4 {
    margin: 0;
    color: var(--text-color);
  }

  .detail-title-row h3 {
    font-size: var(--ui-font-14, 14px);
  }

  .detail-heading p,
  .detail-section-head p,
  .call-head p,
  .repair-reason p {
    margin: var(--ui-space-3, 3px) 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-10_5, 10.5px);
    line-height: 1.45;
  }

  .detail-status,
  .call-status,
  .billing-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-3, 3px);
    min-height: var(--ui-layout-19, 19px);
    box-sizing: border-box;
    padding: var(--ui-space-2, 2px) var(--ui-space-6, 6px);
    border: 1px solid currentColor;
    border-radius: 999px;
    font-size: var(--ui-font-9_5, 9.5px);
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
    gap: var(--ui-space-8, 8px);
    margin-top: var(--ui-space-12, 12px);
  }

  .detail-metrics > div {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--ui-space-2, 2px) var(--ui-space-6, 6px);
    padding: var(--ui-space-8, 8px) var(--ui-space-9, 9px);
    border: 1px solid var(--surface-divider-color);
    border-radius: 8px;
  }

  .detail-metrics span {
    grid-column: 1 / -1;
    color: var(--desc-color);
    font-size: var(--ui-font-9_5, 9.5px);
  }

  .detail-metrics strong {
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
    font-variant-numeric: tabular-nums;
  }

  .detail-metrics small {
    align-self: end;
    color: var(--desc-color);
    font-size: var(--ui-font-8_5, 8.5px);
  }

  .detail-calls {
    margin-top: var(--ui-space-16, 16px);
  }

  .detail-section-head {
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    margin-bottom: var(--ui-space-12, 12px);
  }

  .detail-section-head h4 {
    font-size: var(--ui-font-13, 13px);
  }

  .detail-refresh {
    flex: 0 0 auto;
    gap: var(--ui-space-5, 5px);
  }

  .call-timeline {
    display: grid;
    gap: var(--ui-space-10, 10px);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .call-item {
    position: relative;
    display: grid;
    grid-template-columns: var(--ui-layout-26, 26px) minmax(0, 1fr);
    gap: var(--ui-space-9, 9px);
  }

  .call-item:not(:last-child)::before {
    position: absolute;
    top: var(--ui-layout-28, 28px);
    bottom: calc(-1 * var(--ui-space-12, 12px));
    left: var(--ui-layout-12, 12px);
    width: 2px;
    background: var(--surface-divider-color);
    content: '';
  }

  .call-sequence {
    z-index: 1;
    display: inline-flex;
    width: var(--ui-layout-26, 26px);
    height: var(--ui-layout-26, 26px);
    align-items: center;
    justify-content: center;
    border: 2px solid var(--primary-color);
    border-radius: 50%;
    color: var(--primary-color);
    background: var(--background-color);
    font-size: var(--ui-font-10, 10px);
    font-weight: 700;
  }

  .call-card {
    min-width: 0;
    padding: var(--ui-space-11, 11px);
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .call-head {
    justify-content: space-between;
    gap: var(--ui-space-10, 10px);
  }

  .call-title-row {
    flex-wrap: wrap;
    gap: var(--ui-space-6, 6px);
  }

  .call-title-row > strong {
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
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
    gap: var(--ui-space-6, 6px);
    margin-top: var(--ui-space-10, 10px);
  }

  .call-token-grid > div {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-2, 2px);
    min-width: 0;
    padding: var(--ui-space-7, 7px);
    border: 1px solid var(--surface-divider-color);
    border-radius: 7px;
  }

  .call-token-grid span {
    color: var(--desc-color);
    font-size: var(--ui-font-9, 9px);
  }

  .call-token-grid strong {
    overflow: hidden;
    color: var(--text-color);
    font-size: var(--ui-font-11, 11px);
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
  }

  .repair-reason {
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-7, 7px);
    margin-top: var(--ui-space-9, 9px);
    padding: var(--ui-space-8, 8px);
    border: 1px solid var(--primary-color);
    border-radius: 8px;
    color: var(--primary-color);
  }

  .repair-reason > :first-child {
    flex: 0 0 auto;
    margin-top: var(--ui-space-1, 1px);
  }

  .repair-reason strong {
    color: var(--text-color);
    font-size: var(--ui-font-10_5, 10.5px);
  }

  .usage-missing,
  .call-error {
    margin-top: var(--ui-space-8, 8px);
    padding: var(--ui-space-7, 7px) var(--ui-space-8, 8px);
    border-radius: 7px;
    font-size: var(--ui-font-10, 10px);
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
    min-height: var(--ui-layout-120, 120px);
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-7, 7px);
    border: 1px dashed var(--surface-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }

  .detail-privacy {
    margin: var(--ui-space-14, 14px) 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
    line-height: 1.45;
  }

  .detail-privacy > :first-child {
    flex: 0 0 auto;
    margin-top: var(--ui-space-1, 1px);
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

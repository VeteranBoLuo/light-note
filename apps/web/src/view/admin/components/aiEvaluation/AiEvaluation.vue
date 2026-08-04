<template>
  <AdminDataPage
    eyebrow="Admin / AI"
    :title="t('aiEvaluationAdmin.title')"
    :subtitle="t('aiEvaluationAdmin.subtitle')"
    :toolbar-hint="t('aiEvaluationAdmin.toolbarHint')"
    :summary-count="runs.length"
  >
    <template #metrics>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('aiEvaluationAdmin.latestStatus') }}</span>
        <strong class="admin-stat-value">{{ statusLabel(latest?.status) }}</strong>
        <span class="admin-stat-hint">{{
          latest ? formatTime(latest.finishedAt || latest.createTime) : t('aiEvaluationAdmin.neverRun')
        }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('aiEvaluationAdmin.latestPassed') }}</span>
        <strong class="admin-stat-value">{{ latest ? `${latest.passedCaseCount}/${latest.caseCount}` : '-' }}</strong>
        <span class="admin-stat-hint">{{ t('aiEvaluationAdmin.safetyHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('aiEvaluationAdmin.latestTokens') }}</span>
        <strong class="admin-stat-value">{{ formatNumber(latest?.totalTokens) }}</strong>
        <span class="admin-stat-hint">{{
          t('aiEvaluationAdmin.inputOutput', {
            input: formatNumber(latest?.promptTokens),
            output: formatNumber(latest?.completionTokens),
          })
        }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('aiEvaluationAdmin.latestDuration') }}</span>
        <strong class="admin-stat-value">{{ formatDuration(latest?.durationMs) }}</strong>
        <span class="admin-stat-hint">{{
          t('aiEvaluationAdmin.providerModel', { provider: latest?.provider || '-', model: latest?.model || '-' })
        }}</span>
      </li>
    </template>

    <template #toolbar>
      <span class="ai-evaluation__round-label">{{ t('aiEvaluationAdmin.suiteLabel') }}</span>
      <BSelect
        v-model:value="suite"
        class="ai-evaluation__suite-select"
        :options="suiteOptions"
        :disabled="hasActiveRun"
      />
      <span class="ai-evaluation__round-label">{{ t('aiEvaluationAdmin.depthLabel') }}</span>
      <BSelect
        v-model:value="depth"
        class="ai-evaluation__depth-select"
        :options="depthOptions"
        :disabled="hasActiveRun"
      />
      <span class="ai-evaluation__round-label">{{ t('aiEvaluationAdmin.repeatLabel') }}</span>
      <BSelect
        v-model:value="repeat"
        class="ai-evaluation__round-select"
        :options="repeatOptions"
        :disabled="hasActiveRun"
      />
      <BButton type="primary" :loading="starting || hasActiveRun" :disabled="hasActiveRun" @click="confirmStart">
        {{ hasActiveRun ? t('aiEvaluationAdmin.running') : t('aiEvaluationAdmin.start') }}
      </BButton>
      <BButton :loading="loading" @click="loadRuns">{{ t('aiEvaluationAdmin.refresh') }}</BButton>
    </template>

    <div v-if="!runs.length && !loading" class="ai-evaluation__empty">{{ t('aiEvaluationAdmin.empty') }}</div>
    <div v-else class="ai-evaluation__runs">
      <article v-for="run in runs" :key="run.id" class="ai-evaluation__run">
        <BButton class="ai-evaluation__run-head" @click="toggle(run.id)">
          <span class="ai-evaluation__status" :data-status="run.status">{{ statusLabel(run.status) }}</span>
          <strong>{{ run.model || t('aiEvaluationAdmin.defaultRunName') }}</strong>
          <span>{{ suiteLabel(run.suite) }} · {{ depthLabel(run.resultJson?.depth) }}</span>
          <span>{{ t('aiEvaluationAdmin.cases', { passed: run.passedCaseCount, total: run.caseCount }) }}</span>
          <span>{{ t('aiEvaluationAdmin.tokens', { count: formatNumber(run.totalTokens) }) }}</span>
          <span>{{ formatDuration(run.durationMs) }}</span>
          <time>{{ formatTime(run.createTime) }}</time>
        </BButton>
        <div v-if="expandedIds.has(run.id)" class="ai-evaluation__details">
          <p v-if="run.errorCode" class="ai-evaluation__error">{{
            t('aiEvaluationAdmin.errorCode', { code: run.errorCode })
          }}</p>
          <div v-for="result in run.resultJson?.results || []" :key="result.id" class="ai-evaluation__case">
            <span>{{ result.passedAttempts === result.totalAttempts ? '✓' : '✗' }}</span>
            <strong>{{ result.id }}</strong>
            <span>{{ result.passedAttempts }}/{{ result.totalAttempts }}</span>
            <span v-if="result.safetyCritical" class="ai-evaluation__safety">{{
              t('aiEvaluationAdmin.safetyCritical')
            }}</span>
            <div class="ai-evaluation__layers">
              <span
                v-for="layer in caseLayers(result)"
                :key="layer.key"
                class="ai-evaluation__layer"
                :data-status="layer.status"
              >
                {{ layer.label }}
              </span>
            </div>
            <div v-if="caseExpectation(result)" class="ai-evaluation__expectation">
              <p class="ai-evaluation__expectation-question">{{ caseExpectation(result)!.message }}</p>
              <p class="ai-evaluation__expectation-parts">
                <span>{{ t('aiEvaluationAdmin.expectPrefix') }}</span>
                <span v-for="(part, index) in caseExpectation(result)!.parts" :key="index">{{ part }}</span>
              </p>
            </div>
            <p v-for="(error, index) in caseErrors(result)" :key="index">{{ error }}</p>
          </div>
        </div>
      </article>
    </div>
  </AdminDataPage>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { useI18n } from 'vue-i18n';

  const { t, locale } = useI18n();

  interface EvaluationRun {
    id: string;
    suite: 'quick' | 'full' | string;
    status: 'queued' | 'running' | 'passed' | 'failed' | 'error';
    provider?: string;
    model?: string;
    repeatCount: number;
    caseCount: number;
    passedCaseCount: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    durationMs: number;
    resultJson?: { depth?: 'plan' | 'answer'; results?: any[] } | null;
    errorCode?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    createTime: string;
  }

  const runs = ref<EvaluationRun[]>([]);
  const loading = ref(false);
  const starting = ref(false);
  const repeat = ref(1);
  const suite = ref<'quick' | 'full'>('quick');
  const depth = ref<'plan' | 'answer'>('plan');
  const expandedIds = ref(new Set<string>());
  const repeatOptions = computed(() =>
    [1, 2, 3, 4, 5].map((value) => ({ value, label: t('aiEvaluationAdmin.repeatOption', { count: value }) })),
  );
  const suiteOptions = computed(() => [
    { value: 'quick', label: t('aiEvaluationAdmin.suiteQuick', { count: 6 }) },
    { value: 'full', label: t('aiEvaluationAdmin.suiteFull', { count: 39 }) },
  ]);
  const depthOptions = computed(() => [
    { value: 'plan', label: t('aiEvaluationAdmin.depthPlan') },
    { value: 'answer', label: t('aiEvaluationAdmin.depthAnswer') },
  ]);
  const caseCount = computed(() => (suite.value === 'full' ? 39 : 6));
  const latest = computed(() => runs.value[0] || null);
  const hasActiveRun = computed(() => runs.value.some((run) => ['queued', 'running'].includes(run.status)));
  let pollTimer: number | null = null;

  function statusLabel(status?: EvaluationRun['status']) {
    return t(`aiEvaluationAdmin.${status || 'error'}`);
  }
  function suiteLabel(value?: string) {
    return value === 'full'
      ? t('aiEvaluationAdmin.suiteFull', { count: 39 })
      : t('aiEvaluationAdmin.suiteQuick', { count: 6 });
  }
  function depthLabel(value?: string) {
    return value === 'answer' ? t('aiEvaluationAdmin.depthAnswerShort') : t('aiEvaluationAdmin.depthPlanShort');
  }
  function formatNumber(value?: number) {
    return Number(value || 0).toLocaleString('zh-CN');
  }
  function formatDuration(value?: number) {
    const ms = Number(value || 0);
    if (!ms) return '-';
    return ms >= 1000
      ? t('aiEvaluationAdmin.durationSeconds', { count: (ms / 1000).toFixed(1) })
      : t('aiEvaluationAdmin.durationMs', { count: ms });
  }
  function formatTime(value?: string | null) {
    return value ? new Date(value).toLocaleString(locale.value, { hour12: false }) : '-';
  }
  function caseErrors(result: any) {
    return (result.attempts || []).flatMap((attempt: any, index: number) =>
      (attempt.errors || []).map((error: string) => t('aiEvaluationAdmin.attemptError', { attempt: index + 1, error })),
    );
  }
  // 跳过原因的可读说明：区分「按设计不适用」与「被前置失败拖累」——两者都显示成
  // 「已跳过」时无法判断结果是否正常，这是这个页面最主要的阅读障碍。
  const LAYER_SKIP_REASONS: Record<string, string> = {
    confirmation_required: 'aiEvaluationAdmin.skipConfirmationRequired',
    no_tool: 'aiEvaluationAdmin.skipNoTool',
    clarification: 'aiEvaluationAdmin.skipClarification',
    not_requested: 'aiEvaluationAdmin.skipNotRequested',
    prerequisite_failed: 'aiEvaluationAdmin.skipPrerequisiteFailed',
  };
  function skipReasonLabel(attempts: any[]) {
    const reason = attempts.map((layer: any) => layer?.reason).find(Boolean);
    return reason && LAYER_SKIP_REASONS[reason] ? t(LAYER_SKIP_REASONS[reason]) : '';
  }
  function caseLayers(result: any) {
    const definitions = [
      { key: 'planning', label: t('aiEvaluationAdmin.layerPlanning') },
      { key: 'toolContract', label: t('aiEvaluationAdmin.layerToolContract') },
      { key: 'answer', label: t('aiEvaluationAdmin.layerAnswer') },
    ];
    if (!(result.attempts || []).some((attempt: any) => attempt.layers)) return [];
    return definitions.map((definition) => {
      const attempts = (result.attempts || []).map((attempt: any) => attempt.layers?.[definition.key]).filter(Boolean);
      const applicable = attempts.filter((layer: any) => layer.status !== 'skipped');
      const passed = applicable.filter((layer: any) => layer.status === 'passed').length;
      const status = !applicable.length ? 'skipped' : passed === applicable.length ? 'passed' : 'failed';
      if (applicable.length) {
        return {
          key: definition.key,
          status,
          label: t('aiEvaluationAdmin.layerPassed', { layer: definition.label, passed, total: applicable.length }),
        };
      }
      // 跳过时把原因带出来；prerequisite_failed 说明是被前面拖累的，不是"本该跳过"
      const reason = skipReasonLabel(attempts);
      const byDesign = attempts.every((layer: any) => layer?.reason !== 'prerequisite_failed');
      return {
        key: definition.key,
        status: byDesign ? 'skipped' : 'blocked',
        label: reason
          ? t('aiEvaluationAdmin.layerSkippedReason', { layer: definition.label, reason })
          : t('aiEvaluationAdmin.layerSkipped', { layer: definition.label }),
      };
    });
  }
  /** 用例期望：这条问题本来该调什么、该不该验回答。没有它就无法判断结果对错。 */
  function caseExpectation(result: any) {
    const expectation = result.expectation;
    if (!expectation) return null;
    const parts: string[] = [];
    if (expectation.requiredCapabilities?.length) {
      parts.push(t('aiEvaluationAdmin.expectCapabilities', { list: expectation.requiredCapabilities.join('、') }));
    }
    if (expectation.requiredTools?.length) {
      parts.push(t('aiEvaluationAdmin.expectTools', { list: expectation.requiredTools.join('、') }));
    } else if (expectation.expectedNeedsClarification === true) {
      parts.push(t('aiEvaluationAdmin.expectClarification'));
    } else if (!expectation.requiredCapabilities?.length) {
      parts.push(t('aiEvaluationAdmin.expectNoTool'));
    }
    if (expectation.forbiddenTools?.length) {
      parts.push(t('aiEvaluationAdmin.expectForbiddenTools', { list: expectation.forbiddenTools.join('、') }));
    }
    if (expectation.expectedAnswerKind === 'refusal') parts.push(t('aiEvaluationAdmin.expectRefusal'));
    parts.push(
      expectation.answerLayerApplicable
        ? t('aiEvaluationAdmin.expectAnswerChecked')
        : t('aiEvaluationAdmin.expectAnswerByConfirmation'),
    );
    return { message: expectation.message || '', parts };
  }
  function toggle(id: string) {
    const next = new Set(expandedIds.value);
    next.has(id) ? next.delete(id) : next.add(id);
    expandedIds.value = next;
  }
  function schedulePoll() {
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = hasActiveRun.value ? window.setTimeout(loadRuns, 3000) : null;
  }
  async function loadRuns() {
    loading.value = true;
    try {
      const response = await apiBasePost('/api/aiEvaluation/runs', { limit: 20 }, { silent: true });
      if (response.status !== 200) throw new Error(response.msg || t('aiEvaluationAdmin.requestFailed'));
      runs.value = Array.isArray(response.data) ? response.data : [];
    } catch (error: any) {
      message.error(error?.message || t('aiEvaluationAdmin.loadFailed'));
    } finally {
      loading.value = false;
      schedulePoll();
    }
  }
  function confirmStart() {
    Alert.alert({
      title: t('aiEvaluationAdmin.confirmTitle'),
      content: t('aiEvaluationAdmin.confirmContent', {
        suite: suiteLabel(suite.value),
        depth: depthLabel(depth.value),
        repeat: repeat.value,
        requests: caseCount.value * repeat.value * (depth.value === 'answer' ? 2 : 1),
      }),
      okText: t('aiEvaluationAdmin.confirmOk'),
      onOk: startRun,
    });
  }
  async function startRun() {
    starting.value = true;
    try {
      const response = await apiBasePost(
        '/api/aiEvaluation/runs/start',
        { suite: suite.value, repeat: repeat.value, depth: depth.value },
        { silent: true, timeout: 10000 },
      );
      if (response.status !== 200) throw new Error(response.msg || t('aiEvaluationAdmin.startFailed'));
      message.success(t('aiEvaluationAdmin.started'));
      await loadRuns();
    } catch (error: any) {
      message.error(error?.message || t('aiEvaluationAdmin.startFailed'));
    } finally {
      starting.value = false;
    }
  }

  onMounted(loadRuns);
  onBeforeUnmount(() => {
    if (pollTimer) window.clearTimeout(pollTimer);
  });
</script>

<style scoped lang="less">
  @import '@/assets/css/admin-manage.less';
  .ai-evaluation__round-label {
    color: var(--desc-color);
    font-size: 13px;
  }
  .ai-evaluation__round-select {
    width: 90px;
  }
  .ai-evaluation__suite-select {
    width: 180px;
  }
  .ai-evaluation__depth-select {
    width: 220px;
  }
  :deep(.admin-data-page__toolbar-main) {
    flex-wrap: wrap;
  }
  .ai-evaluation__empty {
    padding: 48px;
    color: var(--desc-color);
    text-align: center;
  }
  .ai-evaluation__runs {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-auto-rows: max-content;
    align-content: start;
    gap: 10px;
    padding-bottom: 20px;
    scrollbar-gutter: stable;
    overscroll-behavior: contain;
    overflow-x: hidden;
    overflow-y: auto;
  }
  .ai-evaluation__run {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }
  .ai-evaluation__run-head {
    min-width: 0;
    min-height: 52px;
    height: auto;
    display: grid;
    grid-template-columns:
      minmax(64px, 76px)
      minmax(140px, 1fr)
      minmax(112px, 150px)
      minmax(76px, 108px)
      minmax(76px, 108px)
      minmax(56px, 76px)
      minmax(132px, 168px);
    gap: 10px;
    align-items: center;
    width: 100%;
    padding: 14px 16px;
    border: 0;
    background: transparent;
    color: var(--text-color);
    line-height: 1.45;
    white-space: normal;
    text-align: left;
    cursor: pointer;
  }
  .ai-evaluation__run-head > * {
    min-width: 0;
  }
  .ai-evaluation__run-head > strong,
  .ai-evaluation__run-head > span,
  .ai-evaluation__run-head > time {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ai-evaluation__status {
    color: var(--desc-color);
    font-weight: 600;
  }
  .ai-evaluation__status[data-status='passed'] {
    color: var(--success-color);
  }
  .ai-evaluation__status[data-status='failed'],
  .ai-evaluation__status[data-status='error'] {
    color: var(--danger-color);
  }
  .ai-evaluation__details {
    display: grid;
    gap: 8px;
    padding: 0 16px 16px;
    border-top: 1px solid var(--card-border-color);
  }
  .ai-evaluation__case {
    display: grid;
    grid-template-columns: 20px minmax(180px, 1fr) auto auto;
    gap: 8px;
    padding-top: 10px;
  }
  .ai-evaluation__case p {
    grid-column: 2 / -1;
    margin: 0;
    color: var(--danger-color);
    font-size: 12px;
  }
  .ai-evaluation__layers {
    grid-column: 2 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .ai-evaluation__layer {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--hover-bg-color, var(--card-background));
    color: var(--desc-color);
    font-size: 12px;
  }
  .ai-evaluation__layer[data-status='passed'] {
    color: var(--success-color);
  }
  .ai-evaluation__layer[data-status='failed'] {
    color: var(--danger-color);
  }
  /* 被前置层失败拖累的跳过：不是"按设计不适用"，需要与普通跳过区分开，
     否则读者会误以为这层本来就不用跑。用警示色而非灰色。 */
  .ai-evaluation__layer[data-status='blocked'] {
    color: var(--warning-color);
    border: 1px solid color-mix(in srgb, var(--warning-color) 32%, transparent);
  }
  .ai-evaluation__expectation {
    grid-column: 2 / -1;
    margin-top: 4px;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--hover-bg-color, var(--card-background));
    border-left: 2px solid color-mix(in srgb, var(--primary-color) 45%, transparent);
  }
  .ai-evaluation__expectation-question {
    color: var(--title-color, var(--font-color));
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .ai-evaluation__expectation-parts {
    margin-top: 2px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .ai-evaluation__expectation-parts > span + span::before {
    content: '·';
    margin: 0 6px;
    opacity: 0.6;
  }
  .ai-evaluation__safety {
    color: var(--warning-color);
    font-size: 12px;
  }
  .ai-evaluation__error {
    color: var(--danger-color);
  }
  @media (max-width: @admin-bp-mobile) {
    :deep(.admin-data-page__surface) {
      gap: 16px;
    }
    :deep(.admin-data-page__toolbar-main) {
      gap: 8px;
    }
    .ai-evaluation__suite-select,
    .ai-evaluation__depth-select,
    .ai-evaluation__round-select {
      width: 100%;
    }
    .ai-evaluation__runs {
      flex: 0 0 auto;
      overflow: visible;
      padding-bottom: calc(20px + env(safe-area-inset-bottom));
    }
    .ai-evaluation__run-head {
      grid-template-columns: minmax(64px, auto) minmax(0, 1fr);
      gap: 6px 12px;
      min-height: 0;
      padding: 12px;
      align-items: start;
    }
    .ai-evaluation__run-head > strong {
      text-align: right;
    }
    .ai-evaluation__run-head > :nth-child(3) {
      grid-column: 1 / -1;
      color: var(--sub-text-color);
    }
    .ai-evaluation__run-head > :nth-child(4),
    .ai-evaluation__run-head > :nth-child(6) {
      color: var(--sub-text-color);
    }
    .ai-evaluation__run-head > :nth-child(5),
    .ai-evaluation__run-head > :nth-child(7) {
      text-align: right;
    }
    .ai-evaluation__run-head > strong,
    .ai-evaluation__run-head > span,
    .ai-evaluation__run-head > time {
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .ai-evaluation__details {
      padding: 0 12px 12px;
    }
    .ai-evaluation__case {
      grid-template-columns: 20px minmax(0, 1fr) auto;
    }
    .ai-evaluation__case > strong {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .ai-evaluation__safety {
      grid-column: 2 / -1;
    }
  }
  @media (min-width: (@admin-bp-mobile + 1px)) and (max-width: @admin-bp-desktop) {
    .ai-evaluation__run-head {
      grid-template-columns: 72px minmax(140px, 1fr) repeat(2, minmax(80px, auto));
    }
    .ai-evaluation__run-head > :nth-child(5),
    .ai-evaluation__run-head > :nth-child(6),
    .ai-evaluation__run-head > :nth-child(7) {
      white-space: normal;
    }
  }
</style>

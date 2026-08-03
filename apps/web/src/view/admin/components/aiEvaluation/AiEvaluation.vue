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
          <span>{{ suiteLabel(run.suite) }}</span>
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
    resultJson?: { results?: any[] } | null;
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
  const expandedIds = ref(new Set<string>());
  const repeatOptions = computed(() =>
    [1, 2, 3, 4, 5].map((value) => ({ value, label: t('aiEvaluationAdmin.repeatOption', { count: value }) })),
  );
  const suiteOptions = computed(() => [
    { value: 'quick', label: t('aiEvaluationAdmin.suiteQuick', { count: 6 }) },
    { value: 'full', label: t('aiEvaluationAdmin.suiteFull', { count: 37 }) },
  ]);
  const caseCount = computed(() => (suite.value === 'full' ? 37 : 6));
  const latest = computed(() => runs.value[0] || null);
  const hasActiveRun = computed(() => runs.value.some((run) => ['queued', 'running'].includes(run.status)));
  let pollTimer: number | null = null;

  function statusLabel(status?: EvaluationRun['status']) {
    return t(`aiEvaluationAdmin.${status || 'error'}`);
  }
  function suiteLabel(value?: string) {
    return value === 'full'
      ? t('aiEvaluationAdmin.suiteFull', { count: 37 })
      : t('aiEvaluationAdmin.suiteQuick', { count: 6 });
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
        repeat: repeat.value,
        requests: caseCount.value * repeat.value,
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
        { suite: suite.value, repeat: repeat.value },
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
    color: var(--success-color, #16a34a);
  }
  .ai-evaluation__status[data-status='failed'],
  .ai-evaluation__status[data-status='error'] {
    color: var(--danger-color, #dc2626);
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
    color: var(--danger-color, #dc2626);
    font-size: 12px;
  }
  .ai-evaluation__safety {
    color: var(--warning-color, #d97706);
    font-size: 12px;
  }
  .ai-evaluation__error {
    color: var(--danger-color, #dc2626);
  }
  @media (max-width: 760px) {
    .ai-evaluation__run-head {
      grid-template-columns: 72px 1fr;
      gap: 8px 12px;
    }
    .ai-evaluation__case {
      grid-template-columns: 20px 1fr auto;
    }
  }
  @media (min-width: 761px) and (max-width: 1180px) {
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

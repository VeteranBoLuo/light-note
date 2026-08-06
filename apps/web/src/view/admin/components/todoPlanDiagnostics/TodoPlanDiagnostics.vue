<template>
  <AdminDataPage
    eyebrow="Admin / Todo"
    :title="t('todoPlanDiagnosticsAdmin.title')"
    :subtitle="t('todoPlanDiagnosticsAdmin.subtitle')"
    :toolbar-hint="t('todoPlanDiagnosticsAdmin.toolbarHint')"
    :summary-count="series.length"
    layout="scroll"
  >
    <template #metrics>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('todoPlanDiagnosticsAdmin.series') }}</span>
        <strong class="admin-stat-value">{{ n(metrics.active_series_count) }}</strong>
        <span class="admin-stat-hint">{{
          t('todoPlanDiagnosticsAdmin.pausedHint', { count: n(metrics.paused_series_count) })
        }}</span>
      </li>
      <li class="admin-stat-card" :class="{ 'has-warning': metrics.reminder_jobs_overdue > 0 }">
        <span class="admin-stat-label">{{ t('todoPlanDiagnosticsAdmin.pendingJobs') }}</span>
        <strong class="admin-stat-value">{{ n(metrics.reminder_jobs_pending) }}</strong>
        <span class="admin-stat-hint">{{
          t('todoPlanDiagnosticsAdmin.overdueHint', { count: n(metrics.reminder_jobs_overdue) })
        }}</span>
      </li>
      <li
        class="admin-stat-card"
        :class="{ 'has-danger': metrics.reminder_jobs_unknown + metrics.reminder_jobs_failed > 0 }"
      >
        <span class="admin-stat-label">{{ t('todoPlanDiagnosticsAdmin.deliveryExceptions') }}</span>
        <strong class="admin-stat-value">{{ n(metrics.reminder_jobs_unknown + metrics.reminder_jobs_failed) }}</strong>
        <span class="admin-stat-hint">{{
          t('todoPlanDiagnosticsAdmin.unknownFailedHint', {
            unknown: n(metrics.reminder_jobs_unknown),
            failed: n(metrics.reminder_jobs_failed),
          })
        }}</span>
      </li>
      <li class="admin-stat-card" :class="{ 'has-danger': metrics.series_with_error > 0 }">
        <span class="admin-stat-label">{{ t('todoPlanDiagnosticsAdmin.generationErrors') }}</span>
        <strong class="admin-stat-value">{{ n(metrics.series_with_error) }}</strong>
        <span class="admin-stat-hint">{{
          t('todoPlanDiagnosticsAdmin.failureTotalHint', { count: n(metrics.series_generation_failures) })
        }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('todoPlanDiagnosticsAdmin.deliveryLatency') }}</span>
        <strong class="admin-stat-value">{{ duration(metrics.reminder_delivery_latency_seconds) }}</strong>
        <span class="admin-stat-hint">{{
          t('todoPlanDiagnosticsAdmin.processingHint', { count: n(metrics.reminder_jobs_processing) })
        }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('todoPlanDiagnosticsAdmin.quietHours') }}</span>
        <strong class="admin-stat-value">{{ n(metrics.quiet_hours_deferred) }}</strong>
        <span class="admin-stat-hint">{{
          t('todoPlanDiagnosticsAdmin.quietHint', {
            skipped: n(metrics.quiet_hours_skipped),
            deduped: n(metrics.reminder_duplicate_prevented),
          })
        }}</span>
      </li>
    </template>

    <template #toolbar>
      <BInput
        v-model:value="keyword"
        class="todo-plan-diagnostics__search"
        :placeholder="t('todoPlanDiagnosticsAdmin.searchPlaceholder')"
        @enter="load"
      />
      <BSelect v-model:value="status" class="todo-plan-diagnostics__status" :options="statusOptions" @change="load" />
      <BButton type="primary" :loading="loading" @click="load">{{ t('common.refresh') }}</BButton>
    </template>

    <div v-if="bookmark.isMobile" class="todo-plan-diagnostics__cards">
      <article v-for="item in series" :key="item.id" class="todo-plan-diagnostics__card">
        <header>
          <div>
            <strong>{{ item.title }}</strong>
            <small>{{ item.userLabel }} · {{ item.id }}</small>
          </div>
          <BChip :tone="statusTone(item.status)">{{ statusLabel(item.status) }}</BChip>
        </header>
        <dl>
          <div
            ><dt>{{ t('todoPlanDiagnosticsAdmin.rule') }}</dt
            ><dd>{{ ruleLabel(item) }}</dd></div
          >
          <div
            ><dt>{{ t('todoPlanDiagnosticsAdmin.instances') }}</dt
            ><dd>{{ progressLabel(item) }}</dd></div
          >
          <div
            ><dt>{{ t('todoPlanDiagnosticsAdmin.generatedThrough') }}</dt
            ><dd>{{ date(item.generatedThroughDate) }}</dd></div
          >
          <div
            ><dt>{{ t('todoPlanDiagnosticsAdmin.nextReminder') }}</dt
            ><dd>{{ date(item.nextReminderAt) }}</dd></div
          >
          <div
            ><dt>{{ t('todoPlanDiagnosticsAdmin.jobs') }}</dt
            ><dd>{{ jobsLabel(item) }}</dd></div
          >
        </dl>
        <p v-if="item.lastGenerationError" class="todo-plan-diagnostics__error">{{ item.lastGenerationError }}</p>
      </article>
      <p v-if="!series.length && !loading" class="todo-plan-diagnostics__empty">{{
        t('todoPlanDiagnosticsAdmin.empty')
      }}</p>
    </div>

    <BTable v-else fill row-key="id" :data="series" :columns="columns" :loading="loading" :expanded-rows="expandedIds">
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'series'" class="todo-plan-diagnostics__series-cell">
          <strong>{{ record.title }}</strong>
          <small>{{ record.userLabel }} · {{ record.id }}</small>
        </div>
        <BChip v-else-if="column.key === 'status'" :tone="statusTone(record.status)">{{
          statusLabel(record.status)
        }}</BChip>
        <span v-else-if="column.key === 'rule'">{{ ruleLabel(record) }}</span>
        <span v-else-if="column.key === 'instances'">{{ progressLabel(record) }}</span>
        <span v-else-if="column.key === 'generatedThroughDate'">{{ date(record.generatedThroughDate) }}</span>
        <span v-else-if="column.key === 'nextReminderAt'">{{ date(record.nextReminderAt) }}</span>
        <span
          v-else-if="column.key === 'jobs'"
          :class="{ 'todo-plan-diagnostics__error': record.failedJobCount + record.unknownJobCount > 0 }"
          >{{ jobsLabel(record) }}</span
        >
        <BButton v-else-if="column.key === 'detail'" size="small" @click="toggle(record.id)">
          {{ expandedIds.includes(record.id) ? t('common.close') : t('common.detail') }}
        </BButton>
      </template>
      <template #expandedRow="{ record }">
        <div class="todo-plan-diagnostics__expanded">
          <span>{{ t('todoPlanDiagnosticsAdmin.version', { version: record.version }) }}</span>
          <span>{{
            t('todoPlanDiagnosticsAdmin.nextOccurrence', {
              date: date(record.nextOccurrenceDate),
              no: record.nextOccurrenceNo,
            })
          }}</span>
          <span>{{ t('todoPlanDiagnosticsAdmin.timezone', { timezone: record.timezone }) }}</span>
          <span v-if="record.parentSeriesId">{{
            t('todoPlanDiagnosticsAdmin.parentSeries', { id: record.parentSeriesId })
          }}</span>
          <strong v-if="record.lastGenerationError" class="todo-plan-diagnostics__error">{{
            record.lastGenerationError
          }}</strong>
        </div>
      </template>
    </BTable>
  </AdminDataPage>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBasePost } from '@/http/request';
  import { bookmarkStore } from '@/store';
  import type { Column } from '@/components/base/BasicComponents/BTable/config';

  type SeriesStatus = 'active' | 'paused' | 'ended';
  interface SeriesDiagnostic {
    id: string;
    userLabel: string;
    title: string;
    repeatMode: 'scheduled' | 'after_completion';
    status: SeriesStatus;
    timezone: string;
    scheduleRule: any;
    version: number;
    nextOccurrenceNo: number;
    generatedThroughDate?: string | null;
    nextOccurrenceDate?: string | null;
    parentSeriesId?: string | null;
    instanceCount: number;
    completedCount: number;
    skippedCount: number;
    reminderJobCount: number;
    pendingJobCount: number;
    failedJobCount: number;
    unknownJobCount: number;
    nextReminderAt?: string | null;
    lastGenerationError?: string | null;
  }
  type Metrics = Record<string, number>;

  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const loading = ref(false);
  const keyword = ref('');
  const status = ref<'all' | SeriesStatus>('all');
  const series = ref<SeriesDiagnostic[]>([]);
  const metrics = ref<Metrics>({});
  const expandedIds = ref<string[]>([]);
  const statusOptions = computed(() => [
    { value: 'all', label: t('todoPlanDiagnosticsAdmin.statusAll') },
    { value: 'active', label: t('todoPlanDiagnosticsAdmin.statusActive') },
    { value: 'paused', label: t('todoPlanDiagnosticsAdmin.statusPaused') },
    { value: 'ended', label: t('todoPlanDiagnosticsAdmin.statusEnded') },
  ]);
  const columns = computed<Column[]>(() => [
    { key: 'series', title: t('todoPlanDiagnosticsAdmin.series'), width: 'minmax(220px, 1.5fr)' },
    { key: 'status', title: t('todoPlanDiagnosticsAdmin.status'), width: '90px' },
    { key: 'rule', title: t('todoPlanDiagnosticsAdmin.rule'), width: '150px' },
    { key: 'instances', title: t('todoPlanDiagnosticsAdmin.instances'), width: '130px' },
    { key: 'generatedThroughDate', title: t('todoPlanDiagnosticsAdmin.generatedThrough'), width: '120px' },
    { key: 'nextReminderAt', title: t('todoPlanDiagnosticsAdmin.nextReminder'), width: '160px' },
    { key: 'jobs', title: t('todoPlanDiagnosticsAdmin.jobs'), width: '150px' },
    { key: 'detail', title: t('common.detail'), width: '76px', ellipsis: false },
  ]);

  function n(value: unknown) {
    return Number(value || 0).toLocaleString(locale.value);
  }
  function date(value?: string | null) {
    return value ? new Date(value).toLocaleString(locale.value, { hour12: false }) : '-';
  }
  function duration(seconds: unknown) {
    const value = Number(seconds || 0);
    if (!value) return '-';
    return value < 60 ? `${value.toFixed(1)}s` : `${(value / 60).toFixed(1)}m`;
  }
  function statusLabel(value: SeriesStatus) {
    return t(`todoPlanDiagnosticsAdmin.status${value[0].toUpperCase()}${value.slice(1)}`);
  }
  function statusTone(value: SeriesStatus): 'success' | 'pending' | 'neutral' {
    return value === 'active' ? 'success' : value === 'paused' ? 'pending' : 'neutral';
  }
  function ruleLabel(item: SeriesDiagnostic) {
    const plan = item.scheduleRule?.plan || {};
    if (item.repeatMode === 'after_completion') {
      return t('todoPlanDiagnosticsAdmin.afterCompletionRule', {
        interval: plan.interval || 1,
        unit: plan.unit || 'day',
      });
    }
    return t('todoPlanDiagnosticsAdmin.scheduledRule', {
      frequency: plan.frequency || '-',
      interval: plan.interval || 1,
    });
  }
  function progressLabel(item: SeriesDiagnostic) {
    return t('todoPlanDiagnosticsAdmin.progress', {
      completed: n(item.completedCount),
      total: n(item.instanceCount),
      skipped: n(item.skippedCount),
    });
  }
  function jobsLabel(item: SeriesDiagnostic) {
    return t('todoPlanDiagnosticsAdmin.jobsDetail', {
      total: n(item.reminderJobCount),
      pending: n(item.pendingJobCount),
      failed: n(item.failedJobCount),
      unknown: n(item.unknownJobCount),
    });
  }
  function toggle(id: string) {
    expandedIds.value = expandedIds.value.includes(id)
      ? expandedIds.value.filter((item) => item !== id)
      : [...expandedIds.value, id];
  }
  async function load() {
    if (loading.value) return;
    loading.value = true;
    try {
      const response: any = await apiBasePost(
        '/api/todo/v2/admin/diagnostics',
        { keyword: keyword.value.trim(), status: status.value, limit: 100 },
        { silent: true },
      );
      if (response?.status !== 200) throw new Error(response?.msg || t('todoPlanDiagnosticsAdmin.loadFailed'));
      metrics.value = response.data?.metrics || {};
      series.value = Array.isArray(response.data?.series) ? response.data.series : [];
      expandedIds.value = expandedIds.value.filter((id) => series.value.some((item) => item.id === id));
    } catch (error: any) {
      message.error(error?.message || t('todoPlanDiagnosticsAdmin.loadFailed'));
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);
</script>

<style scoped lang="less">
  .todo-plan-diagnostics__search {
    width: min(320px, 42vw);
  }
  .todo-plan-diagnostics__status {
    width: 140px;
  }
  .todo-plan-diagnostics__series-cell {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .todo-plan-diagnostics__series-cell small {
    overflow: hidden;
    color: var(--desc-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .todo-plan-diagnostics__error {
    color: var(--danger-color, #e5484d);
    font-weight: 600;
  }
  .todo-plan-diagnostics__expanded {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    padding: 10px 16px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .admin-stat-card.has-warning {
    border-color: #d97706 !important;
  }
  .admin-stat-card.has-danger {
    border-color: var(--danger-color, #e5484d) !important;
  }
  .todo-plan-diagnostics__cards {
    display: grid;
    gap: 10px;
  }
  .todo-plan-diagnostics__card {
    display: grid;
    gap: 10px;
    padding: 14px;
    border: 1px solid var(--card-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .todo-plan-diagnostics__card header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .todo-plan-diagnostics__card header > div {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .todo-plan-diagnostics__card small {
    overflow: hidden;
    color: var(--desc-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .todo-plan-diagnostics__card dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
  }
  .todo-plan-diagnostics__card dl > div {
    min-width: 0;
  }
  .todo-plan-diagnostics__card dt {
    color: var(--desc-color);
    font-size: 11px;
  }
  .todo-plan-diagnostics__card dd {
    margin: 2px 0 0;
    overflow-wrap: anywhere;
    font-size: 12px;
  }
  .todo-plan-diagnostics__empty {
    margin: 24px 0;
    color: var(--desc-color);
    text-align: center;
  }
  @media (max-width: 640px) {
    .todo-plan-diagnostics__search,
    .todo-plan-diagnostics__status {
      width: 100%;
    }
    .todo-plan-diagnostics__card dl {
      grid-template-columns: 1fr;
    }
  }
  :global(html.light-note-android-webview) .admin-stat-card.has-warning {
    border-color: #d97706 !important;
  }
  :global(html.light-note-android-webview) .admin-stat-card.has-danger {
    border-color: #e5484d !important;
  }
</style>

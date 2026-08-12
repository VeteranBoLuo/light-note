<template>
  <AdminDataPage
    eyebrow="Admin / Operations"
    :title="t('adminActionCenter.title')"
    :subtitle="t('adminActionCenter.subtitle')"
    :toolbar-hint="t('adminActionCenter.toolbarHint')"
    :summary-count="filteredItems.length"
    layout="scroll"
  >
    <template #metrics>
      <li
        class="admin-stat-card"
        :class="{
          'has-warning': activeSection === 'work' && work.total > 0,
          'has-danger': activeSection === 'jobs' && jobs.attention > 0,
        }"
      >
        <span class="admin-stat-label">{{
          t(
            activeSection === 'work'
              ? 'adminActionCenter.metrics.pendingWork'
              : 'adminActionCenter.metrics.jobAttention',
          )
        }}</span>
        <strong class="admin-stat-value">{{ number(activeSection === 'work' ? work.total : jobs.attention) }}</strong>
        <span class="admin-stat-hint">{{
          activeSection === 'work'
            ? t('adminActionCenter.metrics.criticalHint', { count: number(work.critical) })
            : t('adminActionCenter.metrics.runningHint', { count: number(jobs.running) })
        }}</span>
      </li>
      <li class="admin-stat-card" :class="{ 'has-danger': sla.overdue > 0 }">
        <span class="admin-stat-label">{{ t('adminActionCenter.metrics.overdue') }}</span>
        <strong class="admin-stat-value">{{ number(sla.overdue) }}</strong>
        <span class="admin-stat-hint">{{
          sla.sampled
            ? t('adminActionCenter.metrics.overdueSampledHint', { count: number(sla.returnedCount) })
            : t('adminActionCenter.metrics.dueSoonHint', { count: number(sla.dueSoon) })
        }}</span>
      </li>
      <li class="admin-stat-card" :class="{ 'is-success': activeSection === 'jobs' }">
        <span class="admin-stat-label">{{
          t(activeSection === 'jobs' ? 'adminActionCenter.metrics.completed24h' : 'adminActionCenter.sla.dueSoon')
        }}</span>
        <strong class="admin-stat-value">{{
          number(activeSection === 'jobs' ? jobs.completed24h : sla.dueSoon)
        }}</strong>
        <span class="admin-stat-hint">{{
          activeSection === 'jobs'
            ? t('adminActionCenter.metrics.completedHint')
            : t('adminActionCenter.metrics.dueSoonHint', { count: number(sla.dueSoon) })
        }}</span>
      </li>
    </template>

    <template #toolbar>
      <BTabs v-model:active-tab="activeSection" variant="segment" :options="tabs" @change="onSectionChange" />
      <BSelect
        v-model:value="sourceFilter"
        class="action-center__select"
        :options="sourceOptions"
        @change="onSourceChange"
      />
      <BSelect
        v-if="activeSection === 'jobs'"
        v-model:value="statusFilter"
        class="action-center__select"
        :options="statusOptions"
        @change="onServerFilterChange"
      />
      <BSelect
        v-model:value="slaFilter"
        class="action-center__select"
        :options="slaOptions"
        @change="onServerFilterChange"
      />
      <BInput
        v-model:value="keyword"
        class="action-center__search"
        clearable
        :placeholder="t('adminActionCenter.searchPlaceholder')"
        @keyup.enter="load"
      />
      <BButton type="primary" :loading="loading" @click="load">{{ t('common.refresh') }}</BButton>
    </template>

    <div v-if="unavailableSources.length" class="action-center__warning" role="status">
      <strong>{{ t('adminActionCenter.partialTitle') }}</strong>
      <span>{{
        t('adminActionCenter.partialHint', {
          sources: unavailableSources.map(sourceLabel).join('、'),
        })
      }}</span>
    </div>

    <BLoading v-if="loading && !hasLoaded" loading :title="t('adminActionCenter.loading')" />

    <template v-else>
      <section class="action-center__source-section" :aria-label="t('adminActionCenter.sourceSummary')">
        <BCard
          v-for="source in activeSources"
          :key="source.source"
          as="article"
          variant="panel"
          padding="12px"
          class="action-center__source-card"
          :class="{ 'is-selected': sourceFilter === source.source }"
          interactive
          role="button"
          tabindex="0"
          :aria-pressed="sourceFilter === source.source"
          @click="selectSource(source.source)"
          @keydown.enter.prevent="selectSource(source.source)"
          @keydown.space.prevent="selectSource(source.source)"
        >
          <header>
            <strong>{{ sourceLabel(source.source) }}</strong>
            <div class="action-center__source-card-badges">
              <span v-if="sourceFilter === source.source" class="action-center__source-selected">
                {{ t('adminActionCenter.sourceSelected') }}
              </span>
              <BChip :tone="sourceTone(source)">{{ sourcePrimaryValue(source) }}</BChip>
            </div>
          </header>
          <p v-if="activeSection === 'work'">
            {{
              t('adminActionCenter.sourceWorkHint', {
                count: number(asWorkSource(source).count),
                overdue: number(source.overdue),
              })
            }}
          </p>
          <p v-else>
            {{
              t('adminActionCenter.sourceJobHint', {
                attention: number(asJobSource(source).attention),
                running: number(asJobSource(source).running),
                waiting: number(asJobSource(source).waiting),
                overdue: number(source.overdue),
              })
            }}
          </p>
        </BCard>
      </section>

      <section class="action-center__items" :aria-label="t('adminActionCenter.listTitle')">
        <BCard
          v-for="item in filteredItems"
          :key="`${item.source}:${item.id}`"
          as="article"
          variant="card"
          padding="14px"
          class="action-center__item"
          :class="`is-${item.status}`"
        >
          <div class="action-center__item-main">
            <div class="action-center__item-heading">
              <BChip :tone="itemTone(item)">{{ sourceLabel(item.source) }}</BChip>
              <BChip v-if="activeSection === 'jobs'" :tone="statusTone(item.status)">{{
                statusLabel(item.status)
              }}</BChip>
              <BChip v-else-if="item.severity === 'critical'" tone="danger">{{
                t('adminActionCenter.status.critical')
              }}</BChip>
              <BChip v-if="item.slaState && item.slaState !== 'unavailable'" :tone="slaTone(item.slaState)">
                {{ slaLabel(item.slaState) }}
              </BChip>
              <strong>{{ item.title }}</strong>
            </div>
            <p class="action-center__meta">
              <span v-if="item.ownerLabel">{{ item.ownerLabel }}</span>
              <span v-if="item.ownerTeam">{{ t('adminActionCenter.ownerTeam', { team: item.ownerTeam }) }}</span>
              <span>{{ t('adminActionCenter.itemId', { id: shortId(item.id) }) }}</span>
              <span>{{ formatTime(item.updatedAt || item.createdAt) }}</span>
              <span v-if="item.dueAt">{{ t('adminActionCenter.dueAt', { time: formatBeijingTime(item.dueAt) }) }}</span>
              <span v-if="item.slaState === 'overdue'" class="action-center__overdue-text">{{
                t('adminActionCenter.overdueFor', { duration: formatDuration(item.overdueMinutes) })
              }}</span>
            </p>
            <p v-if="activeSection === 'jobs'" class="action-center__job-meta">
              <span>{{ t('adminActionCenter.attempts', { count: number(item.attempts) }) }}</span>
              <span v-if="item.scheduledAt">{{
                t('adminActionCenter.scheduledAt', {
                  time: formatBeijingTime(item.scheduledAtUtc || item.scheduledAt),
                })
              }}</span>
              <span v-if="numberValue(item.groupCount) > 1">{{
                t('adminActionCenter.groupedJobs', { count: number(item.groupCount) })
              }}</span>
              <code v-if="item.errorCode">{{ item.errorCode }}</code>
            </p>
          </div>
          <div class="action-center__item-actions">
            <BButton v-if="hasItemAction(item)" size="small" @click="openItem(item)">
              {{ activeSection === 'work' ? t('adminActionCenter.openWork') : t('adminActionCenter.openDiagnostics') }}
            </BButton>
            <BButton
              v-if="activeSection === 'jobs' && item.canRetry"
              size="small"
              type="primary"
              @click="openRetry(item)"
            >
              {{ t('adminActionCenter.retry.action') }}
            </BButton>
            <BButton
              v-if="activeSection === 'jobs' && item.source === 'bookmark_icon' && item.status === 'attention'"
              size="small"
              type="danger"
              @click="confirmDismiss(item)"
            >
              {{ t('adminActionCenter.dismiss.action') }}
            </BButton>
          </div>
        </BCard>

        <div v-if="!filteredItems.length" class="action-center__empty">
          <strong>{{ t('adminActionCenter.emptyTitle') }}</strong>
          <span>{{ t('adminActionCenter.emptyHint') }}</span>
        </div>
      </section>
    </template>

    <BModal
      v-model:visible="retryVisible"
      :title="t('adminActionCenter.retry.title')"
      width="min(520px, 92vw)"
      :mask-closable="!retryLoading"
      :esc-closable="!retryLoading"
      initial-focus=".action-center__retry-reason textarea"
    >
      <div v-if="retryJob" class="action-center__retry">
        <p>{{
          t('adminActionCenter.retry.summary', {
            source: sourceLabel(retryJob.source),
            title: retryJob.title,
          })
        }}</p>
        <p class="action-center__retry-warning">{{ t('adminActionCenter.retry.warning') }}</p>
        <label>
          <span>{{ t('adminActionCenter.retry.reason') }}</span>
          <BInput
            v-model:value="retryReason"
            class="action-center__retry-reason"
            type="textarea"
            :rows="3"
            :maxlength="500"
            :placeholder="t('adminActionCenter.retry.reasonPlaceholder')"
          />
        </label>
      </div>
      <template #footer>
        <div class="action-center__retry-footer">
          <BButton :disabled="retryLoading" @click="retryVisible = false">{{ t('common.cancel') }}</BButton>
          <BButton type="primary" :loading="retryLoading" @click="submitRetry">
            {{ t('adminActionCenter.retry.confirm') }}
          </BButton>
        </div>
      </template>
    </BModal>

    <BModal
      v-model:visible="todoDiagnosticVisible"
      :title="t('adminActionCenter.diagnostic.title')"
      width="min(760px, 94vw)"
      :mask-closable="!todoDiagnosticLoading"
      :esc-closable="!todoDiagnosticLoading"
    >
      <BLoading v-if="todoDiagnosticLoading" loading :title="t('adminActionCenter.diagnostic.loading')" />
      <div v-else-if="todoDiagnostic" class="action-center__diagnostic">
        <header class="action-center__diagnostic-heading">
          <div>
            <small>{{ todoDiagnostic.todo.ownerLabel }}</small>
            <strong>{{ todoDiagnostic.todo.title }}</strong>
          </div>
          <BChip :tone="diagnosticTone(todoDiagnostic.job)">{{ diagnosticStateLabel(todoDiagnostic.job) }}</BChip>
        </header>

        <section class="action-center__diagnostic-primary">
          <div class="is-time">
            <span>{{ t('adminActionCenter.diagnostic.scheduledAt') }}</span>
            <strong>{{ formatBeijingTime(todoDiagnostic.job.scheduledAtUtc) }}</strong>
            <small>{{ t('adminActionCenter.diagnostic.beijingTime') }}</small>
          </div>
          <div>
            <span>{{ t('adminActionCenter.diagnostic.result') }}</span>
            <strong>{{ attentionReasonLabel(todoDiagnostic.job) }}</strong>
            <small v-if="todoDiagnostic.job.errorCode"
              ><code>{{ todoDiagnostic.job.errorCode }}</code></small
            >
          </div>
          <div>
            <span>{{ t('adminActionCenter.diagnostic.channel') }}</span>
            <strong>{{ channelLabel(todoDiagnostic.job.channel) }}</strong>
            <small>{{ t('adminActionCenter.attempts', { count: number(todoDiagnostic.job.attempts) }) }}</small>
          </div>
        </section>

        <section class="action-center__diagnostic-section">
          <h4>{{ t('adminActionCenter.diagnostic.rule') }}</h4>
          <p>{{ diagnosticRuleLabel(todoDiagnostic.rule) }}</p>
          <div class="action-center__diagnostic-meta">
            <span>{{
              t('adminActionCenter.diagnostic.timezone', { timezone: timezoneLabel(todoDiagnostic.job.timezone) })
            }}</span>
            <span>{{ t('adminActionCenter.diagnostic.todoId', { id: shortId(todoDiagnostic.todo.id) }) }}</span>
            <span>{{ t('adminActionCenter.diagnostic.jobId', { id: shortId(todoDiagnostic.job.id) }) }}</span>
          </div>
        </section>

        <section class="action-center__diagnostic-section">
          <h4>{{
            t('adminActionCenter.diagnostic.relatedJobs', { count: number(todoDiagnostic.relatedJobs.length) })
          }}</h4>
          <div class="action-center__diagnostic-jobs">
            <div v-for="job in todoDiagnostic.relatedJobs" :key="job.id">
              <span>{{ formatBeijingTime(job.scheduledAtUtc) }}</span>
              <BChip :tone="diagnosticTone(job)">{{ diagnosticStateLabel(job) }}</BChip>
              <small>{{ channelLabel(job.channel) }}</small>
            </div>
          </div>
        </section>
      </div>
      <div v-else class="action-center__empty">
        <strong>{{ t('adminActionCenter.diagnostic.emptyTitle') }}</strong>
        <span>{{ t('adminActionCenter.diagnostic.emptyHint') }}</span>
      </div>
      <template #footer>
        <div class="action-center__retry-footer">
          <BButton v-if="todoDiagnostic?.job.seriesId" :disabled="todoDiagnosticLoading" @click="openSeriesDiagnostic">
            {{ t('adminActionCenter.diagnostic.openSeries') }}
          </BButton>
          <BButton type="primary" :disabled="todoDiagnosticLoading" @click="todoDiagnosticVisible = false">
            {{ t('common.close') }}
          </BButton>
        </div>
      </template>
    </BModal>
  </AdminDataPage>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs, { type TabItem } from '@/components/base/BasicComponents/BTabs.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import {
    dismissAdminAsyncJob,
    getAdminActionCenter,
    getAdminTodoReminderDiagnostic,
    retryAdminAsyncJob,
  } from '@/api/commonApi';
  import { formatAdminDateTime } from '@/utils/adminDateTime';

  type Section = 'work' | 'jobs';
  type ItemStatus = 'pending' | 'waiting' | 'running' | 'attention';
  type SlaState = 'overdue' | 'due_soon' | 'within_sla' | 'unavailable';
  interface ActionItem {
    id: string;
    source: string;
    status: ItemStatus;
    rawStatus?: string;
    severity?: string;
    title: string;
    ownerLabel?: string;
    userId?: string | null;
    attempts?: number;
    scheduledAt?: string | null;
    scheduledAtUtc?: string | null;
    scheduledAtBeijing?: string | null;
    scheduledAtLocal?: string | null;
    timezone?: string | null;
    attentionReason?: string | null;
    groupCount?: number;
    relatedId?: string | null;
    seriesId?: string | null;
    ruleId?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    errorCode?: string | null;
    targetUrl?: string;
    canRetry?: boolean;
    ownerTeam?: string | null;
    assignee?: string | null;
    slaMinutes?: number | null;
    dueAt?: string | null;
    slaState?: SlaState;
    ageMinutes?: number | null;
    overdueMinutes?: number;
  }
  interface TodoReminderDiagnosticJob {
    id: string;
    todoId: string;
    seriesId?: string | null;
    ruleId?: string | null;
    status: string;
    health: 'attention' | 'running' | 'waiting' | 'paused' | 'sent' | 'terminal';
    attentionReason?: string | null;
    channel: string;
    attempts: number;
    scheduledAtUtc?: string | null;
    scheduledAtBeijing?: string | null;
    scheduledAtLocal?: string | null;
    timezone?: string | null;
    errorCode?: string | null;
  }
  interface TodoReminderDiagnosticRule {
    id: string;
    mode: string;
    triggerType?: string | null;
    fixedLocalTime?: string | null;
    offsetMinutes?: number | null;
    repeatIntervalMinutes?: number | null;
    stopType?: string | null;
    maxCount?: number | null;
    channels?: string[];
    quietPolicy?: string;
    schedule?: {
      mode?: string;
      once?: { type?: string; fixedAt?: string; offsetMinutes?: number };
      repeat?: {
        kind?: string;
        intervalMinutes?: number;
        weekdays?: number[];
        monthDays?: number[];
        localTime?: string;
      };
    } | null;
  }
  interface TodoReminderDiagnostic {
    todo: { id: string; title: string; ownerLabel: string; description?: string; priority?: number };
    job: TodoReminderDiagnosticJob;
    rule: TodoReminderDiagnosticRule | null;
    relatedJobs: TodoReminderDiagnosticJob[];
  }
  interface WorkSource {
    source: string;
    label: string;
    count: number;
    critical: number;
    overdue: number;
    dueSoon: number;
    oldestAgeMinutes: number;
    sampled: boolean;
  }
  interface JobSource {
    source: string;
    label: string;
    total: number;
    attention: number;
    running: number;
    waiting: number;
    completed24h: number;
    overdue: number;
    dueSoon: number;
    oldestAgeMinutes: number;
    sampled: boolean;
  }

  const WORK_SOURCE_KEYS = [
    'opinion',
    'security',
    'community_report',
    'ai_feedback',
    'feature_request',
    'resource_governance',
  ] as const;
  const JOB_SOURCE_KEYS = [
    'ai_document',
    'bookmark_icon',
    'todo_reminder',
    'account_deletion',
    'email_delivery',
    'file_preview',
    'resource_cleanup',
  ] as const;
  const SOURCE_KEYS = [...WORK_SOURCE_KEYS, ...JOB_SOURCE_KEYS] as const;

  function routeQueryValue(value: unknown) {
    return String(Array.isArray(value) ? value[0] || '' : value || '').trim();
  }

  const initialQuery = router.currentRoute?.value?.query || {};
  const initialSection = routeQueryValue(initialQuery.section) === 'jobs' ? 'jobs' : 'work';
  const initialSources = initialSection === 'jobs' ? JOB_SOURCE_KEYS : WORK_SOURCE_KEYS;
  const requestedSource = routeQueryValue(initialQuery.source);
  const requestedStatus = routeQueryValue(initialQuery.status);
  const requestedSla = routeQueryValue(initialQuery.slaState);

  const { t, locale } = useI18n();
  const loading = ref(false);
  const hasLoaded = ref(false);
  const activeSection = ref<Section>(initialSection);
  const sourceFilter = ref(
    requestedSource === 'all' || (initialSources as readonly string[]).includes(requestedSource)
      ? requestedSource
      : 'all',
  );
  const statusFilter = ref(
    ['all', 'attention', 'running', 'waiting'].includes(requestedStatus) ? requestedStatus : 'all',
  );
  const slaFilter = ref(
    ['all', 'overdue', 'due_soon', 'within_sla', 'unavailable'].includes(requestedSla) ? requestedSla : 'all',
  );
  const keyword = ref(routeQueryValue(initialQuery.keyword).slice(0, 120));
  const sla = ref({
    policyVersion: '',
    overdue: 0,
    dueSoon: 0,
    oldestAgeMinutes: 0,
    returnedCount: 0,
    unavailableCount: 0,
    sampled: false,
  });
  const unavailableSources = ref<string[]>([]);
  const retryVisible = ref(false);
  const retryLoading = ref(false);
  const retryJob = ref<ActionItem | null>(null);
  const retryReason = ref('');
  const todoDiagnosticVisible = ref(false);
  const todoDiagnosticLoading = ref(false);
  const todoDiagnostic = ref<TodoReminderDiagnostic | null>(null);
  let todoDiagnosticSequence = 0;
  const work = ref<{ total: number; critical: number; sources: WorkSource[]; items: ActionItem[] }>({
    total: 0,
    critical: 0,
    sources: [],
    items: [],
  });
  const jobs = ref<{
    attention: number;
    running: number;
    waiting: number;
    completed24h: number;
    sources: JobSource[];
    items: ActionItem[];
  }>({ attention: 0, running: 0, waiting: 0, completed24h: 0, sources: [], items: [] });
  let loadSequence = 0;

  const tabs = computed<TabItem[]>(() => [
    { key: 'work', label: t('adminActionCenter.tabs.work'), badge: work.value.total },
    { key: 'jobs', label: t('adminActionCenter.tabs.jobs'), badge: jobs.value.attention },
  ]);
  const activeSources = computed(() => (activeSection.value === 'work' ? work.value.sources : jobs.value.sources));
  const sourceOptions = computed(() => [
    { value: 'all', label: t('adminActionCenter.allSources') },
    ...(activeSection.value === 'work' ? WORK_SOURCE_KEYS : JOB_SOURCE_KEYS).map((source) => ({
      value: source,
      label: sourceLabel(source),
    })),
  ]);
  const statusOptions = computed(() => [
    { value: 'all', label: t('adminActionCenter.status.all') },
    { value: 'attention', label: t('adminActionCenter.status.attention') },
    { value: 'running', label: t('adminActionCenter.status.running') },
    { value: 'waiting', label: t('adminActionCenter.status.waiting') },
  ]);
  const slaOptions = computed(() => [
    { value: 'all', label: t('adminActionCenter.sla.all') },
    { value: 'overdue', label: t('adminActionCenter.sla.overdue') },
    { value: 'due_soon', label: t('adminActionCenter.sla.dueSoon') },
    { value: 'within_sla', label: t('adminActionCenter.sla.within') },
    { value: 'unavailable', label: t('adminActionCenter.sla.unavailable') },
  ]);
  const currentItems = computed(() => (activeSection.value === 'work' ? work.value.items : jobs.value.items));
  const filteredItems = computed(() => {
    const search = keyword.value.trim().toLocaleLowerCase();
    return currentItems.value.filter((item) => {
      if (sourceFilter.value !== 'all' && item.source !== sourceFilter.value) return false;
      if (activeSection.value === 'jobs' && statusFilter.value !== 'all' && item.status !== statusFilter.value)
        return false;
      if (slaFilter.value !== 'all' && item.slaState !== slaFilter.value) return false;
      if (!search) return true;
      return [item.id, item.title, item.ownerLabel, item.errorCode, item.rawStatus]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(search));
    });
  });

  function number(value: unknown) {
    return Number(value || 0).toLocaleString(locale.value);
  }
  function numberValue(value: unknown) {
    return Number(value || 0);
  }
  function asWorkSource(source: WorkSource | JobSource) {
    return source as WorkSource;
  }
  function asJobSource(source: WorkSource | JobSource) {
    return source as JobSource;
  }
  function sourceLabel(source: string) {
    return (SOURCE_KEYS as readonly string[]).includes(source) ? t(`adminActionCenter.sources.${source}`) : source;
  }
  function statusLabel(status: ItemStatus) {
    return t(`adminActionCenter.status.${status}`);
  }
  function statusTone(status: ItemStatus): 'danger' | 'pending' | 'success' | 'neutral' {
    if (status === 'attention') return 'danger';
    if (status === 'running') return 'success';
    if (status === 'waiting') return 'pending';
    return 'neutral';
  }
  function slaTone(state: SlaState): 'danger' | 'pending' | 'success' | 'neutral' {
    if (state === 'overdue') return 'danger';
    if (state === 'due_soon') return 'pending';
    if (state === 'within_sla') return 'success';
    return 'neutral';
  }
  function slaLabel(state: SlaState) {
    return t(`adminActionCenter.sla.${state === 'due_soon' ? 'dueSoon' : state === 'within_sla' ? 'within' : state}`);
  }
  function itemTone(item: ActionItem): 'danger' | 'pending' | 'neutral' {
    if (item.severity === 'critical' || item.status === 'attention') return 'danger';
    return activeSection.value === 'work' ? 'pending' : 'neutral';
  }
  function sourceTone(source: WorkSource | JobSource): 'danger' | 'pending' | 'success' | 'neutral' {
    if (activeSection.value === 'work') return asWorkSource(source).critical > 0 ? 'danger' : 'pending';
    if (asJobSource(source).attention > 0) return 'danger';
    return asJobSource(source).running > 0 ? 'success' : 'neutral';
  }
  function sourcePrimaryValue(source: WorkSource | JobSource) {
    return activeSection.value === 'work' ? number(asWorkSource(source).count) : number(asJobSource(source).attention);
  }
  function formatTime(value?: string | null) {
    return formatAdminDateTime(value, locale.value, { source: 'beijing' });
  }
  function formatBeijingTime(value?: string | null) {
    return formatAdminDateTime(value, locale.value, { source: 'utc' });
  }
  function formatDuration(value?: number | null) {
    const minutes = Math.max(0, Number(value || 0));
    if (minutes < 60) return t('adminActionCenter.duration.minutes', { count: number(minutes) });
    if (minutes < 24 * 60) return t('adminActionCenter.duration.hours', { count: number(Math.floor(minutes / 60)) });
    return t('adminActionCenter.duration.days', { count: number(Math.floor(minutes / (24 * 60))) });
  }
  function shortId(value: string) {
    const id = String(value || '');
    return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
  }
  function itemTarget(item: ActionItem) {
    if (item.targetUrl) return item.targetUrl;
    return '';
  }
  function currentActionCenterPath() {
    return router.currentRoute?.value?.path === '/actionCenter' ? '/actionCenter' : '/admin/actionCenter';
  }
  function actionCenterReturnTo() {
    const params = new URLSearchParams();
    params.set('section', activeSection.value);
    if (sourceFilter.value !== 'all') params.set('source', sourceFilter.value);
    if (activeSection.value === 'jobs' && statusFilter.value !== 'all') params.set('status', statusFilter.value);
    if (slaFilter.value !== 'all') params.set('slaState', slaFilter.value);
    if (keyword.value.trim()) params.set('keyword', keyword.value.trim().slice(0, 120));
    const query = params.toString();
    return `${currentActionCenterPath()}${query ? `?${query}` : ''}`;
  }
  function hasItemAction(item: ActionItem) {
    return item.source === 'todo_reminder' || Boolean(itemTarget(item));
  }
  function openItem(item: ActionItem) {
    if (item.source === 'todo_reminder') {
      void openTodoDiagnostic(item);
      return;
    }
    if (item.source === 'opinion') {
      const mobile = currentActionCenterPath() === '/actionCenter';
      void router.push({
        path: mobile ? '/userOpinion' : '/admin/userOpinion',
        query: { opinionId: item.id, returnTo: actionCenterReturnTo() },
      });
      return;
    }
    if (item.source === 'security') {
      const mobile = currentActionCenterPath() === '/actionCenter';
      void router.push({
        path: mobile ? '/securityCenterMobile' : '/securityCenter/review',
        query: {
          ...(mobile ? { tab: 'review' } : {}),
          eventId: item.id,
          returnTo: actionCenterReturnTo(),
        },
      });
      return;
    }
    const target = itemTarget(item);
    if (target) router.push(target);
  }
  async function openTodoDiagnostic(item: ActionItem) {
    const requestId = ++todoDiagnosticSequence;
    todoDiagnostic.value = null;
    todoDiagnosticVisible.value = true;
    todoDiagnosticLoading.value = true;
    try {
      const response: any = await getAdminTodoReminderDiagnostic({ id: item.id });
      if (requestId !== todoDiagnosticSequence) return;
      if (response?.status !== 200) throw new Error(response?.msg || t('adminActionCenter.diagnostic.loadFailed'));
      if (!response.data?.todo?.id || !response.data?.job?.id) {
        throw new Error(t('adminActionCenter.diagnostic.loadFailed'));
      }
      todoDiagnostic.value = {
        todo: response.data?.todo,
        job: response.data?.job,
        rule: response.data?.rule || null,
        relatedJobs: Array.isArray(response.data?.relatedJobs) ? response.data.relatedJobs : [],
      } as TodoReminderDiagnostic;
    } catch (error: any) {
      if (requestId !== todoDiagnosticSequence) return;
      message.error(error?.message || t('adminActionCenter.diagnostic.loadFailed'));
    } finally {
      if (requestId === todoDiagnosticSequence) todoDiagnosticLoading.value = false;
    }
  }
  function diagnosticTone(job: TodoReminderDiagnosticJob): 'danger' | 'pending' | 'success' | 'neutral' {
    if (job.health === 'attention') return 'danger';
    if (job.health === 'running' || job.health === 'sent') return 'success';
    if (job.health === 'waiting') return 'pending';
    return 'neutral';
  }
  function diagnosticStateLabel(job: TodoReminderDiagnosticJob) {
    return t(`adminActionCenter.diagnostic.state.${job.health}`);
  }
  function attentionReasonLabel(job: TodoReminderDiagnosticJob) {
    if (job.attentionReason) return t(`adminActionCenter.diagnostic.reason.${job.attentionReason}`);
    return t(`adminActionCenter.diagnostic.reason.${job.health}`);
  }
  function channelLabel(channel: string) {
    return t(`adminActionCenter.diagnostic.channelLabel.${channel === 'email' ? 'email' : 'in_app'}`);
  }
  function timezoneLabel(timezone?: string | null) {
    return ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin'].includes(String(timezone || ''))
      ? t('adminActionCenter.diagnostic.beijingTime')
      : timezone || t('adminActionCenter.diagnostic.beijingTime');
  }
  function diagnosticRuleLabel(rule: TodoReminderDiagnosticRule | null) {
    if (!rule) return t('adminActionCenter.diagnostic.ruleUnavailable');
    const schedule = rule.schedule;
    if (schedule?.mode === 'repeat') {
      const repeat = schedule.repeat || {};
      if (repeat.kind === 'weekly') {
        const weekdays = (repeat.weekdays || [])
          .map((day) => t(`adminActionCenter.diagnostic.weekday.${day}`))
          .join(locale.value.startsWith('zh') ? '、' : ', ');
        return t('adminActionCenter.diagnostic.weeklyRule', {
          weekdays: weekdays || '-',
          time: repeat.localTime || rule.fixedLocalTime || '-',
        });
      }
      if (repeat.kind === 'monthly') {
        return t('adminActionCenter.diagnostic.monthlyRule', {
          days: (repeat.monthDays || []).join(locale.value.startsWith('zh') ? '、' : ', ') || '-',
          time: repeat.localTime || rule.fixedLocalTime || '-',
        });
      }
      return t('adminActionCenter.diagnostic.intervalRule', {
        minutes: number(repeat.intervalMinutes || rule.repeatIntervalMinutes),
      });
    }
    if (schedule?.mode === 'once') return t('adminActionCenter.diagnostic.onceRule');
    return t(`adminActionCenter.diagnostic.ruleMode.${rule.mode || 'unknown'}`);
  }
  function openSeriesDiagnostic() {
    const seriesId = todoDiagnostic.value?.job.seriesId;
    if (!seriesId) return;
    todoDiagnosticVisible.value = false;
    router.push({ path: '/admin/todoPlanDiagnostics', query: { keyword: seriesId } });
  }
  function openRetry(item: ActionItem) {
    retryJob.value = item;
    retryReason.value = '';
    retryVisible.value = true;
  }
  async function submitRetry() {
    const job = retryJob.value;
    if (!job || retryLoading.value) return;
    const reason = retryReason.value.trim();
    if (reason.length < 6) {
      message.warning(t('adminActionCenter.retry.reasonRequired'));
      return;
    }
    retryLoading.value = true;
    try {
      const response: any = await retryAdminAsyncJob({
        source: job.source,
        id: job.id,
        reason,
        confirmed: true,
        confirmText: '确认重试任务',
      });
      if (response?.status !== 200) throw new Error(response?.msg || t('adminActionCenter.retry.failed'));
      message.success(t('adminActionCenter.retry.success'));
      retryVisible.value = false;
      retryJob.value = null;
      retryReason.value = '';
      await load();
    } catch (error: any) {
      message.error(error?.message || t('adminActionCenter.retry.failed'));
    } finally {
      retryLoading.value = false;
    }
  }
  function confirmDismiss(item: ActionItem) {
    Alert.alert({
      title: t('adminActionCenter.dismiss.title'),
      content: t('adminActionCenter.dismiss.content', { title: item.title }),
      okText: t('adminActionCenter.dismiss.confirm'),
      okType: 'danger',
      onOk: async () => {
        try {
          const response: any = await dismissAdminAsyncJob({
            source: item.source,
            id: item.id,
            reason: t('adminActionCenter.dismiss.auditReason'),
            confirmed: true,
          });
          if (response?.status !== 200) throw new Error(response?.msg || t('adminActionCenter.dismiss.failed'));
          message.success(t('adminActionCenter.dismiss.success'));
          await load();
        } catch (error: any) {
          message.error(error?.message || t('adminActionCenter.dismiss.failed'));
        }
      },
    });
  }
  function selectSource(source: string) {
    if (sourceFilter.value === source) return;
    sourceFilter.value = source;
    statusFilter.value = 'all';
    slaFilter.value = 'all';
    void load();
  }
  function onSourceChange() {
    statusFilter.value = 'all';
    slaFilter.value = 'all';
    void load();
  }
  function onSectionChange() {
    sourceFilter.value = 'all';
    statusFilter.value = 'all';
    slaFilter.value = 'all';
    void load();
  }
  function onServerFilterChange() {
    void load();
  }

  async function load() {
    const requestId = ++loadSequence;
    const requestedSource = sourceFilter.value;
    loading.value = true;
    try {
      const response: any = await getAdminActionCenter({
        limit: 60,
        section: activeSection.value,
        source: requestedSource,
        status: activeSection.value === 'jobs' ? (statusFilter.value as ItemStatus | 'all') : 'all',
        slaState: slaFilter.value as SlaState | 'all',
        keyword: keyword.value.trim(),
      });
      if (requestId !== loadSequence) return;
      if (response?.status !== 200) throw new Error(response?.msg || t('adminActionCenter.loadFailed'));
      unavailableSources.value = Array.isArray(response.data?.unavailableSources)
        ? response.data.unavailableSources
        : [];
      sla.value = {
        policyVersion: String(response.data?.sla?.policyVersion || ''),
        overdue: Number(response.data?.sla?.overdue || 0),
        dueSoon: Number(response.data?.sla?.dueSoon || 0),
        oldestAgeMinutes: Number(response.data?.sla?.oldestAgeMinutes || 0),
        returnedCount: Number(response.data?.sla?.returnedCount || 0),
        unavailableCount: Number(response.data?.sla?.unavailableCount || 0),
        sampled: Boolean(response.data?.sla?.sampled),
      };
      work.value = {
        total: Number(response.data?.work?.total || 0),
        critical: Number(response.data?.work?.critical || 0),
        sources: Array.isArray(response.data?.work?.sources) ? response.data.work.sources : [],
        items: Array.isArray(response.data?.work?.items) ? response.data.work.items : [],
      };
      jobs.value = {
        attention: Number(response.data?.jobs?.attention || 0),
        running: Number(response.data?.jobs?.running || 0),
        waiting: Number(response.data?.jobs?.waiting || 0),
        completed24h: Number(response.data?.jobs?.completed24h || 0),
        sources: Array.isArray(response.data?.jobs?.sources) ? response.data.jobs.sources : [],
        items: Array.isArray(response.data?.jobs?.items) ? response.data.jobs.items : [],
      };
      if (!sourceOptions.value.some((option) => option.value === sourceFilter.value)) sourceFilter.value = 'all';
      hasLoaded.value = true;
    } catch (error: any) {
      if (requestId !== loadSequence) return;
      message.error(error?.message || t('adminActionCenter.loadFailed'));
    } finally {
      if (requestId === loadSequence) loading.value = false;
    }
  }

  onMounted(load);
</script>

<style scoped lang="less">
  .action-center__select {
    width: 154px;
  }
  .action-center__search {
    width: min(300px, 32vw);
  }
  .admin-stat-card.has-warning {
    border-color: #d97706 !important;
  }
  .admin-stat-card.has-danger {
    border-color: var(--danger-color, #e5484d) !important;
  }
  .admin-stat-card.is-success {
    border-color: #2f9e68 !important;
  }
  .action-center__warning {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    padding: 10px 12px;
    border: 1px solid #d97706;
    border-radius: 10px;
    color: var(--text-color);
    background: var(--card-background);
    font-size: 12px;
  }
  .action-center__source-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px;
  }
  .action-center__source-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .action-center__source-card {
    cursor: pointer;
  }
  .action-center__source-card:focus-visible {
    outline: 2px solid var(--primary-color, #615ced);
    outline-offset: 2px;
  }
  .action-center__source-card.is-selected {
    border-color: var(--primary-color, #615ced);
  }
  .action-center__source-card-badges {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }
  .action-center__source-selected {
    color: var(--primary-color, #615ced);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }
  .action-center__source-card p {
    margin: 6px 0 0;
    color: var(--sub-text-color);
    font-size: 11px;
    line-height: 1.5;
  }
  .action-center__items {
    display: grid;
    gap: 8px;
  }
  .action-center__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    box-shadow: none;
  }
  .action-center__item.is-attention {
    border-color: var(--danger-color, #e5484d);
  }
  .action-center__item-main {
    min-width: 0;
    display: grid;
    gap: 5px;
  }
  .action-center__item-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .action-center__item-heading {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .action-center__item-heading strong {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .action-center__meta,
  .action-center__job-meta {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    color: var(--sub-text-color);
    font-size: 11px;
    line-height: 1.5;
  }
  .action-center__job-meta code {
    color: var(--danger-color, #e5484d);
    overflow-wrap: anywhere;
  }
  .action-center__overdue-text {
    color: var(--danger-color, #e5484d);
    font-weight: 700;
  }
  .action-center__empty {
    min-height: 180px;
    display: grid;
    place-content: center;
    gap: 5px;
    color: var(--sub-text-color);
    text-align: center;
  }
  .action-center__empty strong {
    color: var(--text-color);
  }
  .action-center__retry {
    display: grid;
    gap: 10px;
  }
  .action-center__retry p {
    margin: 0;
    line-height: 1.55;
  }
  .action-center__retry-warning {
    padding: 9px 11px;
    border: 1px solid #d97706;
    border-radius: 9px;
    color: var(--text-color);
    background: var(--card-background);
    font-size: 12px;
  }
  .action-center__retry label {
    display: grid;
    gap: 6px;
    color: var(--text-color);
    font-size: 12px;
  }
  .action-center__retry-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--card-border-color);
  }
  .action-center__diagnostic {
    display: grid;
    gap: 14px;
    padding: 2px 2px 8px;
  }
  .action-center__diagnostic-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .action-center__diagnostic-heading > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .action-center__diagnostic-heading small,
  .action-center__diagnostic-primary small,
  .action-center__diagnostic-jobs small {
    color: var(--sub-text-color);
  }
  .action-center__diagnostic-heading strong {
    color: var(--text-color);
    font-size: 18px;
    overflow-wrap: anywhere;
  }
  .action-center__diagnostic-primary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .action-center__diagnostic-primary > div {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 5px;
    padding: 12px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }
  .action-center__diagnostic-primary > div.is-time {
    border-color: var(--todo-accent-color, #0ea5e9);
  }
  .action-center__diagnostic-primary span,
  .action-center__diagnostic-section h4 {
    color: var(--sub-text-color);
    font-size: 11px;
    font-weight: 600;
  }
  .action-center__diagnostic-primary strong {
    color: var(--text-color);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .action-center__diagnostic-primary .is-time strong {
    color: var(--todo-accent-color, #0ea5e9);
    font-size: 17px;
  }
  .action-center__diagnostic-section {
    display: grid;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--card-border-color);
  }
  .action-center__diagnostic-section h4,
  .action-center__diagnostic-section p {
    margin: 0;
  }
  .action-center__diagnostic-section p {
    color: var(--text-color);
    line-height: 1.55;
  }
  .action-center__diagnostic-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 14px;
    color: var(--sub-text-color);
    font-size: 11px;
  }
  .action-center__diagnostic-jobs {
    display: grid;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    overflow: hidden;
  }
  .action-center__diagnostic-jobs > div {
    min-height: 42px;
    display: grid;
    grid-template-columns: minmax(160px, 1fr) auto minmax(72px, auto);
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    color: var(--text-color);
  }
  .action-center__diagnostic-jobs > div + div {
    border-top: 1px solid var(--card-border-color);
  }

  @media (max-width: 767px) {
    .action-center__select,
    .action-center__search {
      width: 100%;
    }
    .action-center__source-section {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .action-center__item {
      align-items: stretch;
      flex-direction: column;
    }
    .action-center__item :deep(.b-button) {
      min-height: 44px;
    }
    .action-center__item-actions {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    }
    .action-center__diagnostic-primary {
      grid-template-columns: 1fr;
    }
    .action-center__diagnostic-jobs > div {
      min-height: 52px;
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .action-center__diagnostic-jobs small {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 359px) {
    .action-center__source-section {
      grid-template-columns: 1fr;
    }
  }

  html.light-note-mobile-rendering & {
    .action-center__item,
    .action-center__warning,
    .action-center__source-card {
      box-shadow: none;
    }
    .action-center__item.is-attention {
      border-color: #d64545;
    }
    .action-center__source-card.is-selected {
      border-color: #615ced;
    }
  }
</style>

<template>
  <AdminDataPage
    layout="scroll"
    :eyebrow="t('aiOperations.eyebrow')"
    :title="t('aiOperations.title')"
    :subtitle="t('aiOperations.subtitle')"
    :toolbar-hint="t('aiOperations.toolbarHint')"
  >
    <template #actions>
      <BButton type="primary" :loading="refreshing" @click="refreshAll">
        <SvgIcon v-if="!refreshing" :src="icon.infrastructure.refresh" size="15" aria-hidden="true" />
        {{ t('aiOperations.refresh') }}
      </BButton>
    </template>

    <template #metrics>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('aiOperations.metrics.balance') }}</span>
        <strong class="admin-stat-value">{{ balanceDisplay }}</strong>
        <span class="admin-stat-hint">{{ balanceHintDisplay }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('aiOperations.metrics.modelActions') }}</span>
        <strong class="admin-stat-value">{{ overview ? formatNumber(summary.modelActions) : '—' }}</strong>
        <span class="admin-stat-hint">
          {{
            overview
              ? t('aiOperations.metrics.modelActionsHint', {
                  calls: formatNumber(summary.providerCalls),
                  tokens: formatNumber(summary.providerTokens),
                  cost: formatCost(summary.estimatedCost),
                })
              : overviewPlaceholderHint
          }}
        </span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('aiOperations.metrics.delivery') }}</span>
        <strong class="admin-stat-value">{{ overview ? formatPercent(summary.deliveryRate) : '—' }}</strong>
        <span class="admin-stat-hint">
          {{
            overview
              ? t('aiOperations.metrics.deliveryHint', {
                  delivered: formatNumber(summary.delivered),
                  p95: formatDuration(summary.durationP95),
                })
              : overviewPlaceholderHint
          }}
        </span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('aiOperations.metrics.anomalies') }}</span>
        <strong class="admin-stat-value">{{ overview ? formatNumber(summary.anomalySignals) : '—' }}</strong>
        <span class="admin-stat-hint operations-anomaly-hint">
          <span
            v-if="overview"
            class="operations-signal-dot"
            :class="{ 'is-active': summary.anomalySignals > 0 }"
            aria-hidden="true"
          />
          {{
            overview
              ? t('aiOperations.metrics.anomaliesHint', {
                  failed: formatNumber(summary.failed),
                  stale: formatNumber(summary.staleRunning),
                  usage: formatNumber(summary.usageMissing + summary.settlementAttention),
                })
              : overviewPlaceholderHint
          }}
        </span>
      </li>
    </template>

    <template #toolbar>
      <label class="operations-filter operations-filter--select">
        <span>{{ t('aiOperations.filters.period') }}</span>
        <BSelect
          v-model:value="filters.periodDays"
          :options="periodOptions"
          :aria-label="t('aiOperations.filters.period')"
          @change="applyFilterChange"
        />
      </label>
      <label class="operations-filter operations-filter--select">
        <span>{{ t('aiOperations.filters.module') }}</span>
        <BSelect
          v-model:value="filters.module"
          :options="moduleOptions"
          :aria-label="t('aiOperations.filters.module')"
          @change="applyFilterChange"
        />
      </label>
      <label class="operations-filter operations-filter--select">
        <span>{{ t('aiOperations.filters.status') }}</span>
        <BSelect
          v-model:value="filters.status"
          :options="statusOptions"
          :aria-label="t('aiOperations.filters.status')"
          @change="applyFilterChange"
        />
      </label>
      <label class="operations-filter operations-filter--select">
        <span>{{ t('aiOperations.filters.provider') }}</span>
        <BSelect
          v-model:value="filters.provider"
          :options="providerOptions"
          :aria-label="t('aiOperations.filters.provider')"
          @change="applyFilterChange"
        />
      </label>
      <label class="operations-filter operations-filter--search" for="ai-operations-search">
        <span class="operations-filter__label">{{ t('common.search') }}</span>
        <BInput
          id="ai-operations-search"
          v-model:value="filters.keyword"
          clearable
          :placeholder="t('aiOperations.searchPlaceholder')"
          @input="scheduleKeywordSearch"
          @enter="applyKeywordImmediately"
        >
          <template #prefix><SvgIcon :src="icon.navigation.search" size="15" aria-hidden="true" /></template>
        </BInput>
      </label>
      <span class="operations-internal-filter">
        <BSwitch
          v-model:checked="filters.hideInternal"
          :aria-label="t('aiOperations.hideInternal')"
          @change="applyFilterChange"
        />
        {{ t('aiOperations.hideInternal') }}
      </span>
    </template>

    <template #summary>
      <template v-if="!executions.length && listLoading">{{ t('aiOperations.executions.loadingCount') }}</template>
      <template v-else-if="!executions.length && listError">{{
        t('aiOperations.executions.resultUnavailable')
      }}</template>
      <template v-else>{{ t('aiOperations.executions.resultCount', { n: formatNumber(total) }) }}</template>
    </template>

    <div v-if="partialData" class="operations-inline-warning" role="status">
      <SvgIcon :src="icon.message.warning" size="16" aria-hidden="true" />
      {{ staleData ? t('aiOperations.staleWarning') : t('aiOperations.partialWarning') }}
    </div>

    <BCard v-if="initialLoading" class="operations-state-card" variant="panel">
      <BLoading inline :loading="true" :title="t('aiOperations.loading')" />
    </BCard>

    <BCard v-else-if="initialError" class="operations-state-card operations-state-card--error" variant="panel">
      <SvgIcon :src="icon.message.error" size="26" aria-hidden="true" />
      <strong>{{ t('aiOperations.loadFailed') }}</strong>
      <span>{{ t('aiOperations.loadFailedHint') }}</span>
      <BButton type="primary" @click="refreshAll">{{ t('aiOperations.retry') }}</BButton>
    </BCard>

    <template v-else>
      <section class="operations-overview-grid">
        <BCard class="operations-trend-card" variant="panel">
          <template #title>
            <div class="operations-section-title">
              <span>
                <strong>{{ t('aiOperations.trend.title') }}</strong>
                <small>{{ t('aiOperations.trend.hint') }}</small>
              </span>
              <BChip tone="neutral" size="small">{{ t('settings.ai.usage.days', { n: filters.periodDays }) }}</BChip>
            </div>
          </template>

          <div
            v-if="trendHasUsage"
            class="operations-trend-scroll"
            role="img"
            :aria-label="t('aiOperations.trend.aria', { days: filters.periodDays })"
          >
            <div class="operations-trend" :style="trendWidthStyle">
              <BTooltip v-for="(day, index) in overview?.daily || []" :key="day.date" :title="trendTooltip(day)">
                <span class="operations-trend__item">
                  <span class="operations-trend__plot" aria-hidden="true">
                    <span
                      v-if="day.providerTokens > 0"
                      class="operations-trend__bar"
                      :style="{ height: `${chartHeight(day.providerTokens, trendMaximum)}%` }"
                    />
                    <span v-if="day.failures > 0" class="operations-trend__failure" />
                  </span>
                  <time :datetime="day.date">{{ showTrendLabel(index) ? shortDate(day.date) : '' }}</time>
                </span>
              </BTooltip>
            </div>
          </div>
          <div v-else class="operations-empty-block">
            <SvgIcon :src="icon.settings.ai" size="22" aria-hidden="true" />
            {{ t('aiOperations.trend.empty') }}
          </div>
        </BCard>

        <BCard class="operations-module-card" variant="panel">
          <template #title>
            <div class="operations-section-title">
              <span>
                <strong>{{ t('aiOperations.modules.title') }}</strong>
                <small>{{ t('aiOperations.modules.hint') }}</small>
              </span>
            </div>
          </template>
          <ul v-if="overview?.modules?.length" class="operations-module-list">
            <li v-for="item in overview.modules.slice(0, 7)" :key="item.module">
              <div>
                <strong>{{ moduleLabel(item.module) }}</strong>
                <span>{{
                  t('aiOperations.modules.row', {
                    actions: formatNumber(item.modelActions),
                    tokens: formatNumber(item.providerTokens),
                  })
                }}</span>
              </div>
              <span class="operations-module-track" aria-hidden="true">
                <span :style="{ width: `${chartHeight(item.providerTokens, moduleMaximum, 5)}%` }" />
              </span>
            </li>
          </ul>
          <div v-else class="operations-empty-block">{{ t('aiOperations.modules.empty') }}</div>
        </BCard>
      </section>

      <BCard class="operations-provider-card" variant="panel">
        <template #title>
          <div class="operations-section-title">
            <span>
              <strong>{{ t('aiOperations.providers.title') }}</strong>
              <small>{{ t('aiOperations.providers.hint') }}</small>
            </span>
          </div>
        </template>
        <div v-if="overview?.providers?.length" class="operations-provider-grid">
          <article v-for="provider in overview.providers" :key="`${provider.provider}-${provider.model}`">
            <span class="operations-provider-icon"
              ><SvgIcon :src="icon.settings.ai" size="17" aria-hidden="true"
            /></span>
            <div>
              <strong>{{ provider.provider || t('aiOperations.providers.unknown') }}</strong>
              <span>{{ provider.model || t('aiOperations.executions.providerUnknown') }}</span>
              <small>{{
                t('aiOperations.providers.row', {
                  calls: formatNumber(provider.calls),
                  tokens: formatNumber(provider.tokens),
                  cost: formatCost(provider.estimatedCost),
                })
              }}</small>
              <small
                v-if="provider.failedCalls || provider.missingUsageCalls || provider.platformCalls"
                class="is-attention"
              >
                {{
                  t('aiOperations.providers.issue', {
                    failed: formatNumber(provider.failedCalls),
                    missing: formatNumber(provider.missingUsageCalls),
                    platform: formatNumber(provider.platformCalls),
                  })
                }}
              </small>
            </div>
          </article>
        </div>
        <div v-else class="operations-empty-block">{{ t('aiOperations.providers.empty') }}</div>
      </BCard>

      <section class="operations-executions" aria-labelledby="ai-operations-executions-title">
        <header class="operations-executions__header">
          <div>
            <h3 id="ai-operations-executions-title">{{ t('aiOperations.executions.title') }}</h3>
            <p>{{ t('aiOperations.executions.privacy') }}</p>
          </div>
          <BLoading v-if="listLoading && executions.length" inline :loading="true" />
        </header>

        <BCard v-if="!executions.length && listLoading" class="operations-list-state" variant="panel">
          <BLoading inline :loading="true" :title="t('aiOperations.loading')" />
        </BCard>

        <BCard v-else-if="!executions.length" class="operations-list-state" variant="panel">
          <SvgIcon :src="listError ? icon.message.error : icon.settings.ai" size="24" aria-hidden="true" />
          <strong>{{ listError ? t('aiOperations.loadFailed') : t('aiOperations.executions.emptyTitle') }}</strong>
          <span>{{ listError ? t('aiOperations.loadFailedHint') : t('aiOperations.executions.emptyHint') }}</span>
          <BButton v-if="listError" size="small" @click="reloadExecutions(false)">{{
            t('aiOperations.retry')
          }}</BButton>
        </BCard>

        <div v-else-if="!bookmark.isMobile" class="operations-table-wrap">
          <BTable
            ref="tableRef"
            fill
            virtual
            :data="executions"
            :columns="columns"
            :row-clickable="true"
            :loading="listLoading"
            :has-more="hasMore"
            :row-height="68"
            @load-more="loadMoreExecutions"
            @row-click="openDetail"
          >
            <template #bodyCell="{ column, record }">
              <div v-if="column.key === 'action'" class="operations-cell-main">
                <strong>{{ actionLabel(record.labelKey) }}</strong>
                <span>{{ moduleLabel(record.module) }} · {{ shortExecutionId(record.id) }}</span>
              </div>
              <div v-else-if="column.key === 'actor'" class="operations-cell-main">
                <strong>{{ actorName(record.actor) }}</strong>
                <span v-if="actorsDiffer(record)">{{ actorSubjectLabel(record) }}</span>
                <span v-else>{{ record.actor?.role || '—' }}</span>
              </div>
              <div v-else-if="column.key === 'status'" class="operations-status-stack">
                <BChip :tone="aiOperationsStatusTone(record.status)" size="medium">
                  {{ statusLabel(record.status) }}
                </BChip>
                <span v-for="notice in executionAttentionLabels(record)" :key="notice">
                  <SvgIcon :src="icon.message.warning" size="11" aria-hidden="true" />
                  {{ notice }}
                </span>
              </div>
              <div v-else-if="column.key === 'model'" class="operations-cell-main">
                <strong>{{ record.providers?.join(' / ') || t('aiOperations.providers.unknown') }}</strong>
                <span>{{ record.models?.join(' / ') || t('aiOperations.executions.providerUnknown') }}</span>
              </div>
              <div v-else-if="column.key === 'tokens'" class="operations-cell-main operations-cell-main--numeric">
                <strong>{{ formatNumber(record.providerTokens) }}</strong>
                <span>{{ tokenPairLabel(record) }}</span>
              </div>
              <div v-else-if="column.key === 'calls'" class="operations-cell-main operations-cell-main--numeric">
                <strong>{{ formatNumber(record.providerCallCount) }}</strong>
                <span>{{ formatDuration(record.durationMs) }}</span>
              </div>
              <time v-else-if="column.key === 'time'" :datetime="dateTimeAttribute(record.createdAt)">
                {{ formatDateTime(record.createdAt) }}
              </time>
              <BTooltip
                v-else-if="column.key === 'detail'"
                :title="t('aiOperations.executions.openDetail', { action: actionLabel(record.labelKey) })"
              >
                <BButton
                  class="operations-row-action"
                  :aria-label="t('aiOperations.executions.openDetail', { action: actionLabel(record.labelKey) })"
                  @click.stop="openDetail(record)"
                >
                  <SvgIcon :src="icon.ai.sourceArrow" size="15" aria-hidden="true" />
                </BButton>
              </BTooltip>
            </template>
          </BTable>
        </div>

        <template v-else>
          <MobileListSurface :aria-label="t('aiOperations.executions.title')">
            <MobileListRow
              v-for="record in executions"
              :key="record.id"
              interactive
              complex
              :selected="selectedExecution?.id === record.id && detailVisible"
              @click="openDetail(record)"
            >
              <template #leading>
                <span class="operations-mobile-icon"
                  ><SvgIcon :src="icon.settings.ai" size="20" aria-hidden="true"
                /></span>
              </template>
              <div class="operations-mobile-row">
                <div class="operations-mobile-row__head">
                  <strong>{{ actionLabel(record.labelKey) }}</strong>
                  <BChip :tone="aiOperationsStatusTone(record.status)" size="small">{{
                    statusLabel(record.status)
                  }}</BChip>
                </div>
                <span
                  >{{ moduleLabel(record.module) }} ·
                  {{ actorsDiffer(record) ? actorSubjectLabel(record) : actorName(record.actor) }} ·
                  {{ formatDateTime(record.createdAt) }}</span
                >
                <small
                  >{{
                    t('aiOperations.executions.callsAndDuration', {
                      calls: formatNumber(record.providerCallCount),
                      duration: formatDuration(record.durationMs),
                    })
                  }}
                  · {{ tokenPairLabel(record) }}</small
                >
                <small v-if="executionAttentionLabels(record).length" class="operations-mobile-row__attention">
                  <SvgIcon :src="icon.message.warning" size="12" aria-hidden="true" />
                  {{ executionAttentionLabels(record).join(' · ') }}
                </small>
              </div>
              <template #trailing>
                <SvgIcon :src="icon.ai.sourceArrow" size="16" aria-hidden="true" />
              </template>
            </MobileListRow>
          </MobileListSurface>
          <div class="operations-mobile-more">
            <BButton v-if="hasMore" :loading="listLoading" @click="loadMoreExecutions">
              {{ t('aiOperations.executions.loadMore') }}
            </BButton>
            <span v-else>{{ t('aiOperations.executions.noMore') }}</span>
          </div>
        </template>

        <div v-if="listError && executions.length" class="operations-list-retry" role="status">
          <span>
            <SvgIcon :src="icon.message.warning" size="15" aria-hidden="true" />
            {{ t('aiOperations.executions.retryHint') }}
          </span>
          <BButton size="small" @click="reloadExecutions(true)">{{ t('aiOperations.retry') }}</BButton>
        </div>
      </section>
    </template>
  </AdminDataPage>

  <AiUsageDetailModal
    v-model:visible="detailVisible"
    :execution="selectedExecution"
    detail-endpoint="/api/admin/ai-operations/executions/detail"
  />
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute } from 'vue-router';
  import { apiBasePost } from '@/http/request';
  import { bookmarkStore } from '@/store';
  import icon from '@/config/icon';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import AiUsageDetailModal from '@/components/aiSkills/AiUsageDetailModal.vue';
  import { AI_USAGE_FILTER_MODULE_KEYS, aiUsageModuleKey } from '@/components/aiSkills/aiUsageModules';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import {
    actorDisplay,
    actorsDiffer,
    aiOperationsStatusKey,
    aiOperationsStatusTone,
    chartHeight,
    type AiOperationsActor,
    type AiOperationsDay,
    type AiOperationsExecution,
    type AiOperationsOverview,
    type AiOperationsSummary,
  } from './aiOperationsModel';

  const EMPTY_SUMMARY: AiOperationsSummary = Object.freeze({
    executions: 0,
    actors: 0,
    modelActions: 0,
    providerCalls: 0,
    providerTokens: 0,
    chargedTokens: 0,
    platformCoveredTokens: 0,
    estimatedCost: 0,
    delivered: 0,
    succeeded: 0,
    partial: 0,
    failed: 0,
    quotaBlocked: 0,
    aborted: 0,
    running: 0,
    deliveryRate: 0,
    technicalErrorRate: 0,
    averageDurationMs: 0,
    durationP95: 0,
    anomalySignals: 0,
    staleRunning: 0,
    usageMissing: 0,
    settlementAttention: 0,
  });

  const { t, locale } = useI18n();
  const route = useRoute();
  const bookmark = bookmarkStore();
  const tableRef = ref<InstanceType<typeof BTable> | null>(null);
  const overview = ref<AiOperationsOverview | null>(null);
  const overviewLoading = ref(false);
  const overviewError = ref(false);
  const listLoading = ref(false);
  const listError = ref(false);
  const executions = ref<AiOperationsExecution[]>([]);
  const total = ref(0);
  const nextCursor = ref<string | null>(null);
  const hasMore = ref(false);
  const balance = ref<any>(null);
  const balanceLoading = ref(false);
  const selectedExecution = ref<AiOperationsExecution | null>(null);
  const detailVisible = ref(false);
  const seenProviders = ref<string[]>([]);
  let overviewSequence = 0;
  let listSequence = 0;
  let balanceSequence = 0;
  let keywordTimer: number | null = null;
  let linkedExecutionHandled = false;

  const linkedExecutionId = String(route.query.executionId || '').trim();
  const linkedKeyword = String(route.query.requestId || linkedExecutionId || '')
    .trim()
    .slice(0, 80);
  const filters = reactive({
    periodDays: linkedKeyword ? 90 : 7,
    module: 'all',
    status: 'all',
    provider: 'all',
    keyword: linkedKeyword,
    hideInternal: true,
  });

  const summary = computed(() => overview.value?.summary || EMPTY_SUMMARY);
  const refreshing = computed(() => overviewLoading.value || listLoading.value || balanceLoading.value);
  const initialLoading = computed(
    () => !overview.value && !executions.value.length && (overviewLoading.value || listLoading.value),
  );
  const initialError = computed(
    () => !overview.value && !executions.value.length && overviewError.value && listError.value,
  );
  const staleData = computed(() =>
    Boolean((overviewError.value && overview.value) || (listError.value && executions.value.length)),
  );
  const partialData = computed(() => !initialError.value && (overviewError.value || listError.value));
  const trendMaximum = computed(() =>
    Math.max(0, ...(overview.value?.daily || []).map((item) => Number(item.providerTokens || 0))),
  );
  const trendHasUsage = computed(() => trendMaximum.value > 0);
  const moduleMaximum = computed(() =>
    Math.max(0, ...(overview.value?.modules || []).map((item) => Number(item.providerTokens || 0))),
  );
  const trendWidthStyle = computed(() => ({
    minWidth: `${Math.max(560, (overview.value?.daily?.length || 0) * (filters.periodDays === 90 ? 13 : 24))}px`,
  }));

  const periodOptions = computed(() =>
    [7, 30, 90].map((value) => ({ value, label: t('settings.ai.usage.days', { n: value }) })),
  );
  const moduleOptions = computed(() =>
    AI_USAGE_FILTER_MODULE_KEYS.map((value) => ({
      value,
      label: moduleLabel(value),
    })),
  );
  const statusOptions = computed(() => [
    { value: 'all', label: t('aiOperations.filters.allStatuses') },
    { value: 'attention', label: t('aiOperations.filters.attention') },
    ...['success', 'partial', 'failed', 'quota_blocked', 'aborted', 'running'].map((value) => ({
      value,
      label: statusLabel(value),
    })),
  ]);
  const providerOptions = computed(() => [
    { value: 'all', label: t('aiOperations.filters.allProviders') },
    ...seenProviders.value.map((value) => ({ value, label: value })),
  ]);
  const columns = computed(() => [
    { title: t('aiOperations.columns.action'), key: 'action', width: 'minmax(210px, 1.5fr)', ellipsis: false },
    { title: t('aiOperations.columns.actor'), key: 'actor', width: 'minmax(130px, 1fr)', ellipsis: false },
    { title: t('aiOperations.columns.status'), key: 'status', width: '144px', ellipsis: false },
    { title: t('aiOperations.columns.model'), key: 'model', width: 'minmax(150px, 1.15fr)', ellipsis: false },
    { title: t('aiOperations.columns.tokens'), key: 'tokens', width: '130px', ellipsis: false },
    { title: t('aiOperations.columns.calls'), key: 'calls', width: '112px', ellipsis: false },
    { title: t('aiOperations.columns.time'), key: 'time', width: '148px', ellipsis: false },
    { title: '', key: 'detail', width: '44px', ellipsis: false },
  ]);
  const balanceDisplay = computed(() => {
    if (balanceLoading.value && !balance.value) return '…';
    if (!balance.value) return t('aiOperations.metrics.balanceUnavailable');
    return formatBalance(balance.value.totalBalance, balance.value.currency);
  });
  const balanceHintDisplay = computed(() => {
    const change = balance.value?.dailyBalanceChange;
    if (!balance.value) return t('aiOperations.metrics.balanceHint');
    if (change?.isAvailable) {
      const formatted = formatSignedBalance(change.change, change.currency || balance.value.currency);
      if (balance.value.stale || change.stale)
        return t('aiOperations.metrics.balanceChangeCached', { change: formatted });
      if (change.partialDay) return t('aiOperations.metrics.balanceChangePartial', { change: formatted });
      return t('aiOperations.metrics.balanceChange', { change: formatted });
    }
    return balance.value.stale ? t('aiOperations.metrics.balanceCached') : t('aiOperations.metrics.balanceHint');
  });
  const overviewPlaceholderHint = computed(() =>
    t(overviewLoading.value ? 'aiOperations.metrics.ledgerLoading' : 'aiOperations.metrics.ledgerUnavailable'),
  );

  function requestFilters() {
    return {
      periodDays: filters.periodDays,
      module: filters.module,
      status: filters.status,
      provider: filters.provider,
      keyword: filters.keyword.trim() || undefined,
      hideInternal: filters.hideInternal,
    };
  }

  function filterSignature() {
    return JSON.stringify(requestFilters());
  }

  async function loadOverview({ preserve = false } = {}) {
    const sequence = ++overviewSequence;
    const signature = filterSignature();
    if (!preserve) overview.value = null;
    overviewLoading.value = true;
    overviewError.value = false;
    try {
      const response: any = await apiBasePost('/api/admin/ai-operations/overview', requestFilters(), { silent: true });
      if (sequence !== overviewSequence || signature !== filterSignature()) return false;
      if (Number(response?.status) !== 200 || !response?.data) throw new Error('AI_OPERATIONS_OVERVIEW_FAILED');
      overview.value = response.data as AiOperationsOverview;
      const providers = response.data.providers.map((item: any) => String(item.provider || '').trim()).filter(Boolean);
      seenProviders.value = [...new Set([...seenProviders.value, ...providers])].sort();
      return true;
    } catch {
      if (sequence === overviewSequence) overviewError.value = true;
      return false;
    } finally {
      if (sequence === overviewSequence) overviewLoading.value = false;
    }
  }

  async function loadExecutions({ reset = false, preserve = false } = {}) {
    if (!reset && (listLoading.value || !hasMore.value)) return false;
    const sequence = reset ? ++listSequence : listSequence;
    const signature = filterSignature();
    const cursor = reset ? null : nextCursor.value;
    if (reset) {
      if (!preserve) executions.value = [];
      nextCursor.value = null;
      hasMore.value = false;
      if (!preserve) total.value = 0;
    }
    listLoading.value = true;
    listError.value = false;
    try {
      const response: any = await apiBasePost(
        '/api/admin/ai-operations/executions/query',
        { ...requestFilters(), cursor, limit: 50 },
        { silent: true },
      );
      if (sequence !== listSequence || signature !== filterSignature()) return false;
      if (Number(response?.status) !== 200 || !response?.data) throw new Error('AI_OPERATIONS_LIST_FAILED');
      const items = Array.isArray(response.data.items) ? response.data.items : [];
      if (reset) {
        executions.value = items;
      } else {
        const existing = new Set(executions.value.map((item) => item.id));
        executions.value = [
          ...executions.value,
          ...items.filter((item: AiOperationsExecution) => !existing.has(item.id)),
        ];
      }
      if (Number.isFinite(Number(response.data.total))) total.value = Number(response.data.total);
      nextCursor.value = response.data.nextCursor || null;
      hasMore.value = Boolean(response.data.hasMore && nextCursor.value);
      openLinkedExecutionIfPresent();
      return true;
    } catch {
      if (sequence === listSequence) {
        listError.value = true;
        // 自动触底失败后立即熔断，避免 BTable 因 hasMore 未变化重复请求同一游标。
        hasMore.value = false;
      }
      return false;
    } finally {
      if (sequence === listSequence) listLoading.value = false;
    }
  }

  async function fetchBalance(forceRefresh = false) {
    const sequence = ++balanceSequence;
    balanceLoading.value = true;
    try {
      const response: any = await apiBasePost('/api/common/getDeepSeekBalance', { forceRefresh }, { silent: true });
      if (Number(response?.status) !== 200 || !response?.data) throw new Error('AI_PROVIDER_BALANCE_UNAVAILABLE');
      if (sequence === balanceSequence) balance.value = response.data;
    } catch {
      // 余额是独立的上游快照，失败不能拖垮统一执行账本。
      if (sequence === balanceSequence && balance.value) {
        balance.value = {
          ...balance.value,
          stale: true,
          dailyBalanceChange: balance.value.dailyBalanceChange
            ? { ...balance.value.dailyBalanceChange, stale: true }
            : balance.value.dailyBalanceChange,
        };
      }
    } finally {
      if (sequence === balanceSequence) balanceLoading.value = false;
    }
  }

  function applyFilterChange() {
    if (keywordTimer !== null) window.clearTimeout(keywordTimer);
    keywordTimer = null;
    tableRef.value?.scrollToTop();
    void Promise.all([loadOverview({ preserve: false }), loadExecutions({ reset: true, preserve: false })]);
  }

  function scheduleKeywordSearch() {
    if (keywordTimer !== null) window.clearTimeout(keywordTimer);
    keywordTimer = window.setTimeout(() => {
      keywordTimer = null;
      applyFilterChange();
    }, 500);
  }

  function applyKeywordImmediately() {
    if (keywordTimer !== null) window.clearTimeout(keywordTimer);
    keywordTimer = null;
    applyFilterChange();
  }

  function refreshAll() {
    tableRef.value?.scrollToTop();
    void Promise.all([
      loadOverview({ preserve: true }),
      loadExecutions({ reset: true, preserve: true }),
      fetchBalance(true),
    ]);
  }

  function reloadExecutions(preserve = true) {
    void loadExecutions({ reset: true, preserve });
  }

  function loadMoreExecutions() {
    void loadExecutions({ reset: false });
  }

  function openDetail(record: AiOperationsExecution) {
    selectedExecution.value = record;
    detailVisible.value = true;
  }

  function openLinkedExecutionIfPresent() {
    if (detailVisible.value || linkedExecutionHandled) return;
    const linked = executions.value.find((item) => item.id === linkedExecutionId);
    if (linked) {
      linkedExecutionHandled = true;
      openDetail(linked);
    }
  }

  function formatNumber(value: unknown) {
    const number = Number(value || 0);
    return new Intl.NumberFormat(locale.value).format(Number.isFinite(number) ? Math.max(0, number) : 0);
  }

  function formatCost(value: unknown) {
    const number = Number(value || 0);
    return (Number.isFinite(number) ? Math.max(0, number) : 0).toLocaleString(locale.value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  function formatPercent(value: unknown) {
    const number = Number(value || 0);
    return `${(Number.isFinite(number) ? number : 0).toLocaleString(locale.value, { maximumFractionDigits: 1 })}%`;
  }

  function formatDuration(value: unknown) {
    const milliseconds = Math.max(0, Number(value || 0));
    if (!Number.isFinite(milliseconds) || !milliseconds) return '—';
    if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
    return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`;
  }

  function formatDateTime(value: unknown) {
    const date = new Date(Number(value));
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale.value, {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }

  function dateTimeAttribute(value: unknown) {
    const date = new Date(Number(value));
    return Number.isFinite(date.getTime()) ? date.toISOString() : '';
  }

  function shortDate(value: string) {
    return String(value || '')
      .slice(5)
      .replace('-', '/');
  }

  function formatBalance(value: unknown, currency: unknown) {
    const amount = Number(value);
    const code = String(currency || 'CNY').toUpperCase();
    const symbol = code === 'CNY' ? '¥' : `${code} `;
    return `${symbol}${(Number.isFinite(amount) ? Math.abs(amount) : 0).toFixed(2)}`;
  }

  function formatSignedBalance(value: unknown, currency: unknown) {
    const amount = Number(value);
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const sign = safeAmount > 0 ? '+' : safeAmount < 0 ? '-' : '';
    return `${sign}${formatBalance(Math.abs(safeAmount), currency)}`;
  }

  function moduleLabel(module: string) {
    return t(`settings.ai.usage.modules.${aiUsageModuleKey(module, true)}`);
  }

  function actionLabel(labelKey: string) {
    return t(`settings.ai.usage.actions.${labelKey || 'otherAiAction'}`);
  }

  function statusLabel(status: string) {
    return t(`settings.ai.usage.status.${aiOperationsStatusKey(status)}`);
  }

  function actorName(actor: AiOperationsActor | null | undefined) {
    return actorDisplay(actor, t('aiOperations.executions.unknownActor'));
  }

  function actorSubjectLabel(record: AiOperationsExecution) {
    return t('aiOperations.executions.actorSubject', {
      actor: actorName(record.actor),
      subject: actorName(record.subject),
    });
  }

  function tokenPairLabel(record: AiOperationsExecution) {
    return t('aiOperations.executions.tokenPair', {
      charged: formatNumber(record.chargedTokens),
      provider: formatNumber(record.providerTokens),
    });
  }

  function executionAttentionLabels(record: AiOperationsExecution) {
    const labels: string[] = [];
    if (record.staleRunning) labels.push(t('aiOperations.executions.staleRunning'));
    if (record.usageAttention) labels.push(t('aiOperations.executions.usageMissing'));
    if (record.settlementAttention) labels.push(t('aiOperations.executions.settlementAttention'));
    return labels;
  }

  function shortExecutionId(value: string) {
    return String(value || '').slice(0, 8);
  }

  function showTrendLabel(index: number) {
    const length = overview.value?.daily?.length || 0;
    if (index === 0 || index === length - 1) return true;
    const step = filters.periodDays === 7 ? 1 : filters.periodDays === 30 ? 5 : 15;
    return index % step === 0;
  }

  function trendTooltip(day: AiOperationsDay) {
    const tokens = `${formatNumber(day.providerTokens)} tokens`;
    return day.failures
      ? `${day.date} · ${tokens} · ${t('aiOperations.trend.failures', { n: formatNumber(day.failures) })}`
      : `${day.date} · ${tokens}`;
  }

  watch(detailVisible, (visible) => {
    if (!visible) selectedExecution.value = null;
  });

  onMounted(() => {
    void Promise.all([
      loadOverview({ preserve: false }),
      loadExecutions({ reset: true, preserve: false }),
      fetchBalance(false),
    ]);
  });

  onBeforeUnmount(() => {
    overviewSequence += 1;
    listSequence += 1;
    balanceSequence += 1;
    if (keywordTimer !== null) window.clearTimeout(keywordTimer);
  });
</script>

<style scoped lang="less">
  .operations-filter {
    min-width: 0;
    display: inline-flex;
    flex-direction: column;
    gap: 3px;
    color: var(--sub-text-color);
    font-size: 10px;
    line-height: 1.2;
  }

  .operations-filter--select {
    width: 138px;
  }

  .operations-filter--search {
    min-width: 220px;
    flex: 1 1 260px;
  }

  .operations-filter :deep(.b-select),
  .operations-filter :deep(.select-trigger) {
    width: 100%;
  }

  .operations-filter__label {
    min-height: 12px;
  }

  .operations-internal-filter {
    align-self: flex-end;
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    gap: 7px;
    color: var(--text-color);
    font-size: 12px;
    white-space: nowrap;
  }

  .operations-anomaly-hint {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .operations-signal-dot {
    width: 7px;
    height: 7px;
    flex: 0 0 auto;
    border: 1px solid var(--desc-color);
    border-radius: 50%;
    background: var(--card-background);
  }

  .operations-signal-dot.is-active {
    border-color: var(--error-color, #c33f47);
    background: var(--error-color, #c33f47);
  }

  .operations-inline-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 11px;
    border: 1px solid var(--warning-color, #a86700);
    border-radius: 10px;
    color: var(--warning-color, #a86700);
    background: var(--card-background);
    font-size: 12px;
  }

  .operations-state-card,
  .operations-list-state {
    display: flex;
    min-height: 180px;
    align-items: center;
    justify-content: center;
    gap: 9px;
  }

  .operations-state-card--error,
  .operations-list-state {
    flex-direction: column;
    color: var(--desc-color);
    text-align: center;
  }

  .operations-state-card--error strong,
  .operations-list-state strong {
    color: var(--text-color);
  }

  .operations-overview-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.8fr);
    gap: 14px;
  }

  .operations-trend-card,
  .operations-module-card,
  .operations-provider-card {
    min-width: 0;
  }

  .operations-section-title {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .operations-section-title > span {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .operations-section-title strong {
    color: var(--text-color);
    font-size: 14px;
  }

  .operations-section-title small {
    color: var(--desc-color);
    font-size: 10px;
    font-weight: 400;
  }

  .operations-trend-scroll {
    overflow-x: auto;
    padding: 4px 0 2px;
  }

  .operations-trend {
    height: 176px;
    display: flex;
    align-items: stretch;
    gap: 4px;
    padding: 8px 6px 0;
    border-bottom: 1px solid var(--surface-divider-color);
    background-image: linear-gradient(to bottom, transparent 49%, var(--surface-divider-color) 50%, transparent 51%);
  }

  .operations-trend :deep(.b-tooltip-wrap) {
    min-width: 0;
    flex: 1 1 0;
    display: flex;
    align-items: stretch;
  }

  .operations-trend__item {
    min-width: 0;
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .operations-trend__plot {
    position: relative;
    width: 100%;
    min-width: 5px;
    flex: 1;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .operations-trend__bar {
    width: min(70%, 15px);
    min-height: 3px;
    border: 1px solid var(--primary-color);
    border-radius: 4px 4px 1px 1px;
    background: var(--primary-color);
  }

  .operations-trend__failure {
    position: absolute;
    top: 2px;
    width: 7px;
    height: 7px;
    border: 1px solid var(--background-color);
    border-radius: 50%;
    background: var(--error-color, #c33f47);
  }

  .operations-trend__item time {
    min-height: 14px;
    color: var(--desc-color);
    font-size: 9px;
    white-space: nowrap;
  }

  .operations-empty-block {
    min-height: 132px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .operations-module-list {
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
    list-style: none;
  }

  .operations-module-list li,
  .operations-module-list li > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .operations-module-list li > div {
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .operations-module-list strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .operations-module-list span {
    color: var(--desc-color);
    font-size: 9.5px;
  }

  .operations-module-track {
    height: 6px;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    background: var(--card-background);
  }

  .operations-module-track > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--primary-color);
  }

  .operations-provider-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 10px;
  }

  .operations-provider-grid article {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
  }

  .operations-provider-icon,
  .operations-mobile-icon {
    display: inline-flex;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--primary-color);
    border-radius: 9px;
    color: var(--primary-color);
    background: var(--card-background);
  }

  .operations-provider-grid article > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .operations-provider-grid strong,
  .operations-provider-grid span,
  .operations-provider-grid small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .operations-provider-grid strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .operations-provider-grid span,
  .operations-provider-grid small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .operations-provider-grid .is-attention {
    color: var(--warning-color, #a86700);
  }

  .operations-executions {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .operations-executions__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .operations-executions__header h3,
  .operations-executions__header p {
    margin: 0;
  }

  .operations-executions__header h3 {
    color: var(--text-color);
    font-size: 15px;
  }

  .operations-executions__header p {
    margin-top: 2px;
    color: var(--desc-color);
    font-size: 10px;
  }

  .operations-table-wrap {
    height: 520px;
    min-height: 420px;
  }

  .operations-cell-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .operations-cell-main strong,
  .operations-cell-main span,
  .operations-cell-main--numeric {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .operations-cell-main strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .operations-cell-main span {
    color: var(--desc-color);
    font-size: 10px;
  }

  .operations-cell-main--numeric strong,
  .operations-executions time {
    font-variant-numeric: tabular-nums;
  }

  .operations-executions time {
    color: var(--text-color);
    font-size: 11px;
  }

  .operations-row-action.b_btn {
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    color: var(--desc-color);
    background: var(--card-background);
  }

  .operations-row-action.b_btn:hover,
  .operations-row-action.b_btn:focus-visible {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  .operations-status-stack {
    min-width: 0;
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }

  .operations-status-stack > span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--warning-color, #a86700);
    font-size: 9px;
    line-height: 1.2;
    white-space: nowrap;
  }

  .operations-mobile-row {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .operations-mobile-row__head {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .operations-mobile-row__head strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .operations-mobile-row > span,
  .operations-mobile-row > small {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .operations-mobile-row > .operations-mobile-row__attention {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--warning-color, #a86700);
  }

  .operations-mobile-more {
    display: flex;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    color: var(--desc-color);
    font-size: 11px;
  }

  .operations-list-retry {
    display: flex;
    min-height: 42px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 10px;
    border: 1px solid var(--warning-color, #a86700);
    border-radius: 10px;
    color: var(--warning-color, #a86700);
    background: var(--card-background);
    font-size: 11px;
  }

  .operations-list-retry > span {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  @media (max-width: 960px) {
    .operations-filter--select {
      width: calc(50% - 5px);
    }

    .operations-filter--search {
      width: 100%;
      flex-basis: 100%;
    }

    .operations-internal-filter {
      width: 100%;
      align-self: auto;
      justify-content: space-between;
    }

    .operations-overview-grid {
      grid-template-columns: 1fr;
    }

    .operations-trend-card,
    .operations-module-card,
    .operations-provider-card {
      --b-card-padding: 13px;
    }

    .operations-provider-grid {
      grid-template-columns: 1fr;
    }

    .operations-provider-grid article {
      border-radius: 8px;
    }

    .operations-list-state {
      min-height: 160px;
    }
  }

  @media (max-width: 350px) {
    .operations-filter--select {
      width: 100%;
    }

    .operations-trend {
      height: 158px;
    }
  }
</style>

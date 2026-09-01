<template>
  <section class="ai-usage-center" aria-labelledby="ai-usage-center-title">
    <div class="usage-head">
      <div>
        <h3 id="ai-usage-center-title">{{ t('settings.ai.usage.title') }}</h3>
        <p>{{ t('settings.ai.usage.description') }}</p>
      </div>
      <BButton
        class="usage-refresh"
        size="small"
        :loading="loading"
        :aria-label="t('settings.ai.usage.refresh')"
        @click="load(true)"
      >
        <SvgIcon v-if="!loading" :src="icon.infrastructure.refresh" size="14" aria-hidden="true" />
        {{ t('settings.ai.usage.refresh') }}
      </BButton>
    </div>

    <BTabs v-model:active-tab="activeTab" variant="line" :options="tabOptions" @change="handleTabChange" />

    <div v-if="errorCode && data" class="usage-inline-warning" role="status">
      <SvgIcon :src="icon.message.warning" size="15" aria-hidden="true" />
      <span>{{ t('settings.ai.usage.staleWarning') }}</span>
    </div>

    <div v-if="!data && errorCode" class="usage-state usage-state--error" role="alert">
      <SvgIcon :src="icon.message.warning" size="24" aria-hidden="true" />
      <strong>{{ t('settings.ai.usage.errorTitle') }}</strong>
      <span>{{ t('settings.ai.usage.errorDescription') }}</span>
      <BButton size="small" @click="load(true)">{{ t('settings.ai.usage.retry') }}</BButton>
    </div>

    <div v-else-if="loading && !data" class="usage-state usage-state--loading" role="status" aria-live="polite">
      <BLoading inline :loading="true" :title="t('settings.ai.usage.loadingTitle')" />
    </div>

    <div v-else-if="activeTab === 'details'" class="usage-details">
      <div class="usage-filters">
        <label>
          <span>{{ t('settings.ai.usage.period') }}</span>
          <BSelect v-model:value="days" :options="periodOptions" :aria-label="t('settings.ai.usage.period')" />
        </label>
        <label>
          <span>{{ t('settings.ai.usage.module') }}</span>
          <BSelect v-model:value="moduleFilter" :options="moduleOptions" :aria-label="t('settings.ai.usage.module')" />
        </label>
      </div>

      <div class="usage-summary" aria-live="polite">
        <article class="summary-card">
          <span>{{ t('settings.ai.usage.periodConsumption', { days }) }}</span>
          <strong>{{ formatTokens(data?.summary.chargedTokens) }}</strong>
          <small>{{
            t('settings.ai.usage.todayConsumption', { n: formatTokens(data?.summary.todayChargedTokens) })
          }}</small>
        </article>
        <article class="summary-card">
          <span>{{ t('settings.ai.usage.modelActions') }}</span>
          <strong>{{ formatNumber(data?.summary.modelActions) }}</strong>
          <small>{{
            t('settings.ai.usage.zeroChargeActions', { n: formatNumber(data?.summary.zeroChargeModelActions) })
          }}</small>
        </article>
        <article class="summary-card">
          <span>{{ t('settings.ai.usage.platformCovered') }}</span>
          <strong>{{ formatTokens(data?.summary.platformCoveredTokens) }}</strong>
          <small>{{ t('settings.ai.usage.platformCoveredHint') }}</small>
        </article>
      </div>

      <section v-if="data?.modules.length" class="usage-section" aria-labelledby="usage-modules-title">
        <div class="usage-section-head">
          <div>
            <h4 id="usage-modules-title">{{ t('settings.ai.usage.moduleBreakdown') }}</h4>
            <p>{{ t('settings.ai.usage.moduleBreakdownHint') }}</p>
          </div>
        </div>
        <div class="module-breakdown">
          <div v-for="item in data.modules" :key="item.module" class="module-row">
            <span class="module-name">{{ moduleLabel(item.module) }}</span>
            <span class="module-track" aria-hidden="true">
              <span :style="{ width: `${modulePercent(item.chargedTokens)}%` }"></span>
            </span>
            <strong>{{ formatTokens(item.chargedTokens) }}</strong>
            <small>{{ t('settings.ai.usage.actionCount', { n: formatNumber(item.actions) }) }}</small>
          </div>
        </div>
      </section>

      <section class="usage-section" aria-labelledby="usage-trend-title">
        <div class="usage-section-head">
          <div>
            <h4 id="usage-trend-title">{{ t('settings.ai.usage.dailyTrend') }}</h4>
            <p>{{ t('settings.ai.usage.dailyTrendHint') }}</p>
          </div>
        </div>
        <div
          v-if="chartPoints.some((point) => point.tokens > 0)"
          class="usage-chart"
          role="img"
          :aria-label="chartAriaLabel"
        >
          <div class="chart-bars" :style="{ minWidth: chartMinWidth }">
            <div
              v-for="(point, index) in chartPoints"
              :key="point.date"
              class="chart-point"
              :class="{ 'is-today': point.isToday }"
              :title="`${point.date} · ${formatTokens(point.tokens)} tokens`"
            >
              <span class="chart-value" :style="{ height: `${chartHeight(point.tokens)}%` }"></span>
              <small v-if="index === 0 || index === chartPoints.length - 1 || point.isToday">
                {{ shortDate(point.date) }}
              </small>
            </div>
          </div>
        </div>
        <div v-else class="usage-empty usage-empty--compact">
          {{ t('settings.ai.usage.noTrend') }}
        </div>
      </section>

      <section class="usage-section" aria-labelledby="usage-records-title">
        <div class="usage-section-head">
          <div>
            <h4 id="usage-records-title">{{ t('settings.ai.usage.recentRecords') }}</h4>
            <p>{{ t('settings.ai.usage.privacyHint') }}</p>
          </div>
        </div>

        <div v-if="data?.items.length" class="usage-records">
          <BButton
            v-for="item in data.items"
            :key="item.id"
            class="usage-record"
            block
            :aria-label="t('settings.ai.usage.openDetail', { action: actionLabel(item.labelKey) })"
            @click="openDetail(item)"
          >
            <span class="record-icon">
              <SvgIcon :src="icon.settings.ai" size="17" aria-hidden="true" />
            </span>
            <div class="record-main">
              <div class="record-title-row">
                <strong>{{ actionLabel(item.labelKey) }}</strong>
                <span class="status-badge" :class="`is-${statusTone(item.status)}`">
                  <SvgIcon :src="statusIcon(item.status)" size="12" aria-hidden="true" />
                  {{ statusLabel(item.status) }}
                </span>
                <span v-if="!item.usageComplete" class="estimate-badge">
                  {{ t('settings.ai.usage.estimated') }}
                </span>
              </div>
              <div class="record-meta">
                <span>{{ formatDateTime(item.createdAt) }}</span>
                <span>{{ moduleLabel(item.module) }}</span>
                <span>{{ t('settings.ai.usage.providerCalls', { n: item.providerCallCount }) }}</span>
              </div>
              <small v-if="item.platformCoveredTokens > 0" class="record-covered">
                {{ t('settings.ai.usage.recordPlatformCovered', { n: formatExactTokens(item.platformCoveredTokens) }) }}
              </small>
              <small v-if="item.quotaSettlementStatus === 'deferred'" class="record-settlement">
                {{ t('settings.ai.usage.settlementPending') }}
              </small>
            </div>
            <div class="record-charge">
              <strong>{{ formatExactTokens(item.chargedTokens) }}</strong>
              <span>tokens</span>
            </div>
            <span class="record-open" aria-hidden="true">
              <SvgIcon :src="icon.arrow_right" size="15" />
            </span>
          </BButton>
        </div>
        <div v-else class="usage-empty">
          <SvgIcon :src="icon.settings.ai" size="24" aria-hidden="true" />
          <strong>{{ t('settings.ai.usage.emptyTitle') }}</strong>
          <span>{{ t('settings.ai.usage.emptyDescription') }}</span>
        </div>

        <BPagination
          v-if="data && data.pagination.total > data.pagination.pageSize"
          :current="data.pagination.page"
          :page-size="data.pagination.pageSize"
          :total="data.pagination.total"
          @page-change="page = $event"
          @size-change="changePageSize"
        />
      </section>
    </div>

    <div v-else class="usage-rules">
      <div class="rule-callout">
        <span class="rule-callout-icon">
          <SvgIcon :src="icon.common.magicWand" size="19" aria-hidden="true" />
        </span>
        <div>
          <strong>{{ t('settings.ai.usage.ruleTitle') }}</strong>
          <p>{{ t('settings.ai.usage.ruleDescription') }}</p>
        </div>
      </div>

      <section class="rule-section">
        <div class="rule-section-title">
          <span class="rule-dot rule-dot--charged"></span>
          <div>
            <h4>{{ t('settings.ai.usage.chargedTitle') }}</h4>
            <p>{{ t('settings.ai.usage.chargedDescription') }}</p>
          </div>
        </div>
        <div class="rule-groups">
          <article v-for="group in tokenActionGroups" :key="group.module" class="rule-group">
            <strong>{{ moduleLabel(group.module) }}</strong>
            <div class="rule-action-list">
              <span v-for="action in group.actions" :key="action.id" class="rule-action">
                {{ actionLabel(action.labelKey) }}
                <small v-if="action.unit === 'item'">{{ t('settings.ai.usage.perItem') }}</small>
              </span>
            </div>
          </article>
        </div>
      </section>

      <section class="rule-section">
        <div class="rule-section-title">
          <span class="rule-dot rule-dot--free"></span>
          <div>
            <h4>{{ t('settings.ai.usage.freeTitle') }}</h4>
            <p>{{ t('settings.ai.usage.freeDescription') }}</p>
          </div>
        </div>
        <div class="free-grid">
          <article v-for="action in data?.catalog.freeActions || []" :key="action.id" class="free-card">
            <SvgIcon :src="icon.message.success" size="15" aria-hidden="true" />
            <div>
              <strong>{{ freeActionLabel(action.labelKey) }}</strong>
              <p>{{ freeActionDescription(action.labelKey) }}</p>
            </div>
          </article>
        </div>
      </section>

      <div class="boundary-notes">
        <p><SvgIcon :src="icon.message.info" size="14" aria-hidden="true" />{{ t('settings.ai.usage.cacheRule') }}</p>
        <p><SvgIcon :src="icon.message.info" size="14" aria-hidden="true" />{{ t('settings.ai.usage.repairRule') }}</p>
        <p><SvgIcon :src="icon.message.info" size="14" aria-hidden="true" />{{ t('settings.ai.usage.failureRule') }}</p>
        <p
          ><SvgIcon :src="icon.message.info" size="14" aria-hidden="true" />{{
            t('settings.ai.usage.missingUsageRule')
          }}</p
        >
        <p
          ><SvgIcon :src="icon.message.info" size="14" aria-hidden="true" />{{
            t('settings.ai.usage.freeLimitRule')
          }}</p
        >
      </div>
    </div>

    <AiUsageDetailModal v-model:visible="detailVisible" :execution="selectedUsage" />
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request';
  import { recordOperation } from '@/api/commonApi';
  import { formatAiQuotaTokens } from '@/composables/useAiQuotaStatus';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import AiUsageDetailModal from '@/components/aiSkills/AiUsageDetailModal.vue';
  import { AI_USAGE_FILTER_MODULE_KEYS, aiUsageModuleKey } from '@/components/aiSkills/aiUsageModules';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  interface UsageSummary {
    chargedTokens: number;
    providerTokens: number;
    platformCoveredTokens: number;
    todayChargedTokens: number;
    modelActions: number;
    zeroChargeModelActions: number;
  }

  interface UsageItem {
    id: string;
    actionId: string;
    module: string;
    labelKey: string;
    unit: 'request' | 'item';
    createdAt: number;
    status: string;
    modelCalled: boolean;
    providerCallCount: number;
    providerTokens: number;
    chargedTokens: number;
    platformCoveredTokens: number;
    usageComplete: boolean;
    quotaSettlementStatus: string;
    durationMs: number;
  }

  interface PublicCatalog {
    ruleVersion: number;
    chargingRule: string;
    repairBilling: string;
    failedExecutionBilling?: string;
    missingUsageBilling: string;
    tokenActions: Array<{ id: string; module: string; labelKey: string; unit: 'request' | 'item' }>;
    freeActions: Array<{ id: string; module: string; labelKey: string; descriptionKey: string }>;
  }

  interface UsageResponse {
    query: { days: number; page: number; pageSize: number; module: string };
    summary: UsageSummary;
    daily: Array<{ date: string; chargedTokens: number; providerTokens: number; actions: number }>;
    modules: Array<{ module: string; chargedTokens: number; providerTokens: number; actions: number }>;
    items: UsageItem[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
    catalog: PublicCatalog;
  }

  const { t, locale } = useI18n();
  const activeTab = ref('details');
  const days = ref(7);
  const moduleFilter = ref('all');
  const page = ref(1);
  const pageSize = ref(20);
  const loading = ref(false);
  const errorCode = ref('');
  const data = ref<UsageResponse | null>(null);
  const selectedUsage = ref<UsageItem | null>(null);
  const detailVisible = ref(false);
  let requestSequence = 0;

  const tabOptions = computed(() => [
    { key: 'details', label: t('settings.ai.usage.detailsTab') },
    { key: 'rules', label: t('settings.ai.usage.rulesTab') },
  ]);
  const periodOptions = computed(() =>
    [7, 30, 90].map((value) => ({ label: t('settings.ai.usage.days', { n: value }), value })),
  );
  const moduleOptions = computed(() =>
    AI_USAGE_FILTER_MODULE_KEYS.map((value) => ({ label: moduleLabel(value), value })),
  );

  const tokenActionGroups = computed(() => {
    const grouped = new Map<string, PublicCatalog['tokenActions']>();
    for (const action of data.value?.catalog.tokenActions || []) {
      const actions = grouped.get(action.module) || [];
      actions.push(action);
      grouped.set(action.module, actions);
    }
    return [...grouped.entries()].map(([module, actions]) => ({ module, actions }));
  });

  const chartPoints = computed(() => {
    const values = new Map((data.value?.daily || []).map((item) => [item.date, item.chargedTokens]));
    const count = Number(days.value) || 7;
    const points: Array<{ date: string; tokens: number; isToday: boolean }> = [];
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    for (let index = count - 1; index >= 0; index -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - index);
      const key = localDateKey(date);
      points.push({ date: key, tokens: Number(values.get(key) || 0), isToday: index === 0 });
    }
    return points;
  });
  const maxChartTokens = computed(() => Math.max(1, ...chartPoints.value.map((point) => point.tokens)));
  const maxModuleTokens = computed(() => Math.max(1, ...(data.value?.modules || []).map((item) => item.chargedTokens)));
  const chartAriaLabel = computed(() =>
    t('settings.ai.usage.chartAria', {
      days: days.value,
      n: formatTokens(data.value?.summary.chargedTokens),
    }),
  );
  const chartMinWidth = computed(() => (days.value > 30 ? `${days.value * 9}px` : '100%'));

  async function load(force = false) {
    const current = ++requestSequence;
    const currentData = data.value;
    const dataMatchesQuery =
      currentData?.query.days === days.value &&
      currentData?.query.module === moduleFilter.value &&
      currentData?.pagination.page === page.value &&
      currentData?.pagination.pageSize === pageSize.value;
    if (currentData && !dataMatchesQuery) data.value = null;
    loading.value = true;
    errorCode.value = '';
    try {
      const response = await apiBasePost(
        '/api/chat/aiUsage',
        { days: days.value, module: moduleFilter.value, page: page.value, pageSize: pageSize.value },
        { silent: true },
      );
      if (current !== requestSequence) return;
      if (Number(response?.status) !== 200 || !response?.data) throw new Error('AI_USAGE_REQUEST_FAILED');
      data.value = response.data as UsageResponse;
    } catch (error: any) {
      if (current !== requestSequence) return;
      errorCode.value = String(error?.data?.code || error?.code || 'AI_USAGE_REQUEST_FAILED');
      if (force && !data.value) data.value = null;
    } finally {
      if (current === requestSequence) loading.value = false;
    }
  }

  watch(
    [days, moduleFilter, page, pageSize],
    (values, previous) => {
      const filtersChanged = previous && (values[0] !== previous[0] || values[1] !== previous[1]);
      if (filtersChanged && page.value !== 1) {
        page.value = 1;
        return;
      }
      void load();
    },
    { immediate: true },
  );

  function changePageSize(value: number) {
    pageSize.value = value;
    page.value = 1;
  }

  function openDetail(item: UsageItem) {
    selectedUsage.value = item;
    detailVisible.value = true;
    recordOperation({
      module: 'AI 用量与计费',
      operation: `查看调用详情【${operationModuleLabel(item.module)}】`,
    });
  }

  function handleTabChange(value: string) {
    if (value !== 'rules') return;
    recordOperation({ module: 'AI 用量与计费', operation: '查看计费规则' });
  }

  function operationModuleLabel(module: string) {
    const labels: Record<string, string> = {
      note: '笔记',
      bookmark: '书签',
      file: '文件',
      todo: '待办',
      search: '搜索',
      help: '帮助',
      tag: '标签',
      toolbox: '知识工坊',
    };
    return labels[module] || '其他';
  }

  function formatTokens(value: unknown) {
    return formatAiQuotaTokens(value ?? 0, locale.value);
  }

  function formatNumber(value: unknown) {
    const number = Number(value || 0);
    return new Intl.NumberFormat(locale.value).format(Number.isFinite(number) ? Math.max(0, number) : 0);
  }

  function formatExactTokens(value: unknown) {
    return formatNumber(value);
  }

  function moduleLabel(module: string) {
    return t(`settings.ai.usage.modules.${aiUsageModuleKey(module, true)}`);
  }

  function actionLabel(labelKey: string) {
    return t(`settings.ai.usage.actions.${labelKey || 'otherAiAction'}`);
  }

  function freeActionLabel(labelKey: string) {
    return t(`settings.ai.usage.freeActions.${labelKey}.title`);
  }

  function freeActionDescription(labelKey: string) {
    return t(`settings.ai.usage.freeActions.${labelKey}.description`);
  }

  function statusTone(status: string) {
    if (status === 'success') return 'success';
    if (status === 'aborted') return 'neutral';
    if (status === 'partial' || status === 'quota_blocked') return 'warning';
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

  function formatDateTime(value: number) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale.value, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function localDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function shortDate(value: string) {
    const [, month = '', day = ''] = value.split('-');
    return `${month}/${day}`;
  }

  function chartHeight(value: number) {
    if (value <= 0) return 2;
    return Math.max(8, Math.round((value / maxChartTokens.value) * 100));
  }

  function modulePercent(value: number) {
    if (value <= 0) return 0;
    return Math.max(3, Math.round((value / maxModuleTokens.value) * 100));
  }
</script>

<style scoped lang="less">
  .ai-usage-center {
    min-width: 0;
    padding-top: 4px;
  }

  .usage-head,
  .usage-section-head,
  .record-title-row,
  .record-meta,
  .boundary-notes p,
  .usage-inline-warning {
    display: flex;
    align-items: center;
  }

  .usage-head {
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
  }

  .usage-head h3,
  .usage-section h4,
  .rule-section h4 {
    margin: 0;
    color: var(--text-color);
  }

  .usage-head h3 {
    font-size: 14px;
  }

  .usage-head p,
  .usage-section-head p,
  .rule-section-title p,
  .rule-callout p,
  .free-card p {
    margin: 3px 0 0;
    color: var(--desc-color);
    font-size: 11.5px;
    line-height: 1.5;
  }

  .usage-refresh {
    flex: 0 0 auto;
    gap: 5px;
  }

  .usage-inline-warning {
    gap: 6px;
    margin: 10px 0;
    padding: 8px 10px;
    border: 1px solid var(--warning-color, #d98a00);
    border-radius: 8px;
    color: var(--warning-color, #b36b00);
    font-size: 12px;
  }

  .usage-state,
  .usage-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 180px;
    padding: 20px;
    color: var(--desc-color);
    text-align: center;
    font-size: 12px;
  }

  .usage-state strong,
  .usage-empty strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .usage-state--error {
    border: 1px solid var(--error-color, #d84a4a);
    border-radius: 10px;
  }

  .usage-filters {
    display: flex;
    gap: 10px;
    margin: 12px 0;
  }

  .usage-filters label {
    display: grid;
    grid-template-columns: auto minmax(110px, 1fr);
    align-items: center;
    gap: 7px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .usage-filters :deep(.b-select) {
    min-width: 130px;
  }

  .usage-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .summary-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    padding: 11px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .summary-card span,
  .summary-card small {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.35;
  }

  .summary-card strong {
    color: var(--text-color);
    font-size: 15px;
  }

  .usage-section,
  .rule-section {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--surface-divider-color);
  }

  .usage-section-head {
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .usage-section h4,
  .rule-section h4 {
    font-size: 13px;
  }

  .module-breakdown {
    display: grid;
    gap: 8px;
  }

  .module-row {
    display: grid;
    grid-template-columns: 64px minmax(70px, 1fr) 72px 68px;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
  }

  .module-name,
  .module-row small {
    color: var(--desc-color);
  }

  .module-row > strong {
    color: var(--text-color);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .module-track {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-divider-color);
  }

  .module-track > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--primary-color);
  }

  .usage-chart {
    overflow-x: auto;
    padding: 6px 0 2px;
    scrollbar-width: thin;
  }

  .chart-bars {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 100px;
    padding-top: 4px;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .chart-point {
    position: relative;
    display: flex;
    flex: 1 0 6px;
    align-items: flex-end;
    justify-content: center;
    height: 78px;
  }

  .chart-point small {
    position: absolute;
    top: 82px;
    color: var(--desc-color);
    font-size: 9px;
    white-space: nowrap;
  }

  .chart-value {
    width: min(100%, 10px);
    min-height: 2px;
    border-radius: 3px 3px 0 0;
    background: var(--primary-color);
    opacity: 0.78;
  }

  .chart-point.is-today .chart-value {
    opacity: 1;
    outline: 1px solid var(--primary-color);
    outline-offset: 1px;
  }

  .usage-empty--compact {
    min-height: 72px;
    padding: 8px;
  }

  .usage-records {
    display: grid;
    gap: 7px;
    margin-bottom: 12px;
  }

  .usage-record {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto 16px;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: auto;
    padding: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
    line-height: normal;
    white-space: normal;
    text-align: left;
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease;
  }

  @media (hover: hover) and (pointer: fine) {
    .usage-record:hover {
      border-color: var(--primary-color);
      background: var(--primary-btn-bg-color);
    }
  }

  .record-icon {
    display: inline-flex;
    width: 34px;
    height: 34px;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    color: var(--primary-color);
    background: var(--primary-btn-bg-color);
  }

  .record-main {
    min-width: 0;
  }

  .record-title-row,
  .record-meta {
    flex-wrap: wrap;
    gap: 6px;
  }

  .record-title-row > strong {
    min-width: 0;
    color: var(--text-color);
    font-size: 12.5px;
  }

  .record-meta {
    margin-top: 4px;
    color: var(--desc-color);
    font-size: 10.5px;
  }

  .record-meta span + span::before {
    content: '·';
    margin-right: 6px;
  }

  .status-badge,
  .estimate-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-height: 18px;
    box-sizing: border-box;
    padding: 1px 6px;
    border: 1px solid currentColor;
    border-radius: 999px;
    font-size: 9.5px;
    line-height: 1;
  }

  .status-badge.is-success {
    color: var(--success-color, #23845b);
  }

  .status-badge.is-warning,
  .estimate-badge,
  .record-settlement {
    color: var(--warning-color, #a86700);
  }

  .status-badge.is-error {
    color: var(--error-color, #c33f47);
  }

  .status-badge.is-neutral {
    color: var(--desc-color);
  }

  .record-covered,
  .record-settlement {
    display: block;
    margin-top: 4px;
    font-size: 10.5px;
  }

  .record-covered {
    color: var(--success-color, #23845b);
  }

  .record-charge {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 72px;
    color: var(--desc-color);
    font-size: 9.5px;
    font-variant-numeric: tabular-nums;
  }

  .record-charge strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .record-open {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--desc-color);
  }

  .rule-callout {
    display: flex;
    gap: 10px;
    margin-top: 12px;
    padding: 12px;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .rule-callout-icon {
    display: inline-flex;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    color: #fff;
    background: var(--primary-color);
  }

  .rule-callout strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .rule-section-title {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    margin-bottom: 10px;
  }

  .rule-dot {
    width: 9px;
    height: 9px;
    flex: 0 0 auto;
    margin-top: 4px;
    border: 2px solid currentColor;
    border-radius: 50%;
  }

  .rule-dot--charged {
    color: var(--primary-color);
    background: var(--primary-color);
  }

  .rule-dot--free {
    color: var(--success-color, #23845b);
    background: var(--success-color, #23845b);
  }

  .rule-groups {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .rule-group,
  .free-card {
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    background: var(--workspace-panel-bg-color);
  }

  .rule-group > strong,
  .free-card strong {
    color: var(--text-color);
    font-size: 11.5px;
  }

  .rule-action-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 7px;
  }

  .rule-action {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px 6px;
    border: 1px solid var(--surface-divider-color);
    border-radius: 6px;
    color: var(--desc-color);
    font-size: 10.5px;
  }

  .rule-action small {
    color: var(--primary-color);
    font-size: 9px;
  }

  .free-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .free-card {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .free-card > :first-child {
    flex: 0 0 auto;
    margin-top: 1px;
    color: var(--success-color, #23845b);
  }

  .boundary-notes {
    display: grid;
    gap: 7px;
    margin-top: 12px;
    padding: 10px;
    border: 1px solid var(--surface-divider-color);
    border-radius: 9px;
  }

  .boundary-notes p {
    align-items: flex-start;
    gap: 6px;
    margin: 0;
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.5;
  }

  .boundary-notes p > :first-child {
    flex: 0 0 auto;
    margin-top: 1px;
    color: var(--primary-color);
  }

  @media (max-width: 600px) {
    .usage-head {
      align-items: flex-start;
    }

    .usage-refresh {
      min-height: 44px;
      padding-inline: 12px;
    }

    :deep(.tab-container .tab) {
      min-height: 44px;
      box-sizing: border-box;
      padding-block: 10px;
    }

    .usage-filters {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .usage-filters label {
      display: flex;
      align-items: stretch;
      flex-direction: column;
    }

    .usage-filters :deep(.b-select) {
      min-width: 0;
      width: 100%;
    }

    .usage-filters :deep(.select-trigger) {
      height: 44px;
    }

    .usage-summary {
      grid-template-columns: 1fr;
    }

    .module-row {
      grid-template-columns: 58px minmax(54px, 1fr) 64px;
    }

    .module-row small {
      display: none;
    }

    .usage-record {
      grid-template-columns: 30px minmax(0, 1fr) 16px;
      align-items: flex-start;
      min-height: 64px;
    }

    .record-icon {
      width: 30px;
      height: 30px;
    }

    .record-charge {
      grid-column: 2;
      align-items: flex-start;
      margin-top: -3px;
    }

    .record-open {
      grid-column: 3;
      grid-row: 1 / span 2;
      align-self: center;
    }

    :deep(.bpagination__btn),
    :deep(.bpagination__sizer-trigger) {
      min-width: 44px;
      height: 44px;
    }

    .rule-groups,
    .free-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

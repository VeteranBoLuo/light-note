<template>
  <AdminDataPage
    eyebrow="Admin / Product"
    :title="t('adminProductInsights.title')"
    :subtitle="t('adminProductInsights.subtitle')"
    layout="scroll"
  >
    <template #actions>
      <div class="product-insights__actions">
        <BSelect
          v-model:value="periodDays"
          class="product-insights__select"
          :aria-label="t('adminProductInsights.periodLabel')"
          :options="periodOptions"
          :disabled="loading"
          @change="load()"
        />
        <BSelect
          v-model:value="cohortWeeks"
          class="product-insights__select"
          :aria-label="t('adminProductInsights.cohortPeriodLabel')"
          :options="cohortOptions"
          :disabled="loading"
          @change="load()"
        />
        <BButton size="small" :loading="loading" @click="load">{{ t('common.refresh') }}</BButton>
      </div>
    </template>

    <template #metrics>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminProductInsights.metrics.activeUsers') }}</span>
        <strong class="admin-stat-value">{{ n(data?.summary.activeUsers) }}</strong>
        <span class="admin-stat-hint">{{ t('adminProductInsights.metrics.periodHint', { days: periodDays }) }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminProductInsights.metrics.newUsers') }}</span>
        <strong class="admin-stat-value">{{ n(data?.summary.newUsers) }}</strong>
        <span class="admin-stat-hint">{{ t('adminProductInsights.metrics.excludesInternal') }}</span>
      </li>
      <li class="admin-stat-card" :class="{ 'has-warning': (data?.summary.activationRate || 0) < 20 }">
        <span class="admin-stat-label">{{ t('adminProductInsights.metrics.activation') }}</span>
        <strong class="admin-stat-value">{{ rate(data?.summary.activationRate) }}</strong>
        <span class="admin-stat-hint">{{ t('adminProductInsights.metrics.activationHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminProductInsights.metrics.aiAdoption') }}</span>
        <strong class="admin-stat-value">{{ rate(data?.summary.aiAdoptionRate) }}</strong>
        <span class="admin-stat-hint">{{ t('adminProductInsights.metrics.aiHint') }}</span>
      </li>
    </template>

    <div v-if="data?.unavailableSources.length" class="product-insights__warning" role="status">
      <strong>{{ t('adminProductInsights.partialTitle') }}</strong>
      <span>{{
        t('adminProductInsights.partialHint', {
          sources: data.unavailableSources.map(sourceLabel).join('、'),
        })
      }}</span>
    </div>

    <BLoading v-if="loading && !data" loading :title="t('adminProductInsights.loading')" />

    <template v-else-if="data">
      <section class="product-insights__section" aria-labelledby="product-feature-adoption">
        <header class="product-insights__section-header">
          <div>
            <h3 id="product-feature-adoption">{{ t('adminProductInsights.adoption.title') }}</h3>
            <p>{{ t('adminProductInsights.adoption.subtitle', { days: periodDays }) }}</p>
          </div>
          <BChip tone="neutral">{{ t('adminProductInsights.aggregateOnly') }}</BChip>
        </header>
        <div class="product-insights__feature-grid">
          <BCard
            v-for="feature in data.features"
            :key="feature.source"
            as="article"
            variant="panel"
            padding="14px"
            class="product-insights__feature"
            :class="{ 'is-unavailable': !feature.available }"
          >
            <header>
              <strong>{{ sourceLabel(feature.source) }}</strong>
              <BChip :tone="feature.available ? 'success' : 'pending'">
                {{
                  feature.available
                    ? t('adminProductInsights.adoption.available')
                    : t('adminProductInsights.adoption.unavailable')
                }}
              </BChip>
            </header>
            <template v-if="feature.available">
              <div class="product-insights__feature-rate">
                <strong>{{ rate(feature.rate) }}</strong>
                <span>{{ t('adminProductInsights.adoption.ofActiveUsers') }}</span>
              </div>
              <BProgress
                size="small"
                :percent="feature.rate"
                :aria-label="t('adminProductInsights.adoption.rateAria', { feature: sourceLabel(feature.source) })"
              />
              <p>
                {{
                  t('adminProductInsights.adoption.detail', {
                    users: n(feature.users),
                    events: n(feature.events),
                  })
                }}
              </p>
            </template>
            <p v-else>{{ t('adminProductInsights.adoption.migrationHint') }}</p>
          </BCard>
        </div>
      </section>

      <section class="product-insights__section" aria-labelledby="product-cohort-retention">
        <header class="product-insights__section-header">
          <div>
            <h3 id="product-cohort-retention">{{ t('adminProductInsights.retention.title') }}</h3>
            <p>{{ t('adminProductInsights.retention.subtitle') }}</p>
          </div>
        </header>

        <BTable
          v-if="!bookmark.isMobile && data.cohorts.length"
          row-key="cohortStart"
          :data="data.cohorts"
          :columns="cohortColumns"
          class="product-insights__table"
        >
          <template #bodyCell="{ record, column }">
            <template v-if="column.key === 'cohortStart'">{{ formatDate(asCohort(record).cohortStart) }}</template>
            <template v-else-if="column.key === 'registered'">{{ n(asCohort(record).registered) }}</template>
            <template v-else-if="column.key === 'd1'">{{ retentionLabel(asCohort(record).d1) }}</template>
            <template v-else-if="column.key === 'd7'">{{ retentionLabel(asCohort(record).d7) }}</template>
            <template v-else-if="column.key === 'd30'">{{ retentionLabel(asCohort(record).d30) }}</template>
          </template>
        </BTable>

        <div v-else-if="data.cohorts.length" class="product-insights__cohort-list">
          <BCard
            v-for="cohort in data.cohorts"
            :key="cohort.cohortStart"
            as="article"
            variant="panel"
            padding="14px"
            class="product-insights__cohort"
          >
            <header>
              <strong>{{ formatDate(cohort.cohortStart) }}</strong>
              <span>{{ t('adminProductInsights.retention.registered', { count: n(cohort.registered) }) }}</span>
            </header>
            <dl>
              <div
                ><dt>D1</dt><dd>{{ retentionLabel(cohort.d1) }}</dd></div
              >
              <div
                ><dt>D7</dt><dd>{{ retentionLabel(cohort.d7) }}</dd></div
              >
              <div
                ><dt>D30</dt><dd>{{ retentionLabel(cohort.d30) }}</dd></div
              >
            </dl>
          </BCard>
        </div>
        <div v-else class="product-insights__empty">
          <strong>{{ t('adminProductInsights.retention.emptyTitle') }}</strong>
          <span>{{ t('adminProductInsights.retention.emptyHint') }}</span>
        </div>
      </section>

      <BCard variant="panel" padding="14px" class="product-insights__methodology">
        <strong>{{ t('adminProductInsights.methodology.title') }}</strong>
        <ul>
          <li>{{ t('adminProductInsights.methodology.activity') }}</li>
          <li>{{ t('adminProductInsights.methodology.activation') }}</li>
          <li>{{ t('adminProductInsights.methodology.retention') }}</li>
          <li>{{ t('adminProductInsights.methodology.privacy') }}</li>
        </ul>
      </BCard>
    </template>
  </AdminDataPage>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import type { Column } from '@/components/base/BasicComponents/BTable/config';
  import { getAdminProductInsights } from '@/api/commonApi';
  import { bookmarkStore } from '@/store';

  type PeriodDays = 7 | 30 | 90;
  type CohortWeeks = 8 | 12 | 16;
  interface RetentionValue {
    eligible: number;
    retained: number;
    rate: number;
  }
  interface CohortRow {
    cohortStart: string;
    registered: number;
    d1: RetentionValue;
    d7: RetentionValue;
    d30: RetentionValue;
  }
  interface ProductInsightsData {
    generatedAt: string;
    periodDays: PeriodDays;
    cohortWeeks: CohortWeeks;
    summary: {
      activeUsers: number;
      newUsers: number;
      activatedUsers: number;
      activationRate: number;
      aiAdoptionRate: number;
    };
    features: Array<{ source: string; available: boolean; users: number; events: number; rate: number }>;
    cohorts: CohortRow[];
    unavailableSources: string[];
  }

  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const loading = ref(false);
  const periodDays = ref<PeriodDays>(30);
  const cohortWeeks = ref<CohortWeeks>(8);
  const data = ref<ProductInsightsData | null>(null);

  const periodOptions = computed(() => [
    { value: 7, label: t('adminProductInsights.periods.7') },
    { value: 30, label: t('adminProductInsights.periods.30') },
    { value: 90, label: t('adminProductInsights.periods.90') },
  ]);
  const cohortOptions = computed(() => [
    { value: 8, label: t('adminProductInsights.cohortPeriods.8') },
    { value: 12, label: t('adminProductInsights.cohortPeriods.12') },
    { value: 16, label: t('adminProductInsights.cohortPeriods.16') },
  ]);
  const cohortColumns = computed<Column[]>(() => [
    { key: 'cohortStart', title: t('adminProductInsights.retention.cohort'), width: 'minmax(150px, 1fr)' },
    { key: 'registered', title: t('adminProductInsights.retention.newUsers'), width: '110px' },
    { key: 'd1', title: 'D1', width: 'minmax(150px, 1fr)' },
    { key: 'd7', title: 'D7', width: 'minmax(150px, 1fr)' },
    { key: 'd30', title: 'D30', width: 'minmax(150px, 1fr)' },
  ]);

  function n(value: unknown) {
    return Number(value || 0).toLocaleString(locale.value);
  }
  function rate(value: unknown) {
    return `${Number(value || 0).toLocaleString(locale.value, { maximumFractionDigits: 1 })}%`;
  }
  function sourceLabel(source: string) {
    return t(`adminProductInsights.sources.${source}`);
  }
  function asCohort(value: unknown) {
    return value as CohortRow;
  }
  function retentionLabel(value: RetentionValue) {
    if (!value.eligible) return t('adminProductInsights.retention.immature');
    return t('adminProductInsights.retention.value', {
      rate: rate(value.rate),
      retained: n(value.retained),
      eligible: n(value.eligible),
    });
  }
  function formatDate(value: string) {
    const date = new Date(`${value}T00:00:00`);
    return Number.isFinite(date.getTime())
      ? date.toLocaleDateString(locale.value, { month: 'short', day: 'numeric', year: 'numeric' })
      : value;
  }

  async function load() {
    if (loading.value) return;
    loading.value = true;
    try {
      const response: any = await getAdminProductInsights({
        periodDays: periodDays.value,
        cohortWeeks: cohortWeeks.value,
      });
      if (response?.status !== 200) throw new Error(response?.msg || 'ADMIN_PRODUCT_INSIGHTS_FAILED');
      data.value = response.data;
    } catch {
      message.error(t('adminProductInsights.loadFailed'));
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);
</script>

<style scoped lang="less">
  .product-insights__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .product-insights__select {
    width: 132px;
  }

  .product-insights__warning {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--warning-border-color, #e6a23c);
    border-radius: 10px;
    color: var(--text-color);
    background: var(--warning-background-color, rgba(230, 162, 60, 0.08));
    font-size: 12px;
    line-height: 1.5;
  }

  .product-insights__section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .product-insights__section-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .product-insights__section-header h3,
  .product-insights__section-header p {
    margin: 0;
  }

  .product-insights__section-header h3 {
    color: var(--text-color);
    font-size: 15px;
  }

  .product-insights__section-header p {
    margin-top: 2px;
    color: var(--sub-text-color);
    font-size: 12px;
  }

  .product-insights__feature-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .product-insights__feature {
    border-color: var(--surface-border-color);
  }

  .product-insights__feature.is-unavailable {
    border-style: dashed;
  }

  .product-insights__feature header,
  .product-insights__cohort header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .product-insights__feature-rate {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 12px 0 8px;
  }

  .product-insights__feature-rate strong {
    color: var(--text-color);
    font-size: 22px;
  }

  .product-insights__feature-rate span,
  .product-insights__feature p,
  .product-insights__cohort header span {
    color: var(--sub-text-color);
    font-size: 11px;
  }

  .product-insights__feature p {
    margin: 8px 0 0;
    line-height: 1.5;
  }

  .product-insights__table {
    min-height: 220px;
  }

  .product-insights__cohort-list {
    display: grid;
    gap: 8px;
  }

  .product-insights__cohort dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 12px 0 0;
  }

  .product-insights__cohort dl div {
    padding: 8px;
    border: 1px solid var(--surface-divider-color);
    border-radius: 8px;
  }

  .product-insights__cohort dt {
    color: var(--sub-text-color);
    font-size: 10px;
  }

  .product-insights__cohort dd {
    margin: 3px 0 0;
    color: var(--text-color);
    font-size: 12px;
  }

  .product-insights__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 28px 12px;
    border: 1px dashed var(--surface-border-color);
    border-radius: 12px;
    color: var(--sub-text-color);
    font-size: 12px;
  }

  .product-insights__methodology > strong {
    font-size: 13px;
  }

  .product-insights__methodology ul {
    margin: 8px 0 0;
    padding-left: 18px;
    color: var(--sub-text-color);
    font-size: 11px;
    line-height: 1.7;
  }

  @media (max-width: 900px) {
    .product-insights__feature-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 600px) {
    .product-insights__actions {
      width: 100%;
      flex-wrap: wrap;
    }

    .product-insights__select {
      flex: 1 1 120px;
      width: auto;
    }

    .product-insights__feature-grid {
      grid-template-columns: 1fr;
    }

    .product-insights__cohort dl {
      grid-template-columns: 1fr;
    }
  }

  html.light-note-mobile-rendering .product-insights__feature,
  html.light-note-mobile-rendering .product-insights__cohort {
    box-shadow: none;
    border-color: var(--surface-border-color);
  }
</style>

<template>
  <section class="core-usage" aria-labelledby="core-usage-title" :aria-busy="loading">
    <header class="core-usage__header">
      <div
        ><h3 id="core-usage-title">{{ t('coreUsageReport.title') }}</h3
        ><p>{{ t('coreUsageReport.intro') }}</p></div
      >
      <div class="core-usage__actions">
        <BButton size="small" :loading="loading" @click="generate">{{
          t(report ? 'coreUsageReport.regenerate' : 'coreUsageReport.generate')
        }}</BButton>
      </div>
    </header>
    <p v-if="failure" role="alert" class="core-usage__error">{{ t(failure) }}</p>
    <p v-if="!report" class="core-usage__hint">{{ t('coreUsageReport.idle', { days }) }}</p>
    <template v-else>
      <p class="core-usage__hint" role="status">{{
        t('coreUsageReport.snapshot', {
          time: generatedTime,
          days: report.days,
          eligible: count(report.cohort.eligible),
          immature: count(report.cohort.immature),
        })
      }}</p>
      <BTable v-if="!bookmark.isMobile" :columns="columns" :data="rows" row-key="key">
        <template #bodyCell="{ record, column }">
          <template v-if="column.key === 'label'">{{ t(`coreUsageReport.metrics.${row(record).key}`) }}</template>
          <template v-else-if="column.key === 'observed'">{{ count(row(record).observed) }}</template>
          <template v-else-if="column.key === 'eligible'">{{ count(row(record).eligible) }}</template>
          <template v-else-if="column.key === 'value'">{{ recordedRate(row(record)) }}</template>
          <template v-else-if="column.key === 'status'">
            <BChip :tone="row(record).status === 'available' ? 'success' : 'pending'">{{
              t(`coreUsageReport.statuses.${row(record).status}`)
            }}</BChip>
            <span class="core-usage__reason">{{ reason(row(record)) }}</span>
          </template>
        </template>
      </BTable>
      <div v-else class="core-usage__list">
        <article v-for="metric in rows" :key="metric.key">
          <header
            ><strong>{{ t(`coreUsageReport.metrics.${metric.key}`) }}</strong
            ><BChip :tone="metric.status === 'available' ? 'success' : 'pending'">{{
              t(`coreUsageReport.statuses.${metric.status}`)
            }}</BChip></header
          >
          <dl
            ><div
              ><dt>{{ t('coreUsageReport.observed') }}</dt
              ><dd>{{ count(metric.observed) }}</dd></div
            ><div
              ><dt>{{ t('coreUsageReport.eligible') }}</dt
              ><dd>{{ count(metric.eligible) }}</dd></div
            ><div
              ><dt>{{ t('coreUsageReport.rate') }}</dt
              ><dd>{{ recordedRate(metric) }}</dd></div
            ></dl
          >
          <p v-if="metric.reasons.length" class="core-usage__hint">{{ reason(metric) }}</p>
        </article>
      </div>
      <p class="core-usage__hint">{{ t('coreUsageReport.coverage') }}</p>
      <p class="core-usage__hint">{{ t('coreUsageReport.limitation') }}</p>
    </template>
  </section>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { getAdminCoreUsageReport } from '@/api/commonApi';
  import { bookmarkStore } from '@/store';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import type { Column } from '@/components/base/BasicComponents/BTable/config';
  interface Metric {
    eligible: number | null;
    observed: number | null;
    value: number | null;
    status: string;
    reasons: string[];
  }
  interface Report {
    asOf: string;
    days: number;
    cohort: { eligible: number; immature: number };
    metrics: Record<string, Metric>;
  }
  type Row = Metric & { key: string };
  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const props = defineProps<{ days: 7 | 30 | 90 }>();
  const loading = ref(false);
  const failure = ref('');
  const report = ref<Report | null>(null);
  let generation = 0;
  onBeforeUnmount(() => {
    generation++;
  });
  const keys = ['a7Resources', 'a7Overall', 'r7Core', 'a7ResourcesLegacy', 'r7InteractionProxy'];
  const rows = computed<Row[]>(() => (report.value ? keys.map((key) => ({ key, ...report.value!.metrics[key] })) : []));
  const columns = computed<Column[]>(() => [
    { key: 'label', title: t('coreUsageReport.metric'), width: 'minmax(190px, 1.3fr)', ellipsis: false },
    { key: 'observed', title: t('coreUsageReport.observed'), width: '110px' },
    { key: 'eligible', title: t('coreUsageReport.eligible'), width: '100px' },
    { key: 'value', title: t('coreUsageReport.rate'), width: '90px' },
    { key: 'status', title: t('coreUsageReport.status'), width: 'minmax(200px, 1fr)', ellipsis: false },
  ]);
  const generatedTime = computed(() =>
    report.value ? new Date(report.value.asOf).toLocaleString(locale.value, { timeZone: 'Asia/Shanghai' }) : '',
  );
  const row = (value: unknown) => value as Row;
  const count = (value: number | null) => (value == null ? '—' : value.toLocaleString(locale.value));
  function recordedRate(metric: Metric) {
    // Coverage uncertainty affects completeness, not the ratio of records we do have.
    if (
      !['available', 'coverage_unknown', 'partial_coverage'].includes(metric.status) ||
      metric.observed == null ||
      metric.eligible == null ||
      !Number.isFinite(metric.observed) ||
      !Number.isFinite(metric.eligible) ||
      metric.eligible <= 0 ||
      metric.observed < 0 ||
      metric.observed > metric.eligible
    )
      return '—';
    return `${((metric.observed / metric.eligible) * 100).toLocaleString(locale.value, { maximumFractionDigits: 2 })}%`;
  }
  const reason = (metric: Metric) => metric.reasons.map((key) => t(`coreUsageReport.reasons.${key}`)).join(' · ');
  watch(
    () => props.days,
    () => {
      generation++;
      loading.value = false;
      report.value = null;
      failure.value = '';
    },
  );
  async function generate() {
    if (loading.value) return;
    const current = ++generation;
    loading.value = true;
    failure.value = '';
    try {
      const response: any = await getAdminCoreUsageReport({ days: props.days });
      if (current !== generation) return;
      if (response?.status !== 200) {
        failure.value = response?.status === 409 ? 'coreUsageReport.busy' : 'coreUsageReport.failed';
        return;
      }
      report.value = response.data;
    } catch {
      if (current === generation) failure.value = 'coreUsageReport.failed';
    } finally {
      if (current === generation) loading.value = false;
    }
  }
</script>
<style scoped lang="less">
  .core-usage {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 0;
    border-block: 1px solid var(--surface-border-color);
    min-width: 0;
  }
  .core-usage__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }
  .core-usage__header h3 {
    margin: 0;
    font-size: 15px;
    color: var(--text-color);
  }
  .core-usage__header p,
  .core-usage__hint {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--sub-text-color);
  }
  .core-usage__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .core-usage__reason {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--sub-text-color);
    white-space: normal;
  }
  .core-usage__error {
    margin: 0;
    color: var(--error-color);
    font-size: 12px;
  }
  .core-usage__list article {
    padding: 12px 0;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .core-usage__list header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    color: var(--text-color);
    font-size: 13px;
  }
  .core-usage__list dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: 12px 0 0;
    gap: 8px;
  }
  .core-usage__list dt {
    font-size: 12px;
    color: var(--sub-text-color);
  }
  .core-usage__list dd {
    margin: 4px 0 0;
    font-size: 16px;
    color: var(--text-color);
  }
</style>

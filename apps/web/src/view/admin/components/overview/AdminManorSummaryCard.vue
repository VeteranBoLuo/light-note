<template>
  <BCard
    as="section"
    class="ov-manor-card"
    :class="{ 'is-mobile': mobile }"
    padding="16px 18px"
    radius="10px"
    :aria-label="a('title')"
  >
    <header class="ov-manor-header">
      <div class="ov-manor-title">
        <SvgIcon :src="icon.manor.entry" size="26" aria-hidden="true" />
        <h3>{{ a('title') }}</h3>
        <BChip v-if="data" :tone="runtimeTone">{{ runtimeLabel }}</BChip>
      </div>
      <RouterLink :to="managementRoute" class="ov-manor-link ov-manor-header-link">
        {{ a('manage') }}<SvgIcon :src="icon.arrow_right" size="14" aria-hidden="true" />
      </RouterLink>
    </header>
    <BLoading class="ov-manor-loading" :loading="loading" :title="a('loading')">
      <ul class="ov-manor-metrics">
        <li v-for="item in metrics" :key="item.key" class="ov-manor-metric">
          <span class="ov-manor-label">{{ item.label }}</span>
          <div class="ov-manor-value" :class="{ 'is-net': item.key === 'net' }">
            <strong>{{ item.value }}</strong
            ><small>{{ item.unit }}</small>
          </div>
          <small class="ov-manor-hint">{{ item.hint }}</small>
        </li>
      </ul>
    </BLoading>
    <div v-if="notice" class="ov-manor-notice" role="status">
      <span>{{ notice }}</span>
      <BButton type="text" size="small" :loading="loading" @click="refresh">{{ a('retry') }}</BButton>
    </div>
    <div class="ov-manor-toolbar">
      <BButton
        type="text"
        size="small"
        :disabled="!data?.daily"
        :aria-expanded="showDaily"
        :aria-controls="dailyId"
        @click="showDaily = !showDaily"
      >
        {{ a(showDaily ? 'hideDaily' : 'showDaily') }}
        <SvgIcon
          :src="icon.pagination.chevron"
          size="12"
          class="ov-manor-chevron"
          :class="{ 'is-open': showDaily }"
          aria-hidden="true"
        />
      </BButton>
    </div>
    <section v-if="showDaily && data?.daily" :id="dailyId" class="ov-manor-daily" :aria-label="a('dailyTitle')">
      <div class="ov-manor-daily-heading"
        ><h4>{{ a('dailyTitle') }}</h4
        ><span>{{ a('dailyHint') }}</span></div
      >
      <BTable v-if="!mobile" :data="dailyRows" :columns="columns" row-key="day">
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'day'" class="ov-manor-date">
            <time :datetime="record.day">{{ record.day.slice(5) }}</time>
            <small v-if="record.day === data.day">{{ a('today') }}</small>
          </span>
          <span v-else :class="{ 'ov-manor-net': column.key === 'net' }">{{
            column.key === 'spent' ? number(record.spent) : signed(record[column.key])
          }}</span>
        </template>
      </BTable>
      <ul v-else class="ov-manor-daily-list">
        <li v-for="row in dailyRows" :key="row.day">
          <span class="ov-manor-date">
            <time :datetime="row.day">{{ row.day.slice(5) }}</time
            ><small v-if="row.day === data.day">{{ a('today') }}</small>
          </span>
          <dl>
            <div
              ><dt>{{ a('spent') }}</dt
              ><dd>{{ number(row.spent) }}</dd></div
            >
            <div
              ><dt>{{ a('net') }}</dt
              ><dd class="ov-manor-net">{{ signed(row.net) }}</dd></div
            >
            <div
              ><dt>{{ a('issued') }}</dt
              ><dd>{{ signed(row.issued) }}</dd></div
            >
          </dl>
        </li>
      </ul>
    </section>
    <RouterLink :to="managementRoute" class="ov-manor-link ov-manor-mobile-link">
      {{ a('manage') }}<SvgIcon :src="icon.arrow_right" size="16" aria-hidden="true" />
    </RouterLink>
  </BCard>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
  import { RouterLink } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { getManorAdminSummary, type ManorSummary } from '@/api/manorAdminApi';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import type { Column } from '@/components/base/BasicComponents/BTable/config';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = defineProps<{ hideInternal: boolean; mobile: boolean }>();
  const { t, locale } = useI18n();
  const a = (key: string) => t(`manorAdmin.summary.${key}`);
  const data = ref<ManorSummary | null>(null);
  const loading = ref(false);
  const loadError = ref(false);
  const showDaily = ref(false);
  const dailyId = useId();
  let generation = 0;
  let controller: AbortController | null = null;
  const managementRoute = computed(() => ({
    path: props.mobile ? '/manorManagement' : '/admin/manorManagement',
    query: { internal: props.hideInternal ? 'hide' : 'show', days: '7', tab: 'overview' },
  }));
  const today = computed(() => data.value?.daily?.find((row) => row.day === data.value?.day));
  const dailyRows = computed(() => data.value?.daily?.slice().reverse() || []);
  const number = (value?: number | null) => (value == null ? '—' : value.toLocaleString(locale.value));
  const signed = (value?: number | null) =>
    value == null ? '—' : value < 0 ? `−${number(-value)}` : value > 0 ? `+${number(value)}` : number(0);
  const runtimeTone = computed(() =>
    !data.value?.runtime.deploymentEnabled
      ? 'neutral'
      : data.value.runtime.mode === 'maintenance'
        ? 'pending'
        : 'success',
  );
  const runtimeLabel = computed(() =>
    t(`manorAdmin.${!data.value?.runtime.deploymentEnabled ? 'disabled' : data.value.runtime.mode}`),
  );
  const activityHint = computed(() => {
    if (data.value?.failures.includes('activity')) return a('unavailable');
    if (data.value && data.value.activeToday == null) return a('coverageUnknown');
    return a(data.value?.activityPartialToday ? 'partialToday' : 'activeHint');
  });
  const netHint = computed(() => {
    const net = today.value?.net;
    return a(net == null ? 'unavailable' : net < 0 ? 'recovered' : net > 0 ? 'injected' : 'balanced');
  });
  const metrics = computed(() => [
    {
      key: 'spent',
      label: a('todaySpent'),
      value: number(today.value?.spent),
      unit: a('pointsUnit'),
      hint: a('spentHint'),
    },
    { key: 'net', label: a('todayNet'), value: signed(today.value?.net), unit: a('pointsUnit'), hint: netHint.value },
    {
      key: 'issued',
      label: a('todayIssued'),
      value: signed(today.value?.issued),
      unit: a('pointsUnit'),
      hint: a('issuedHint'),
    },
    {
      key: 'active',
      label: a('todayActive'),
      value: number(data.value?.activeToday),
      unit: a('peopleUnit'),
      hint: activityHint.value,
    },
  ]);
  const columns = computed<Column[]>(() => [
    { key: 'day', title: a('date'), width: 'minmax(0, 1.4fr)', ellipsis: false },
    ...['spent', 'net', 'issued'].map((key) => ({ key, title: a(key), align: 'right' as const, ellipsis: false })),
  ]);
  const notice = computed(() =>
    loadError.value
      ? a(data.value ? 'refreshFailed' : 'loadFailed')
      : data.value?.failures.length
        ? a('partialFailed')
        : '',
  );

  async function load(reset: boolean) {
    const request = ++generation;
    controller?.abort();
    controller = new AbortController();
    const hideInternal = props.hideInternal;
    if (reset) data.value = null;
    loading.value = true;
    loadError.value = false;
    try {
      const result = await getManorAdminSummary(hideInternal, controller.signal);
      if (request !== generation) return;
      const previous = data.value;
      // 同日同口径的单项失败保留已知结果；覆盖未知和跨日结果不回填旧值。
      if (previous?.day === result.day && previous.hideInternal === result.hideInternal) {
        data.value = {
          ...result,
          daily: result.daily ?? previous.daily,
          activeToday: result.failures.includes('activity')
            ? (result.activeToday ?? previous.activeToday)
            : result.activeToday,
        };
      } else data.value = result;
    } catch (error) {
      if (request !== generation) return;
      if ([401, 403].includes(Number((error as { status?: number })?.status))) data.value = null;
      loadError.value = true;
    } finally {
      if (request === generation) loading.value = false;
    }
  }
  function refresh() {
    return load(false);
  }
  watch(
    () => props.hideInternal,
    () => {
      void load(true);
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation++;
    controller?.abort();
  });
  defineExpose({ refresh });
</script>

<style scoped lang="less">
  .ov-manor-card {
    --b-card-shadow: none;
  }
  .ov-manor-header,
  .ov-manor-title {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    min-width: 0;
  }
  .ov-manor-header {
    justify-content: space-between;
    margin-bottom: var(--ui-space-16, 16px);
    gap: var(--ui-space-12, 12px);
  }
  .ov-manor-title {
    flex-wrap: wrap;
  }
  .ov-manor-title h3 {
    margin: 0;
    color: var(--text-color);
    font-size: var(--ui-font-16, 16px);
    font-weight: 600;
  }
  .ov-manor-link {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    min-height: var(--ui-control-28, 28px);
    color: var(--workspace-purple-text, var(--primary-color));
    font-size: var(--ui-font-12, 12px);
    text-decoration: none;
  }
  .ov-manor-header-link {
    flex: none;
  }
  .ov-manor-link:hover {
    text-decoration: underline;
  }
  .ov-manor-link:focus-visible {
    outline: 2px solid var(--focus-ring-color, var(--primary-color));
    outline-offset: 2px;
  }
  .ov-manor-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ov-manor-card .ov-manor-loading,
  .ov-manor-loading :deep(.b-loading-content) {
    height: auto;
  }
  .ov-manor-metric {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
    min-width: 0;
    padding-left: var(--ui-space-18, 18px);
    border-left: 1px solid var(--surface-border-color);
  }
  .ov-manor-metric:first-child {
    border-left: 0;
    padding-left: 0;
  }
  .ov-manor-label {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .ov-manor-value {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--ui-space-6, 6px);
    min-height: var(--ui-layout-36, 36px);
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }
  .ov-manor-value strong {
    font-size: var(--ui-font-28, 28px);
    font-weight: 650;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .ov-manor-value small,
  .ov-manor-hint {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .ov-manor-value.is-net strong,
  .ov-manor-net {
    color: var(--workspace-purple-text, var(--primary-color));
  }
  .ov-manor-notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    margin-top: var(--ui-space-12, 12px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .ov-manor-toolbar {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--ui-space-8, 8px);
    margin-top: var(--ui-space-14, 14px);
    border-top: 1px solid var(--surface-border-color);
  }
  .ov-manor-chevron.is-open {
    transform: rotate(180deg);
  }
  .ov-manor-daily {
    padding-top: var(--ui-space-12, 12px);
    margin-top: var(--ui-space-8, 8px);
    border-top: 1px solid var(--surface-border-color);
  }
  .ov-manor-daily-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    margin-bottom: var(--ui-space-10, 10px);
  }
  .ov-manor-daily-heading h4 {
    margin: 0;
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
  }
  .ov-manor-daily-heading > span {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .ov-manor-daily :deep(.table-container) {
    padding: 0;
    background: transparent;
    box-shadow: none;
    border-radius: 0;
    gap: 0;
  }
  .ov-manor-daily :deep(.table-header) {
    height: var(--ui-control-32, 32px);
    background: transparent;
    border-bottom: 1px solid var(--surface-border-color);
    border-radius: 0;
  }
  .ov-manor-daily :deep(.table-body) {
    overflow: visible;
    max-height: none;
  }
  .ov-manor-daily :deep(.table-row-window) {
    gap: 0;
  }
  .ov-manor-daily :deep(.table-row) {
    min-height: var(--ui-control-32, 32px);
    border-bottom: 1px solid var(--surface-border-color);
    border-radius: 0;
  }
  .ov-manor-daily :deep(.table-cell),
  .ov-manor-daily :deep(.header-cell) {
    font-size: var(--ui-font-12, 12px);
  }
  .ov-manor-daily :deep(.table-cell:not(:first-child)),
  .ov-manor-daily :deep(.header-cell:not(:first-child)) {
    justify-content: flex-end;
    text-align: right;
  }
  .ov-manor-date {
    display: inline-flex;
    align-items: baseline;
    gap: var(--ui-space-5, 5px);
    font-variant-numeric: tabular-nums;
  }
  .ov-manor-date small {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .ov-manor-mobile-link {
    display: none;
  }
  .is-mobile .ov-manor-header-link {
    display: none;
  }
  .is-mobile .ov-manor-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: var(--ui-space-16, 16px);
  }
  .is-mobile .ov-manor-metric {
    padding-left: var(--ui-space-14, 14px);
  }
  .is-mobile .ov-manor-metric:nth-child(odd) {
    border-left: 0;
    padding-left: 0;
  }
  .is-mobile .ov-manor-value strong {
    font-size: var(--ui-font-26, 26px);
  }
  .is-mobile .ov-manor-toolbar :deep(.b_btn),
  .is-mobile .ov-manor-notice :deep(.b_btn) {
    height: var(--ui-control-32, 32px);
    line-height: var(--ui-control-32, 32px);
  }
  .is-mobile .ov-manor-mobile-link {
    display: flex;
    justify-content: space-between;
    min-height: var(--ui-control-32, 32px);
    padding-top: var(--ui-space-10, 10px);
    margin-top: var(--ui-space-14, 14px);
    border-top: 1px solid var(--surface-border-color);
  }
  .ov-manor-daily-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .ov-manor-daily-list > li {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-10, 10px) 0;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .ov-manor-daily-list > li:last-child {
    border-bottom: 0;
  }
  .ov-manor-daily-list .ov-manor-date {
    flex: none;
    flex-direction: column;
    gap: 0;
    font-size: var(--ui-font-12, 12px);
  }
  .ov-manor-daily-list dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    flex: 1;
    min-width: 0;
    gap: var(--ui-space-8, 8px);
    margin: 0;
    text-align: right;
  }
  .ov-manor-daily-list dt {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .ov-manor-daily-list dd {
    margin: var(--ui-space-3, 3px) 0 0;
    font-size: var(--ui-font-12, 12px);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
</style>

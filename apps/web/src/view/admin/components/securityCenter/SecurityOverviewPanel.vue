<template>
  <BLoading :loading="loading" class="security-v2-page-loading">
    <div class="security-v2-page security-overview-v2">
      <header class="security-v2-header">
        <div>
          <h2>{{ t('securityV2.overview.title') }}</h2>
          <p>{{ t('securityV2.overview.subtitle') }}</p>
        </div>
        <div class="security-v2-actions">
          <BSelect v-model:value="days" class="security-days-select" :options="dayOptions" @change="loadOverview" />
          <BButton @click="loadOverview">{{ t('securityV2.common.refresh') }}</BButton>
        </div>
      </header>

      <section class="security-banner is-info">
        <span class="security-pill is-info">{{ t('securityV2.common.scope') }}</span>
        <div
          ><strong>{{ t('securityV2.overview.scopeTitle') }}</strong
          ><p>{{ t('securityV2.overview.scopeDesc') }}</p></div
        >
      </section>
      <section class="security-banner is-success auto-ban-banner">
        <span class="security-pill is-success">{{ t('securityV2.common.policy') }}</span>
        <div
          ><strong>{{ t('securityV2.overview.autoBanOff') }}</strong
          ><p>{{ t('securityV2.overview.autoBanDesc') }}</p></div
        >
        <span class="security-pill is-success recommendation">{{ t('securityV2.overview.recommended') }}</span>
      </section>

      <div class="security-kpis">
        <article v-for="card in kpis" :key="card.label" class="security-kpi">
          <span>{{ card.label }}</span>
          <strong :class="card.tone">{{ card.value }}</strong>
          <small>{{ card.hint }}</small>
        </article>
      </div>

      <div class="security-overview-grid">
        <section class="security-panel security-trend-panel">
          <div class="security-panel-head">
            <div
              ><h3>{{ t('securityV2.overview.chartTitle') }}</h3
              ><span>{{ t('securityV2.overview.chartHint') }}</span></div
            >
            <div class="security-chart-legend">
              <span><i class="is-raw"></i>{{ t('securityV2.overview.raw') }}</span>
              <span><i class="is-confirmed"></i>{{ t('securityV2.overview.confirmed') }}</span>
              <span><i class="is-false"></i>{{ t('securityV2.overview.falsePositive') }}</span>
              <span><i class="is-benign"></i>{{ t('securityV2.overview.benign') }}</span>
              <span><i class="is-authorized"></i>{{ t('securityV2.overview.authorized') }}</span>
            </div>
          </div>
          <div
            v-if="trend.length"
            class="security-v2-chart"
            @mousemove="handleChartPointer"
            @mouseleave="clearChartHover"
          >
            <span class="chart-gridline" style="top: 25%"></span><span class="chart-gridline" style="top: 50%"></span
            ><span class="chart-gridline" style="top: 75%"></span>
            <svg viewBox="0 0 700 180" preserveAspectRatio="none" role="img" :aria-label="chartAriaLabel">
              <polyline :points="chartPoints('raw')" class="chart-line is-raw" />
              <polyline :points="chartPoints('confirmed')" class="chart-line is-confirmed" />
              <polyline :points="chartPoints('falsePositive')" class="chart-line is-false" />
              <polyline :points="chartPoints('benignAnomaly')" class="chart-line is-benign" />
              <polyline :points="chartPoints('authorizedTest')" class="chart-line is-authorized" />
            </svg>
            <template v-if="hoveredTrendItem">
              <span class="chart-hover-guide" :style="{ left: chartXPercent(activeTrendIndex) }"></span>
              <span
                v-for="series in chartSeries"
                :key="series.key"
                class="chart-hover-point"
                :class="series.tone"
                :style="{ left: chartXPercent(activeTrendIndex), top: chartYPercent(series.key, activeTrendIndex) }"
              ></span>
              <div
                class="security-chart-tooltip"
                :class="chartTooltipAlignment"
                :style="{ left: chartXPercent(activeTrendIndex) }"
              >
                <strong>{{ formatTrendDate(hoveredTrendItem.date) }}</strong>
                <span v-for="series in chartSeries" :key="series.key">
                  <i :class="series.tone"></i><em>{{ series.label }}</em
                  ><b>{{ number(hoveredTrendItem[series.key]) }}</b>
                </span>
              </div>
            </template>
            <span
              v-for="axis in chartAxisLabels"
              :key="axis.index"
              class="chart-axis-label"
              :class="axis.alignment"
              :style="{ left: chartXPercent(axis.index) }"
              >{{ axis.label }}</span
            >
          </div>
          <div v-else class="security-empty">{{ t('securityV2.common.noData') }}</div>
        </section>

        <section class="security-panel security-noisy-panel">
          <div class="security-panel-head">
            <div
              ><h3>{{ t('securityV2.overview.noisyRules') }}</h3
              ><span>{{ t('securityV2.overview.noisyHint') }}</span></div
            >
            <BButton @click="router.push({ name: 'securityCenterQuality' })">{{
              t('securityV2.overview.qualityLink')
            }}</BButton>
          </div>
          <div v-for="rule in noisyRules" :key="rule.ruleCode" class="security-quality-row">
            <div class="quality-name"
              ><strong>{{ rule.ruleName || rule.ruleCode }}</strong
              ><small
                >{{ rule.primaryRoute || '-' }} ·
                {{ t('securityV2.overview.hitVolume', { count: number(rule.rawHits) }) }}</small
              ></div
            >
            <span class="security-pill" :class="modeClass(rule.mode)">{{ modeLabel(rule.mode) }}</span>
            <b :class="falsePositiveClass(rule.falsePositiveRate)">{{ number(rule.falsePositiveRate) }}%</b>
            <span class="quality-bar"
              ><i
                :class="falsePositiveClass(rule.falsePositiveRate)"
                :style="{ width: `${Math.max(4, number(rule.falsePositiveRate))}%` }"
              ></i
            ></span>
          </div>
          <div v-if="!noisyRules.length" class="security-empty">{{ t('securityV2.common.noData') }}</div>
        </section>
      </div>

      <section class="security-panel security-review-queue">
        <div class="security-panel-head">
          <div
            ><h3>{{ t('securityV2.overview.reviewQueue') }}</h3
            ><span>{{ t('securityV2.overview.reviewHint') }}</span></div
          >
          <BButton @click="router.push({ name: 'securityCenterReview' })">{{
            t('securityV2.overview.reviewLink')
          }}</BButton>
        </div>
        <div v-for="event in reviewQueue" :key="event.representativeEventId" class="security-review-row">
          <span class="security-review-score">{{ number(event.maxScore) }}</span>
          <div class="security-review-main">
            <strong>{{ event.ruleName || event.ruleCode }} · {{ event.requestPath || '-' }}</strong>
            <small
              >{{ event.actorLabel || t('securityV2.common.anonymous') }} ·
              {{ t('securityV2.common.hits', { count: event.hitCount || 1 }) }} ·
              {{ formatTime(event.lastSeenAt) }}</small
            >
            <div class="security-review-meta"
              ><span>{{ t('securityV2.overview.rulePrefix', { code: event.ruleCode || '-' }) }}</span
              ><span>{{ event.blocked ? t('securityV2.common.blocked') : t('securityV2.common.logged') }}</span
              ><span>{{ t('securityV2.overview.needsContext') }}</span></div
            >
          </div>
          <div class="security-review-actions">
            <BButton size="small" @click="markFalsePositive(event)">{{ t('securityV2.review.falsePositive') }}</BButton>
            <BButton
              size="small"
              @click="router.push({ name: 'securityCenterReview', query: { eventId: event.representativeEventId } })"
              >{{ t('securityV2.common.view') }}</BButton
            >
          </div>
        </div>
        <div v-if="!reviewQueue.length" class="security-empty">{{ t('securityV2.common.noData') }}</div>
      </section>
    </div>
  </BLoading>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBasePost } from '@/http/request';
  import { securityCenterMessages } from './securityCenterI18n';

  const emit = defineEmits<{ pendingCount: [count: number] }>();
  const { t } = useI18n({ useScope: 'local', messages: securityCenterMessages });
  const router = useRouter();
  const loading = ref(false);
  const days = ref(7);
  const overview = ref<any>({ summary: {}, trend: [], noisyRules: [], reviewQueue: [] });
  const dayOptions = computed(() => [
    { value: 7, label: t('securityV2.common.days7') },
    { value: 30, label: t('securityV2.common.days30') },
  ]);
  const summary = computed(() => overview.value.summary || {});
  const trend = computed(() => overview.value.trend || []);
  const noisyRules = computed(() => overview.value.noisyRules || []);
  const reviewQueue = computed(() => overview.value.reviewQueue || []);
  const number = (value: unknown) => Number(value || 0);
  type ChartSeriesKey = 'raw' | 'confirmed' | 'falsePositive' | 'benignAnomaly' | 'authorizedTest';
  const hoveredTrendIndex = ref<number | null>(null);
  const chartSeries = computed<Array<{ key: ChartSeriesKey; label: string; tone: string }>>(() => [
    { key: 'raw', label: t('securityV2.overview.raw'), tone: 'is-raw' },
    { key: 'confirmed', label: t('securityV2.overview.confirmed'), tone: 'is-confirmed' },
    { key: 'falsePositive', label: t('securityV2.overview.falsePositive'), tone: 'is-false' },
    { key: 'benignAnomaly', label: t('securityV2.overview.benign'), tone: 'is-benign' },
    { key: 'authorizedTest', label: t('securityV2.overview.authorized'), tone: 'is-authorized' },
  ]);
  const chartMax = computed(() =>
    Math.max(1, ...trend.value.flatMap((item: any) => chartSeries.value.map((series) => number(item[series.key])))),
  );
  const hoveredTrendItem = computed(() =>
    hoveredTrendIndex.value == null ? null : trend.value[hoveredTrendIndex.value] || null,
  );
  const activeTrendIndex = computed(() => hoveredTrendIndex.value ?? 0);
  const chartAxisLabels = computed(() => {
    const count = trend.value.length;
    if (!count) return [];
    const indices =
      count <= 7
        ? Array.from({ length: count }, (_, index) => index)
        : Array.from({ length: 6 }, (_, index) => Math.round((index * (count - 1)) / 5));
    return Array.from(new Set(indices)).map((index) => ({
      index,
      label: formatTrendAxisDate(trend.value[index]?.date),
      alignment: index === 0 ? 'is-start' : index === count - 1 ? 'is-end' : '',
    }));
  });
  const chartTooltipAlignment = computed(() => {
    if (hoveredTrendIndex.value === 0) return 'is-start';
    if (hoveredTrendIndex.value === trend.value.length - 1) return 'is-end';
    return '';
  });
  const chartAriaLabel = computed(
    () =>
      `${t('securityV2.overview.chartTitle')}：${trend.value.map((item: any) => `${formatTrendDate(item.date)}，${chartSeries.value.map((series) => `${series.label} ${number(item[series.key])}`).join('，')}`).join('；')}`,
  );
  const kpis = computed(() => [
    {
      label: t('securityV2.overview.pending'),
      value: number(summary.value.pendingReview),
      hint: t('securityV2.overview.highConfidenceCount', { count: number(summary.value.pendingHighConfidence) }),
      tone: 'is-warning',
    },
    {
      label: t('securityV2.overview.confirmed7d'),
      value: number(summary.value.confirmedAttacks),
      hint: t('securityV2.overview.confirmedHint'),
      tone: '',
    },
    {
      label: t('securityV2.overview.falsePositive7d'),
      value: `${number(summary.value.falsePositiveRate)}%`,
      hint: t('securityV2.overview.falsePositiveHint'),
      tone: 'is-danger',
    },
    {
      label: t('securityV2.overview.highBlocks'),
      value: number(summary.value.highConfidenceBlocks),
      hint: t('securityV2.overview.highBlocksHint'),
      tone: '',
    },
    {
      label: t('securityV2.overview.rateLimits'),
      value: number(summary.value.rateLimitTriggers),
      hint: t('securityV2.overview.rateLimitsHint'),
      tone: '',
    },
    {
      label: t('securityV2.overview.detection'),
      value: t('securityV2.overview.healthy'),
      hint: summary.value.eventBacklog
        ? t('securityV2.overview.backlog', { count: summary.value.eventBacklog })
        : `v${summary.value.policyVersion || 1} · ${t('securityV2.mobile.noBacklog')}`,
      tone: 'is-success',
    },
  ]);

  function modeLabel(mode: string) {
    return t(`securityV2.common.${mode === 'block' ? 'block' : mode === 'off' ? 'off' : 'observe'}`);
  }
  function modeClass(mode: string) {
    return mode === 'block' ? 'is-danger' : mode === 'off' ? 'is-neutral' : 'is-warning';
  }
  function falsePositiveClass(rate: unknown) {
    const value = number(rate);
    return value >= 50 ? 'is-danger' : value >= 20 ? 'is-warning' : 'is-success';
  }
  function formatTime(value: string) {
    return value
      ? new Date(value.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '-';
  }
  function chartX(index: number) {
    return trend.value.length === 1 ? 350 : (index * 700) / (trend.value.length - 1);
  }
  function chartY(key: ChartSeriesKey, index: number) {
    return 165 - (number(trend.value[index]?.[key]) / chartMax.value) * 145;
  }
  function chartXPercent(index: number) {
    return `${(chartX(index) / 700) * 100}%`;
  }
  function chartYPercent(key: ChartSeriesKey, index: number) {
    return `${(chartY(key, index) / 180) * 100}%`;
  }
  function chartPoints(key: ChartSeriesKey) {
    const values = trend.value.map((item: any) => number(item[key]));
    return values.map((_value: number, index: number) => `${chartX(index)},${chartY(key, index)}`).join(' ');
  }
  function handleChartPointer(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!rect.width || !trend.value.length) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    hoveredTrendIndex.value = trend.value.length === 1 ? 0 : Math.round(ratio * (trend.value.length - 1));
  }
  function clearChartHover() {
    hoveredTrendIndex.value = null;
  }
  function formatTrendDate(value: unknown) {
    const raw = String(value || '');
    const date = new Date(`${raw}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? raw || '-'
      : date.toLocaleDateString([], { month: '2-digit', day: '2-digit', weekday: 'short' });
  }
  function formatTrendAxisDate(value: unknown) {
    const raw = String(value || '');
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (parts) return `${parts[2]}/${parts[3]}`;
    const date = new Date(`${raw}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? raw || '-'
      : date.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
  }
  function rankNoisyRules(items: any[]) {
    return items
      .filter((item) => number(item.rawHits) > 0)
      .sort(
        (left, right) =>
          number(right.falsePositiveRate) - number(left.falsePositiveRate) ||
          number(right.rawHits) - number(left.rawHits),
      )
      .slice(0, 5);
  }
  async function loadOverview() {
    loading.value = true;
    try {
      const res = await apiBasePost('/api/security/v2/overview', { days: days.value }, { silent: true }).catch(
        () => null,
      );
      if (res?.status !== 200) return;
      const nextOverview = res.data || overview.value;
      if (!Array.isArray(nextOverview.noisyRules) || !nextOverview.noisyRules.length) {
        const qualityRes = await apiBasePost(
          '/api/security/v2/rules/quality',
          { days: days.value },
          { silent: true },
        ).catch(() => null);
        const qualityItems = Array.isArray(qualityRes?.data?.items) ? qualityRes.data.items : [];
        nextOverview.noisyRules = rankNoisyRules(qualityItems);
      }
      overview.value = nextOverview;
      emit('pendingCount', number(nextOverview.summary?.pendingReview));
    } finally {
      loading.value = false;
    }
  }
  async function markFalsePositive(event: any) {
    const res = await apiBasePost(
      `/api/security/v2/clusters/${encodeURIComponent(event.representativeEventId)}/disposition`,
      { disposition: 'false_positive', reason: t('securityV2.review.reviewReason') },
    ).catch(() => null);
    if (res?.status === 200) {
      message.success(t('securityV2.review.success'));
      loadOverview();
    }
  }
  onMounted(loadOverview);
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>

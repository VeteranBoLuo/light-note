<template>
  <CommonContainer :title="t('securityV2.title')" @back-click="goBack">
    <template #navigation>
      <div class="security-mobile-nav">
        <BButton class="security-mobile-icon" :aria-label="t('securityV2.common.back')" @click="goBack"
          ><SvgIcon :src="icon.arrow_left" size="22"
        /></BButton>
        <strong>{{ t('securityV2.title') }}</strong>
        <span></span>
        <BButton
          class="security-mobile-icon"
          :aria-label="t('securityV2.common.refresh')"
          :loading="loading"
          @click="loadOverview"
          ><SvgIcon :src="icon.cloudSpace.preview.rotate" size="20"
        /></BButton>
      </div>
    </template>

    <div class="security-mobile-content">
      <section v-if="mobileTab === 'overview'" class="security-mobile-panel" data-section="overview">
        <section class="security-mobile-status">
          <b>{{ t('securityV2.mobile.healthy') }}</b>
          <span>{{
            t('securityV2.mobile.status', {
              version: summary.policyVersion || 1,
              backlog: summary.eventBacklog
                ? t('securityV2.overview.backlog', { count: summary.eventBacklog })
                : t('securityV2.mobile.noBacklog'),
            })
          }}</span>
        </section>
        <div class="security-mobile-kpis">
          <article v-for="card in mobileKpis" :key="card.label"
            ><span>{{ card.label }}</span
            ><b :class="card.tone">{{ card.value }}</b></article
          >
        </div>

        <section v-if="trend.length" class="security-mobile-card security-mobile-trend-card">
          <div class="security-mobile-card-head">
            <div
              ><strong>{{ t('securityV2.overview.chartTitle') }}</strong
              ><span>{{ t('securityV2.overview.chartHint') }}</span></div
            >
          </div>
          <div class="security-mobile-chart-legend">
            <span v-for="series in chartSeries" :key="series.key"><i :class="series.tone"></i>{{ series.label }}</span>
          </div>
          <div class="security-mobile-chart" @click="selectTrendPoint">
            <span class="chart-gridline" style="top: 25%"></span><span class="chart-gridline" style="top: 50%"></span
            ><span class="chart-gridline" style="top: 75%"></span>
            <svg viewBox="0 0 700 170" preserveAspectRatio="none" role="img" :aria-label="chartAriaLabel">
              <polyline
                v-for="series in chartSeries"
                :key="series.key"
                :points="chartPoints(series.key)"
                class="chart-line"
                :class="series.tone"
              />
            </svg>
            <span class="chart-hover-guide" :style="{ left: chartXPercent(activeTrendIndex) }"></span>
            <span
              v-for="series in chartSeries"
              :key="series.key"
              class="chart-hover-point"
              :class="series.tone"
              :style="{ left: chartXPercent(activeTrendIndex), top: chartYPercent(series.key, activeTrendIndex) }"
            ></span>
            <span
              v-for="axis in chartAxisLabels"
              :key="axis.index"
              class="chart-axis-label"
              :class="axis.alignment"
              :style="{ left: chartXPercent(axis.index) }"
              >{{ axis.label }}</span
            >
          </div>
          <div v-if="selectedTrendItem" class="security-mobile-chart-values">
            <strong>{{ formatTrendDate(selectedTrendItem.date) }}</strong>
            <div>
              <span v-for="series in chartSeries" :key="series.key"
                ><i :class="series.tone"></i><em>{{ series.label }}</em
                ><b>{{ number(selectedTrendItem[series.key]) }}</b></span
              >
            </div>
          </div>
        </section>

        <section v-if="noisyRules.length" class="security-mobile-card security-mobile-noisy-card">
          <div class="security-mobile-card-head">
            <div
              ><strong>{{ t('securityV2.overview.noisyRules') }}</strong
              ><span>{{ t('securityV2.overview.noisyHint') }}</span></div
            >
          </div>
          <article v-for="rule in noisyRules" :key="rule.ruleCode" class="security-mobile-noisy-row">
            <div
              ><strong>{{ rule.ruleName || rule.ruleCode }}</strong
              ><span
                >{{ rule.primaryRoute || '-' }} ·
                {{ t('securityV2.overview.hitVolume', { count: number(rule.rawHits) }) }}</span
              ></div
            >
            <b :class="falsePositiveClass(rule.falsePositiveRate)">{{ number(rule.falsePositiveRate) }}%</b>
          </article>
        </section>
      </section>

      <section v-else-if="mobileTab === 'review'" class="security-mobile-panel" data-section="review">
        <div v-if="returnTo" class="security-mobile-return">
          <span>{{ t('securityV2.review.fromActionCenter') }}</span>
          <BButton @click="goBack">{{ t('securityV2.review.backToQueue') }}</BButton>
        </div>
        <div class="security-mobile-section-title"
          ><strong>{{ t('securityV2.mobile.reviewEvents') }}</strong
          ><span>{{ t('securityV2.mobile.viewAll', { count: summary.pendingReview || 0 }) }}</span></div
        >
        <article
          v-for="event in reviewQueue"
          :key="event.representativeEventId"
          class="security-mobile-event"
          @click="openDetail(event)"
        >
          <div class="security-mobile-event-head">
            <span class="security-mobile-score">{{ number(event.maxScore) }}</span>
            <div
              ><strong>{{ event.ruleName || event.ruleCode }}</strong
              ><span
                >{{ event.requestPath || '-' }} · {{ event.actorLabel || t('securityV2.common.anonymous') }} ·
                {{ t('securityV2.common.hits', { count: event.hitCount || 1 }) }}</span
              ></div
            >
            <span class="security-pill" :class="event.blocked ? 'is-danger' : 'is-info'">{{
              event.blocked ? t('securityV2.common.blocked') : t('securityV2.common.logged')
            }}</span>
          </div>
          <div class="security-mobile-event-meta"
            ><span class="security-pill is-warning">{{ t('securityV2.overview.needsContext') }}</span
            ><span>{{ formatTime(event.lastSeenAt) }}</span></div
          >
        </article>
        <div v-if="!reviewQueue.length" class="security-empty">{{ t('securityV2.common.noData') }}</div>
      </section>
    </div>

    <nav class="security-mobile-bottom-nav">
      <BButton :class="{ 'is-active': mobileTab === 'overview' }" @click="selectTab('overview')">{{
        t('securityV2.nav.overview')
      }}</BButton>
      <BButton :class="{ 'is-active': mobileTab === 'review' }" @click="selectTab('review')">{{
        t('securityV2.nav.review')
      }}</BButton>
    </nav>

    <EventDetailDrawer :open="drawerOpen" :event-id="activeEventId" read-only @close="closeDetail" />
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { apiBasePost } from '@/http/request';
  import { normalizeAdminActionCenterReturnTo } from '@/utils/adminNavigation.ts';
  import EventDetailDrawer from './EventDetailDrawer.vue';
  import { securityCenterMessages } from './securityCenterI18n';

  const { t } = useI18n({ useScope: 'local', messages: securityCenterMessages });
  const route = useRoute();
  const router = useRouter();
  const loading = ref(false);
  const overview = ref<any>({ summary: {}, reviewQueue: [], noisyRules: [] });
  const drawerOpen = ref(false);
  const activeEventId = ref('');
  type MobileTab = 'overview' | 'review';
  type ChartSeriesKey = 'raw' | 'confirmed' | 'falsePositive' | 'benignAnomaly' | 'authorizedTest';
  const mobileTabs = new Set<MobileTab>(['overview', 'review']);
  const normalizeTab = (value: unknown): MobileTab =>
    mobileTabs.has(String(value) as MobileTab) ? (String(value) as MobileTab) : 'overview';
  const normalizeEventId = (value: unknown) =>
    String(value || '')
      .trim()
      .slice(0, 64);
  const mobileTab = ref<MobileTab>(route.query.eventId ? 'review' : normalizeTab(route.query.tab));
  const returnTo = computed(() => normalizeAdminActionCenterReturnTo(route.query.returnTo));
  const summary = computed(() => overview.value.summary || {});
  const trend = computed(() => overview.value.trend || []);
  const reviewQueue = computed(() => overview.value.reviewQueue || []);
  const noisyRules = computed(() => overview.value.noisyRules || []);
  const number = (value: unknown) => Number(value || 0);
  const activeTrendIndex = ref(0);
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
  const selectedTrendItem = computed(
    () => trend.value[activeTrendIndex.value] || trend.value[trend.value.length - 1] || null,
  );
  const chartAxisLabels = computed(() => {
    const count = trend.value.length;
    if (!count) return [];
    const indices =
      count <= 4
        ? Array.from({ length: count }, (_, index) => index)
        : [0, Math.round((count - 1) / 3), Math.round(((count - 1) * 2) / 3), count - 1];
    return Array.from(new Set(indices)).map((index) => ({
      index,
      label: formatTrendAxisDate(trend.value[index]?.date),
      alignment: index === 0 ? 'is-start' : index === count - 1 ? 'is-end' : '',
    }));
  });
  const chartAriaLabel = computed(
    () =>
      `${t('securityV2.overview.chartTitle')}：${trend.value.map((item: any) => `${formatTrendDate(item.date)}，${chartSeries.value.map((series) => `${series.label} ${number(item[series.key])}`).join('，')}`).join('；')}`,
  );
  const mobileKpis = computed(() => [
    { label: t('securityV2.overview.pending'), value: number(summary.value.pendingReview), tone: 'is-warning' },
    { label: t('securityV2.overview.confirmed7d'), value: number(summary.value.confirmedAttacks), tone: '' },
    {
      label: t('securityV2.overview.falsePositive7d'),
      value: `${number(summary.value.falsePositiveRate)}%`,
      tone: 'is-danger',
    },
    { label: t('securityV2.overview.highBlocks'), value: number(summary.value.highConfidenceBlocks), tone: '' },
  ]);
  function chartX(index: number) {
    return trend.value.length === 1 ? 350 : (index * 700) / (trend.value.length - 1);
  }
  function chartY(key: ChartSeriesKey, index: number) {
    return 152 - (number(trend.value[index]?.[key]) / chartMax.value) * 132;
  }
  function chartXPercent(index: number) {
    return `${(chartX(index) / 700) * 100}%`;
  }
  function chartYPercent(key: ChartSeriesKey, index: number) {
    return `${(chartY(key, index) / 170) * 100}%`;
  }
  function chartPoints(key: ChartSeriesKey) {
    return trend.value.map((_item: any, index: number) => `${chartX(index)},${chartY(key, index)}`).join(' ');
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
    return parts ? `${parts[2]}/${parts[3]}` : raw || '-';
  }
  function selectTrendPoint(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!rect.width || !trend.value.length) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    activeTrendIndex.value = trend.value.length === 1 ? 0 : Math.round(ratio * (trend.value.length - 1));
  }
  function falsePositiveClass(rate: unknown) {
    const value = number(rate);
    return value >= 50 ? 'is-danger' : value >= 20 ? 'is-warning' : 'is-success';
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
  function formatTime(value: string) {
    return value
      ? new Date(value.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '-';
  }
  function openDetail(event: any) {
    activeEventId.value = normalizeEventId(event.representativeEventId || event.eventId);
    if (!activeEventId.value) return;
    drawerOpen.value = true;
    router.replace({ query: { ...route.query, tab: 'review', eventId: activeEventId.value } });
  }
  function closeDetail() {
    drawerOpen.value = false;
    activeEventId.value = '';
    router.replace({ query: { ...route.query, eventId: undefined } });
  }
  function goBack() {
    void router.push(returnTo.value || '/admin');
  }
  function selectTab(tab: MobileTab) {
    if (mobileTab.value === tab) return;
    mobileTab.value = tab;
    drawerOpen.value = false;
    activeEventId.value = '';
    router.replace({ query: { ...route.query, tab, eventId: undefined } });
  }
  async function loadOverview() {
    loading.value = true;
    try {
      const res = await apiBasePost('/api/security/v2/overview', { days: 7 }, { silent: true }).catch(() => null);
      if (res?.status !== 200) return;
      const nextOverview = res.data || overview.value;
      if (!Array.isArray(nextOverview.noisyRules) || !nextOverview.noisyRules.length) {
        const qualityRes = await apiBasePost('/api/security/v2/rules/quality', { days: 7 }, { silent: true }).catch(
          () => null,
        );
        const qualityItems = Array.isArray(qualityRes?.data?.items) ? qualityRes.data.items : [];
        nextOverview.noisyRules = rankNoisyRules(qualityItems);
      }
      overview.value = nextOverview;
      activeTrendIndex.value = Math.max(0, (nextOverview.trend?.length || 1) - 1);
    } finally {
      loading.value = false;
    }
  }
  function syncMobileRoute(tabValue: unknown, eventIdValue: unknown) {
    const eventId = normalizeEventId(eventIdValue);
    const nextTab = eventId ? 'review' : normalizeTab(tabValue);
    mobileTab.value = nextTab;
    activeEventId.value = eventId;
    drawerOpen.value = Boolean(eventId);
    if ((tabValue != null && String(tabValue) !== nextTab) || (eventId && tabValue == null)) {
      router.replace({ query: { ...route.query, tab: nextTab } });
    }
  }
  watch(
    () => [route.query.tab, route.query.eventId],
    ([tab, eventId]) => syncMobileRoute(tab, eventId),
  );
  onMounted(() => {
    syncMobileRoute(route.query.tab, route.query.eventId);
    loadOverview();
  });
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>

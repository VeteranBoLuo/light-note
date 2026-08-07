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
        <div><strong>{{ t('securityV2.overview.scopeTitle') }}</strong><p>{{ t('securityV2.overview.scopeDesc') }}</p></div>
      </section>
      <section class="security-banner is-success auto-ban-banner">
        <span class="security-pill is-success">{{ t('securityV2.common.policy') }}</span>
        <div><strong>{{ t('securityV2.overview.autoBanOff') }}</strong><p>{{ t('securityV2.overview.autoBanDesc') }}</p></div>
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
            <div><h3>{{ t('securityV2.overview.chartTitle') }}</h3><span>{{ t('securityV2.overview.chartHint') }}</span></div>
            <div class="security-chart-legend">
              <span><i class="is-raw"></i>{{ t('securityV2.overview.raw') }}</span>
              <span><i class="is-confirmed"></i>{{ t('securityV2.overview.confirmed') }}</span>
              <span><i class="is-false"></i>{{ t('securityV2.overview.falsePositive') }}</span>
            </div>
          </div>
          <div v-if="trend.length" class="security-v2-chart">
            <span class="chart-gridline" style="top: 25%"></span><span class="chart-gridline" style="top: 50%"></span><span class="chart-gridline" style="top: 75%"></span>
            <svg viewBox="0 0 700 180" preserveAspectRatio="none" :aria-label="t('securityV2.overview.chartTitle')">
              <polyline :points="chartPoints('raw')" class="chart-line is-raw" />
              <polyline :points="chartPoints('confirmed')" class="chart-line is-confirmed" />
              <polyline :points="chartPoints('falsePositive')" class="chart-line is-false" />
            </svg>
          </div>
          <div v-else class="security-empty">{{ t('securityV2.common.noData') }}</div>
        </section>

        <section class="security-panel security-noisy-panel">
          <div class="security-panel-head">
            <div><h3>{{ t('securityV2.overview.noisyRules') }}</h3><span>{{ t('securityV2.overview.noisyHint') }}</span></div>
            <BButton @click="router.push({ name: 'securityCenterQuality' })">{{ t('securityV2.overview.qualityLink') }}</BButton>
          </div>
          <div v-for="rule in noisyRules" :key="rule.ruleCode" class="security-quality-row">
            <div class="quality-name"><strong>{{ rule.ruleName || rule.ruleCode }}</strong><small>{{ rule.primaryRoute || '-' }}</small></div>
            <span class="security-pill" :class="modeClass(rule.mode)">{{ modeLabel(rule.mode) }}</span>
            <b :class="falsePositiveClass(rule.falsePositiveRate)">{{ number(rule.falsePositiveRate) }}%</b>
            <span class="quality-bar"><i :class="falsePositiveClass(rule.falsePositiveRate)" :style="{ width: `${Math.max(4, number(rule.falsePositiveRate))}%` }"></i></span>
          </div>
          <div v-if="!noisyRules.length" class="security-empty">{{ t('securityV2.common.noData') }}</div>
        </section>
      </div>

      <section class="security-panel security-review-queue">
        <div class="security-panel-head">
          <div><h3>{{ t('securityV2.overview.reviewQueue') }}</h3><span>{{ t('securityV2.overview.reviewHint') }}</span></div>
          <BButton @click="router.push({ name: 'securityCenterReview' })">{{ t('securityV2.overview.reviewLink') }}</BButton>
        </div>
        <div v-for="event in reviewQueue" :key="event.representativeEventId" class="security-review-row">
          <span class="security-review-score">{{ number(event.maxScore) }}</span>
          <div class="security-review-main">
            <strong>{{ event.ruleName || event.ruleCode }} · {{ event.requestPath || '-' }}</strong>
            <small>{{ event.actorLabel || t('securityV2.common.anonymous') }} · {{ t('securityV2.common.hits', { count: event.hitCount || 1 }) }} · {{ formatTime(event.lastSeenAt) }}</small>
            <div class="security-review-meta"><span>{{ t('securityV2.overview.rulePrefix', { code: event.ruleCode || '-' }) }}</span><span>{{ event.blocked ? t('securityV2.common.blocked') : t('securityV2.common.logged') }}</span><span>{{ t('securityV2.overview.needsContext') }}</span></div>
          </div>
          <div class="security-review-actions">
            <BButton size="small" @click="markFalsePositive(event)">{{ t('securityV2.review.falsePositive') }}</BButton>
            <BButton size="small" @click="router.push({ name: 'securityCenterReview', query: { eventId: event.representativeEventId } })">{{ t('securityV2.common.view') }}</BButton>
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
  const kpis = computed(() => [
    { label: t('securityV2.overview.pending'), value: number(summary.value.pendingReview), hint: t('securityV2.overview.highConfidenceCount', { count: number(summary.value.pendingHighConfidence) }), tone: 'is-warning' },
    { label: t('securityV2.overview.confirmed7d'), value: number(summary.value.confirmedAttacks), hint: t('securityV2.overview.confirmedHint'), tone: '' },
    { label: t('securityV2.overview.falsePositive7d'), value: `${number(summary.value.falsePositiveRate)}%`, hint: t('securityV2.overview.falsePositiveHint'), tone: 'is-danger' },
    { label: t('securityV2.overview.highBlocks'), value: number(summary.value.highConfidenceBlocks), hint: t('securityV2.overview.highBlocksHint'), tone: '' },
    { label: t('securityV2.overview.rateLimits'), value: number(summary.value.rateLimitTriggers), hint: t('securityV2.overview.rateLimitsHint'), tone: '' },
    { label: t('securityV2.overview.detection'), value: t('securityV2.overview.healthy'), hint: summary.value.eventBacklog ? t('securityV2.overview.backlog', { count: summary.value.eventBacklog }) : `v${summary.value.policyVersion || 1} · ${t('securityV2.mobile.noBacklog')}`, tone: 'is-success' },
  ]);

  function modeLabel(mode: string) { return t(`securityV2.common.${mode === 'block' ? 'block' : mode === 'off' ? 'off' : 'observe'}`); }
  function modeClass(mode: string) { return mode === 'block' ? 'is-danger' : mode === 'off' ? 'is-neutral' : 'is-warning'; }
  function falsePositiveClass(rate: unknown) { const value = number(rate); return value >= 50 ? 'is-danger' : value >= 20 ? 'is-warning' : 'is-success'; }
  function formatTime(value: string) { return value ? new Date(value.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'; }
  function chartPoints(key: 'raw' | 'confirmed' | 'falsePositive') {
    const values = trend.value.map((item: any) => number(item[key]));
    const max = Math.max(1, ...trend.value.map((item: any) => Math.max(number(item.raw), number(item.confirmed), number(item.falsePositive))));
    return values.map((value: number, index: number) => `${trend.value.length === 1 ? 350 : (index * 700) / (trend.value.length - 1)},${165 - (value / max) * 145}`).join(' ');
  }
  async function loadOverview() {
    loading.value = true;
    const res = await apiBasePost('/api/security/v2/overview', { days: days.value }, { silent: true }).catch(() => null).finally(() => { loading.value = false; });
    if (res?.status === 200) {
      overview.value = res.data || overview.value;
      emit('pendingCount', number(res.data?.summary?.pendingReview));
    }
  }
  async function markFalsePositive(event: any) {
    const res = await apiBasePost(`/api/security/v2/clusters/${encodeURIComponent(event.representativeEventId)}/disposition`, { disposition: 'false_positive', reason: t('securityV2.review.reviewReason') }).catch(() => null);
    if (res?.status === 200) { message.success(t('securityV2.review.success')); loadOverview(); }
  }
  onMounted(loadOverview);
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>

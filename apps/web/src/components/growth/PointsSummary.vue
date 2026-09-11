<template>
  <section class="points-summary" :aria-label="t('growth.pointsUsageOverviewTitle')">
    <div class="summary-top">
      <div class="balance">
        <span>{{ t('growth.pointsCenterBalance') }}</span>
        <strong>{{ summary ? formatNumber(summary.balance) : '—' }}</strong>
      </div>
      <BButton size="small" @click="$emit('exchange')">{{ t('growth.pointsUsageExchangeAction') }}</BButton>
    </div>
    <div v-if="loading && !summary" class="summary-state"><BLoading inline loading /></div>
    <div v-else-if="error" class="summary-state is-error" role="alert">
      <span>{{ t('growth.pointsCenterLoadFailed') }}</span>
      <BButton size="small" :loading="loading" @click="load">{{ t('common.retry') }}</BButton>
    </div>
    <template v-if="summary">
      <div class="summary-bottom">
        <div class="totals">
          <div
            ><span>{{ t('growth.pointsIncome28') }}</span
            ><b class="income">+{{ formatNumber(earned) }}</b></div
          >
          <div
            ><span>{{ t('growth.pointsExpense28') }}</span
            ><b class="expense">{{ spent > 0 ? '-' : '' }}{{ formatNumber(spent) }}</b></div
          >
        </div>
        <div class="summary-actions">
          <BButton
            class="summary-disclosure"
            size="small"
            :aria-expanded="panel === 'analysis'"
            :aria-controls="`${panelId}-analysis`"
            @click="toggle('analysis')"
          >
            <span>{{ t('growth.pointsAnalysis') }}</span>
            <SvgIcon class="summary-chevron" :src="icon.noteTree.chevron" size="16" aria-hidden="true" />
          </BButton>
          <BButton
            class="summary-disclosure"
            size="small"
            :aria-expanded="panel === 'rules'"
            :aria-controls="`${panelId}-rules`"
            @click="toggle('rules')"
          >
            <span>{{ t('growth.pointsRules') }}</span>
            <SvgIcon class="summary-chevron" :src="icon.noteTree.chevron" size="16" aria-hidden="true" />
          </BButton>
        </div>
      </div>
      <section v-if="panel === 'analysis'" :id="`${panelId}-analysis`" class="summary-details">
        <h3>{{ t('growth.pointsAnalysis28') }}</h3>
        <div class="source-groups">
          <div v-for="group in sourceGroups" :key="group.key">
            <h4>{{ t(group.key === 'income' ? 'growth.pointsFilterEarned' : 'growth.pointsFilterSpent') }}</h4>
            <div v-for="source in group.rows" :key="`${source.reason}:${source.key}`" class="source-row">
              <span>{{ sourceLabel(source) }}</span>
              <b :class="group.key">{{ source.amount > 0 ? '+' : '' }}{{ formatNumber(source.amount) }}</b>
            </div>
            <p v-if="!group.rows.length" class="empty">{{ t('growth.pointsNoChanges') }}</p>
          </div>
        </div>
      </section>
      <section v-if="panel === 'rules'" :id="`${panelId}-rules`" class="summary-details">
        <h3>{{ t('growth.pointsRules') }}</h3>
        <p class="rules-hint">{{ t('growth.pointsCenterRulesHint') }}</p>
        <dl class="rules">
          <div
            ><dt>{{ t('growth.pointsCenterRuleCheckin') }}</dt
            ><dd>{{ checkinRule }}</dd></div
          >
          <div
            ><dt>{{ t('growth.pointsCenterRuleDaily') }}</dt
            ><dd>{{ dailyRule }}</dd></div
          >
          <div
            ><dt>{{ t('growth.pointsCenterRuleWeekly') }}</dt
            ><dd>{{ weeklyRule }}</dd></div
          >
          <div
            ><dt>{{ t('growth.pointsCenterRuleRandom') }}</dt
            ><dd>{{ t('growth.pointsCenterRuleUncertain') }}</dd></div
          >
        </dl>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue';
  import { useI18n } from 'vue-i18n';
  import growthApi from '@/api/growthApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';

  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const panelId = useId();
  defineEmits<{ exchange: [] }>();
  const { t, te, locale } = useI18n();
  const summary = ref<any>(null);
  const loading = ref(false);
  const error = ref(false);
  const panel = ref<'analysis' | 'rules' | null>(null);
  const spent = computed(() => Number(summary.value?.last28Days?.spent || 0));
  // Old API versions return net source totals; adding deductions recovers gross income.
  const earned = computed(
    () =>
      summary.value?.last28Days?.earned ??
      (summary.value?.sources || []).reduce(
        (sum: number, source: any) => sum + Number(source.amount || 0),
        spent.value,
      ),
  );
  const sourceGroups = computed(() => [
    { key: 'income', rows: (summary.value?.sources || []).filter((s: any) => Number(s.amount) > 0) },
    { key: 'expense', rows: (summary.value?.sources || []).filter((s: any) => Number(s.amount) < 0) },
  ]);
  const checkinRule = computed(() => {
    const rule = summary.value?.earningRules?.checkin;
    return rule ? `${rule.base}–${rule.maximum}` : '—';
  });
  const dailyRule = computed(
    () => (summary.value?.earningRules?.daily || []).map((item: any) => item.points).join(' + ') || '—',
  );
  const weeklyRule = computed(() =>
    summary.value?.earningRules?.weekly
      ? formatNumber(
          summary.value.earningRules.weekly.reduce((sum: number, item: any) => sum + Number(item.reward || 0), 0),
        )
      : '—',
  );
  function formatNumber(value: unknown) {
    return Number(value || 0).toLocaleString(locale.value);
  }
  function toggle(value: 'analysis' | 'rules') {
    panel.value = panel.value === value ? null : value;
  }
  function sourceLabel(source: any) {
    const key = `growth.pointsCenterSource.${source.key}`;
    const reason = `growth.pointsReason.${source.reason}`;
    return te(key) ? t(key) : te(reason) ? t(reason) : source.reason;
  }
  let generation = 0;
  onBeforeUnmount(() => {
    generation++;
  });
  async function load() {
    const current = ++generation;
    loading.value = true;
    error.value = false;
    try {
      const response = await growthApi.getPointsSummary();
      if (current !== generation) return;
      if (response?.status !== 200 || !response.data || response.data.visitor) throw new Error('POINTS_SUMMARY_FAILED');
      summary.value = response.data;
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  onMounted(load);
</script>

<style scoped lang="less">
  .points-summary {
    color: var(--text-color);
  }
  .summary-top,
  .summary-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .balance {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .balance span,
  .totals span {
    color: var(--desc-color);
    font-size: 13px;
  }
  .balance strong {
    font-size: 32px;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .summary-bottom {
    margin-top: 18px;
    flex-wrap: wrap;
  }
  .totals {
    display: flex;
    gap: 32px;
  }
  .totals > div {
    display: grid;
    gap: 5px;
  }
  .totals b {
    font-size: 19px;
    font-variant-numeric: tabular-nums;
  }
  .summary-actions {
    display: flex;
    gap: 8px;
  }
  .summary-disclosure {
    gap: 6px;
    padding: 0 6px;
    color: var(--desc-color);
    background: transparent;
    box-shadow: none;
    border: none;
    &:hover,
    &[aria-expanded='true'] {
      color: var(--workspace-purple-text);
    }
    &:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
  }
  .summary-chevron {
    transition: transform 160ms ease;
  }
  .summary-disclosure[aria-expanded='true'] .summary-chevron {
    transform: rotate(180deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .summary-chevron {
      transition: none;
    }
  }
  .income {
    color: var(--success-color);
  }
  .expense,
  .is-error {
    color: var(--danger-color);
  }
  .summary-state {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 65px;
  }
  .summary-details {
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--card-border-color);
  }
  h3,
  h4 {
    margin: 0 0 12px;
    font-size: 14px;
  }
  h4 {
    color: var(--desc-color);
    font-weight: normal;
  }
  .source-groups {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 32px;
  }
  .source-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 0;
    font-size: 13px;
  }
  .source-row span {
    overflow-wrap: anywhere;
  }
  .source-row b {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .empty,
  .rules-hint {
    color: var(--desc-color);
    font-size: 12px;
  }
  .rules {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin: 16px 0 0;
  }
  .rules dt {
    color: var(--desc-color);
    font-size: 13px;
  }
  .rules dd {
    margin: 4px 0 0;
    font-size: 15px;
  }
  @media (max-width: 767px) {
    .totals {
      gap: 24px;
    }
    .source-groups {
      grid-template-columns: 1fr;
      gap: 20px;
    }
  }
</style>

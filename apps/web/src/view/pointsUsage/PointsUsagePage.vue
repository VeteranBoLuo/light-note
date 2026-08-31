<template>
  <div class="points-usage-page">
    <main class="points-usage-shell">
      <header class="points-usage-hero">
        <BButton class="points-usage-back" @click="goBack">
          <SvgIcon :src="icon.arrow_left" size="16" aria-hidden="true" />
          <span>{{ t('common.back') }}</span>
        </BButton>

        <div class="points-usage-heading">
          <span class="points-usage-heading__icon" aria-hidden="true">
            <SvgIcon :src="icon.growth.coin" size="23" />
          </span>
          <div>
            <h1>{{ t('growth.pointsUsagePageTitle') }}</h1>
            <p>{{ t('growth.pointsUsagePageDescription') }}</p>
          </div>
        </div>
      </header>

      <BCard as="section" class="points-overview-panel" variant="raised" padding="18px 20px" radius="16px">
        <div class="points-overview-panel__head">
          <div>
            <h2>{{ t('growth.pointsUsageOverviewTitle') }}</h2>
            <p>{{ t('growth.pointsUsageOverviewDescription') }}</p>
          </div>
          <BButton size="small" @click="openRewards">{{ t('growth.pointsUsageExchangeAction') }}</BButton>
        </div>

        <div v-if="summary" class="points-usage-metrics">
          <BCard
            v-for="metric in metrics"
            :key="metric.key"
            as="article"
            class="points-usage-metric"
            variant="panel"
            padding="12px 13px"
            radius="11px"
          >
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <small>{{ metric.hint }}</small>
          </BCard>
        </div>
        <div v-else class="points-overview-state" :class="{ 'is-error': loadFailed }" role="status">
          <template v-if="loadFailed">
            <SvgIcon :src="icon.message.warning" size="20" aria-hidden="true" />
            <span>{{ t('growth.pointsCenterLoadFailed') }}</span>
            <BButton size="small" @click="loadSummary">{{ t('common.retry') }}</BButton>
          </template>
          <BLoading v-else inline loading :title="t('common.loading')" />
        </div>
      </BCard>

      <BCard as="section" class="points-ledger-panel" padding="18px 20px" radius="16px">
        <PointsLedger />
        <p class="points-ledger-note">
          <SvgIcon :src="icon.message.info" size="15" aria-hidden="true" />
          {{ t('growth.pointsUsageSettlementHint') }}
        </p>
      </BCard>
    </main>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import growthApi from '@/api/growthApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import PointsLedger from '@/components/growth/PointsLedger.vue';
  import icon from '@/config/icon';

  const { t, locale } = useI18n();
  const router = useRouter();
  const summary = ref<any>(null);
  const loadFailed = ref(false);

  function formatNumber(value: unknown) {
    return Number(value || 0).toLocaleString(locale.value);
  }

  function formatSpent(value: unknown) {
    const amount = Number(value || 0);
    return amount > 0 ? `-${amount.toLocaleString(locale.value)}` : '0';
  }

  const metrics = computed(() => [
    {
      key: 'balance',
      label: t('growth.pointsCenterBalance'),
      value: formatNumber(summary.value?.balance),
      hint: t('growth.pointsUsageBalanceHint'),
    },
    {
      key: 'today',
      label: t('growth.pointsUsageTodayEarned'),
      value: `+${formatNumber(summary.value?.today?.stableEarned)}`,
      hint: t('growth.pointsUsageStableHint'),
    },
    {
      key: 'week',
      label: t('growth.pointsUsageWeekEarned'),
      value: `+${formatNumber(summary.value?.week?.stableEarned)}`,
      hint: t('growth.pointsUsageStableHint'),
    },
    {
      key: 'spent',
      label: t('growth.pointsUsageWeekSpent'),
      value: formatSpent(summary.value?.week?.spent),
      hint: t('growth.pointsUsageSpentHint'),
    },
  ]);

  async function loadSummary() {
    loadFailed.value = false;
    try {
      const response = await growthApi.getPointsSummary();
      if (response?.status !== 200) throw new Error('POINTS_SUMMARY_FAILED');
      summary.value = response.data;
    } catch {
      loadFailed.value = true;
    }
  }

  function openRewards() {
    void router.push({ path: '/growth', query: { section: 'rewards', reward: 'shop' } });
  }

  function goBack() {
    if (window.history.length > 1) router.back();
    else void router.push({ path: '/growth', query: { section: 'rewards', reward: 'ledger' } });
  }

  onMounted(() => void loadSummary());
</script>

<style scoped lang="less">
  .points-usage-page {
    height: 100%;
    overflow-y: auto;
    padding: 28px 24px 64px;
    box-sizing: border-box;
    background: var(--background-color);
    color: var(--text-color);
  }

  .points-usage-shell {
    width: min(100%, 920px);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .points-usage-hero {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .points-usage-back.b_btn {
    align-self: flex-start;
    height: 34px;
    gap: 5px;
    padding: 0 12px 0 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    background: transparent;
    color: var(--desc-color);
    font-size: 13px;
  }

  .points-usage-heading {
    display: flex;
    align-items: center;
    gap: 13px;
  }

  .points-usage-heading__icon {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    display: grid;
    place-items: center;
    border-radius: 13px;
    color: #b45309;
    background: #fff7e6;
  }

  .points-usage-heading h1,
  .points-overview-panel__head h2 {
    margin: 0;
    color: var(--text-color);
  }

  .points-usage-heading h1 {
    font-size: 24px;
    font-weight: 700;
  }

  .points-usage-heading p,
  .points-overview-panel__head p {
    margin: 3px 0 0;
    color: var(--desc-color);
    line-height: 1.5;
  }

  .points-usage-heading p {
    font-size: 13px;
  }

  .points-overview-panel,
  .points-ledger-panel {
    --b-card-background: var(--workbench-subcard-bg);
  }

  .points-overview-panel__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 13px;
  }

  .points-overview-panel__head h2 {
    font-size: 15px;
  }

  .points-overview-panel__head p {
    font-size: 12px;
  }

  .points-usage-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 9px;
  }

  .points-usage-metric {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .points-usage-metric span,
  .points-usage-metric small {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.4;
  }

  .points-usage-metric strong {
    color: var(--text-color);
    font-size: 17px;
    font-variant-numeric: tabular-nums;
  }

  .points-overview-state {
    min-height: 92px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    color: var(--desc-color);
  }

  .points-overview-state.is-error {
    border-color: var(--error-color, #c33f47);
    color: var(--error-color, #c33f47);
  }

  .points-ledger-note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 16px 0 0;
    padding-top: 12px;
    border-top: 1px solid var(--surface-divider-color);
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.55;
  }

  @media (hover: hover) and (pointer: fine) {
    .points-usage-back.b_btn:hover {
      border-color: var(--primary-color);
      color: var(--primary-color);
    }
  }

  @media (max-width: 700px) {
    .points-usage-page {
      padding: 16px 14px 48px;
    }

    .points-usage-heading {
      align-items: flex-start;
    }

    .points-usage-heading h1 {
      font-size: 21px;
    }

    .points-usage-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .points-overview-panel__head {
      align-items: center;
    }
  }

  [data-theme='night'] .points-usage-heading__icon {
    color: #f3b44f;
    background: rgba(180, 83, 9, 0.18);
  }

  html.light-note-mobile-rendering .points-usage-heading__icon,
  html.light-note-mobile-rendering .points-overview-state {
    box-shadow: none;
  }
</style>

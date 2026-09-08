<template>
  <div class="today-growth" :class="{ 'today-growth--compact': compact }" :aria-busy="loading">
    <div v-if="loading && !data" class="today-growth__skeleton" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
    <div v-else-if="error && !data" class="today-growth__error" role="alert">
      <SvgIcon :src="icon.message.warning" size="22" />
      <div
        ><strong>{{ t('growth.todayLoadFailed') }}</strong
        ><span>{{ t('growth.todayLoadFailedDesc') }}</span></div
      >
      <BButton size="small" @click="$emit('retry')">{{ t('common.retry') }}</BButton>
    </div>
    <template v-else>
      <header class="today-growth__header">
        <div>
          <span class="today-growth__eyebrow">{{ t('growth.todayEyebrow') }}</span>
          <h2>{{ t('growth.todayTitle') }}</h2>
        </div>
        <BButton
          v-if="Number(data?.count || 0) > 0"
          type="primary"
          size="small"
          :loading="claiming"
          :disabled="readOnly || claiming"
          @click="$emit('claim-all')"
        >
          {{ t('growth.claimAllCount', { n: data?.count || 0 }) }}
        </BButton>
      </header>

      <div class="today-growth__metrics">
        <div class="today-growth__metric">
          <SvgIcon :src="icon.growth.action" size="19" />
          <span>{{ t('growth.todayDailyProgress') }}</span>
          <strong>{{ data?.today?.completed || 0 }}/{{ data?.today?.total || 3 }}</strong>
        </div>
        <div class="today-growth__metric">
          <SvgIcon :src="icon.growth.level" size="19" />
          <span class="today-growth__metric-copy">
            <span>{{ t('growth.todayExpCap') }}</span>
            <small>{{ t('growth.todayExpCapHint') }}</small>
          </span>
          <strong>{{ growth?.dailyExp || 0 }}/{{ growth?.dailyCap || 200 }}</strong>
        </div>
        <div class="today-growth__metric">
          <SvgIcon :src="icon.growth.reward" size="19" />
          <span>{{ t('growth.todayClaimable') }}</span>
          <strong>{{ data?.count || 0 }}</strong>
        </div>
        <div v-if="compact" class="today-growth__metric">
          <SvgIcon :src="icon.growth.reward" size="19" />
          <span>{{ t('growth.lotteryFreeDraw') }}</span>
          <strong>{{ freeDraws }}</strong>
        </div>
        <div v-if="compact" class="today-growth__metric">
          <SvgIcon :src="icon.growth.checkin" size="19" />
          <span>{{ t('growth.streak') }}</span>
          <strong>{{ t('growth.daysVal', { n: growth?.streak || 0 }) }}</strong>
        </div>
        <BButton
          v-if="compact"
          type="primary"
          size="small"
          class="today-growth__claim-compact"
          :loading="claiming"
          :disabled="readOnly || claiming || Number(data?.count || 0) <= 0"
          @click="$emit('claim-all')"
        >
          {{ Number(data?.count || 0) > 0 ? t('growth.claimAllCount', { n: data?.count }) : t('growth.claimAllNone') }}
        </BButton>
      </div>

      <GrowthNextActionCard
        v-if="showNextAction && data?.nextAction"
        class="today-growth__next"
        :next-action="data.nextAction"
        :read-only="readOnly"
        :low-pressure="lowPressure"
        @action="$emit('action', $event)"
        @view-all="$emit('action', 'open_growth_tasks')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import GrowthNextActionCard from '@/components/growth/GrowthNextActionCard.vue';
  import icon from '@/config/icon.ts';
  import type { Growth, GrowthClaimable } from '@/composables/useGrowth.ts';

  withDefaults(
    defineProps<{
      data: GrowthClaimable | null;
      growth: Growth | null;
      loading?: boolean;
      error?: boolean;
      claiming?: boolean;
      readOnly?: boolean;
      lowPressure?: boolean;
      compact?: boolean;
      freeDraws?: number;
      showNextAction?: boolean;
    }>(),
    {
      loading: false,
      error: false,
      claiming: false,
      readOnly: false,
      lowPressure: false,
      compact: false,
      freeDraws: 0,
      showNextAction: true,
    },
  );
  defineEmits<{
    retry: [];
    'claim-all': [];
    action: [action: string];
  }>();
  const { t } = useI18n();
</script>

<style scoped lang="less">
  .today-growth {
    min-height: 150px;
    padding: 18px;
    border: 1px solid var(--card-border-color);
    border-radius: 16px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-color) 8%, var(--workbench-subcard-bg)),
      var(--workbench-subcard-bg)
    );
  }
  .today-growth__header,
  .today-growth__next,
  .today-growth__error {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .today-growth__header {
    justify-content: space-between;
  }
  .today-growth__eyebrow {
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  h2 {
    margin: 2px 0 0;
    color: var(--text-color);
    font-size: 18px;
  }
  .today-growth__metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-top: 15px;
  }
  .today-growth__metric {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--card-border-color);
    border-radius: 11px;
    background: var(--background-color);
    color: var(--primary-color);
  }
  .today-growth__metric > span {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .today-growth__metric-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }
  .today-growth__metric-copy > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .today-growth__metric-copy small {
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.25;
    white-space: normal;
  }
  .today-growth__metric strong {
    color: var(--text-color);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .today-growth__next {
    height: auto;
    margin-top: 12px;
    padding: 11px 12px;
    border-color: var(--primary-color);
    border-radius: 11px;
    background: var(--background-color);
    box-shadow: none;
  }
  .today-growth--compact {
    min-height: 0;
    padding: 10px 12px;
  }
  .today-growth--compact .today-growth__header {
    display: none;
  }
  .today-growth--compact .today-growth__metrics {
    grid-template-columns: repeat(5, minmax(0, 1fr)) auto;
    gap: 7px;
    margin-top: 0;
  }
  .today-growth--compact .today-growth__metric {
    min-height: 38px;
    box-sizing: border-box;
    padding: 6px 8px;
  }
  .today-growth--compact .today-growth__metric-copy small {
    display: none;
  }
  .today-growth--compact .today-growth__claim-compact {
    align-self: center;
    white-space: nowrap;
  }
  .today-growth__error {
    min-height: 110px;
    justify-content: center;
    color: var(--warning-color, #b7791f);
  }
  .today-growth__error div {
    display: flex;
    flex-direction: column;
  }
  .today-growth__error span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .today-growth__skeleton {
    display: grid;
    gap: 12px;
  }
  .today-growth__skeleton span {
    height: 26px;
    border-radius: 9px;
    background: linear-gradient(90deg, var(--hover-background), var(--card-border-color), var(--hover-background));
    background-size: 200% 100%;
    animation: today-growth-shimmer 1.2s linear infinite;
  }
  .today-growth__skeleton span:nth-child(2) {
    height: 52px;
  }
  .today-growth__skeleton span:nth-child(3) {
    height: 44px;
  }
  @keyframes today-growth-shimmer {
    to {
      background-position: -200% 0;
    }
  }
  @media (max-width: 640px) {
    .today-growth {
      padding: 15px;
    }
    .today-growth__metrics {
      grid-template-columns: 1fr;
    }
    .today-growth__next {
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .today-growth__next .b_btn {
      margin-left: 50px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .today-growth__skeleton span {
      animation: none;
    }
  }
  html.light-note-mobile-rendering .today-growth__next {
    border-color: var(--primary-color);
    box-shadow: none;
  }
</style>

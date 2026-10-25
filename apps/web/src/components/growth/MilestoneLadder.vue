<template>
  <div class="ml">
    <header class="ml-head">
      <h2>{{ t('growth.milestoneLadderTitle') }}</h2>
      <span class="ml-current-label">{{ t('growth.milestoneCurrent') }}</span>
      <div class="ml-current"
        ><strong>{{ streak }}</strong
        ><span>{{ t('growth.milestoneDayN', { n: '' }).trim() }}</span></div
      >
      <p class="ml-next">{{
        next
          ? t('growth.milestoneNext', { target: next.days, remaining: Math.max(0, next.days - streak) })
          : t('growth.milestoneComplete')
      }}</p>
    </header>
    <div class="ml-track" :style="{ '--stops': ordered.length }">
      <div class="ml-line" aria-hidden="true"><span :style="{ width: railProgress + '%' }"></span></div>
      <div
        v-for="m in ordered"
        :key="m.days"
        class="ml-node"
        :class="{ reached: m.reached, next: next?.days === m.days }"
      >
        <AchievementEmblem
          :achievement-key="`streak_${m.days}`"
          group="checkin"
          :size="dimension(72, 'layout')"
          :animated="animated && m.reached"
          :locked="!m.reached && next?.days !== m.days"
        />
        <span class="ml-stop" aria-hidden="true"
          ><SvgIcon v-if="m.reached" :src="icon.filterPanel.check" size="12"
        /></span>
        <strong class="ml-day">{{ t('growth.milestoneDayN', { n: m.days }) }}</strong>
        <span class="ml-state">{{
          m.reached
            ? t('growth.milestoneReached')
            : next?.days === m.days
              ? t('growth.milestoneNextStop')
              : t('growth.milestoneRemaining', { n: Math.max(0, m.days - streak) })
        }}</span>
        <div class="ml-rewards">
          <span><SvgIcon :src="icon.growth.coin" size="12" />{{ m.points }}</span>
          <span v-if="m.storageMb"><SvgIcon :src="icon.growth.storage" size="12" />{{ fmtMb(m.storageMb) }}</span>
          <span v-if="m.cards"
            ><SvgIcon :src="icon.growth.reward" size="12" />{{ t('growth.prizeCard', { n: m.cards }) }}</span
          >
        </div>
      </div>
    </div>
    <div class="ml-hint" :title="t('growth.milestoneLadderHint')">
      <p>{{ t('growth.milestoneRuleShort') }}</p
      ><p>{{ t('growth.milestoneRuleState') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUiDensity } from '@/composables/useUiDensity';
  import type { StreakMilestone } from '@/composables/useGrowth';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AchievementEmblem from './AchievementEmblem.vue';
  import icon from '@/config/icon';
  const { t } = useI18n();
  const { dimension } = useUiDensity();
  const props = withDefaults(
    defineProps<{ milestones: StreakMilestone[]; currentStreak?: number; animated?: boolean }>(),
    { animated: true },
  );
  const streak = computed(() => Math.max(0, Number(props.currentStreak) || 0));
  const ordered = computed(() => [...props.milestones].sort((a, b) => a.days - b.days));
  const next = computed(() => ordered.value.find((m) => m.days > streak.value));
  // Stations are equally spaced, so interpolate inside the current interval, not against 365.
  const railProgress = computed(() => {
    const stops = ordered.value;
    if (stops.length < 2 || streak.value < stops[0].days) return 0;
    const index = stops.findIndex((m) => m.days > streak.value);
    if (index < 0) return 100;
    const previous = stops[index - 1].days;
    return ((index - 1 + (streak.value - previous) / (stops[index].days - previous)) / (stops.length - 1)) * 100;
  });
  const fmtMb = (mb: number) => (mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`);
</script>

<style scoped lang="less">
  .ml {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-20, 20px);
    min-width: 0;
    height: 100%;
  }
  .ml-head h2 {
    margin: 0 0 var(--ui-space-14, 14px);
    font-size: var(--ui-font-17, 17px);
    font-weight: 700;
    color: var(--text-color);
  }
  .ml-current-label {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .ml-current {
    display: flex;
    align-items: baseline;
    gap: var(--ui-space-8, 8px);
    color: var(--workspace-purple-text, var(--primary-color));
    font-variant-numeric: tabular-nums;
  }
  .ml-current strong {
    font-size: var(--ui-layout-54, 54px);
    line-height: 1.12;
    letter-spacing: -0.04em;
    font-weight: 750;
  }
  .ml-current span {
    font-size: var(--ui-font-16, 16px);
  }
  .ml-next {
    margin: var(--ui-space-6, 6px) 0 0;
    color: var(--workspace-purple-text, var(--primary-color));
    font-size: var(--ui-font-13, 13px);
  }
  .ml-track {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--stops), minmax(0, 1fr));
    gap: 0;
  }
  .ml-node {
    position: relative;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    text-align: center;
  }
  .ml-node > .achievement-emblem {
    max-width: 100%;
  }
  .ml-line {
    position: absolute;
    top: calc(var(--ui-layout-72, 72px) + var(--ui-space-6, 6px) + var(--ui-layout-20, 20px) / 2 - 2px);
    left: calc(50% / var(--stops));
    right: calc(50% / var(--stops));
    height: var(--ui-space-4, 4px);
    background: var(--card-border-color);
    border-radius: 999px;
    overflow: hidden;
  }
  .ml-line span {
    display: block;
    height: 100%;
    background: var(--primary-color);
    transition: width 0.4s ease;
  }
  .ml-stop {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-layout-20, 20px);
    height: var(--ui-layout-20, 20px);
    box-sizing: border-box;
    border: 3px solid var(--card-border-color);
    border-radius: 50%;
    background: var(--background-color);
    color: #fff;
    box-shadow: 0 0 0 4px var(--background-color);
  }
  .reached .ml-stop {
    background: var(--primary-color);
    border-color: var(--primary-color);
  }
  .next .ml-stop {
    border-color: var(--primary-color);
  }
  .ml-day {
    max-width: 100%;
    box-sizing: border-box;
    padding-inline: var(--ui-space-3, 3px);
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
  }
  .ml-state {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .reached .ml-state,
  .next .ml-state {
    color: var(--workspace-purple-text, var(--primary-color));
    font-weight: 600;
  }
  .ml-rewards {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .ml-rewards span {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--ui-space-3, 3px);
    flex-wrap: wrap;
  }
  .ml-hint {
    margin-top: auto;
    padding-top: var(--ui-space-12, 12px);
    border-top: 1px solid var(--card-border-color);
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    line-height: 1.6;
  }
  .ml-hint p {
    margin: 0;
  }
  .ml-hint p + p {
    margin-top: var(--ui-space-4, 4px);
  }
  @media (max-width: 767px) {
    .ml {
      gap: var(--ui-space-16, 16px);
    }
    .ml-current strong {
      font-size: var(--ui-font-40, 40px);
    }
    .ml-rewards {
      font-size: var(--ui-font-10, 10px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ml-line span {
      transition: none;
    }
  }
</style>

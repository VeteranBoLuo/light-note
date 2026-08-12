<template>
  <div class="ml">
    <div class="ml-head">
      <div class="ml-title"><SvgIcon :src="icon.growth.rank" size="16" /> {{ t('growth.milestoneLadderTitle') }}</div>
      <div class="ml-hint">{{ t('growth.milestoneLadderHint') }}</div>
    </div>
    <div class="ml-track">
      <div v-for="m in milestones" :key="m.days" class="ml-node" :class="{ reached: m.reached }">
        <div class="ml-day">{{ t('growth.milestoneDayN', { n: m.days }) }}</div>
        <div class="ml-rewards">
          <span class="ml-rw"><SvgIcon :src="icon.growth.coin" size="12" /> {{ m.points }}</span>
          <span v-if="m.storageMb" class="ml-rw"><SvgIcon :src="icon.growth.storage" size="12" /> {{ fmtMb(m.storageMb) }}</span>
          <span v-if="m.cards" class="ml-rw"><SvgIcon :src="icon.growth.reward" size="12" /> {{ m.cards }}</span>
        </div>
        <div class="ml-state">
          <span v-if="m.reached" class="ml-reached"><SvgIcon :src="icon.filterPanel.check" size="12" /> {{ t('growth.milestoneReached') }}</span>
          <span v-else class="ml-remain">{{ Math.max(0, m.days - (currentStreak || 0)) }}d</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { StreakMilestone } from '@/composables/useGrowth.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const { t } = useI18n();
  defineProps<{ milestones: StreakMilestone[]; currentStreak?: number }>();

  const fmtMb = (mb: number) => (mb >= 1024 ? `${+(mb / 1024).toFixed(1)}G` : `${mb}M`);
</script>

<style scoped lang="less">
  .ml {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ml-title {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 15px;
    font-weight: 700;
  }
  .ml-hint {
    margin-top: 3px;
    font-size: 12px;
    color: var(--desc-color);
  }
  .ml-track {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  @media (max-width: 560px) {
    .ml-track {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .ml-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 8px;
    border-radius: 12px;
    background: var(--background-color);
    border: 1px solid color-mix(in srgb, var(--card-border-color) 45%, transparent);
    text-align: center;
  }
  .ml-node.reached {
    border-color: color-mix(in srgb, #f59e0b 55%, transparent);
    background: color-mix(in srgb, #f59e0b 8%, var(--background-color));
  }
  .ml-day {
    font-size: 14px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .ml-rewards {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11.5px;
    color: var(--desc-color);
  }
  .ml-rw {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    white-space: nowrap;
  }
  .ml-state {
    margin-top: 2px;
    font-size: 11px;
  }
  .ml-reached {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: #d97706;
    font-weight: 700;
  }
  :global(html.light-note-mobile-rendering) .ml-node.reached {
    border-color: #d97706;
  }
  .ml-remain {
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
</style>

<template>
  <div class="achievement-collection">
    <header class="ac-heading">
      <h1>{{ t('growth.achievementCollectionTitle') }}</h1>
      <span>{{ t('growth.achUnlocked', { n: unlockedCount, total: totalAchievements }) }}</span>
      <span v-if="claimableCount" class="ac-claimable">{{ t('growth.achClaimableN', { n: claimableCount }) }}</span>
    </header>
    <div
      v-if="milestones.length || (showHighlights && achievements.length)"
      class="ac-overview"
      :class="{ 'ac-overview--split': milestones.length && showHighlights && achievements.length }"
    >
      <section v-if="milestones.length" class="ac-panel"
        ><MilestoneLadder :milestones="milestones" :current-streak="currentStreak" :animated="animated"
      /></section>
      <section v-if="showHighlights && achievements.length" class="ac-panel ac-feature"
        ><AchievementHighlights :achievements="achievements" :animated="animated" @select="wall?.openDetail($event)"
      /></section>
    </div>
    <section class="ac-panel ac-wall">
      <AchievementWall
        ref="wall"
        :achievements="achievements"
        :unlocked-count="unlockedCount"
        :total-achievements="totalAchievements"
        :claimable-count="claimableCount"
        :claiming-key="claimingKey"
        :read-only="readOnly"
        :animated="animated"
        :show-heading="false"
        @claim="emit('claim', $event)"
      />
    </section>
  </div>
</template>
<script setup lang="ts">
  import { ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { Achievement, StreakMilestone } from '@/composables/useGrowth';
  import MilestoneLadder from './MilestoneLadder.vue';
  import AchievementHighlights from './AchievementHighlights.vue';
  import AchievementWall from './AchievementWall.vue';
  withDefaults(
    defineProps<{
      achievements: Achievement[];
      milestones: StreakMilestone[];
      currentStreak: number;
      unlockedCount: number;
      totalAchievements: number;
      claimableCount?: number;
      claimingKey?: string | null;
      readOnly?: boolean;
      animated?: boolean;
      showHighlights?: boolean;
    }>(),
    { readOnly: false, animated: true, showHighlights: true },
  );
  const emit = defineEmits<{ claim: [key: string] }>();
  const { t } = useI18n();
  const wall = ref<InstanceType<typeof AchievementWall> | null>(null);
</script>
<style scoped lang="less">
  .achievement-collection {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-18, 18px);
    min-width: 0;
    flex: 0 0 auto;
  }
  .ac-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--ui-space-12, 12px);
  }
  .ac-heading h1 {
    margin: 0;
    color: var(--text-color);
    font-size: var(--ui-font-24, 24px);
    line-height: 1.4;
  }
  .ac-heading span {
    color: var(--workspace-purple-text, var(--primary-color));
    font-size: var(--ui-font-13, 13px);
    font-variant-numeric: tabular-nums;
  }
  .ac-heading .ac-claimable {
    margin-left: auto;
    color: var(--warning-color);
  }
  .ac-overview {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--ui-space-16, 16px);
  }
  .ac-overview--split {
    grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
  }
  .ac-panel {
    min-width: 0;
    border: 1px solid var(--card-border-color);
    border-radius: 16px;
    background: var(--workbench-subcard-bg);
    padding: var(--ui-space-20, 20px);
  }
  .ac-feature {
    background: linear-gradient(
      140deg,
      var(--workbench-subcard-bg),
      color-mix(in srgb, var(--primary-color) 5%, var(--workbench-subcard-bg))
    );
  }
  @media (max-width: 1199px) {
    .ac-overview--split {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 767px) {
    .ac-panel {
      padding: var(--ui-space-14, 14px);
    }
  }
</style>

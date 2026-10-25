<template>
  <section v-if="recent.length || near.length" class="achievement-highlights">
    <BTabs v-model:active-tab="active" variant="line" :options="options" />
    <template v-if="selected.length">
      <BButton
        class="achievement-highlights__hero"
        :style="achievementVisualStyle(selected[0].key, selected[0].group)"
        @click="emit('select', selected[0])"
      >
        <AchievementEmblem
          :key="selected[0].key"
          :achievement-key="selected[0].key"
          :group="selected[0].group"
          :size="dimension(180, 'layout')"
          :locked="!selected[0].unlocked"
          :animated="animated"
        />
        <strong>{{ t(`growth.achName.${selected[0].key}`) }}</strong>
        <span>{{ t(`growth.achDesc.${selected[0].key}`) }}</span>
        <small>{{
          selected[0].unlocked
            ? formatTime(selected[0].unlockedAt)
            : `${Math.min(selected[0].cur, selected[0].target)} / ${selected[0].target}`
        }}</small>
      </BButton>
      <div class="achievement-highlights__others">
        <BButton
          v-for="item in selected.slice(1)"
          :key="item.key"
          class="achievement-highlights__item"
          @click="emit('select', item)"
        >
          <AchievementEmblem
            :achievement-key="item.key"
            :group="item.group"
            :size="dimension(36, 'layout')"
            :locked="!item.unlocked"
          />
          <span
            ><strong>{{ t(`growth.achName.${item.key}`) }}</strong
            ><small>{{
              item.unlocked ? formatTime(item.unlockedAt) : `${Math.min(item.cur, item.target)} / ${item.target}`
            }}</small></span
          >
        </BButton>
      </div>
    </template>
    <p v-else>{{ t(active === 'recent' ? 'growth.recentUnlockedEmpty' : 'growth.nearestAchievementEmpty') }}</p>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUiDensity } from '@/composables/useUiDensity';
  import AchievementEmblem from './AchievementEmblem.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import { achievementVisualStyle } from '@/config/achievements';
  import type { Achievement } from '@/composables/useGrowth';
  const props = withDefaults(defineProps<{ achievements: Achievement[]; animated?: boolean }>(), { animated: true });
  const emit = defineEmits<{ select: [achievement: Achievement] }>();
  const { t, locale } = useI18n();
  const { dimension } = useUiDensity();
  const active = ref(props.achievements.some((item) => item.unlocked) ? 'recent' : 'near');
  const options = computed(() => [
    { key: 'recent', label: t('growth.recentUnlockedTitle') },
    { key: 'near', label: t('growth.nearestAchievementTitle') },
  ]);
  const progress = (item: Achievement) => (item.target ? Math.min(100, (item.cur / item.target) * 100) : 0);
  const time = (value?: string | null) => {
    const number = value ? Date.parse(value) : 0;
    return Number.isFinite(number) ? number : 0;
  };
  const recent = computed(() =>
    props.achievements
      .filter((item) => item.unlocked)
      .sort((a, b) => time(b.unlockedAt) - time(a.unlockedAt) || a.key.localeCompare(b.key))
      .slice(0, 3),
  );
  const near = computed(() =>
    props.achievements
      .filter((item) => !item.unlocked)
      .sort((a, b) => progress(b) - progress(a) || a.target - b.target)
      .slice(0, 3),
  );
  const selected = computed(() => (active.value === 'recent' ? recent.value : near.value));
  function formatTime(value?: string | null) {
    return time(value)
      ? new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(new Date(value!))
      : t('growth.achievementUnlocked');
  }
</script>

<style scoped lang="less">
  .achievement-highlights {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
    height: 100%;
  }
  .achievement-highlights__hero.b_btn {
    flex: 1;
    width: 100%;
    height: auto;
    line-height: 1.5;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
    padding: var(--ui-space-10, 10px);
    border: 0;
    border-radius: 12px;
    white-space: normal;
    background: radial-gradient(
      ellipse at 50% 35%,
      color-mix(in srgb, var(--achievement-accent) 13%, transparent),
      transparent 68%
    );
    color: var(--text-color);
  }
  .achievement-highlights__hero strong {
    font-size: var(--ui-font-20, 20px);
  }
  .achievement-highlights__hero span,
  .achievement-highlights__hero small {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .achievement-highlights__others {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-8, 8px);
    border-top: 1px solid var(--card-border-color);
    padding-top: var(--ui-space-10, 10px);
  }
  .achievement-highlights__item.b_btn {
    display: flex;
    min-width: 0;
    width: 100%;
    height: auto;
    gap: var(--ui-space-6, 6px);
    padding: var(--ui-space-4, 4px);
    border: 0;
    background: transparent;
    text-align: left;
    justify-content: flex-start;
    line-height: 1.5;
  }
  .achievement-highlights__item > span {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .achievement-highlights__item strong {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--ui-font-11, 11px);
  }
  .achievement-highlights__item small,
  p {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .b_btn:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  @media (max-width: 767px) {
    .achievement-highlights :deep(.tab) {
      min-width: 0;
      white-space: normal;
      line-height: 1.4;
    }
    .achievement-highlights__hero.b_btn {
      display: grid;
      grid-template-columns: var(--ui-layout-120, 120px) minmax(0, 1fr);
      column-gap: var(--ui-space-12, 12px);
      text-align: left;
    }
    .achievement-highlights__hero > .achievement-emblem {
      grid-row: 1 / 4;
      width: var(--ui-layout-120, 120px);
      height: var(--ui-layout-120, 120px);
    }
    .achievement-highlights__hero > strong {
      align-self: end;
      font-size: var(--ui-font-18, 18px);
    }
    .achievement-highlights__hero > small {
      align-self: start;
    }
  }
</style>

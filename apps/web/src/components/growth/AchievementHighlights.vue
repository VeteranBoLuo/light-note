<template>
  <div v-if="recent.length || near.length" class="achievement-highlights">
    <section>
      <h2><SvgIcon :src="icon.growth.level" size="17" />{{ t('growth.recentUnlockedTitle') }}</h2>
      <div v-if="recent.length" class="achievement-highlights__list">
        <article v-for="item in recent" :key="item.key">
          <AchievementEmblem :achievement-key="item.key" :group="item.group" :size="34" />
          <div><strong>{{ t(`growth.achName.${item.key}`) }}</strong><span>{{ formatTime(item.unlockedAt) }}</span></div>
        </article>
      </div>
      <p v-else>{{ t('growth.recentUnlockedEmpty') }}</p>
    </section>
    <section>
      <h2><SvgIcon :src="icon.growth.action" size="17" />{{ t('growth.nearestAchievementTitle') }}</h2>
      <div v-if="near.length" class="achievement-highlights__list">
        <article v-for="item in near" :key="item.key">
          <AchievementEmblem :achievement-key="item.key" :group="item.group" :size="34" locked />
          <div>
            <strong>{{ t(`growth.achName.${item.key}`) }}</strong>
            <span>{{ Math.min(item.cur, item.target) }}/{{ item.target }} · {{ progress(item) }}%</span>
          </div>
        </article>
      </div>
      <p v-else>{{ t('growth.nearestAchievementEmpty') }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import AchievementEmblem from '@/components/growth/AchievementEmblem.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import type { Achievement } from '@/composables/useGrowth.ts';

  const props = defineProps<{ achievements: Achievement[] }>();
  const { t, locale } = useI18n();
  const progress = (item: Achievement) => (item.target ? Math.min(100, Math.round((item.cur / item.target) * 100)) : 0);
  const recent = computed(() =>
    props.achievements
      .filter((item) => item.unlocked)
      .sort((left, right) => {
        const leftTime = left.unlockedAt ? new Date(left.unlockedAt).getTime() : 0;
        const rightTime = right.unlockedAt ? new Date(right.unlockedAt).getTime() : 0;
        return rightTime - leftTime || left.key.localeCompare(right.key);
      })
      .slice(0, 3),
  );
  const near = computed(() =>
    props.achievements
      .filter((item) => !item.unlocked)
      .sort((left, right) => progress(right) - progress(left) || left.target - right.target)
      .slice(0, 3),
  );
  function formatTime(value?: string | null) {
    if (!value) return t('growth.achievementUnlocked');
    return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(new Date(value));
  }
</script>

<style scoped lang="less">
  .achievement-highlights { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  section { min-width: 0; padding: 14px; border: 1px solid var(--card-border-color); border-radius: 13px; background: var(--workbench-subcard-bg); }
  h2 { display: flex; align-items: center; gap: 7px; margin: 0 0 10px; color: var(--text-color); font-size: 14px; }
  h2 :deep(svg) { color: var(--primary-color); }
  .achievement-highlights__list { display: flex; flex-direction: column; gap: 8px; }
  article { display: flex; align-items: center; gap: 9px; min-width: 0; }
  article > div { display: flex; min-width: 0; flex-direction: column; }
  strong { overflow: hidden; color: var(--text-color); font-size: 12.5px; text-overflow: ellipsis; white-space: nowrap; }
  span, p { margin: 0; color: var(--desc-color); font-size: 11.5px; }
  @media (max-width: 640px) { .achievement-highlights { grid-template-columns: 1fr; } }
</style>

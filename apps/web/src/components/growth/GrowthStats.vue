<template>
  <div class="gs">
    <div class="gs-hero">
      <span class="gs-hero-icon" aria-hidden="true"><SvgIcon :src="icon.common.calendar" size="28" /></span>
      <div class="gs-hero-text">
        <div class="gs-hero-main" v-html="t('growth.companionDays', { n: `<b>${stats.joinDays}</b>` })"></div>
        <div class="gs-hero-sub">{{ t('growth.companionSub') }}</div>
      </div>
    </div>

    <div class="gs-grid">
      <div v-for="tile in tiles" :key="tile.key" class="gs-tile">
        <span class="gs-tile-icon" aria-hidden="true"><SvgIcon :src="tile.icon" size="18" /></span>
        <b class="gs-tile-val">{{ tile.val }}</b>
        <span class="gs-tile-label">{{ tile.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { GrowthStats } from '@/composables/useGrowth.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const props = defineProps<{ stats: GrowthStats }>();
  const { t } = useI18n();

  const tiles = computed(() => [
    { key: 'checkins', icon: icon.growth.checkin, val: props.stats.totalCheckins, label: t('growth.statTotalCheckins') },
    { key: 'maxStreak', icon: icon.growth.tenure, val: props.stats.maxStreak, label: t('growth.statMaxStreak') },
    { key: 'weekExp', icon: icon.growth.level, val: props.stats.weekExp, label: t('growth.statWeekExp') },
    { key: 'bookmarks', icon: icon.resource.bookmark, val: props.stats.bookmarkCount, label: t('growth.statBookmarks') },
    { key: 'notes', icon: icon.resource.note, val: props.stats.noteCount, label: t('growth.statNotes') },
    { key: 'files', icon: icon.resource.file, val: props.stats.fileCount, label: t('growth.statFiles') },
    { key: 'tags', icon: icon.resource.tag, val: props.stats.tagCount, label: t('growth.statTags') },
    { key: 'todos', icon: icon.growth.action, val: props.stats.completedTodoCount, label: t('growth.statTodos') },
    {
      key: 'organized',
      icon: icon.growth.organize,
      val: props.stats.organizedResourceCount,
      label: t('growth.statOrganized'),
    },
  ]);
</script>

<style scoped lang="less">
  .gs {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .gs-hero {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border-radius: 12px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-color) 12%, transparent),
      color-mix(in srgb, var(--primary-color) 4%, transparent)
    );
    border: 1px solid color-mix(in srgb, var(--primary-color) 22%, transparent);
  }
  .gs-hero-icon {
    display: grid;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    color: var(--primary-color);
  }
  .gs-hero-text {
    min-width: 0;
  }
  .gs-hero-main {
    font-size: 15px;
    color: var(--text-color);
  }
  .gs-hero-main :deep(b) {
    font-size: 22px;
    font-weight: 800;
    color: var(--primary-color);
    margin: 0 3px;
    font-variant-numeric: tabular-nums;
  }
  .gs-hero-sub {
    font-size: 12px;
    color: var(--desc-color);
    margin-top: 2px;
  }
  .gs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
    gap: 10px;
  }
  .gs-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 12px 8px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 4%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--card-border-color) 38%, transparent);
  }
  .gs-tile-icon {
    font-size: 18px;
    line-height: 1;
  }
  .gs-tile-val {
    font-size: 18px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--text-color);
  }
  .gs-tile-label {
    font-size: 11.5px;
    color: var(--desc-color);
  }
</style>

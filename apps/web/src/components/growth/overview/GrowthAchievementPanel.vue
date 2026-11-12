<template>
  <section class="ach-panel" :class="{ 'ach-panel--stacked': stacked }" :aria-label="t('growth.mobileTabAchievements')">
    <header class="ach-panel__head">
      <h3>{{ t('growth.mobileTabAchievements') }}</h3>
      <span class="ach-panel__count">{{
        t('growth.overview.achUnlocked', { n: unlockedCount, total: totalCount })
      }}</span>
      <span v-if="claimableCount > 0" class="ach-panel__claimable">{{
        t('growth.overview.achClaimable', { n: claimableCount })
      }}</span>
      <BButton type="text" size="small" class="ach-panel__all" @click="$emit('open')">
        {{ t('growth.overview.viewAll') }}<SvgIcon :src="icon.arrow_right" size="12" />
      </BButton>
    </header>

    <div v-if="ranked.recent.length" class="ach-panel__recent">
      <BButton
        v-for="item in ranked.recent"
        :key="item.key"
        class="ach-panel__badge"
        :aria-label="achievementName(item.key)"
        @click="$emit('open')"
      >
        <span v-if="item.claimable" class="ach-panel__tag">{{ t('growth.overview.achClaimTag') }}</span>
        <AchievementEmblem :achievement-key="item.key" :group="item.group" :size="emblemSize" />
        <b>{{ achievementName(item.key) }}</b>
        <small>{{ formatDate(item.unlockedAt) }}</small>
      </BButton>
    </div>
    <p v-else class="ach-panel__empty">{{ t('growth.overview.achEmpty') }}</p>

    <div v-if="nearList.length" class="ach-panel__near">
      <h4>{{ t('growth.nearestAchievementTitle') }}</h4>
      <div v-for="item in nearList" :key="item.key" class="ach-panel__near-item">
        <AchievementEmblem :achievement-key="item.key" :group="item.group" :size="smallEmblemSize" locked />
        <div class="ach-panel__near-body">
          <div class="ach-panel__near-title">
            <b>{{ achievementName(item.key) }}</b>
            <span>{{ fmt(Math.min(item.cur, item.target)) }}/{{ fmt(item.target) }}</span>
          </div>
          <small>{{ achievementDesc(item.key) }}</small>
          <BProgress
            :percent="item.target ? (Math.min(item.cur, item.target) / item.target) * 100 : 0"
            size="small"
            :show-info="false"
            :aria-label="`${achievementName(item.key)} ${Math.min(item.cur, item.target)}/${item.target}`"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AchievementEmblem from '@/components/growth/AchievementEmblem.vue';
  import icon from '@/config/icon.ts';
  import { useUiDensity } from '@/composables/useUiDensity';
  import { rankAchievements } from '@/utils/growthOverview';
  import type { Achievement } from '@/composables/useGrowth.ts';

  const props = withDefaults(
    defineProps<{
      achievements: Achievement[];
      unlockedCount: number;
      totalCount: number;
      claimableCount?: number;
      stacked?: boolean;
    }>(),
    { claimableCount: 0, stacked: false },
  );
  defineEmits<{ open: [] }>();
  const { t, te, locale } = useI18n();
  const { dimension } = useUiDensity();

  const emblemSize = computed(() => dimension(props.stacked ? 48 : 56, 'layout'));
  const smallEmblemSize = computed(() => dimension(36, 'layout'));
  const ranked = computed(() => rankAchievements(props.achievements));
  // 有最近解锁时只保留最接近的一枚；新用户把两枚最容易拿到的成就作为起点。
  const nearList = computed(() => ranked.value.near.slice(0, ranked.value.recent.length ? 1 : 2));
  const fmt = (value: number) => Number(value || 0).toLocaleString('en-US');

  function achievementName(key: string) {
    const name = `growth.achName.${key}`;
    return te(name) ? t(name) : key;
  }
  function achievementDesc(key: string) {
    const desc = `growth.achDesc.${key}`;
    return te(desc) ? t(desc) : '';
  }
  function formatDate(value?: string | null) {
    const time = value ? Date.parse(value) : NaN;
    return Number.isFinite(time)
      ? new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(new Date(time))
      : t('growth.achievementUnlocked');
  }
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';

  .ach-panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
  }
  .ach-panel__head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: .ui-space(6px) [] .ui-space(10px) [];
    margin-bottom: .ui-space(12px) [];
  }
  .ach-panel__head h3 {
    margin: 0;
    color: var(--text-color);
    font-size: .ui-font(16px) [];
    font-weight: 700;
  }
  .ach-panel__count {
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .ach-panel__claimable,
  .ach-panel__tag {
    padding: 0 .ui-space(7px) [];
    border: 1px solid var(--warning-color);
    border-radius: 999px;
    color: var(--warning-color);
    font-size: .ui-font(12px) [];
    font-weight: 600;
    line-height: 1.6;
    white-space: nowrap;
  }
  .ach-panel__all.b_btn {
    gap: .ui-space(2px) [];
    height: auto;
    margin-left: auto;
    padding: 0;
    color: var(--primary-color);
    font-weight: 600;
  }
  .ach-panel__recent {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: .ui-space(6px) [];
  }
  .ach-panel__badge.b_btn {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: .ui-space(6px) [];
    height: auto;
    min-width: 0;
    padding: .ui-space(10px) [] .ui-space(4px) [] .ui-space(8px) [];
    border: 0;
    border-radius: 12px;
    background: transparent;
    line-height: 1.4;
  }
  .ach-panel__badge.b_btn:hover {
    background: var(--surface-card-hover-bg);
  }
  .ach-panel__badge b {
    max-width: 100%;
    overflow: hidden;
    color: var(--text-color);
    font-size: .ui-font(13px) [];
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ach-panel__badge small {
    color: var(--desc-color);
    font-size: .ui-font(11px) [];
  }
  .ach-panel__tag {
    position: absolute;
    top: .ui-space(2px) [];
    right: .ui-space(4px) [];
    z-index: 1;
    background: var(--surface-card-bg);
    font-size: .ui-font(11px) [];
  }
  .ach-panel__empty {
    margin: 0;
    padding: .ui-space(4px) [] 0 .ui-space(12px) [];
    color: var(--desc-color);
    font-size: .ui-font(13px) [];
    line-height: 1.6;
  }
  .ach-panel__near {
    margin-top: auto;
    padding-top: .ui-space(14px) [];
    border-top: 1px solid var(--surface-divider-color);
  }
  .ach-panel__near h4 {
    margin: 0 0 .ui-space(10px) [];
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    font-weight: 600;
  }
  .ach-panel__near-item {
    display: flex;
    align-items: center;
    gap: .ui-space(12px) [];
  }
  .ach-panel__near-item + .ach-panel__near-item {
    margin-top: .ui-space(12px) [];
  }
  .ach-panel__near-body {
    flex: 1;
    min-width: 0;
  }
  .ach-panel__near-title {
    display: flex;
    justify-content: space-between;
    gap: .ui-space(8px) [];
    font-size: .ui-font(13px) [];
  }
  .ach-panel__near-title b {
    color: var(--text-color);
    font-weight: 600;
  }
  .ach-panel__near-title span {
    color: var(--desc-color);
  }
  .ach-panel__near-body small {
    display: block;
    margin: .ui-space(2px) [] 0 .ui-space(6px) [];
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .ach-panel--stacked .ach-panel__near {
    margin-top: .ui-space(4px) [];
  }
</style>

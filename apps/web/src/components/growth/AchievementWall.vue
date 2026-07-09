<template>
  <div class="aw">
    <div class="aw-head">
      <span class="aw-title">{{ t('growth.dashWall') }}</span>
      <span class="aw-count">{{ t('growth.achUnlocked', { n: unlockedCount, total: totalAchievements }) }}</span>
    </div>
    <div class="aw-bar">
      <div class="aw-bar-fill" :style="{ width: pct + '%' }"></div>
    </div>

    <div v-for="g in groups" :key="g" class="aw-group">
      <div class="aw-group-title">{{ t(`growth.achGroup.${g}`) }}</div>
      <div class="aw-grid">
        <div
          v-for="a in byGroup(g)"
          :key="a.key"
          class="aw-badge"
          :class="{ unlocked: a.unlocked }"
          :title="tipOf(a)"
          @click="openDetail(a)"
        >
          <div class="aw-medal">
            <span class="aw-emoji">{{ icons[a.key] || '🏆' }}</span>
            <span v-if="!a.unlocked" class="aw-lock">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm3 8H9V6a3 3 0 0 1 6 0v3z" /></svg>
            </span>
          </div>
          <div class="aw-name">{{ t(`growth.achName.${a.key}`) }}</div>
          <div v-if="a.unlocked" class="aw-got">{{ t('growth.achGot') }}</div>
          <div v-else class="aw-mini">
            <div class="aw-mini-bar"><div class="aw-mini-fill" :style="{ width: prog(a) + '%' }"></div></div>
            <span class="aw-mini-num">{{ Math.min(a.cur, a.target) }}/{{ a.target }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 成就详情 -->
    <BModal v-if="detail" v-model:visible="detailVisible" :show-footer="false" width="340px" :mask-closable="true">
      <div class="awd">
        <div class="awd-medal" :class="{ unlocked: detail.unlocked }">
          <span class="awd-emoji">{{ icons[detail.key] || '🏆' }}</span>
        </div>
        <div class="awd-name">{{ t(`growth.achName.${detail.key}`) }}</div>
        <div class="awd-desc">{{ t(`growth.achDesc.${detail.key}`) }}</div>
        <div v-if="detail.unlocked" class="awd-status unlocked">✓ {{ t('growth.achGot') }}</div>
        <div v-else class="awd-status">
          <div class="awd-bar"><div class="awd-fill" :style="{ width: prog(detail) + '%' }"></div></div>
          <span class="awd-num">{{ Math.min(detail.cur, detail.target) }} / {{ detail.target }}</span>
        </div>
      </div>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { Achievement } from '@/composables/useGrowth.ts';
  import { ACHIEVEMENT_ICONS, ACHIEVEMENT_GROUPS } from '@/config/achievements.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';

  const props = defineProps<{ achievements: Achievement[]; unlockedCount: number; totalAchievements: number }>();
  const { t } = useI18n();

  const icons = ACHIEVEMENT_ICONS;
  const detail = ref<Achievement | null>(null);
  const detailVisible = ref(false);
  function openDetail(a: Achievement) {
    detail.value = a;
    detailVisible.value = true;
  }
  // 只展示实际存在数据的分组(向后兼容后端新增/删减)
  const groups = computed(() => ACHIEVEMENT_GROUPS.filter((g) => props.achievements.some((a) => a.group === g)));
  const pct = computed(() => (props.totalAchievements ? Math.round((props.unlockedCount / props.totalAchievements) * 100) : 0));

  function byGroup(g: string) {
    return props.achievements.filter((a) => a.group === g);
  }
  function prog(a: Achievement) {
    return a.target ? Math.min(100, Math.round((a.cur / a.target) * 100)) : 0;
  }
  function tipOf(a: Achievement) {
    return t(`growth.achDesc.${a.key}`);
  }
</script>

<style scoped lang="less">
  .aw {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .aw-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .aw-title {
    font-size: 14px;
    font-weight: 700;
  }
  .aw-count {
    font-size: 12px;
    font-weight: 600;
    color: var(--primary-color);
    font-variant-numeric: tabular-nums;
  }
  .aw-bar {
    height: 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 45%, transparent);
    overflow: hidden;
  }
  .aw-bar-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--primary-color), #fbbf24);
    transition: width 0.5s ease;
  }
  .aw-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .aw-group-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--desc-color);
    letter-spacing: 0.03em;
  }
  .aw-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 10px;
  }
  .aw-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 14px 8px 10px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
    background: var(--background-color);
    text-align: center;
    cursor: pointer;
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      border-color 0.18s ease;
  }
  .aw-badge:not(.unlocked):hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
  }
  .aw-badge.unlocked {
    border-color: color-mix(in srgb, #fbbf24 45%, transparent);
    background: linear-gradient(180deg, color-mix(in srgb, #fbbf24 12%, var(--background-color)), var(--background-color));
  }
  .aw-badge.unlocked:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 22px -14px color-mix(in srgb, #fbbf24 80%, transparent);
  }
  .aw-medal {
    position: relative;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--card-border-color) 28%, transparent);
  }
  .aw-badge.unlocked .aw-medal {
    background: radial-gradient(circle at 35% 30%, #fde68a, #f59e0b);
    box-shadow: 0 4px 12px -4px rgba(245, 158, 11, 0.6);
  }
  .aw-emoji {
    font-size: 24px;
    line-height: 1;
    filter: grayscale(1) opacity(0.45);
  }
  .aw-badge.unlocked .aw-emoji {
    filter: none;
  }
  .aw-lock {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--desc-color);
    color: var(--background-color);
    box-shadow: 0 0 0 2px var(--background-color);
  }
  .aw-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-color);
    line-height: 1.25;
  }
  .aw-badge:not(.unlocked) .aw-name {
    color: var(--desc-color);
  }
  .aw-got {
    font-size: 10.5px;
    font-weight: 700;
    color: #f59e0b;
    letter-spacing: 0.04em;
  }
  .aw-mini {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    width: 100%;
  }
  .aw-mini-bar {
    width: 72%;
    height: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 50%, transparent);
    overflow: hidden;
  }
  .aw-mini-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--primary-color);
    transition: width 0.4s ease;
  }
  .aw-mini-num {
    font-size: 10px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
</style>

<!-- 成就详情弹窗内容 teleport 到 body,scoped 命不中,单独非 scoped 块 -->
<style lang="less">
  .awd {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 22px 20px 8px;
    text-align: center;
  }
  .awd-medal {
    width: 76px;
    height: 76px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--card-border-color) 28%, transparent);
  }
  .awd-medal.unlocked {
    background: radial-gradient(circle at 35% 30%, #fde68a, #f59e0b);
    box-shadow: 0 6px 18px -6px rgba(245, 158, 11, 0.7);
  }
  .awd-emoji {
    font-size: 40px;
    line-height: 1;
    filter: grayscale(1) opacity(0.45);
  }
  .awd-medal.unlocked .awd-emoji {
    filter: none;
  }
  .awd-name {
    font-size: 17px;
    font-weight: 700;
    color: var(--text-color);
  }
  .awd-desc {
    font-size: 13px;
    color: var(--desc-color);
    line-height: 1.5;
  }
  .awd-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin-top: 4px;
  }
  .awd-status.unlocked {
    font-size: 13px;
    font-weight: 700;
    color: #f59e0b;
  }
  .awd-bar {
    width: 80%;
    height: 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 45%, transparent);
    overflow: hidden;
  }
  .awd-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--primary-color), #22d3ee);
    transition: width 0.4s ease;
  }
  .awd-num {
    font-size: 12px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
</style>

<template>
  <div class="aw">
    <div class="aw-head">
      <span class="aw-title">{{ t('growth.dashWall') }}</span>
      <span v-if="(claimableCount || 0) > 0" class="aw-claimable">
        <SvgIcon :src="icon.growth.reward" size="13" /> {{ t('growth.achClaimableN', { n: claimableCount }) }}
      </span>
      <span class="aw-count">{{ t('growth.achUnlocked', { n: unlockedCount, total: totalAchievements }) }}</span>
    </div>
    <div class="aw-bar">
      <div class="aw-bar-fill" :style="{ width: pct + '%' }"></div>
    </div>
    <BTabs v-model:active-tab="activeFilter" class="aw-filters" variant="pill" :options="filterOptions" />

    <div v-for="g in visibleGroups" :key="g" class="aw-group">
      <div class="aw-group-title">{{ t(`growth.achGroup.${g}`) }}</div>
      <div class="aw-grid">
        <div
          v-for="a in byGroup(g)"
          :key="a.key"
          class="aw-badge"
          :class="[{ unlocked: a.unlocked }, achievementCardClass(a)]"
          :style="achievementVisualStyle(a.key, a.group)"
          :title="tipOf(a)"
          role="button"
          tabindex="0"
          @click="openDetail(a)"
          @keydown.enter="openDetail(a)"
          @keydown.space.prevent="openDetail(a)"
        >
          <div class="aw-badge__main">
            <div class="aw-medal">
              <AchievementEmblem :achievement-key="a.key" :group="a.group" :locked="!a.unlocked" />
              <span v-if="!a.unlocked" class="aw-lock">
                <SvgIcon :src="icon.growth.lock" size="11" />
              </span>
            </div>
            <div class="aw-copy">
              <div class="aw-name">{{ t(`growth.achName.${a.key}`) }}</div>
              <div class="aw-condition">{{ conditionOf(a) }}</div>
            </div>
          </div>
          <div v-if="a.frameId" class="aw-frame-reward">
            <AvatarFramePreview :frame-id="a.frameId" :src="icon.navigation.user" :size="30" :animated="false" />
            <span>{{ t('growth.achFrameReward', { name: frameName(a.frameId) }) }}</span>
          </div>
          <div class="aw-footer">
            <template v-if="a.unlocked">
              <BButton
                v-if="a.claimable"
                class="aw-claim"
                :disabled="readOnly || claimingKey === a.key"
                :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
                @click.stop="onClaim(a)"
              >
                <SvgIcon :src="a.frameId ? icon.growth.reward : icon.growth.coin" size="12" />
                {{ a.frameId ? t('growth.achClaimWithFrame', { n: a.reward }) : t('growth.achClaim', { n: a.reward }) }}
              </BButton>
              <div v-else class="aw-got">
                <SvgIcon :src="icon.filterPanel.check" size="11" /> {{ t('growth.achClaimed') }}
              </div>
            </template>
            <div v-else class="aw-mini">
              <div class="aw-mini-progress">
                <div class="aw-mini-bar"><div class="aw-mini-fill" :style="{ width: prog(a) + '%' }"></div></div>
                <span class="aw-mini-num">{{ Math.min(a.cur, a.target) }}/{{ a.target }}</span>
                <span v-if="a.minLevel" class="aw-mini-level">Lv.{{ a.currentLevel || 0 }}/{{ a.minLevel }}</span>
              </div>
              <span v-if="a.reward" class="aw-reward-hint">
                {{ t('growth.achRewardLabel') }} <SvgIcon :src="icon.growth.coin" size="10" /> {{ a.reward }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 成就详情 -->
    <BModal v-if="detail" v-model:visible="detailVisible" :show-footer="false" width="340px" :mask-closable="true">
      <div class="awd">
        <AchievementEmblem :achievement-key="detail.key" :group="detail.group" :size="76" :locked="!detail.unlocked" />
        <div class="awd-name">{{ t(`growth.achName.${detail.key}`) }}</div>
        <div class="awd-desc">{{ conditionOf(detail) }}</div>
        <div v-if="detail.reward" class="awd-reward">
          {{ t('growth.achRewardLabel') }} <SvgIcon :src="icon.growth.coin" size="14" /> {{ detail.reward }}
        </div>
        <div v-if="detail.frameId" class="awd-frame-reward">
          <AvatarFramePreview :frame-id="detail.frameId" :src="icon.navigation.user" :size="46" />
          <span>{{ t('growth.achFrameReward', { name: frameName(detail.frameId) }) }}</span>
        </div>
        <BButton
          v-if="detail.claimable"
          class="awd-claim"
          :disabled="readOnly || claimingKey === detail.key"
          :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
          @click="onClaim(detail)"
        >
          {{
            detail.frameId
              ? t('growth.achClaimWithFrame', { n: detail.reward })
              : t('growth.achClaim', { n: detail.reward })
          }}
        </BButton>
        <div v-else-if="detail.unlocked" class="awd-status unlocked">
          <SvgIcon :src="icon.filterPanel.check" size="13" /> {{ t('growth.achClaimed') }}
        </div>
        <div v-else class="awd-status">
          <div class="awd-bar"><div class="awd-fill" :style="{ width: prog(detail) + '%' }"></div></div>
          <span class="awd-num">{{ Math.min(detail.cur, detail.target) }} / {{ detail.target }}</span>
        </div>
      </div>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { Achievement } from '@/composables/useGrowth.ts';
  import { ACHIEVEMENT_GROUPS } from '@/config/achievements.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import AchievementEmblem from '@/components/growth/AchievementEmblem.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import { achievementVisualFor, achievementVisualStyle } from '@/config/achievements.ts';
  import icon from '@/config/icon.ts';

  const props = withDefaults(
    defineProps<{
      achievements: Achievement[];
      unlockedCount: number;
      totalAchievements: number;
      claimableCount?: number;
      claimingKey?: string | null;
      readOnly?: boolean;
    }>(),
    { readOnly: false },
  );
  const emit = defineEmits<{ (e: 'claim', key: string): void }>();
  const { t } = useI18n();

  type AchievementFilter = 'all' | 'claimable' | 'near' | 'unlocked';
  const activeFilter = ref<AchievementFilter>('all');
  const filterOptions = computed(() => [
    { key: 'all', label: t('growth.achFilterAll') },
    { key: 'claimable', label: t('growth.achFilterClaimable') },
    { key: 'near', label: t('growth.achFilterNear') },
    { key: 'unlocked', label: t('growth.achFilterUnlocked') },
  ]);
  const detail = ref<Achievement | null>(null);
  const detailVisible = ref(false);
  function openDetail(a: Achievement) {
    detail.value = a;
    detailVisible.value = true;
  }
  function onClaim(a: Achievement) {
    if (props.readOnly) return;
    emit('claim', a.key);
  }
  watch(
    () => props.achievements,
    (achievements) => {
      if (!detail.value) return;
      const detailKey = detail.value.key;
      detail.value = achievements.find((achievement) => achievement.key === detailKey) || null;
      if (!detail.value) detailVisible.value = false;
    },
  );
  // 只展示实际存在数据的分组(向后兼容后端新增/删减)
  const groups = computed(() => ACHIEVEMENT_GROUPS.filter((g) => props.achievements.some((a) => a.group === g)));
  const visibleGroups = computed(() => groups.value.filter((group) => byGroup(group).length > 0));
  const pct = computed(() =>
    props.totalAchievements ? Math.round((props.unlockedCount / props.totalAchievements) * 100) : 0,
  );

  function byGroup(g: string) {
    return props.achievements.filter((a) => {
      if (a.group !== g) return false;
      if (activeFilter.value === 'claimable') return Boolean(a.claimable);
      if (activeFilter.value === 'near') return !a.unlocked && prog(a) >= 60;
      if (activeFilter.value === 'unlocked') return a.unlocked;
      return true;
    });
  }
  function prog(a: Achievement) {
    return a.target ? Math.min(100, Math.round((a.cur / a.target) * 100)) : 0;
  }
  function conditionOf(a: Achievement) {
    const condition = t(`growth.achDesc.${a.key}`);
    return a.minLevel ? t('growth.frameAchievementConditionWithLevel', { condition, level: a.minLevel }) : condition;
  }
  function tipOf(a: Achievement) {
    return conditionOf(a);
  }
  function achievementCardClass(a: Achievement) {
    const visual = achievementVisualFor(a.key, a.group);
    return [`aw-badge--${visual.rarity}`, { 'aw-badge--apex': visual.apex }];
  }
  function frameName(frameId: string) {
    const key = `growth.shopItems.${frameId}.name`;
    return t(key);
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
  .aw-filters {
    align-self: flex-start;
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
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }
  .aw-badge {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    min-height: 146px;
    padding: 14px;
    box-sizing: border-box;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
    background: var(--background-color);
    text-align: left;
    cursor: pointer;
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      border-color 0.18s ease;
  }
  .aw-badge:not(.unlocked):hover {
    transform: translateY(-2px);
    border-color: var(--achievement-border);
  }
  .aw-badge.unlocked {
    border-color: var(--achievement-border);
    background: linear-gradient(180deg, var(--achievement-surface), var(--background-color) 64%);
  }
  .aw-badge.unlocked:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 22px -14px var(--achievement-shadow);
  }
  .aw-badge--legendary.unlocked,
  .aw-badge--mythic.unlocked {
    border-color: var(--achievement-border);
    background:
      radial-gradient(circle at 15% 0, var(--achievement-metal-glow), transparent 34%),
      linear-gradient(180deg, var(--achievement-surface), var(--background-color) 70%);
  }
  .aw-badge--mythic.unlocked {
    box-shadow: inset 0 1px 0 var(--achievement-metal-highlight);
  }
  .aw-badge--apex.unlocked {
    border-width: 2px;
    background:
      radial-gradient(circle at 14% 0, var(--achievement-metal-glow), transparent 42%),
      linear-gradient(180deg, var(--achievement-surface), var(--background-color) 74%);
  }
  .aw-badge__main {
    min-width: 0;
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr);
    align-items: center;
    gap: 11px;
  }
  .aw-medal {
    position: relative;
    width: 46px;
    height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .aw-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
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
    pointer-events: none;
  }
  .aw-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-color);
    line-height: 1.25;
  }
  .aw-badge:not(.unlocked) .aw-name {
    color: var(--desc-color);
  }
  .aw-condition {
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.4;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .aw-frame-reward {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 24%, var(--surface-border-color));
    border-radius: 10px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 5%, var(--background-color));
    font-size: 10.5px;
    font-weight: 700;
  }
  .aw-frame-reward span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aw-footer {
    min-height: 24px;
    display: flex;
    align-items: center;
    margin-top: auto;
  }
  .aw-got {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10.5px;
    font-weight: 700;
    color: #f59e0b;
    letter-spacing: 0.04em;
  }
  .aw-claimable {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11.5px;
    font-weight: 700;
    color: #d97706;
    margin-left: auto;
    margin-right: 8px;
  }
  .aw-claim {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px 10px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    font-size: 10.5px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #f59e0b, #f97316);
    box-shadow: 0 4px 10px -5px rgba(245, 158, 11, 0.8);
    transition: transform 0.15s;
    animation: aw-claim-pulse 1.6s infinite;
  }
  .aw-claim:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  .aw-claim:disabled {
    opacity: 0.6;
    cursor: default;
    animation: none;
  }
  @keyframes aw-claim-pulse {
    0%,
    100% {
      box-shadow: 0 4px 10px -5px rgba(245, 158, 11, 0.8);
    }
    50% {
      box-shadow: 0 4px 16px -3px rgba(245, 158, 11, 0.95);
    }
  }
  .aw-reward-hint {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 9.5px;
    color: #d97706;
    font-weight: 600;
    white-space: nowrap;
  }
  .aw-mini {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 9px;
    width: 100%;
  }
  .aw-mini-progress {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 1 1 auto;
  }
  .aw-mini-bar {
    min-width: 42px;
    flex: 1 1 auto;
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
    flex: 0 0 auto;
    font-size: 10px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
  .aw-mini-level {
    flex: 0 0 auto;
    padding: 1px 5px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 38%, transparent);
    border-radius: 999px;
    color: var(--primary-color);
    font-size: 9px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  @media (max-width: 767px) {
    .aw-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 9px;
    }

    .aw-badge {
      align-items: center;
      min-height: 154px;
      padding: 12px 8px 10px;
      text-align: center;
    }

    .aw-badge__main {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .aw-copy {
      align-items: center;
    }

    .aw-condition {
      display: none;
    }

    .aw-frame-reward {
      justify-content: center;
      width: 100%;
      padding: 4px 6px;
      box-sizing: border-box;
    }

    .aw-footer {
      width: 100%;
      justify-content: center;
    }

    .aw-mini {
      flex-direction: column;
      gap: 4px;
    }

    .aw-mini-progress {
      width: 100%;
    }
  }

  [data-theme='night'] .aw-badge.unlocked {
    background: linear-gradient(180deg, var(--achievement-night-surface), var(--background-color) 68%);
  }

  [data-theme='night'] .aw-badge--legendary.unlocked,
  [data-theme='night'] .aw-badge--mythic.unlocked,
  [data-theme='night'] .aw-badge--apex.unlocked {
    background:
      radial-gradient(circle at 15% 0, var(--achievement-metal-glow), transparent 36%),
      linear-gradient(180deg, var(--achievement-night-surface), var(--background-color) 72%);
  }

  html.light-note-mobile-rendering .aw-badge,
  html.light-note-mobile-rendering .aw-badge.unlocked {
    border-color: var(--achievement-border);
    box-shadow: none;
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
    flex-direction: row;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: #f59e0b;
  }
  .awd-reward {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
    color: #d97706;
  }
  .awd-frame-reward {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    color: var(--primary-color);
    background: var(--background-color);
    font-size: 12px;
    font-weight: 700;
  }
  .awd-claim {
    margin-top: 6px;
    padding: 8px 22px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #f59e0b, #f97316);
    box-shadow: 0 8px 18px -8px rgba(245, 158, 11, 0.8);
    transition: transform 0.15s;
  }
  .awd-claim:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  .awd-claim:disabled {
    opacity: 0.6;
    cursor: default;
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

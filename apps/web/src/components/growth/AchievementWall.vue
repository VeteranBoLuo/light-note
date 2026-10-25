<template>
  <div class="aw">
    <div v-if="showHeading" class="aw-head">
      <span class="aw-title">{{ t('growth.achievementCollectionTitle') }}</span>
      <span v-if="(claimableCount || 0) > 0" class="aw-claimable">
        <SvgIcon :src="icon.growth.reward" size="13" /> {{ t('growth.achClaimableN', { n: claimableCount }) }}
      </span>
      <span class="aw-count">{{ t('growth.achUnlocked', { n: unlockedCount, total: totalAchievements }) }}</span>
    </div>
    <div v-if="showHeading" class="aw-bar">
      <div class="aw-bar-fill" :style="{ width: pct + '%' }"></div>
    </div>
    <BTabs
      v-model:active-tab="activeFilter"
      v-click-log="{ module: '成长', operation: '筛选成就墙' }"
      class="aw-filters"
      variant="pill"
      :options="filterOptions"
    />

    <div v-for="g in visibleFamilies" :key="g" class="aw-group">
      <div class="aw-group-title">{{ t(`growth.achievementFamily.${g}`) }}</div>
      <div class="aw-grid">
        <div
          v-for="a in byFamily(g)"
          :key="a.key"
          class="aw-badge"
          :class="[{ unlocked: a.unlocked }, achievementCardClass(a)]"
          :style="achievementVisualStyle(a.key, a.group)"
        >
          <BButton class="aw-badge__main" :title="tipOf(a)" @click="openDetail(a)">
            <div class="aw-medal">
              <AchievementEmblem
                :size="dimension(80, 'layout')"
                :animated="animated"
                :achievement-key="a.key"
                :group="a.group"
                :locked="!a.unlocked"
              />
              <span v-if="!a.unlocked" class="aw-lock">
                <SvgIcon :src="icon.growth.lock" size="11" />
              </span>
            </div>
            <div class="aw-copy">
              <small class="aw-tier">{{
                achievementVisualFor(a.key, a.group).apex
                  ? t('growth.achievementApex')
                  : t('growth.achievementTier', { n: achievementVisualFor(a.key, a.group).tier })
              }}</small>
              <div class="aw-name">{{ t(`growth.achName.${a.key}`) }}</div>
              <div class="aw-condition">{{ conditionOf(a) }}</div>
            </div>
          </BButton>
          <div v-if="a.frameId" class="aw-frame-reward">
            <AvatarFramePreview
              :frame-id="a.frameId"
              :src="icon.navigation.user"
              :size="dimension(30, 'layout')"
              :animated="false"
            />
            <span>{{ t('growth.achFrameReward', { name: frameName(a.frameId) }) }}</span>
          </div>
          <div class="aw-footer">
            <template v-if="a.unlocked">
              <BButton
                v-if="a.claimable"
                class="aw-claim"
                size="small"
                :disabled="readOnly || Boolean(claimingKey)"
                :loading="claimingKey === a.key"
                :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
                :aria-label="
                  a.frameId ? t('growth.achClaimWithFrame', { n: a.reward }) : t('growth.achClaim', { n: a.reward })
                "
                @click.stop="onClaim(a)"
              >
                <SvgIcon :src="a.frameId ? icon.growth.reward : icon.growth.coin" size="12" />
                {{ t('growth.achClaim', { n: a.reward }) }}
              </BButton>
              <div v-else class="aw-got">
                <SvgIcon :src="icon.filterPanel.check" size="11" /> {{ t('growth.achClaimed') }}
              </div>
            </template>
            <div v-else class="aw-mini">
              <div class="aw-mini-progress">
                <div class="aw-mini-bar"><div class="aw-mini-fill" :style="{ width: prog(a) + '%' }"></div></div>
                <span class="aw-mini-num">{{ Math.min(a.cur, a.target) }}/{{ a.target }}</span>
              </div>
              <div v-if="a.minLevel || a.reward" class="aw-mini-meta">
                <span
                  v-if="a.minLevel"
                  class="aw-mini-level"
                  :class="{ 'aw-mini-level--met': (a.currentLevel || 0) >= a.minLevel }"
                  :title="t('growth.achLevelRequirement', { level: a.minLevel, current: a.currentLevel || 0 })"
                  :aria-label="t('growth.achLevelRequirement', { level: a.minLevel, current: a.currentLevel || 0 })"
                >
                  Lv.{{ a.minLevel }}
                  <SvgIcon v-if="(a.currentLevel || 0) >= a.minLevel" :src="icon.filterPanel.check" size="10" />
                </span>
                <span v-if="a.reward" class="aw-reward-hint">
                  {{ t('growth.achRewardLabel') }} <SvgIcon :src="icon.growth.coin" size="10" /> {{ a.reward }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!visibleFamilies.length" class="aw-empty" role="status">
      <p>{{ t('growth.achievementFilterEmpty') }}</p>
      <BButton v-if="activeFilter !== 'all'" type="text" @click="activeFilter = 'all'">{{
        t('growth.achievementViewAll')
      }}</BButton>
    </div>

    <!-- 成就详情 -->
    <BModal
      v-if="detail"
      v-model:visible="detailVisible"
      :title="t('growth.achievementDetailTitle')"
      :show-footer="false"
      width="var(--ui-layout-460, 460px)"
      :mask-closable="true"
    >
      <div class="awd" :style="achievementVisualStyle(detail.key, detail.group)">
        <span class="awd-tier">{{
          achievementVisualFor(detail.key, detail.group).apex
            ? t('growth.achievementApex')
            : t('growth.achievementTier', { n: achievementVisualFor(detail.key, detail.group).tier })
        }}</span>
        <AchievementEmblem
          v-if="detailVisible"
          :key="detail.key"
          :animated="animated"
          :achievement-key="detail.key"
          :group="detail.group"
          :size="dimension(200, 'layout')"
          :locked="!detail.unlocked"
        />
        <div class="awd-name">{{ t(`growth.achName.${detail.key}`) }}</div>
        <div class="awd-desc">{{ conditionOf(detail) }}</div>
        <div v-if="detail.reward" class="awd-reward">
          {{ t('growth.achRewardLabel') }} <SvgIcon :src="icon.growth.coin" size="14" /> {{ detail.reward }}
        </div>
        <div v-if="detail.frameId" class="awd-frame-reward">
          <AvatarFramePreview :frame-id="detail.frameId" :src="icon.navigation.user" :size="dimension(46, 'layout')" />
          <span>{{ t('growth.achFrameReward', { name: frameName(detail.frameId) }) }}</span>
        </div>
        <BButton
          v-if="detail.claimable"
          class="awd-claim"
          size="small"
          :disabled="readOnly || Boolean(claimingKey)"
          :loading="claimingKey === detail.key"
          :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
          @click="onClaim(detail)"
        >
          {{
            detail.frameId
              ? t('growth.achClaimWithFrame', { n: detail.reward })
              : t('growth.achClaim', { n: detail.reward })
          }}
        </BButton>
        <BButton
          v-if="detail.unlocked && !readOnly"
          class="awd-community"
          size="small"
          :loading="communitySaving || communityLoading"
          :disabled="
            communitySaving ||
            communityLoading ||
            (!isCommunityFeatured(detail.key) && communityFeaturedKeys.length >= 3)
          "
          @click="toggleCommunityFeatured(detail.key)"
        >
          {{
            isCommunityFeatured(detail.key)
              ? t('growth.achievementRemoveCommunity')
              : t('growth.achievementShowCommunity')
          }}
        </BButton>
        <div v-if="detail.unlocked && !detail.claimable" class="awd-status unlocked">
          <SvgIcon :src="icon.filterPanel.check" size="13" /> {{ t('growth.achClaimed') }}
        </div>
        <div v-if="!detail.unlocked" class="awd-status">
          <div class="awd-bar"><div class="awd-fill" :style="{ width: prog(detail) + '%' }"></div></div>
          <span class="awd-num">{{ Math.min(detail.cur, detail.target) }} / {{ detail.target }}</span>
        </div>
      </div>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { useUiDensity } from '@/composables/useUiDensity';
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { Achievement } from '@/composables/useGrowth.ts';
  import type { AchievementFamily } from '@/config/achievements.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import AchievementEmblem from '@/components/growth/AchievementEmblem.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import { achievementVisualFor, achievementVisualStyle } from '@/config/achievements.ts';
  import icon from '@/config/icon.ts';
  import {
    getCommunityChatOwnProfile,
    updateCommunityChatOwnProfile,
    type CommunityChatOwnProfile,
  } from '@/api/communityChatApi.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { recordOperation } from '@/api/commonApi.ts';

  const props = withDefaults(
    defineProps<{
      achievements: Achievement[];
      unlockedCount: number;
      totalAchievements: number;
      claimableCount?: number;
      claimingKey?: string | null;
      readOnly?: boolean;
      animated?: boolean;
      showHeading?: boolean;
    }>(),
    { readOnly: false, animated: true, showHeading: true },
  );
  const emit = defineEmits<{ (e: 'claim', key: string): void }>();
  const { t } = useI18n();
  const { dimension } = useUiDensity();

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
  const communityProfile = ref<CommunityChatOwnProfile | null>(null);
  const communitySaving = ref(false);
  const communityLoading = ref(false);
  const communityFeaturedKeys = computed(() => communityProfile.value?.featuredAchievementKeys || []);
  function openDetail(a: Achievement) {
    detail.value = a;
    detailVisible.value = true;
    if (a.unlocked && !props.readOnly) void ensureCommunityProfile().catch(() => {});
  }
  function onClaim(a: Achievement) {
    if (props.readOnly || props.claimingKey || !a.unlocked || !a.claimable) return;
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
  defineExpose({ openDetail });
  const families: AchievementFamily[] = [
    'checkin',
    'bookmark',
    'note',
    'file',
    'community',
    'todo',
    'organize',
    'level',
    'tenure',
  ];
  const visibleFamilies = computed(() => families.filter((family) => byFamily(family).length > 0));
  const pct = computed(() =>
    props.totalAchievements ? Math.round((props.unlockedCount / props.totalAchievements) * 100) : 0,
  );

  function byFamily(g: string) {
    return props.achievements
      .filter((a) => {
        if (achievementVisualFor(a.key, a.group).family !== g) return false;
        if (activeFilter.value === 'claimable') return Boolean(a.claimable);
        if (activeFilter.value === 'near') return !a.unlocked && prog(a) >= 60;
        if (activeFilter.value === 'unlocked') return a.unlocked;
        return true;
      })
      .sort((left, right) => {
        const tier =
          achievementVisualFor(left.key, left.group).tier - achievementVisualFor(right.key, right.group).tier;
        // Collection order is stable as rewards are claimed or progress changes.
        // Recency and proximity belong to the separate highlights panel.
        return tier || left.target - right.target || left.key.localeCompare(right.key);
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

  function isCommunityFeatured(key: string) {
    return communityFeaturedKeys.value.includes(key);
  }

  let profileRequest: Promise<CommunityChatOwnProfile> | undefined;
  async function ensureCommunityProfile() {
    if (communityProfile.value) return communityProfile.value;
    if (profileRequest) return profileRequest;
    communityLoading.value = true;
    profileRequest = (async () => {
      const response = await getCommunityChatOwnProfile();
      if (response?.status !== 200 || !response.data) throw new Error('COMMUNITY_PROFILE_LOAD_FAILED');
      communityProfile.value = response.data as CommunityChatOwnProfile;
      return communityProfile.value;
    })();
    try {
      return await profileRequest;
    } finally {
      communityLoading.value = false;
      profileRequest = undefined;
    }
  }

  async function toggleCommunityFeatured(key: string) {
    if (props.readOnly || communitySaving.value || !props.achievements.some((a) => a.key === key && a.unlocked)) return;
    communitySaving.value = true;
    try {
      const current = await ensureCommunityProfile();
      if (!current.featuredAchievementKeys.includes(key) && current.featuredAchievementKeys.length >= 3) {
        message.info(t('growth.achievementCommunityUnavailable'));
        return;
      }
      const featured = current.featuredAchievementKeys.includes(key)
        ? current.featuredAchievementKeys.filter((item) => item !== key)
        : [...current.featuredAchievementKeys, key];
      const response = await updateCommunityChatOwnProfile({
        bio: current.bio,
        showCommunityTenure: current.showCommunityTenure,
        featuredAchievementKeys: featured,
        baseRevision: current.revision,
      });
      if (response?.status !== 200 || !response.data) throw new Error('COMMUNITY_PROFILE_UPDATE_FAILED');
      communityProfile.value = response.data as CommunityChatOwnProfile;
      message.success(t('growth.achievementCommunitySaved'));
      recordOperation({ module: '成长', operation: '更新社区展示成就成功' });
    } catch (error) {
      console.warn('更新社区精选成就失败:', error);
      message.info(t('growth.achievementCommunityUnavailable'));
      communityProfile.value = null;
    } finally {
      communitySaving.value = false;
    }
  }
</script>

<style scoped lang="less">
  .aw {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-20, 20px);
  }
  .aw-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--ui-space-10, 10px);
  }
  .aw-title {
    font-size: var(--ui-font-20, 20px);
    font-weight: 700;
  }
  .aw-count {
    margin-left: auto;
    color: var(--workspace-purple-text, var(--primary-color));
    font-size: var(--ui-font-13, 13px);
    font-variant-numeric: tabular-nums;
  }
  .aw-claimable {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    color: var(--warning-color);
    font-size: var(--ui-font-12, 12px);
  }
  .aw-bar {
    height: var(--ui-space-4, 4px);
    margin-top: calc(-1 * var(--ui-space-10, 10px));
    background: var(--card-border-color);
    border-radius: 999px;
    overflow: hidden;
  }
  .aw-bar-fill {
    height: 100%;
    border-radius: inherit;
    background: var(--primary-color);
    transition: width 0.3s ease;
  }
  .aw-filters {
    align-self: flex-start;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
  }
  .aw-group {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-12, 12px);
  }
  .aw-group-title {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
    font-weight: 650;
  }
  .aw-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--ui-layout-240, 240px)), 1fr));
    gap: var(--ui-space-12, 12px);
  }
  .aw-badge {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-14, 14px);
    border: 1px solid var(--card-border-color);
    border-radius: 14px;
    background: var(--background-color);
    box-sizing: border-box;
    transition:
      border-color 0.18s,
      box-shadow 0.18s;
  }
  .aw-badge.unlocked {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--achievement-accent) 4%, var(--background-color)),
      var(--background-color) 72%
    );
  }
  .aw-badge--apex.unlocked {
    border-color: color-mix(in srgb, var(--achievement-accent) 40%, var(--card-border-color));
  }
  .aw-badge:hover,
  .aw-badge:focus-within {
    border-color: var(--primary-color);
    box-shadow: 0 6px 16px -12px var(--achievement-shadow);
  }
  .aw-badge__main.b_btn {
    display: grid;
    grid-template-columns: var(--ui-layout-80, 80px) minmax(0, 1fr);
    align-items: center;
    gap: var(--ui-space-8, 8px);
    width: 100%;
    height: auto;
    min-width: 0;
    padding: 0;
    text-align: left;
    white-space: normal;
    line-height: 1.4;
    background: transparent;
    border: 0;
    color: var(--text-color);
  }
  .aw-badge__main:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 4px;
    border-radius: 8px;
  }
  .aw-medal {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-layout-80, 80px);
    height: var(--ui-layout-80, 80px);
  }
  .aw-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
  }
  .aw-tier {
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
  }
  .aw-name {
    font-size: var(--ui-font-14, 14px);
    font-weight: 700;
    line-height: 1.45;
  }
  .aw-condition {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    line-height: 1.5;
  }
  .aw-lock {
    position: absolute;
    right: var(--ui-space-2, 2px);
    bottom: var(--ui-space-2, 2px);
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-layout-18, 18px);
    height: var(--ui-layout-18, 18px);
    border-radius: 50%;
    color: var(--background-color);
    background: var(--desc-color);
    border: 2px solid var(--background-color);
  }
  .aw-frame-reward {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    padding-top: var(--ui-space-6, 6px);
    border-top: 1px solid var(--card-border-color);
    min-width: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-10_5, 10.5px);
    line-height: 1.4;
  }
  .aw-frame-reward > span {
    min-width: 0;
  }
  .aw-footer {
    display: flex;
    align-items: center;
    min-height: var(--ui-layout-28, 28px);
    margin-top: auto;
  }
  .aw-got {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    padding: var(--ui-space-4, 4px) var(--ui-space-10, 10px);
    border-radius: 999px;
    color: var(--workspace-purple-text, var(--primary-color));
    background: color-mix(in srgb, var(--primary-color) 7%, transparent);
    font-size: var(--ui-font-11, 11px);
  }
  .aw-claim.b_btn {
    position: relative;
    height: var(--ui-control-28, 28px);
    line-height: 1.2;
    max-width: 100%;
    padding: 0 var(--ui-space-10, 10px);
    border: 1px solid var(--primary-color);
    border-radius: 7px;
    background: color-mix(in srgb, var(--primary-color) 8%, var(--background-color));
    color: var(--workspace-purple-text, var(--primary-color));
    gap: var(--ui-space-4, 4px);
    font-size: var(--ui-font-11, 11px);
    font-weight: 600;
    white-space: nowrap;
  }
  @media (hover: hover) and (pointer: fine) {
    .aw-claim.b_btn:hover:not(:disabled) {
      background: color-mix(in srgb, var(--primary-color) 14%, var(--background-color));
    }
  }
  @media (pointer: coarse) {
    .aw-claim::after {
      content: '';
      position: absolute;
      inset: calc(-1 * var(--ui-space-8, 8px)) 0;
    }
  }
  .aw-mini {
    display: grid;
    gap: var(--ui-space-6, 6px);
    width: 100%;
  }
  .aw-mini-progress {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }
  .aw-mini-bar {
    flex: 1;
    min-width: 0;
    height: var(--ui-space-4, 4px);
    background: var(--card-border-color);
    border-radius: 999px;
    overflow: hidden;
  }
  .aw-mini-fill {
    height: 100%;
    border-radius: inherit;
    background: var(--primary-color);
  }
  .aw-mini-num {
    flex-shrink: 0;
    font-size: var(--ui-font-10, 10px);
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
  .aw-mini-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-6, 6px);
  }
  .aw-mini-level {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-3, 3px);
    padding: var(--ui-space-1, 1px) var(--ui-space-5, 5px);
    border: 1px solid var(--card-border-color);
    border-radius: 999px;
    font-size: var(--ui-font-10, 10px);
    color: var(--desc-color);
  }
  .aw-mini-level--met {
    color: var(--success-color);
    border-color: var(--chip-success-border);
    background: var(--chip-success-bg);
  }
  .aw-reward-hint {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-3, 3px);
    margin-left: auto;
    font-size: var(--ui-font-10, 10px);
    color: var(--desc-color);
  }
  .aw-empty {
    padding: var(--ui-space-32, 32px) var(--ui-space-12, 12px);
    text-align: center;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
  }
  @media (max-width: 767px) {
    .aw-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--ui-space-8, 8px);
    }
    .aw-badge {
      padding: var(--ui-space-12, 12px) var(--ui-space-8, 8px);
    }
    .aw-badge__main.b_btn {
      display: flex;
      flex-direction: column;
      text-align: center;
    }
    .aw-copy {
      align-items: center;
    }
    .aw-condition {
      font-size: var(--ui-font-10, 10px);
    }
    .aw-footer {
      justify-content: center;
    }
    .aw-claim.b_btn {
      height: var(--ui-control-32, 32px);
    }
    .aw-frame-reward {
      flex-direction: column;
      text-align: center;
    }
    .aw-head {
      align-items: center;
    }
  }
  html.light-note-mobile-rendering .aw-badge--apex.unlocked {
    border-color: var(--achievement-accent);
  }
  @media (prefers-reduced-motion: reduce) {
    .aw-bar-fill,
    .aw-badge {
      transition: none;
    }
  }
</style>

<style scoped lang="less">
  .awd {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-22, 22px) var(--ui-space-20, 20px) var(--ui-space-8, 8px);
    text-align: center;
  }
  .awd-tier {
    color: var(--achievement-accent);
    font-size: var(--ui-font-12, 12px);
  }
  .awd-name {
    font-size: var(--ui-font-17, 17px);
    font-weight: 700;
    color: var(--text-color);
  }
  .awd-desc {
    font-size: var(--ui-font-13, 13px);
    color: var(--desc-color);
    line-height: 1.5;
  }
  .awd-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    width: 100%;
    margin-top: var(--ui-space-4, 4px);
  }
  .awd-status.unlocked {
    flex-direction: row;
    justify-content: center;
    font-size: var(--ui-font-13, 13px);
    font-weight: 700;
    color: var(--workspace-purple-text, var(--primary-color));
  }
  .awd-reward {
    display: flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
    color: var(--warning-color);
  }
  .awd-frame-reward {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    color: var(--workspace-purple-text, var(--primary-color));
    background: var(--background-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 700;
  }
  .awd-claim.b_btn {
    height: var(--ui-control-32, 32px);
    line-height: 1.2;
    margin-top: var(--ui-space-6, 6px);
    padding: 0 var(--ui-space-16, 16px);
    border-radius: 8px;
    font-size: var(--ui-font-12, 12px);
    font-weight: 600;
    color: #fff;
    background: var(--primary-color);
  }
  .awd-community {
    width: 100%;
    min-height: var(--ui-control-32, 32px);
    margin-top: var(--ui-space-8, 8px);
    border: 1px solid var(--primary-color);
    color: var(--workspace-purple-text, var(--primary-color));
  }
  .awd-claim:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .awd-bar {
    width: 80%;
    height: var(--ui-space-6, 6px);
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 45%, transparent);
    overflow: hidden;
  }
  .awd-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--primary-color);
    transition: width 0.4s ease;
  }
  .awd-num {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
</style>

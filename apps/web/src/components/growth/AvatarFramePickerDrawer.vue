<template>
  <component :is="pickerShell" v-bind="pickerShellProps" @close="closeDrawer" @update:visible="handleShellVisible">
    <div class="frame-picker" :class="{ 'frame-picker--desktop': !isMobileLayout }">
      <div class="frame-picker__toolbar">
        <div class="frame-picker__balance">
          <span>{{ t('growth.myPoints') }}</span>
          <strong><SvgIcon :src="icon.growth.coin" size="17" /> {{ (shop?.points || 0).toLocaleString() }}</strong>
        </div>
        <BButton class="frame-picker__earn" @click="goEarnPoints">{{ t('myInfo.earnPoints') }}</BButton>
      </div>

      <BTabs v-model:active-tab="activeFilter" variant="segment" :options="filterOptions" />

      <div class="frame-picker__workspace">
        <div class="frame-picker__content">
          <BLoading v-if="shopLoading && !shop" inline :loading="true" :title="t('common.loading')" />

          <div v-else-if="visibleFrames.length" class="frame-picker__groups">
            <section v-for="group in visibleFrameGroups" :key="group.rarity" class="frame-picker__group">
              <div class="frame-picker__group-title">
                <strong>{{ frameRarityName(group.rarity) }}</strong>
                <span>{{ group.frames.length }}</span>
              </div>
              <div class="frame-picker__grid" role="list">
                <BButton
                  v-for="frame in group.frames"
                  :key="frame.id"
                  class="frame-card"
                  :class="{
                    'is-selected': selectedId === frame.id,
                    'is-equipped': frame.equipped,
                    'is-locked': isFrameLocked(frame),
                  }"
                  role="listitem"
                  :aria-pressed="selectedId === frame.id"
                  @click="selectedId = frame.id"
                >
                  <span v-if="frame.equipped" class="frame-card__check" aria-hidden="true">
                    <SvgIcon :src="icon.filterPanel.check" size="13" />
                  </span>
                  <AvatarFramePreview :frame-id="frame.id" :src="avatarSrc" :size="isMobileLayout ? 58 : 64" />
                  <span class="frame-card__copy">
                    <strong>{{ itemName(frame) }}</strong>
                    <small v-if="isAchievementFrame(frame)" class="frame-card__requirement">
                      <SvgIcon :src="icon.growth.reward" size="11" />
                      {{ achievementRequirement(frame) }}
                    </small>
                    <span class="frame-card__meta">
                      <small v-if="!isAchievementFrame(frame)" class="frame-card__cost">
                        <SvgIcon :src="icon.growth.coin" size="12" /> {{ frame.cost }}
                      </small>
                      <small v-if="frame.equipped" class="frame-card__status">{{ t('growth.shopEquipped') }}</small>
                      <small v-else-if="frame.owned" class="frame-card__status">{{ t('growth.shopOwned') }}</small>
                      <small v-else-if="shop?.rootFrameAccess" class="frame-card__status">
                        {{ t('growth.shopRootPreview') }}
                      </small>
                      <small v-else-if="isAchievementFrame(frame)" class="frame-card__achievement">
                        <SvgIcon :src="icon.growth.reward" size="11" />
                        {{ achievementProgress(frame) }}
                      </small>
                      <small v-else-if="!canMeetLevel(frame)" class="frame-card__locked">
                        <SvgIcon :src="icon.growth.lock" size="11" />
                        {{ t('growth.shopLevelNeed', { n: frame.minLevel }) }}
                      </small>
                    </span>
                  </span>
                </BButton>
              </div>
            </section>
          </div>

          <div v-else class="frame-picker__empty">{{ t('myInfo.noOwnedFrames') }}</div>
        </div>

        <aside v-if="selectedFrame && !isMobileLayout" class="frame-picker__detail">
          <div class="frame-picker__detail-preview">
            <AvatarFramePreview :frame-id="selectedFrame.id" :src="avatarSrc" :size="86" />
          </div>
          <span class="frame-picker__rarity" :class="`is-${selectedFrame.rarity || 'basic'}`">
            {{ frameRarityName(selectedFrame.rarity || 'basic') }}
          </span>
          <strong class="frame-picker__detail-name">{{ itemName(selectedFrame) }}</strong>
          <span class="frame-picker__detail-desc">{{ itemDesc(selectedFrame) }}</span>

          <div class="frame-picker__detail-meta">
            <div v-if="!isAchievementFrame(selectedFrame)" class="frame-picker__detail-row">
              <span>{{ t('growth.framePriceLabel') }}</span>
              <strong class="frame-picker__detail-cost">
                <SvgIcon :src="icon.growth.coin" size="14" /> {{ selectedFrame.cost }}
              </strong>
            </div>
            <div v-if="selectedFrame.minLevel" class="frame-picker__detail-row">
              <span>{{ t('growth.frameLevelLabel') }}</span>
              <strong>Lv.{{ selectedFrame.minLevel }}</strong>
            </div>
            <div v-if="isAchievementFrame(selectedFrame)" class="frame-picker__detail-requirement">
              <SvgIcon :src="icon.growth.reward" size="14" />
              {{ t('growth.frameAchievementRequirement', { condition: achievementRequirement(selectedFrame) }) }}
            </div>
            <div class="frame-picker__detail-status">
              <SvgIcon
                :src="canEquipFrame(selectedFrame) ? icon.filterPanel.check : icon.growth.lock"
                size="13"
                aria-hidden="true"
              />
              {{ selectedFrameStatus }}
            </div>
          </div>

          <BButton
            class="frame-picker__detail-action"
            :type="actionType"
            :loading="processingId === selectedFrame.id"
            :disabled="actionDisabled"
            @click="handlePrimaryAction"
          >
            {{ actionLabel }}
          </BButton>
        </aside>
      </div>

      <div v-if="selectedFrame && isMobileLayout" class="frame-picker__action-bar">
        <div class="frame-picker__selection">
          <strong>{{ itemName(selectedFrame) }}</strong>
          <span>{{ itemDesc(selectedFrame) }}</span>
        </div>
        <BButton
          class="frame-picker__primary"
          :type="actionType"
          :loading="processingId === selectedFrame.id"
          :disabled="actionDisabled"
          @click="handlePrimaryAction"
        >
          {{ actionLabel }}
        </BButton>
      </div>
    </div>
  </component>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, useUserStore } from '@/store';
  import { useGrowth, type ShopItem } from '@/composables/useGrowth';
  import { recordOperation } from '@/api/commonApi';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import icon from '@/config/icon';
  import { sortFramesByRarity } from '@/config/growthFrames';
  import { useMobileLayout } from '@/composables/useMobileLayout';

  const props = defineProps<{ open: boolean; zIndex?: number }>();
  const emit = defineEmits<{
    'update:open': [value: boolean];
    navigate: [destination: 'growth' | 'tasks' | 'achievements'];
  }>();
  const { t, te } = useI18n();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const { dashboard, shop, shopLoading, loadDashboard, loadShop, buyItem, equipFrame, claimAchievement } = useGrowth();

  const activeFilter = ref<'all' | 'owned'>('all');
  const selectedId = ref<string | null>(null);
  const processingId = ref<string | null>(null);
  const isMobileLayout = useMobileLayout();
  const pickerShell = computed(() => (isMobileLayout.value ? BDrawer : BModal));
  const pickerShellProps = computed(() =>
    isMobileLayout.value
      ? {
          open: props.open,
          title: t('myInfo.avatarDecorations'),
          placement: 'bottom' as const,
          height: 'min(82vh, 760px)',
          bodyPadding: '0',
          mobileCenteredHeader: true,
          zIndex: props.zIndex,
        }
      : {
          visible: props.open,
          title: t('myInfo.avatarDecorations'),
          width: '940px',
          height: 'min(82vh, 720px)',
          showFooter: false,
          maskClosable: true,
          modalClass: 'frame-picker-modal',
          contentClass: 'frame-picker-modal__content',
          maskClass: 'frame-picker-modal-mask',
        },
  );
  const avatarSrc = computed(() => user.headPicture || icon.navigation.user);
  const frames = computed(() =>
    sortFramesByRarity(shop.value?.frames || shop.value?.items.filter((item) => item.type === 'cosmetic') || []),
  );
  const visibleFrames = computed(() =>
    activeFilter.value === 'owned' ? frames.value.filter((item) => item.owned) : frames.value,
  );
  const frameRarities = ['basic', 'rare', 'epic', 'legendary'] as const;
  const visibleFrameGroups = computed(() =>
    frameRarities
      .map((rarity) => ({ rarity, frames: visibleFrames.value.filter((frame) => frame.rarity === rarity) }))
      .filter((group) => group.frames.length > 0),
  );
  const selectedFrame = computed(() => frames.value.find((item) => item.id === selectedId.value) || null);
  const filterOptions = computed(() => [
    { key: 'all', label: t('growth.frameFilters.all'), badge: frames.value.length },
    { key: 'owned', label: t('myInfo.ownedFrames'), badge: frames.value.filter((item) => item.owned).length },
  ]);

  const actionType = computed<'primary' | ''>(() => (selectedFrame.value?.equipped ? '' : 'primary'));
  const actionDisabled = computed(() => {
    const frame = selectedFrame.value;
    if (!frame || processingId.value) return true;
    if (shop.value?.isVisitor) return false;
    if (canEquipFrame(frame) || isAchievementFrame(frame) || !canMeetLevel(frame)) return false;
    return (shop.value?.points || 0) < Number(frame.cost || 0);
  });
  const actionLabel = computed(() => {
    const frame = selectedFrame.value;
    if (!frame) return '';
    if (shop.value?.isVisitor) return t('myInfo.loginToDecorate');
    if (frame.equipped) return t('growth.shopUnequip');
    if (canEquipFrame(frame)) return t('growth.shopEquip');
    if (isAchievementFrame(frame)) {
      return achievementFor(frame)?.claimable ? t('growth.frameAchievementClaim') : t('growth.frameViewAchievement');
    }
    if (!canMeetLevel(frame)) return t('myInfo.goToGrowth');
    if ((shop.value?.points || 0) < Number(frame.cost || 0)) return t('growth.shopInsufficient');
    return t('myInfo.redeemAndEquip');
  });
  const selectedFrameStatus = computed(() => {
    const frame = selectedFrame.value;
    if (!frame) return '';
    if (frame.equipped) return t('growth.shopEquipped');
    if (frame.owned) return t('growth.shopOwned');
    if (shop.value?.rootFrameAccess) return t('growth.shopRootPreview');
    if (isAchievementFrame(frame)) return achievementProgress(frame);
    if (!canMeetLevel(frame)) return t('growth.shopLevelNeed', { n: frame.minLevel });
    return t('growth.shopNotOwned');
  });

  watch(
    () => props.open,
    async (open) => {
      if (!open) return;
      const [currentShop] = await Promise.all([loadShop(), loadDashboard()]);
      const currentFrames = sortFramesByRarity(
        currentShop?.frames || currentShop?.items.filter((item) => item.type === 'cosmetic') || [],
      );
      selectedId.value = currentFrames.find((item) => item.equipped)?.id || currentFrames[0]?.id || null;
    },
    { immediate: true },
  );

  watch(visibleFrames, (items) => {
    if (items.some((item) => item.id === selectedId.value)) return;
    selectedId.value = items[0]?.id || null;
  });

  function itemName(item: ShopItem) {
    const key = `growth.shopItems.${item.id}.name`;
    return te(key) ? t(key) : item.name;
  }

  function itemDesc(item: ShopItem) {
    const key = `growth.shopItems.${item.id}.desc`;
    return te(key) ? t(key) : item.desc;
  }

  function frameRarityName(rarity: NonNullable<ShopItem['rarity']>) {
    return t(`growth.frameRarity.${rarity}`);
  }

  function canMeetLevel(item: ShopItem) {
    return Boolean(shop.value?.rootFrameAccess || !item.minLevel || (shop.value?.level || 0) >= item.minLevel);
  }

  function canEquipFrame(item: ShopItem) {
    return Boolean(item.canEquip || item.owned || shop.value?.rootFrameAccess);
  }

  function isAchievementFrame(item: ShopItem) {
    return item.acquisition === 'achievement' && Boolean(item.achievementKey);
  }

  function achievementFor(item: ShopItem) {
    return dashboard.value?.achievements.find((achievement) => achievement.key === item.achievementKey);
  }

  function isFrameLocked(item: ShopItem) {
    if (canEquipFrame(item)) return false;
    if (isAchievementFrame(item)) return !achievementFor(item)?.claimable;
    return !canMeetLevel(item);
  }

  function achievementProgress(item: ShopItem) {
    const achievement = achievementFor(item);
    if (!achievement) return t('growth.frameAchievementLocked');
    if (achievement.claimable) return t('growth.frameAchievementReady');
    if (
      achievement.minLevel &&
      achievement.cur >= achievement.target &&
      Number(achievement.currentLevel || 0) < achievement.minLevel
    ) {
      return t('growth.frameAchievementLevelProgress', {
        cur: achievement.currentLevel || 0,
        target: achievement.minLevel,
      });
    }
    return t('growth.frameAchievementProgress', {
      cur: Math.min(achievement.cur, achievement.target),
      target: achievement.target,
    });
  }

  function achievementRequirement(item: ShopItem) {
    const key = item.achievementKey ? `growth.achDesc.${item.achievementKey}` : '';
    const condition = key && te(key) ? t(key) : achievementProgress(item);
    const minLevel = achievementFor(item)?.minLevel || 0;
    return minLevel ? t('growth.frameAchievementConditionWithLevel', { condition, level: minLevel }) : condition;
  }

  function closeDrawer() {
    emit('update:open', false);
  }

  function handleShellVisible(value: boolean) {
    if (!value) closeDrawer();
  }

  function goGrowth() {
    void closeCurrentMobileOverlayThen(closeDrawer, () => emit('navigate', 'growth'));
  }

  function goEarnPoints() {
    void closeCurrentMobileOverlayThen(closeDrawer, () => emit('navigate', 'tasks'));
  }

  function goAchievements() {
    void closeCurrentMobileOverlayThen(closeDrawer, () => emit('navigate', 'achievements'));
  }

  async function applyFrame(frame: ShopItem, frameId: string | null) {
    processingId.value = frame.id;
    try {
      const result = await equipFrame(frameId);
      if (result?.status === 200 && result.data?.ok) {
        message.success(frameId ? t('growth.shopEquipOk', { name: itemName(frame) }) : t('growth.shopUnequipOk'));
        recordOperation({
          module: '个人资料',
          operation: frameId ? `佩戴头像框「${itemName(frame)}」` : `卸下头像框「${itemName(frame)}」`,
        });
      } else {
        message.error(result?.data?.msg || t('growth.operationFailed'));
      }
    } catch (error) {
      console.error('头像框佩戴失败:', error);
      message.error(t('growth.operationFailed'));
    } finally {
      processingId.value = null;
    }
  }

  async function redeemAndEquip(frame: ShopItem) {
    processingId.value = frame.id;
    try {
      const buyResult = await buyItem(frame.id);
      if (buyResult?.status !== 200 || !buyResult.data?.ok) {
        message.error(buyResult?.data?.msg || t('growth.shopInsufficient'));
        return;
      }

      const equipResult = await equipFrame(frame.id);
      if (equipResult?.status === 200 && equipResult.data?.ok) {
        message.success(t('myInfo.redeemAndEquipSuccess', { name: itemName(frame) }));
        recordOperation({
          module: '个人资料',
          operation: `兑换并佩戴头像框「${itemName(frame)}」（-${frame.cost} 积分）`,
        });
      } else {
        message.warning(t('myInfo.redeemedEquipFailed'));
        recordOperation({
          module: '个人资料',
          operation: `兑换头像框「${itemName(frame)}」成功，自动佩戴失败`,
        });
      }
    } catch (error) {
      console.error('头像框兑换失败:', error);
      message.error(t('growth.operationFailed'));
    } finally {
      processingId.value = null;
    }
  }

  async function claimFrame(frame: ShopItem) {
    if (!frame.achievementKey || !achievementFor(frame)?.claimable) return;
    processingId.value = frame.id;
    try {
      const result = await claimAchievement(frame.achievementKey);
      if (result?.status === 200 && result.data?.ok) {
        message.success(t('growth.frameAchievementClaimOk', { name: itemName(frame) }));
        recordOperation({ module: '个人资料', operation: `领取成就头像框「${itemName(frame)}」` });
      } else {
        message.error(result?.data?.msg || t('growth.operationFailed'));
      }
    } catch (error) {
      console.error('成就头像框领取失败:', error);
      message.error(t('growth.operationFailed'));
    } finally {
      processingId.value = null;
    }
  }

  function handlePrimaryAction() {
    const frame = selectedFrame.value;
    if (!frame) return;
    if (shop.value?.isVisitor) {
      bookmark.isShowLogin = true;
      return;
    }
    if (canEquipFrame(frame)) {
      void applyFrame(frame, frame.equipped ? null : frame.id);
      return;
    }
    if (!canMeetLevel(frame)) {
      goGrowth();
      return;
    }
    if (isAchievementFrame(frame)) {
      if (achievementFor(frame)?.claimable) void claimFrame(frame);
      else goAchievements();
      return;
    }

    Alert.alert({
      title: t('myInfo.redeemFrameTitle'),
      content: t('myInfo.redeemFrameConfirm', { name: itemName(frame), points: Number(frame.cost || 0) }),
      okText: t('myInfo.redeemAndEquip'),
      async onOk() {
        await redeemAndEquip(frame);
      },
    });
  }
</script>

<style scoped lang="less">
  .frame-picker {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .frame-picker__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
  }

  .frame-picker__balance {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .frame-picker__balance span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .frame-picker__balance strong {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #b45309;
    font-size: 18px;
  }

  .frame-picker__earn {
    min-height: 36px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--card-background);
  }

  .frame-picker > :deep(.tab-container) {
    margin: 0 16px;
  }

  .frame-picker > :deep(.tab-container.is-segment) {
    min-height: 38px;
    flex: 0 0 38px;
    align-items: stretch;
    box-sizing: border-box;
  }

  .frame-picker > :deep(.tab-container.is-segment .tab) {
    height: 36px;
    min-height: 36px;
    flex: 1 1 50%;
    justify-content: center;
    box-sizing: border-box;
    line-height: 36px;
  }

  .frame-picker__workspace {
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }

  .frame-picker__content {
    min-height: 0;
    height: 100%;
    padding: 14px 16px;
    box-sizing: border-box;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }

  .frame-picker__groups,
  .frame-picker__group {
    display: flex;
    flex-direction: column;
  }

  .frame-picker__groups {
    gap: 18px;
  }

  .frame-picker__group {
    gap: 9px;
  }

  .frame-picker__group-title {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-color);
    font-size: 12px;
  }

  .frame-picker__group-title strong {
    font-weight: 800;
  }

  .frame-picker__group-title span {
    min-width: 19px;
    height: 19px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--surface-panel-bg);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }

  .frame-picker__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .frame-card {
    position: relative;
    width: 100%;
    height: auto;
    min-height: 128px;
    padding: 13px 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    color: var(--text-color);
    background: var(--card-background);
    white-space: normal;
  }

  .frame-card.is-selected,
  .frame-card.is-equipped {
    border-color: var(--primary-color);
  }

  .frame-card.is-selected {
    box-shadow: inset 0 0 0 1px var(--primary-color);
  }

  .frame-card.is-locked {
    opacity: 0.78;
  }

  .frame-card__check {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #fff;
    background: var(--primary-color);
  }

  .frame-card__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    line-height: 1.25;
  }

  .frame-card__meta {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .frame-card__copy strong,
  .frame-card__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .frame-card__copy strong {
    font-size: 13px;
  }

  .frame-card__copy small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .frame-card__copy .frame-card__cost,
  .frame-card__copy .frame-card__status,
  .frame-card__copy .frame-card__locked,
  .frame-card__copy .frame-card__achievement,
  .frame-card__copy .frame-card__requirement {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }

  .frame-card__copy .frame-card__cost {
    color: #b45309;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .frame-card__copy .frame-card__status {
    color: var(--primary-color);
    font-weight: 700;
  }

  .frame-card__copy .frame-card__achievement {
    color: var(--primary-color);
    font-weight: 700;
  }

  .frame-card__copy .frame-card__requirement {
    color: var(--primary-color);
    font-weight: 600;
  }

  .frame-picker__empty {
    padding: 40px 16px;
    color: var(--desc-color);
    text-align: center;
  }

  .frame-picker__action-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 16px calc(11px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--surface-border-color);
    background: var(--card-background);
  }

  .frame-picker__selection {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 3px;
  }

  .frame-picker__selection strong,
  .frame-picker__selection span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .frame-picker__selection strong {
    color: var(--text-color);
    font-size: 14px;
  }

  .frame-picker__selection span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .frame-picker__primary {
    min-width: 118px;
    min-height: 44px;
    border-radius: 11px;
  }

  .frame-picker--desktop .frame-picker__toolbar {
    padding: 14px 20px 10px;
  }

  .frame-picker--desktop > :deep(.tab-container) {
    width: 330px;
    margin: 0 20px 12px;
  }

  .frame-picker--desktop .frame-picker__workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 270px;
    gap: 0;
    border-top: 1px solid var(--surface-border-color);
  }

  .frame-picker--desktop .frame-picker__content {
    padding: 18px 20px 22px;
    scrollbar-gutter: stable;
  }

  .frame-picker--desktop .frame-picker__groups {
    gap: 22px;
  }

  .frame-picker--desktop .frame-picker__group-title {
    font-size: 13px;
  }

  .frame-picker--desktop .frame-picker__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 11px;
  }

  .frame-picker--desktop .frame-card {
    min-height: 106px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 13px;
    padding: 13px 14px;
    border-radius: 13px;
    text-align: left;
  }

  .frame-picker--desktop .frame-card__copy {
    align-items: flex-start;
    gap: 6px;
  }

  .frame-picker--desktop .frame-card__copy strong {
    font-size: 14px;
  }

  .frame-picker--desktop .frame-card__meta {
    justify-content: flex-start;
  }

  .frame-picker--desktop .frame-card__copy .frame-card__requirement {
    justify-content: flex-start;
    max-width: 100%;
  }

  .frame-picker__detail {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 12px 18px 14px;
    box-sizing: border-box;
    overflow: hidden;
    border-left: 1px solid var(--surface-border-color);
    background:
      radial-gradient(circle at 50% 15%, color-mix(in srgb, var(--primary-color) 10%, transparent), transparent 34%),
      var(--surface-panel-bg);
    text-align: center;
  }

  .frame-picker__detail-preview {
    min-height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .frame-picker__rarity {
    margin-top: 1px;
    padding: 2px 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--background-color);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.05em;
  }

  .frame-picker__rarity.is-rare {
    border-color: #7dd3fc;
    color: #0369a1;
  }

  .frame-picker__rarity.is-epic {
    border-color: #c4b5fd;
    color: #6d28d9;
  }

  .frame-picker__rarity.is-legendary {
    border-color: #fbbf24;
    color: #b45309;
  }

  .frame-picker__detail-name {
    margin-top: 6px;
    color: var(--text-color);
    font-size: 16px;
  }

  .frame-picker__detail-desc {
    margin-top: 3px;
    color: var(--desc-color);
    font-size: 11.5px;
    line-height: 1.4;
  }

  .frame-picker__detail-meta {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 9px;
    padding: 10px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--background-color);
    text-align: left;
  }

  .frame-picker__detail-row,
  .frame-picker__detail-status,
  .frame-picker__detail-requirement {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    line-height: 1.35;
  }

  .frame-picker__detail-row {
    justify-content: space-between;
    color: var(--desc-color);
  }

  .frame-picker__detail-row strong {
    color: var(--text-color);
  }

  .frame-picker__detail-cost {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: #b45309 !important;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .frame-picker__detail-status,
  .frame-picker__detail-requirement {
    color: var(--primary-color);
    font-weight: 700;
  }

  .frame-picker__detail-action {
    width: 100%;
    min-height: 38px;
    margin-top: 10px;
    flex: 0 0 auto;
    border-radius: 10px;
  }

  :global(html.light-note-mobile-rendering) .frame-card.is-selected,
  :global(html.light-note-mobile-rendering) .frame-card.is-equipped {
    border-color: var(--primary-color);
    box-shadow: none;
  }
</style>

<style lang="less">
  .frame-picker-modal-mask {
    z-index: 720 !important;
  }

  .frame-picker-modal {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px !important;
  }

  .frame-picker-modal__content {
    padding: 0 !important;
    overflow: hidden !important;
  }
</style>

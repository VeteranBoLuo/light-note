<template>
  <div ref="shopRoot" class="ps" :class="{ 'is-mobile': bookmark.isMobile }">
    <BButton v-if="journey && !readOnly" @click="returnToTask">{{ t('entitlementJourney.returnTask') }}</BButton>
    <div v-if="!shop && (shopLoading || !shopError)" class="ps-state"><BLoading inline loading /></div>
    <div v-else-if="shopError && !shop" class="ps-state ps-state--error">
      <span>{{ t('growth.shopLoadFailed') }}</span>
      <BButton size="small" @click="loadShop">{{ t('common.retry') }}</BButton>
    </div>
    <template v-else>
      <div class="ps-head">
        <div class="ps-head-left">
          <h2 class="ps-title"><SvgIcon :src="icon.growth.reward" size="18" /> {{ t('growth.shopTitle') }}</h2>
          <div class="ps-sub">{{ t('growth.shopSubtitle') }}</div>
        </div>
        <div class="ps-balance">
          <span class="ps-balance-label">{{ t('growth.myPoints') }}</span>
          <span class="ps-balance-num"
            ><SvgIcon :src="icon.growth.coin" size="17" /> {{ formatPoints(shop?.points) }}</span
          >
        </div>
      </div>

      <div class="ps-store-bridge">
        <span class="ps-store-bridge__icon" aria-hidden="true"><SvgIcon :src="icon.support.store" size="19" /></span>
        <div class="ps-store-bridge__copy">
          <strong>{{ t('growth.shopStoreTitle') }}</strong>
          <span>{{ t('growth.shopStoreDescription') }}</span>
        </div>
        <RouterLink class="ps-store-bridge__action" :to="storeDestination">
          {{ t('growth.shopStoreAction') }}
          <SvgIcon :src="icon.arrow_right" size="16" aria-hidden="true" />
        </RouterLink>
      </div>
      <div v-if="shop?.isVisitor" class="ps-visitor">{{ t('growth.shopVisitorTip') }}</div>
      <div v-else-if="shop && !shop.purchaseEnabled" class="ps-visitor">{{ t('growth.shopMaintenance') }}</div>

      <PointsGoal
        :key="`${user.id}:${user.adminContext?.id || ''}`"
        v-if="showGoal && !shop?.isVisitor"
        :read-only="readOnly"
        :refresh-key="goalRefreshKey"
        :catalog="[...(shop?.items || []), ...(shop?.frames || [])]"
        :balance="shop?.points"
        :level="shop?.level"
        :purchase-enabled="shop?.purchaseEnabled"
        :mobile="bookmark.isMobile"
        @redeem="scrollToGoalItem"
      />

      <!-- 实用道具 -->
      <div v-if="consumables.length" class="ps-section-title">{{ t('growth.shopSectionConsumable') }}</div>
      <div class="ps-grid">
        <div
          v-for="it in consumables"
          :key="it.id"
          class="ps-item ps-consumable-item"
          :data-shop-item-id="it.id"
          tabindex="-1"
        >
          <div class="ps-item-icon"><SvgIcon :src="itemIcon(it.id)" size="27" /></div>
          <div class="ps-item-body">
            <div class="ps-item-name">{{ itemName(it) }}</div>
            <div class="ps-item-desc">{{ itemDesc(it) }}</div>
            <BChip v-if="it.effect === 'makeup_card'" tone="neutral" class="ps-item-limit">
              {{ t('growth.shopCardInventory', { n: shop?.protectCards || 0 }) }}
            </BChip>
            <BChip v-if="hasPurchaseLimit(it)" :tone="isLimitReached(it) ? 'success' : 'neutral'" class="ps-item-limit">
              {{ purchaseLimitLabel(it) }}
            </BChip>
          </div>
          <div class="ps-item-foot">
            <span class="ps-purchase-meta">
              <span class="ps-item-cost"
                ><SvgIcon :src="icon.growth.coin" size="13" /> {{ formatPoints(it.cost) }}</span
              >
              <small v-if="unavailableLabel(it)" class="ps-item-unavailable">{{ unavailableLabel(it) }}</small>
            </span>
            <BButton
              type="primary"
              :disabled="readOnly || !canBuyNow(it) || buyingId === it.id"
              :loading="buyingId === it.id"
              :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
              @click="askBuy(it)"
            >
              {{ consumableBtn(it) }}
            </BButton>
          </div>
        </div>
      </div>

      <!-- 个人背景与头像框装扮 -->
      <ProfileBackgroundShop :read-only="readOnly" :scroll-target="scrollTarget" @purchased="goalRefreshKey++" />

      <div v-if="frames.length" class="ps-frame-toolbar">
        <div class="ps-section-title">{{ t('growth.shopSectionFrame') }}</div>
        <BTabs
          v-model:active-tab="activeFrameFilter"
          class="ps-frame-filters"
          variant="pill"
          :options="frameFilterOptions"
        />
      </div>
      <div v-if="frames.length" class="ps-grid ps-frame-grid">
        <div
          v-for="it in visibleFrames"
          :key="it.id"
          class="ps-item ps-frame-item"
          :class="[`ps-frame-item--${frameVariant(it.id) || 'default'}`, { 'is-equipped': it.equipped }]"
          :data-shop-item-id="it.id"
          tabindex="-1"
        >
          <AvatarFramePreview
            class="ps-frame-preview"
            :frame-id="it.id"
            :src="avatarSrc"
            :size="dimension(64, 'layout')"
            pause-when-offscreen
          />
          <div class="ps-item-body">
            <div class="ps-item-name">
              {{ itemName(it) }}
              <span v-if="frameVariant(it.id)" class="ps-frame-style">{{ frameStyleName(it.id) }}</span>
              <span v-if="it.rarity" class="ps-frame-rarity" :class="`ps-frame-rarity--${it.rarity}`">{{
                frameRarityName(it.rarity)
              }}</span>
              <span v-if="isAchievementFrame(it)" class="ps-frame-source">{{ t('growth.frameAchievementOnly') }}</span>
              <span v-if="it.equipped" class="ps-tag-equipped">{{ t('growth.shopEquipped') }}</span>
            </div>
            <div class="ps-item-desc">{{ itemDesc(it) }}</div>
            <div v-if="isAchievementFrame(it)" class="ps-achievement-requirement">
              <SvgIcon :src="icon.growth.reward" size="13" />
              {{ t('growth.frameAchievementRequirement', { condition: achievementRequirement(it) }) }}
            </div>
          </div>
          <div class="ps-item-foot">
            <span v-if="!it.owned && isAchievementFrame(it)" class="ps-achievement-progress">
              <SvgIcon :src="icon.growth.reward" size="13" /> {{ achievementProgress(it) }}
            </span>
            <span v-else-if="isAchievementFrame(it)" class="ps-item-cost ps-item-cost--owned">
              {{ t('growth.shopOwned') }}
            </span>
            <span v-else class="ps-purchase-meta">
              <span class="ps-item-cost"
                ><SvgIcon :src="icon.growth.coin" size="13" /> {{ formatPoints(it.cost) }}</span
              >
              <span v-if="it.owned" class="ps-item-owned">{{ t('growth.shopOwned') }}</span>
              <small v-else-if="unavailableLabel(it)" class="ps-item-unavailable">{{ unavailableLabel(it) }}</small>
            </span>
            <template v-if="canEquipFrame(it)">
              <BButton
                v-if="it.equipped"
                size="small"
                :disabled="readOnly || equippingId === it.id"
                :loading="equippingId === it.id"
                :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
                @click="doEquipFrame(null)"
              >
                {{ t('growth.shopUnequip') }}
              </BButton>
              <BButton
                v-else
                size="small"
                type="primary"
                :disabled="readOnly || equippingId === it.id"
                :loading="equippingId === it.id"
                :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
                @click="doEquipFrame(it.id)"
              >
                {{ t('growth.shopEquip') }}
              </BButton>
            </template>
            <BButton
              v-else-if="isAchievementFrame(it)"
              size="small"
              type="primary"
              :disabled="readOnly || !achievementFor(it)?.claimable || claimingId === it.id"
              :loading="claimingId === it.id"
              :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
              @click="doClaimFrame(it)"
            >
              {{ achievementButton(it) }}
            </BButton>
            <BButton
              v-else
              size="small"
              type="primary"
              :disabled="readOnly || !canBuyNow(it) || buyingId === it.id"
              :loading="buyingId === it.id"
              :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
              @click="askBuy(it)"
            >
              {{ titleBtn(it) }}
            </BButton>
          </div>
        </div>
      </div>

      <div
        v-if="!consumables.length && !frames.length && !shop?.items.some((item) => item.effect === 'background')"
        class="ps-empty"
        >{{ t('growth.shopEmpty') }}</div
      >
    </template>
  </div>
</template>

<script setup lang="ts">
  import { readEntitlementJourney, prepareEntitlementReturn } from '@/utils/entitlementJourney';
  import { recordEntitlementEvent } from '@/api/entitlementEvents';
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { RouterLink, useRouter } from 'vue-router';
  import { useGrowth, type ShopItem } from '@/composables/useGrowth.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import ProfileBackgroundShop from './ProfileBackgroundShop.vue';
  import PointsGoal from '@/components/growth/PointsGoal.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useUiDensity } from '@/composables/useUiDensity';
  import { frameVariant, sortFramesByRarity } from '@/config/growthFrames';
  import { findVerticalScrollContainer, scrollIntoContainer } from '@/utils/scrolling';

  const { t, te, locale } = useI18n();
  const { dimension } = useUiDensity();
  const router = useRouter();
  const props = withDefaults(defineProps<{ readOnly?: boolean; scrollTarget?: string; showGoal?: boolean }>(), {
    readOnly: false,
    scrollTarget: '',
    showGoal: false,
  });
  const goalRefreshKey = ref(0);
  const readOnly = computed(() => props.readOnly);
  const { dashboard, shop, shopLoading, shopError, loadShop, buyItem, equipFrame, claimAchievement } = useGrowth();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const journey = ref(readEntitlementJourney(user.id));
  function returnToTask() {
    const current = prepareEntitlementReturn(user.id);
    if (!current) {
      journey.value = null;
      return;
    }
    recordEntitlementEvent('return_task', current);
    void router.push(current.returnPath);
    message.info(t('entitlementJourney.returnHint'));
  }
  watch(
    () => user.id,
    () => {
      journey.value = readEntitlementJourney(user.id);
    },
  );
  const avatarSrc = computed(() => user.headPicture || icon.navigation.user);
  const shopRoot = ref<HTMLElement | null>(null);

  const storeDestination = computed(() => ({
    path: '/store',
    query: { category: ['ai', 'storage'].includes(props.scrollTarget) ? props.scrollTarget : 'ai' },
  }));

  function formatPoints(value: number | null | undefined) {
    return Number(value || 0).toLocaleString(locale.value);
  }

  function itemIcon(itemId: string) {
    if (itemId.startsWith('ai_pack')) return icon.growth.ai;
    if (itemId.startsWith('storage_')) return icon.growth.storage;
    return icon.growth.reward;
  }

  function itemAsset(it: ShopItem) {
    if (it.id.startsWith('ai_pack')) return 'ai';
    if (it.id.startsWith('storage_')) return 'storage';
    return '';
  }

  function hasPurchaseLimit(it: ShopItem) {
    return Number(it.purchaseLimit || 0) > 0;
  }

  function isLimitReached(it: ShopItem) {
    return Boolean(
      it.limitReached ||
      it.unavailableReasons?.includes('purchase_limit') ||
      (hasPurchaseLimit(it) && Number(it.purchaseCount || 0) >= Number(it.purchaseLimit || 0)),
    );
  }

  function purchaseLimitLabel(it: ShopItem) {
    return isLimitReached(it)
      ? t('growth.shopLimitRedeemed')
      : t('growth.shopPurchaseLimit', { n: Number(it.purchaseLimit || 1) });
  }

  function purchaseConfirmation(it: ShopItem) {
    const params = { n: it.cost, name: itemName(it) };
    if (it.effect === 'makeup_card')
      return t('growth.shopBuyConfirmCard', {
        ...params,
        held: shop.value?.protectCards || 0,
      });
    return hasPurchaseLimit(it) ? t('growth.shopBuyConfirmLimited', params) : t('growth.shopBuyConfirm', params);
  }

  async function scrollToRequestedAsset() {
    const requested = props.scrollTarget;
    if (!requested) return;
    const item = consumables.value.find((it) => it.id === requested || itemAsset(it) === requested);
    if (!item) return;
    await nextTick();
    if (props.scrollTarget !== requested) return;
    scrollToItem(item.id);
  }

  // 名称/描述优先取 i18n(双语),缺失键则回退后端返回的中文名(单一经济事实源仍在后端)
  function itemName(it: ShopItem) {
    const k = 'growth.shopItems.' + it.id + '.name';
    return te(k) ? t(k) : it.name;
  }
  function itemDesc(it: ShopItem) {
    const k = 'growth.shopItems.' + it.id + '.desc';
    return te(k) ? t(k) : it.desc;
  }

  function frameStyleName(frameId: string) {
    const key = `growth.frameStyles.${frameId}`;
    return te(key) ? t(key) : '';
  }

  const consumables = computed(
    () =>
      shop.value?.items
        .filter((i) => i.type === 'consumable')
        .sort(
          (a, b) =>
            Number(a.effect === 'makeup_card') - Number(b.effect === 'makeup_card') ||
            Number(isLimitReached(a)) - Number(isLimitReached(b)),
        ) || [],
  );
  const frames = computed(() =>
    sortFramesByRarity(
      shop.value?.frames || shop.value?.items.filter((i) => i.type === 'cosmetic' && i.effect === 'frame') || [],
    ),
  );
  type FrameFilter = 'all' | 'basic' | 'rare' | 'epic' | 'legendary';
  const activeFrameFilter = ref<FrameFilter>('all');
  const frameFilters: FrameFilter[] = ['all', 'basic', 'rare', 'epic', 'legendary'];
  const frameFilterOptions = computed(() =>
    frameFilters.map((filter) => ({
      key: filter,
      label: t(`growth.frameFilters.${filter}`),
      badge: filter === 'all' ? frames.value.length : frames.value.filter((it) => it.rarity === filter).length,
    })),
  );
  const visibleFrames = computed(() =>
    activeFrameFilter.value === 'all'
      ? frames.value
      : frames.value.filter((it) => it.rarity === activeFrameFilter.value),
  );

  async function scrollToGoalItem(itemId: string) {
    if (readOnly.value) return;
    const item = [...(shop.value?.items || []), ...frames.value].find((candidate) => candidate.id === itemId);
    if (!item) return;
    if (frames.value.some((frame) => frame.id === itemId)) activeFrameFilter.value = 'all';
    await nextTick();
    scrollToItem(itemId);
  }

  function scrollToItem(itemId: string) {
    const target = Array.from(shopRoot.value?.querySelectorAll<HTMLElement>('[data-shop-item-id]') || []).find(
      (element) => element.dataset.shopItemId === itemId,
    );
    if (!target) return;
    const container = findVerticalScrollContainer(target, document.scrollingElement as HTMLElement | null);
    if (container) {
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      const tabs = container.querySelector<HTMLElement>('.growth-section-tabs');
      const offset = tabs
        ? tabs.getBoundingClientRect().height +
          (parseFloat(getComputedStyle(container).paddingTop) || 0) +
          dimension(16, 'space')
        : dimension(16, 'space');
      scrollIntoContainer(container, target, offset, behavior);
    }
  }

  function frameRarityName(rarity: NonNullable<ShopItem['rarity']>) {
    return t(`growth.frameRarity.${rarity}`);
  }

  function isAchievementFrame(it: ShopItem) {
    return it.acquisition === 'achievement' && Boolean(it.achievementKey);
  }

  function canEquipFrame(it: ShopItem) {
    return it.type === 'cosmetic' && Boolean(it.canEquip || it.owned || shop.value?.rootFrameAccess);
  }

  function achievementFor(it: ShopItem) {
    return dashboard.value?.achievements.find((achievement) => achievement.key === it.achievementKey);
  }

  function achievementProgress(it: ShopItem) {
    const achievement = achievementFor(it);
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

  function achievementRequirement(it: ShopItem) {
    const key = it.achievementKey ? `growth.achDesc.${it.achievementKey}` : '';
    const condition = key && te(key) ? t(key) : achievementProgress(it);
    const minLevel = achievementFor(it)?.minLevel || 0;
    return minLevel ? t('growth.frameAchievementConditionWithLevel', { condition, level: minLevel }) : condition;
  }

  function achievementButton(it: ShopItem) {
    const achievement = achievementFor(it);
    if (achievement?.claimable) return t('growth.frameAchievementClaim');
    if (achievement?.claimed) return t('growth.achClaimed');
    return t('growth.frameAchievementLocked');
  }

  // 可兑换判定:全前端按 live shop.points/level/owned/上限 实时算,积分变动即时生效(不依赖服务端 canBuy 快照,免刷新)
  function canBuyNow(it: ShopItem) {
    if (readOnly.value) return false;
    const s = shop.value;
    if (!s || !s.purchaseEnabled || s.isVisitor || canEquipFrame(it) || it.acquisition === 'achievement') return false;
    if (isLimitReached(it)) return false;
    if (it.minLevel && (s.level || 0) < it.minLevel) return false;
    return (s.points || 0) >= Number(it.cost || 0);
  }

  function unavailableLabel(it: ShopItem) {
    const s = shop.value;
    if (!s || it.owned || it.acquisition === 'achievement') return '';
    if (isLimitReached(it)) return '';
    if (!s.purchaseEnabled) return t('growth.shopMaintenance');
    if (s.isVisitor) return t('growth.shopLoginRequired');
    if (it.minLevel && (s.level || 0) < it.minLevel) return t('growth.shopLevelNeed', { n: it.minLevel });
    const shortfall = Math.max(0, Number(it.cost || 0) - Number(s.points || 0));
    return shortfall > 0 ? t('growth.shopShortfall', { n: formatPoints(shortfall) }) : '';
  }

  // 消耗品按钮文案:可买=兑换;否则按原因给出置灰提示
  function consumableBtn(it: ShopItem) {
    if (isLimitReached(it)) return t('growth.shopRedeemed');
    if (canBuyNow(it)) return t('growth.shopBuy');
    if (shop.value && !shop.value.purchaseEnabled) return t('growth.shopMaintenanceShort');
    if ((shop.value?.points || 0) < Number(it.cost || 0)) return t('growth.shopInsufficient');
    return t('growth.shopBuy');
  }
  // 称号按钮文案:未拥有且不可买 → 等级不足 / 积分不足
  function titleBtn(it: ShopItem) {
    if (canBuyNow(it)) return t('growth.shopBuy');
    if (shop.value && !shop.value.purchaseEnabled) return t('growth.shopMaintenanceShort');
    if (it.minLevel && (shop.value?.level || 0) < it.minLevel) return t('growth.shopLevelNeed', { n: it.minLevel });
    if ((shop.value?.points || 0) < Number(it.cost || 0)) return t('growth.shopInsufficient');
    return t('growth.shopBuy');
  }

  const buyingId = ref<string | null>(null);
  const equippingId = ref<string | null>(null);
  const claimingId = ref<string | null>(null);

  let disposed = false;
  onBeforeUnmount(() => {
    disposed = true;
  });

  function askBuy(it: ShopItem) {
    if (readOnly.value || !canBuyNow(it)) return;
    recordEntitlementEvent('select_item', { ...journey.value, skuId: it.id });
    const ownerId = user.id;
    Alert.alert({
      title: t('growth.shopBuy'),
      content: purchaseConfirmation(it),
      okText: t('growth.shopBuy'),
      cancelText: t('common.cancel'),
      onOk: () => {
        if (!disposed && ownerId === user.id) return confirmBuy(it);
      },
    });
  }

  async function confirmBuy(it: ShopItem) {
    if (readOnly.value) return;
    if (buyingId.value) return;
    buyingId.value = it.id;
    try {
      const res = await buyItem(it.id);
      if (res?.status === 200 && res.data?.ok) {
        goalRefreshKey.value++;
        message.success(t('growth.shopBuyOk'));
        recordOperation({ module: '成长', operation: '兑换成长权益' });
      } else if (res?.status === 200 && res.data?.reason === 'purchase_limit') {
        message.warning(t('growth.shopLimitReached'));
      } else if (res?.status === 409 && res.data?.refresh) {
        message.warning(t('growth.economyCatalogChanged'));
      } else {
        message.error(res?.data?.msg || t('growth.shopInsufficient'));
      }
    } catch (err) {
      console.error('兑换失败:', err);
    } finally {
      buyingId.value = null;
    }
  }

  async function doClaimFrame(it: ShopItem) {
    if (readOnly.value || !it.achievementKey || !achievementFor(it)?.claimable) return;
    claimingId.value = it.id;
    try {
      const res = await claimAchievement(it.achievementKey);
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('growth.frameAchievementClaimOk', { name: itemName(it) }));
        recordOperation({ module: '成长', operation: '领取成就头像框' });
      } else {
        message.error(res?.data?.msg || t('growth.operationFailed'));
      }
    } catch (err) {
      console.error('领取成就头像框失败:', err);
      message.error(t('growth.operationFailed'));
    } finally {
      claimingId.value = null;
    }
  }

  async function doEquipFrame(frameId: string | null) {
    if (readOnly.value) return;
    equippingId.value = frameId || 'unequip';
    try {
      const res = await equipFrame(frameId);
      if (res?.status === 200 && res.data?.ok) {
        if (frameId) {
          const it = frames.value.find((i) => i.id === frameId);
          message.success(t('growth.shopEquipOk', { name: it ? itemName(it) : '' }));
          recordOperation({ module: '成长', operation: '佩戴头像框' });
        } else {
          message.success(t('growth.shopUnequipOk'));
          recordOperation({ module: '成长', operation: '卸下头像框' });
        }
      } else {
        message.error(res?.data?.msg || t('growth.operationFailed'));
      }
    } catch (err) {
      console.error('佩戴头像框失败:', err);
    } finally {
      equippingId.value = null;
    }
  }

  onMounted(async () => {
    await loadShop();
    await scrollToRequestedAsset();
  });

  watch(
    () => props.scrollTarget,
    () => void scrollToRequestedAsset(),
  );
</script>

<style scoped lang="less">
  .ps {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-14, 14px);
  }
  .ps-state {
    min-height: var(--ui-layout-180, 180px);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-10, 10px);
    color: var(--desc-color);
  }
  .ps-state--error {
    flex-direction: column;
  }
  .ps-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
    flex-wrap: wrap;
  }
  .ps-title {
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    font-size: var(--ui-font-16, 16px);
    font-weight: 700;
  }
  .ps-sub {
    margin-top: var(--ui-space-4, 4px);
    font-size: var(--ui-font-12_5, 12.5px);
    color: var(--desc-color);
    max-width: var(--ui-layout-420, 420px);
  }
  .ps-balance {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--ui-space-2, 2px);
    padding: var(--ui-space-8, 8px) var(--ui-space-14, 14px);
    border-radius: 12px;
    background: var(--chip-pending-bg);
    border: 1px solid var(--chip-pending-border);
    white-space: nowrap;
  }
  .ps-balance-label {
    font-size: var(--ui-font-11, 11px);
    color: var(--desc-color);
  }
  .ps-balance-num {
    display: flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    font-size: var(--ui-font-18, 18px);
    font-weight: 800;
    color: var(--warning-color);
    font-variant-numeric: tabular-nums;
  }
  .ps-store-bridge {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-panel-bg);
  }
  .ps-store-bridge__icon {
    width: var(--ui-layout-36, 36px);
    height: var(--ui-layout-36, 36px);
    display: grid;
    place-items: center;
    color: var(--workspace-purple-text);
  }
  .ps-store-bridge__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-2, 2px);
  }
  .ps-store-bridge__copy strong {
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
  }
  .ps-store-bridge__copy span {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .ps-store-bridge__action {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--ui-space-6, 6px);
    min-height: var(--ui-control-32, 32px);
    padding: 0 var(--ui-space-4, 4px);
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-13, 13px);
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    border-radius: 6px;
    touch-action: manipulation;
  }
  .ps-store-bridge__action:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .ps-store-bridge__action:active {
    text-decoration: underline;
  }
  @media (hover: hover) and (pointer: fine) {
    .ps-store-bridge__action:hover {
      text-decoration: underline;
    }
  }
  .ps-visitor {
    font-size: var(--ui-font-12_5, 12.5px);
    color: var(--primary-color);
  }
  .ps-section-title {
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
    color: var(--text-color);
    margin-top: var(--ui-space-8, 8px);
  }
  .ps-frame-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-10, 10px) var(--ui-space-16, 16px);
    margin-top: var(--ui-space-4, 4px);
    flex-wrap: wrap;
  }
  .ps-frame-toolbar .ps-section-title {
    margin-top: 0;
  }
  .ps-frame-filters {
    flex-wrap: wrap;
  }
  .ps-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-12, 12px);
  }
  .ps.is-mobile {
    gap: var(--ui-space-12, 12px);

    .ps-store-bridge {
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--ui-space-4, 4px) var(--ui-space-10, 10px);
      padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    }
    .ps-store-bridge__action {
      grid-column: 2;
      justify-self: start;
    }
    .ps-grid {
      grid-template-columns: 1fr;
    }
  }
  .ps-item {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-14, 14px);
    border-radius: 14px;
    background: var(--background-color);
    border: 1px solid color-mix(in srgb, var(--card-border-color) 50%, transparent);
    transition:
      border-color 0.15s,
      transform 0.15s,
      box-shadow 0.15s;
  }
  .ps-consumable-item {
    display: grid;
    grid-template-areas: 'icon body' 'icon foot';
    grid-template-columns: auto minmax(0, 1fr);
    align-content: start;
    column-gap: var(--ui-space-12, 12px);
    row-gap: var(--ui-space-8, 8px);
    border-color: var(--surface-border-color);
    background: var(--surface-card-bg);
  }
  .ps-consumable-item .ps-item-icon {
    grid-area: icon;
    display: grid;
    place-items: center;
    width: var(--ui-layout-32, 32px);
    height: var(--ui-layout-32, 32px);
    border-radius: 8px;
    color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }
  .ps-consumable-item .ps-item-body {
    grid-area: body;
  }
  .ps-consumable-item .ps-item-foot {
    grid-area: foot;
  }
  .ps-consumable-item .ps-item-name,
  .ps-consumable-item .ps-item-desc {
    overflow-wrap: anywhere;
  }
  .ps-consumable-item .ps-item-foot :deep(.b_btn) {
    flex-shrink: 0;
    font-size: var(--ui-font-13, 13px);
  }
  .ps-item:hover {
    border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
    transform: translateY(-2px);
    box-shadow: 0 10px 24px -18px rgba(30, 35, 70, 0.5);
  }
  .ps-item.is-equipped {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 6%, var(--background-color));
    box-shadow: inset 0 0 0 1px var(--primary-color);
  }
  .ps-item-icon {
    color: var(--primary-color);
  }
  .ps-frame-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--ui-layout-300, 300px)), 1fr));
  }
  .ps-frame-item {
    display: grid;
    grid-template-areas:
      'preview body'
      'preview foot';
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: var(--ui-space-15, 15px);
    row-gap: var(--ui-space-10, 10px);
    min-height: var(--ui-layout-112, 112px);
    padding: var(--ui-space-16, 16px);
    overflow: hidden;
  }
  .ps-frame-item--mint {
    background:
      radial-gradient(circle at 8% 50%, color-mix(in srgb, #5eead4 12%, transparent), transparent 33%),
      linear-gradient(135deg, color-mix(in srgb, #14b8a6 12%, var(--background-color)), var(--background-color) 54%);
  }
  .ps-frame-item--ink {
    background:
      radial-gradient(circle at 8% 50%, color-mix(in srgb, #cbd5e1 9%, transparent), transparent 34%),
      linear-gradient(135deg, color-mix(in srgb, #64748b 11%, var(--background-color)), var(--background-color) 54%);
  }
  .ps-frame-item--moonstone {
    background:
      radial-gradient(circle at 8% 50%, color-mix(in srgb, #dbeafe 12%, transparent), transparent 34%),
      linear-gradient(135deg, color-mix(in srgb, #94a3b8 10%, var(--background-color)), var(--background-color) 54%);
  }
  .ps-frame-item--gold {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #f59e0b 11%, var(--background-color)),
      var(--background-color) 52%
    );
  }
  .ps-frame-item--sakura {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #ec4899 10%, var(--background-color)),
      var(--background-color) 54%
    );
  }
  .ps-frame-item--neon {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #6366f1 15%, var(--background-color)),
      color-mix(in srgb, #22d3ee 7%, var(--background-color)) 52%,
      var(--background-color) 54%
    );
  }
  .ps-frame-item--sunset {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #fb7185 11%, var(--background-color)),
      var(--background-color) 54%
    );
  }
  .ps-frame-item--ocean {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #0ea5e9 11%, var(--background-color)),
      var(--background-color) 54%
    );
  }
  .ps-frame-item--aurora {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #10b981 13%, var(--background-color)),
      color-mix(in srgb, #7c3aed 7%, var(--background-color)) 55%,
      var(--background-color)
    );
  }
  .ps-frame-item--streak-month {
    background:
      radial-gradient(circle at 9% 50%, color-mix(in srgb, #c4b5fd 14%, transparent), transparent 34%),
      linear-gradient(135deg, color-mix(in srgb, #4f46e5 13%, var(--background-color)), var(--background-color) 58%);
  }
  .ps-frame-item--galaxy,
  .ps-frame-item--galaxy.is-equipped {
    background:
      radial-gradient(circle at 87% 18%, rgba(255, 255, 255, 0.86) 0 1px, transparent 1.6px),
      radial-gradient(circle at 74% 77%, rgba(224, 231, 255, 0.72) 0 1px, transparent 1.5px),
      linear-gradient(135deg, color-mix(in srgb, #7c3aed 16%, var(--background-color)), var(--background-color) 58%);
  }
  .ps-frame-item--galaxy:hover {
    border-color: color-mix(in srgb, #a78bfa 68%, var(--card-border-color));
    box-shadow: 0 12px 26px -18px rgba(91, 33, 182, 0.68);
  }
  .ps-frame-item--flame {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #ef4444 14%, var(--background-color)),
      color-mix(in srgb, #f59e0b 7%, var(--background-color)) 56%,
      var(--background-color)
    );
  }
  .ps-frame-item--dragon,
  .ps-frame-item--dragon.is-equipped {
    background:
      radial-gradient(circle at 86% 18%, rgba(254, 243, 199, 0.72) 0 1px, transparent 1.7px),
      linear-gradient(135deg, color-mix(in srgb, #b91c1c 16%, var(--background-color)), var(--background-color) 58%);
  }
  .ps-frame-item--dragon:hover {
    border-color: #d97706;
    box-shadow: 0 12px 26px -18px rgba(153, 27, 27, 0.75);
  }
  .ps-frame-item--celestial,
  .ps-frame-item--celestial.is-equipped {
    background:
      radial-gradient(circle at 11% 50%, rgba(250, 204, 21, 0.2) 0, transparent 33%),
      radial-gradient(circle at 87% 18%, rgba(254, 243, 199, 0.92) 0 1px, transparent 1.7px),
      radial-gradient(circle at 73% 78%, rgba(221, 214, 254, 0.82) 0 1px, transparent 1.6px),
      linear-gradient(
        135deg,
        color-mix(in srgb, #312e81 26%, var(--background-color)),
        color-mix(in srgb, #d97706 9%, var(--background-color)) 54%,
        var(--background-color) 78%
      );
  }
  .ps-frame-item--celestial:hover {
    border-color: #f59e0b;
    box-shadow: 0 12px 28px -17px rgba(49, 46, 129, 0.82);
  }
  .ps-frame-item--note-constellation,
  .ps-frame-item--note-constellation.is-equipped {
    background:
      radial-gradient(circle at 10% 50%, rgba(52, 211, 153, 0.18) 0, transparent 32%),
      radial-gradient(circle at 86% 20%, rgba(254, 240, 138, 0.86) 0 1px, transparent 1.7px),
      linear-gradient(
        135deg,
        color-mix(in srgb, #064e3b 20%, var(--background-color)),
        color-mix(in srgb, #312e81 8%, var(--background-color)) 56%,
        var(--background-color) 80%
      );
  }
  .ps-frame-item--note-constellation:hover {
    border-color: #10b981;
    box-shadow: 0 12px 30px -17px rgba(6, 95, 70, 0.82);
  }
  .ps-frame-item--file-constellation,
  .ps-frame-item--file-constellation.is-equipped {
    background:
      radial-gradient(circle at 10% 50%, rgba(56, 189, 248, 0.18) 0, transparent 32%),
      radial-gradient(circle at 86% 20%, rgba(224, 242, 254, 0.92) 0 1px, transparent 1.7px),
      linear-gradient(
        135deg,
        color-mix(in srgb, #075985 21%, var(--background-color)),
        color-mix(in srgb, #f59e0b 8%, var(--background-color)) 56%,
        var(--background-color) 80%
      );
  }
  .ps-frame-item--file-constellation:hover {
    border-color: #38bdf8;
    box-shadow: 0 12px 30px -17px rgba(3, 105, 161, 0.82);
  }
  .ps-frame-item--streak-eternal,
  .ps-frame-item--streak-eternal.is-equipped {
    background:
      radial-gradient(circle at 11% 50%, rgba(253, 224, 71, 0.15) 0, transparent 31%),
      radial-gradient(circle at 86% 20%, rgba(219, 234, 254, 0.9) 0 1px, transparent 1.7px),
      linear-gradient(
        135deg,
        color-mix(in srgb, #1d4ed8 19%, var(--background-color)),
        color-mix(in srgb, #7c3aed 10%, var(--background-color)) 55%,
        var(--background-color) 80%
      );
  }
  .ps-frame-item--streak-eternal:hover {
    border-color: #facc15;
    box-shadow: 0 12px 30px -17px rgba(79, 70, 229, 0.86);
  }
  .ps-frame-preview {
    grid-area: preview;
  }
  .ps-frame-item .ps-item-body {
    grid-area: body;
    align-self: end;
  }
  .ps-frame-item .ps-item-foot {
    grid-area: foot;
    align-self: start;
  }
  .ps-item-body {
    flex: 1 1 auto;
    min-width: 0;
  }
  .ps-item-name {
    font-size: var(--ui-font-14, 14px);
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    flex-wrap: wrap;
  }
  .ps-frame-style {
    padding: var(--ui-space-2, 2px) var(--ui-space-7, 7px);
    border-radius: 999px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
    font-size: var(--ui-font-10, 10px);
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .ps-frame-rarity {
    padding: var(--ui-space-2, 2px) var(--ui-space-7, 7px);
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    color: #475569;
    background: #f8fafc;
    font-size: var(--ui-font-10, 10px);
    font-weight: 800;
    letter-spacing: 0.06em;
  }
  .ps-frame-rarity--rare {
    border-color: #7dd3fc;
    color: #075985;
    background: #e0f2fe;
  }
  .ps-frame-rarity--epic {
    border-color: #c4b5fd;
    color: #5b21b6;
    background: #ede9fe;
  }
  .ps-frame-rarity--legendary {
    border-color: #fde68a;
    color: #fff7ed;
    background: linear-gradient(135deg, #7c3aed, #92400e);
    box-shadow: 0 2px 8px -4px rgba(76, 29, 149, 0.92);
  }
  .ps-frame-source {
    padding: var(--ui-space-2, 2px) var(--ui-space-7, 7px);
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--background-color);
    font-size: var(--ui-font-10, 10px);
    font-weight: 700;
  }
  .ps-tag-equipped {
    font-size: var(--ui-font-10_5, 10.5px);
    font-weight: 600;
    padding: var(--ui-space-1, 1px) var(--ui-space-7, 7px);
    border-radius: 999px;
    color: #fff;
    background: linear-gradient(135deg, var(--primary-color), #22d3ee);
  }
  .ps-item-desc {
    margin-top: var(--ui-space-4, 4px);
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    line-height: 1.5;
  }
  .ps-item-limit {
    margin-top: var(--ui-space-8, 8px);
  }
  .ps-achievement-requirement {
    display: flex;
    align-items: center;
    gap: var(--ui-space-5, 5px);
    margin-top: var(--ui-space-5, 5px);
    color: var(--primary-color);
    font-size: var(--ui-font-11_5, 11.5px);
    font-weight: 600;
    line-height: 1.4;
  }
  .ps-item-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-8, 8px);
  }
  .ps-item-cost {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-3, 3px);
    font-size: var(--ui-font-13, 13px);
    font-weight: 700;
    color: var(--warning-color);
    font-variant-numeric: tabular-nums;
  }
  .ps-item-cost--owned {
    color: var(--desc-color);
    font-weight: 600;
  }
  .ps-purchase-meta {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-7, 7px);
    flex-wrap: wrap;
  }
  .ps-item-owned {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    font-weight: 700;
  }
  .ps-item-unavailable {
    color: var(--desc-color);
    font-size: var(--ui-font-10_5, 10.5px);
    font-weight: 500;
    white-space: nowrap;
  }
  .ps-achievement-progress {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    color: var(--primary-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 700;
  }
  .ps-empty {
    text-align: center;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    padding: var(--ui-space-20, 20px) 0;
  }
  @media (max-width: 560px) {
    .ps-frame-toolbar {
      align-items: flex-start;
      flex-direction: column;
    }
    .ps-frame-filters {
      width: 100%;
    }
    .ps-frame-item {
      column-gap: 12px;
      padding: 14px;
    }
  }
</style>

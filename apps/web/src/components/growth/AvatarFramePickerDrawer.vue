<template>
  <BDrawer
    :open="open"
    :title="t('myInfo.avatarDecorations')"
    placement="bottom"
    height="min(82vh, 760px)"
    body-padding="0"
    mobile-centered-header
    @close="closeDrawer"
  >
    <div class="frame-picker">
      <div class="frame-picker__toolbar">
        <div class="frame-picker__balance">
          <span>{{ t('growth.myPoints') }}</span>
          <strong><SvgIcon :src="icon.growth.coin" size="17" /> {{ (shop?.points || 0).toLocaleString() }}</strong>
        </div>
        <BButton class="frame-picker__earn" @click="goGrowth">{{ t('myInfo.earnPoints') }}</BButton>
      </div>

      <BTabs v-model:active-tab="activeFilter" variant="segment" :options="filterOptions" />

      <div class="frame-picker__content">
        <BLoading v-if="shopLoading && !shop" inline :loading="true" :title="t('common.loading')" />

        <div v-else-if="visibleFrames.length" class="frame-picker__grid" role="list">
          <BButton
            v-for="frame in visibleFrames"
            :key="frame.id"
            class="frame-card"
            :class="{
              'is-selected': selectedId === frame.id,
              'is-equipped': frame.equipped,
              'is-locked': !frame.owned && !canMeetLevel(frame),
            }"
            role="listitem"
            :aria-pressed="selectedId === frame.id"
            @click="selectedId = frame.id"
          >
            <span v-if="frame.equipped" class="frame-card__check" aria-hidden="true">
              <SvgIcon :src="icon.filterPanel.check" size="13" />
            </span>
            <AvatarFramePreview :frame-id="frame.id" :src="avatarSrc" :size="58" />
            <span class="frame-card__copy">
              <strong>{{ itemName(frame) }}</strong>
              <small v-if="frame.equipped">{{ t('growth.shopEquipped') }}</small>
              <small v-else-if="frame.owned">{{ t('growth.shopOwned') }}</small>
              <small v-else-if="!canMeetLevel(frame)" class="frame-card__locked">
                <SvgIcon :src="icon.growth.lock" size="11" />
                {{ t('growth.shopLevelNeed', { n: frame.minLevel }) }}
              </small>
              <small v-else class="frame-card__cost">
                <SvgIcon :src="icon.growth.coin" size="12" /> {{ frame.cost }}
              </small>
            </span>
          </BButton>
        </div>

        <div v-else class="frame-picker__empty">{{ t('myInfo.noOwnedFrames') }}</div>
      </div>

      <div v-if="selectedFrame" class="frame-picker__action-bar">
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
  </BDrawer>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
  import { bookmarkStore, useUserStore } from '@/store';
  import { useGrowth, type ShopItem } from '@/composables/useGrowth';
  import { recordOperation } from '@/api/commonApi';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import icon from '@/config/icon';

  const props = defineProps<{ open: boolean }>();
  const emit = defineEmits<{ 'update:open': [value: boolean] }>();
  const { t, te } = useI18n();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const { shop, shopLoading, loadShop, buyItem, equipFrame } = useGrowth();

  const activeFilter = ref<'all' | 'owned'>('all');
  const selectedId = ref<string | null>(null);
  const processingId = ref<string | null>(null);
  const avatarSrc = computed(() => user.headPicture || icon.navigation.user);
  const frames = computed(() => shop.value?.items.filter((item) => item.type === 'cosmetic') || []);
  const visibleFrames = computed(() =>
    activeFilter.value === 'owned' ? frames.value.filter((item) => item.owned) : frames.value,
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
    if (frame.owned || !canMeetLevel(frame)) return false;
    return (shop.value?.points || 0) < frame.cost;
  });
  const actionLabel = computed(() => {
    const frame = selectedFrame.value;
    if (!frame) return '';
    if (shop.value?.isVisitor) return t('myInfo.loginToDecorate');
    if (frame.equipped) return t('growth.shopUnequip');
    if (frame.owned) return t('growth.shopEquip');
    if (!canMeetLevel(frame)) return t('myInfo.goToGrowth');
    if ((shop.value?.points || 0) < frame.cost) return t('growth.shopInsufficient');
    return t('myInfo.redeemAndEquip');
  });

  watch(
    () => props.open,
    async (open) => {
      if (!open) return;
      const currentShop = await loadShop();
      const currentFrames = currentShop?.items.filter((item) => item.type === 'cosmetic') || [];
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

  function canMeetLevel(item: ShopItem) {
    return !item.minLevel || (shop.value?.level || 0) >= item.minLevel;
  }

  function closeDrawer() {
    emit('update:open', false);
  }

  function goGrowth() {
    void closeCurrentMobileOverlayThen(closeDrawer, () => router.push('/growth'));
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

  function handlePrimaryAction() {
    const frame = selectedFrame.value;
    if (!frame) return;
    if (shop.value?.isVisitor) {
      bookmark.isShowLogin = true;
      return;
    }
    if (!canMeetLevel(frame)) {
      goGrowth();
      return;
    }
    if (frame.owned) {
      void applyFrame(frame, frame.equipped ? null : frame.id);
      return;
    }

    Alert.alert({
      title: t('myInfo.redeemFrameTitle'),
      content: t('myInfo.redeemFrameConfirm', { name: itemName(frame), points: frame.cost }),
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

  .frame-picker__content {
    min-height: 0;
    flex: 1 1 auto;
    padding: 14px 16px;
    overflow-y: auto;
    overscroll-behavior-y: contain;
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
  .frame-card__copy .frame-card__locked {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }

  .frame-card__copy .frame-card__cost {
    color: #b45309;
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

  :global(html.light-note-mobile-rendering) .frame-card.is-selected,
  :global(html.light-note-mobile-rendering) .frame-card.is-equipped {
    border-color: var(--primary-color);
    box-shadow: none;
  }
</style>

<template>
  <section v-if="backgrounds.length || shop?.equippedBackground" ref="section" class="background-shop">
    <div class="background-shop__heading">
      <div
        ><h3>{{ t('profileBackgrounds.title') }}</h3
        ><p>{{ t('profileBackgrounds.subtitle') }}</p></div
      >
      <BButton v-if="shop?.equippedBackground" size="small" :disabled="readOnly || busy" @click="equip(null)">
        {{ t('profileBackgrounds.restore') }}
      </BButton>
    </div>
    <div class="background-shop__grid">
      <article
        v-for="item in backgrounds"
        :key="item.id"
        class="background-shop__item"
        :class="{ 'is-equipped': item.equipped }"
        :data-shop-item-id="item.id"
        tabindex="-1"
      >
        <ProfileBackgroundArt :background-id="item.id" thumbnail />
        <div class="background-shop__copy">
          <div class="background-shop__name">
            <strong>{{ name(item.id) }}</strong>
            <BChip v-if="profileBackground(item.id)?.animated" tone="tag">{{ t('profileBackgrounds.animated') }}</BChip>
          </div>
          <span class="background-shop__theme">
            {{ t(`profileBackgrounds.${item.id}Description`) }}
          </span>
          <span>{{
            item.equipped
              ? t('profileBackgrounds.using')
              : item.owned
                ? t('profileBackgrounds.owned')
                : t('profileBackgrounds.permanent')
          }}</span>
          <div class="background-shop__actions">
            <span>{{
              item.owned
                ? t('profileBackgrounds.shared')
                : t('profileBackgrounds.redeem', { n: item.cost?.toLocaleString() })
            }}</span>
            <BButton size="small" :disabled="busy" @click="preview(item)">{{
              t('profileBackgrounds.preview')
            }}</BButton>
          </div>
        </div>
      </article>
    </div>
    <BModal
      v-model:visible="visible"
      :title="t('profileBackgrounds.previewTitle')"
      width="min(var(--ui-layout-840, 840px), 94vw)"
      :show-footer="false"
    >
      <div v-if="selected" class="background-preview">
        <div class="background-shop__name">
          <h3>{{ name(selected.id) }}</h3>
          <BChip v-if="profileBackground(selected.id)?.animated" tone="tag">{{
            t('profileBackgrounds.animated')
          }}</BChip>
        </div>
        <p>
          {{ t(`profileBackgrounds.${selected.id}Description`) }}
          {{ t('profileBackgrounds.previewHint') }}
        </p>
        <strong>{{ t('profileBackgrounds.card') }}</strong>
        <div class="background-preview__card"><ChatUserProfileContent :profile="previewProfile" identity-only /></div>
        <strong>{{ t('profileBackgrounds.page') }}</strong>
        <div class="background-preview__page">
          <ChatUserProfileContent :profile="previewProfile" identity-only>
            <template #identityDescription
              ><p class="background-preview__bio">{{ t('profileBackgrounds.previewBio') }}</p></template
            >
            <template #identityActions
              ><span class="background-preview__edit">{{ t('community.feed.editProfile') }}</span></template
            >
          </ChatUserProfileContent>
        </div>
        <p v-if="notice" role="status">{{ notice }}</p>
        <div class="background-preview__footer">
          <span>{{ t('profileBackgrounds.subtitle') }}</span>
          <BButton
            v-if="selectedItem?.owned"
            type="primary"
            :disabled="readOnly || busy || selectedItem.equipped"
            :loading="busy"
            @click="equip(selected.id)"
          >
            {{ selectedItem.equipped ? t('profileBackgrounds.using') : t('profileBackgrounds.use') }}
          </BButton>
          <BButton v-else type="primary" :loading="busy" :disabled="!canRedeem || busy" @click="redeem">
            {{ t('profileBackgrounds.redeem', { n: selected.cost?.toLocaleString() }) }}
          </BButton>
        </div>
        <p v-if="unavailable" role="status">{{ unavailable }}</p>
      </div>
    </BModal>
  </section>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { findVerticalScrollContainer, scrollIntoContainer } from '@/utils/scrolling';
  import { useGrowth, type ShopItem } from '@/composables/useGrowth';
  import { useUserStore } from '@/store';
  import { profileBackground } from '@/config/profileBackgrounds';
  import ProfileBackgroundArt from './ProfileBackgroundArt.vue';
  import type { CommunityChatAuthorProfile } from '@/api/communityChatApi';
  import ChatUserProfileContent from '@/components/communityChat/ChatUserProfileContent.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';

  const props = withDefaults(defineProps<{ readOnly?: boolean; scrollTarget?: string }>(), {
    readOnly: false,
    scrollTarget: '',
  });
  const emit = defineEmits<{ purchased: [] }>();
  const { t } = useI18n();
  const user = useUserStore();
  const { shop, growth, buyItem, equipBackground } = useGrowth();
  const section = ref<HTMLElement | null>(null);
  const visible = ref(false);
  const selected = ref<ShopItem | null>(null);
  const quoteVersion = ref('');
  const busy = ref(false);
  const notice = ref('');
  let disposed = false;
  let generation = 0;
  onBeforeUnmount(() => {
    disposed = true;
    generation++;
  });
  watch(
    () => user.id,
    () => {
      generation++;
      visible.value = false;
      selected.value = null;
      busy.value = false;
    },
  );
  const backgrounds = computed(
    () => shop.value?.items.filter((item) => item.effect === 'background' && profileBackground(item.id)) || [],
  );
  const selectedItem = computed(() => backgrounds.value.find((item) => item.id === selected.value?.id));
  const name = (id: string) => t(`profileBackgrounds.${id}`);
  const canRedeem = computed(
    () =>
      !props.readOnly &&
      shop.value?.purchaseEnabled &&
      !shop.value.isVisitor &&
      selectedItem.value?.canBuy &&
      !selectedItem.value.owned,
  );
  const unavailable = computed(() => {
    if (props.readOnly) return t('growth.adminContextActionUnavailable');
    if (selectedItem.value?.owned) return '';
    if (shop.value?.isVisitor) return t('growth.shopLoginRequired');
    if (!shop.value?.purchaseEnabled) return t('growth.shopMaintenance');
    const shortfall = Math.max(0, Number(selected.value?.cost || 0) - Number(shop.value?.points || 0));
    return shortfall ? t('growth.shopShortfall', { n: shortfall }) : '';
  });
  const previewProfile = computed<CommunityChatAuthorProfile>(() => ({
    name: user.alias || t('profileBackgrounds.previewName'),
    avatar: user.headPicture || '',
    userPublicId: '',
    communityId: '',
    role: 'member',
    level: shop.value?.level || 1,
    levelName: growth.value?.name || '',
    title: null,
    frameId: shop.value?.equippedFrame || null,
    frameRarity: null,
    backgroundId: selected.value?.id || null,
    bio: '',
    communityTenureLabel: null,
    achievements: [],
    achievementCount: 0,
    hasMoreAchievements: false,
  }));
  function preview(item: ShopItem) {
    if (busy.value) return;
    selected.value = { ...item };
    quoteVersion.value = shop.value?.economyVersion || '';
    notice.value = '';
    visible.value = true;
  }
  function redeem() {
    if (!canRedeem.value || !selected.value || busy.value) return;
    const item = { ...selected.value };
    const ownerId = user.id;
    const version = quoteVersion.value;
    const requestGeneration = generation;
    Alert.alert({
      title: t('growth.shopBuy'),
      content: t('profileBackgrounds.confirm', { n: item.cost, name: name(item.id) }),
      okText: t('growth.shopBuy'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        if (disposed || requestGeneration !== generation || ownerId !== user.id || props.readOnly || busy.value) return;
        busy.value = true;
        try {
          const res = await buyItem(item.id, { economyVersion: version, expectedCost: Number(item.cost) });
          if (disposed || requestGeneration !== generation || ownerId !== user.id) return;
          if (res?.status === 200 && res.data?.ok) {
            emit('purchased');
            notice.value = t('profileBackgrounds.purchased');
            message.success(notice.value);
          } else if (res?.status === 200 && res.data?.reason === 'owned') {
            message.warning(t('profileBackgrounds.owned'));
          } else if (res?.status === 409 && res.data?.refresh) {
            message.warning(t('growth.economyCatalogChanged'));
            visible.value = false;
          } else message.error(res?.data?.msg || t('growth.operationFailed'));
        } catch {
          if (requestGeneration === generation) message.error(t('growth.operationFailed'));
        } finally {
          if (requestGeneration === generation) busy.value = false;
        }
      },
    });
  }
  async function equip(id: string | null) {
    if (props.readOnly || busy.value || shop.value?.isVisitor) return;
    const requestGeneration = generation;
    busy.value = true;
    try {
      const res = await equipBackground(id);
      if (disposed || requestGeneration !== generation) return;
      if (res?.status === 200 && res.data?.ok) {
        notice.value = t(id ? 'profileBackgrounds.used' : 'profileBackgrounds.restored');
        message.success(notice.value);
      } else message.error(res?.data?.msg || t('growth.operationFailed'));
    } catch {
      if (requestGeneration === generation) message.error(t('growth.operationFailed'));
    } finally {
      if (requestGeneration === generation) busy.value = false;
    }
  }
  watch(
    [() => props.scrollTarget, () => backgrounds.value.length],
    async () => {
      if (props.scrollTarget !== 'background') return;
      await nextTick();
      if (props.scrollTarget !== 'background' || !section.value || disposed) return;
      const container = findVerticalScrollContainer(section.value, document.documentElement);
      if (container) {
        const tabs = container.querySelector<HTMLElement>('.growth-section-tabs');
        const offset = tabs
          ? tabs.getBoundingClientRect().height + (parseFloat(getComputedStyle(container).paddingTop) || 0)
          : 0;
        scrollIntoContainer(container, section.value, offset, 'auto');
      }
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .background-shop {
    margin-top: var(--ui-space-24, 24px);
  }
  .background-shop__heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--ui-space-16, 16px);
  }
  .background-shop h3,
  .background-preview h3 {
    margin: 0;
    font-size: var(--ui-font-16, 16px);
    color: var(--text-color);
  }
  .background-shop p,
  .background-preview > p {
    margin: var(--ui-space-8, 8px) 0 var(--ui-space-16, 16px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
  }
  .background-shop__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-16, 16px);
  }
  .background-shop__item {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }
  .background-shop__item.is-equipped {
    border-color: var(--primary-color);
  }
  .background-shop__copy {
    display: grid;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-16, 16px);
    font-size: var(--ui-font-14, 14px);
  }
  .background-shop__copy > span {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .background-shop__name {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }
  .background-shop__actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-8, 8px);
    flex-wrap: wrap;
  }
  .background-preview {
    display: grid;
    gap: var(--ui-space-12, 12px);
  }
  .background-preview > strong {
    font-size: var(--ui-font-13, 13px);
  }
  .background-preview__card {
    max-width: var(--ui-layout-520, 520px);
    width: 100%;
  }
  .background-preview__bio {
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
    margin: var(--ui-space-8, 8px) 0 0;
  }
  .background-preview__page :deep(.chat-profile-content__hero) {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    padding: var(--ui-space-24, 24px);
    gap: var(--ui-space-16, 16px);
  }
  .background-preview__page :deep(.chat-profile-content__identity) {
    flex: 1;
    padding: 0;
    align-items: flex-start;
    min-height: var(--ui-layout-160, 160px);
  }
  .background-preview__edit {
    color: var(--primary-color);
    background: var(--card-background);
    border-radius: 8px;
    padding: var(--ui-space-6, 6px) var(--ui-space-8, 8px);
    font-size: var(--ui-font-12, 12px);
  }
  .background-preview__footer {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-16, 16px);
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid var(--surface-border-color);
    padding-top: var(--ui-space-16, 16px);
  }
  .background-preview__footer > span {
    flex: 1;
    min-width: 50%;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
  }
  @media (max-width: 600px) {
    .background-shop__grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .background-preview__page :deep(.chat-profile-content__identity) {
      flex-basis: 100%;
    }
    .background-shop__heading {
      flex-wrap: wrap;
    }
    .background-preview__footer .b_btn {
      width: 100%;
    }
  }
</style>

<template>
  <div
    class="store-page commerce-surface"
    :class="{ 'is-mobile': bookmark.isMobile, 'is-compact': !bookmark.isDesktop, 'is-dense': bookmark.isCompactLayout }"
  >
    <MobileTopBar v-if="bookmark.isMobile" />
    <div v-auto-scrollbar class="store-page__scroll"
      ><div class="commerce-page-content"
        ><div class="commerce-landscape commerce-landscape--store" aria-hidden="true"
          ><img src="/brand-scenes/store-strip-footer.webp" alt="" loading="lazy" decoding="async"
        /></div>
        <BrandSceneHero
          scene="store"
          :title="t('autumn.reference.storeTitle')"
          :description="t('autumn.reference.storeIntro')"
          :eyebrow="t('entitlementStore.pageTitle')"
        ></BrandSceneHero
        ><main class="store-shell">
          <BCard v-if="journey" padding="16px">
            <p>{{ t('entitlementJourney.pending') }}</p>
            <BButton @click="returnToTask">{{ t('entitlementJourney.returnTask') }}</BButton>
          </BCard>
          <AiQuotaValueSection />

          <div class="store-purchase-layout">
            <section ref="catalogSection" class="store-section store-catalog" aria-labelledby="store-catalog-title">
              <div class="store-section__heading">
                <div>
                  <h2 id="store-catalog-title">{{ t('entitlementStore.catalogTitle') }}</h2>
                  <p>{{ t('entitlementStore.catalogDescription') }}</p>
                </div>
                <div v-if="catalog?.catalogEnabled"
                  ><BTabs
                    v-model:active-tab="activeCategory"
                    class="store-tabs"
                    variant="solid"
                    :options="categoryTabs"
                /></div>
              </div>

              <div v-if="catalog?.previewMode" class="store-notice" role="status">
                <SvgIcon :src="icon.settings.privacy" size="16" aria-hidden="true" />
                <span>{{ t('entitlementStore.localPreviewHint') }}</span>
              </div>
              <div v-if="catalogLoading" class="store-state">
                <BLoading inline loading :title="t('entitlementStore.loading')" />
              </div>
              <div v-else-if="catalogError" class="store-state is-error" role="alert">
                <SvgIcon :src="icon.message.error" size="18" aria-hidden="true" />
                <span>{{ t('entitlementStore.loadFailed') }}</span>
                <BButton size="small" @click="loadCatalog">{{ t('common.retry') }}</BButton>
              </div>
              <div v-else-if="!catalog?.catalogEnabled" class="store-state">
                <SvgIcon :src="icon.support.store" size="21" aria-hidden="true" />
                <span>{{ t('entitlementStore.catalogUnavailable') }}</span>
              </div>
              <template v-else>
                <div class="package-grid">
                  <EntitlementPackageCard
                    v-for="(item, index) in visiblePackages"
                    :key="item.skuId"
                    :item="item"
                    :index="index"
                    :preview-mode="Boolean(catalog.previewMode)"
                    :action-label="actionLabel(item)"
                    :disabled="!canCheckout(item)"
                    @select="openCheckoutModal"
                  />
                </div>
                <p class="store-notice store-notice--bottom">
                  <SvgIcon :src="icon.settings.privacy" size="16" aria-hidden="true" />
                  <span>{{ t('entitlementStore.identityHint') }}</span>
                </p>
              </template>
            </section>

            <BCard as="aside" class="store-support" padding="14px" radius="13px">
              <span class="store-support__icon" aria-hidden="true"
                ><SvgIcon :src="icon.support.heart" size="21"
              /></span>
              <div>
                <h2>{{ t('entitlementStore.supportTitle') }}</h2>
                <p>{{ t('autumn.reference.supportInvitation') }}</p>
              </div>
              <div class="store-support__art" aria-hidden="true"
                ><img src="/brand-scenes/store-note.webp" alt="" loading="lazy" /><span>{{
                  t('autumn.reference.storeNote')
                }}</span></div
              ><BButton @click="openSupport">{{ t('entitlementStore.supportAction') }}</BButton>
            </BCard>
          </div>
          <div class="store-bottom-grid">
            <BCard class="store-combo" padding="16px" radius="13px"
              ><h2>{{ t('autumn.comboTitle') }}</h2
              ><p>{{ t('autumn.comboDescription') }}</p>
              <div class="store-combo__features"
                ><div v-for="(glyph, i) in [icon.growth.reward, icon.growth.ai, icon.growth.storage]" :key="i"
                  ><SvgIcon :src="glyph" size="21" /><div
                    ><strong>{{ t(`autumn.reference.comboFeature${i + 1}`) }}</strong
                    ><small>{{ t(`autumn.reference.comboFeatureHint${i + 1}`) }}</small></div
                  ></div
                ></div
              >
              <BButton
                type="primary"
                @click="
                  activeCategory = 'combo';
                  scrollToCatalog();
                "
                >{{ t('autumn.comboAction') }}</BButton
              ><img class="store-combo__art" src="/brand-scenes/gift-object.webp" alt="" loading="lazy"
            /></BCard>
            <section class="store-section store-flow scene-panel" aria-labelledby="purchase-flow-title">
              <div class="store-section__heading">
                <div>
                  <h2 id="purchase-flow-title">{{ t('entitlementStore.flowTitle') }}</h2>
                </div>
              </div>
              <div class="store-flow__steps">
                <BCard
                  v-for="step in purchaseSteps"
                  :key="step.key"
                  class="store-flow__step"
                  padding="18px"
                  radius="16px"
                >
                  <span>{{ step.number }}</span>
                  <div>
                    <strong>{{ step.title }}</strong>
                    <p>{{ step.description }}</p>
                  </div>
                </BCard>
              </div>
              <p class="store-flow__rule">
                <SvgIcon :src="icon.message.success" size="17" aria-hidden="true" />
                <span>{{ t('entitlementStore.rulesDescription') }}</span>
              </p>
            </section>

            <p v-if="stateError" role="alert"
              >{{ t('entitlementStore.stateLoadFailed') }}
              <BButton size="small" @click="loadState">{{ t('common.retry') }}</BButton></p
            >
            <section class="store-lower scene-panel" :class="{ 'has-history': showHistory }">
              <div v-if="showHistory" class="store-history" aria-labelledby="purchase-history-title">
                <div class="store-lower__heading">
                  <h2 id="purchase-history-title">{{ t('entitlementStore.historyTitle') }}</h2>
                  <p>{{ t('entitlementStore.historyDescription') }}</p>
                </div>
                <BCard v-if="!storeState.recentOrders.length" class="store-empty" padding="22px">
                  <SvgIcon :src="icon.support.store" size="24" aria-hidden="true" />
                  <span>{{ t('entitlementStore.historyEmpty') }}</span>
                </BCard>
                <div v-else class="purchase-history">
                  <BCard
                    v-for="order in storeState.recentOrders"
                    :key="order.id"
                    class="purchase-order"
                    padding="8px 0"
                  >
                    <span class="purchase-order__icon" aria-hidden="true"
                      ><SvgIcon :src="orderIcon(order)" size="19"
                    /></span>
                    <div class="purchase-order__main">
                      <strong>{{ formatOrderBenefit(order) }}</strong>
                      <span>{{ formatDate(order.confirmedAt) }}</span>
                    </div>
                    <div class="purchase-order__amount">¥{{ order.amount }}</div>
                    <BChip
                      :tone="
                        order.rewardStatus === 'credited'
                          ? 'success'
                          : order.rewardStatus === 'ineligible'
                            ? 'danger'
                            : 'pending'
                      "
                    >
                      {{
                        order.rewardStatus === 'credited'
                          ? t('entitlementStore.credited')
                          : ['manual_review', 'reversal_review'].includes(order.rewardStatus || '')
                            ? t('entitlementJourney.review')
                            : order.rewardStatus === 'ineligible'
                              ? t('entitlementJourney.failed')
                              : t('entitlementStore.processing')
                      }}
                    </BChip>
                  </BCard>
                </div>
              </div>
            </section> </div
          ><div class="scene-footnotes"
            ><CampaignEntry /><EntitlementPurchaseProgress
              ref="purchaseProgress"
              @credited="refreshStore" /></div></main
      ></div>
    </div>

    <EntitlementCheckoutModal
      v-model:visible="checkoutModalVisible"
      :item="selectedItem"
      :package-name="selectedPackageName"
      :account-name="accountName"
      :expected-benefit="selectedExpectedBenefit"
      :can-confirm="Boolean(selectedItem && canCheckout(selectedItem))"
      @confirm="confirmCheckout"
    />
  </div>
</template>

<script setup lang="ts">
  import BrandSceneHero from '@/components/support/BrandSceneHero.vue';
  import AiQuotaValueSection from '@/components/support/AiQuotaValueSection.vue';
  import CampaignEntry from '@/components/support/CampaignEntry.vue';
  import EntitlementPurchaseProgress from '@/components/support/EntitlementPurchaseProgress.vue';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { readEntitlementJourney, prepareEntitlementReturn } from '@/utils/entitlementJourney';
  import { recordEntitlementEvent } from '@/api/entitlementEvents';
  import { useAiQuotaStatus } from '@/composables/useAiQuotaStatus';
  import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import MobileTopBar from '@/components/mobile/MobileTopBar.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';

  import { bookmarkStore, useUserStore } from '@/store';
  import { recordOperation } from '@/api/commonApi';
  import {
    getEntitlementStoreCatalog,
    getEntitlementStoreState,
    type AfdianSupportOrder,
    type EntitlementStoreState,
    type SupportBenefit,
    type SupportCampaignPackage,
    type SupportCatalog,
    type SupportPackage,
    type SupportPackageCategory,
  } from '@/api/supportApi';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { formatAiQuotaTokens } from '@/composables/useAiQuotaStatus';
  import EntitlementCheckoutModal from './EntitlementCheckoutModal.vue';
  import EntitlementPackageCard from './EntitlementPackageCard.vue';

  type StoreItem = SupportPackage | SupportCampaignPackage;
  const { t, locale } = useI18n();
  const router = useRouter();
  const route = useRoute();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const emptyStoreState: EntitlementStoreState = {
    authenticated: false,
    orderSyncAvailable: false,
    orderCount: 0,
    totalAmount: '0.00',
    grantedTokens: 0,
    grantedStorageMb: 0,
    recentOrders: [],
  };
  const journey = ref(readEntitlementJourney(user.id));
  const { load: refreshQuota } = useAiQuotaStatus({ autoLoad: false });
  async function returnToTask() {
    const current = prepareEntitlementReturn(user.id);
    if (!current) {
      journey.value = null;
      return;
    }
    recordEntitlementEvent('return_task', current);
    await router.push(current.returnPath);
    message.info(t('entitlementJourney.returnHint'));
  }
  const catalog = ref<SupportCatalog | null>(null);
  const catalogLoading = ref(true);
  const catalogError = ref(false);
  const storeState = ref<EntitlementStoreState>({ ...emptyStoreState });
  const stateReady = ref(false);
  const stateLoading = ref(false);
  const stateError = ref(false);
  const checkoutModalVisible = ref(false);
  const purchaseProgress = ref<InstanceType<typeof EntitlementPurchaseProgress> | null>(null);
  const selectedItem = ref<StoreItem | null>(null);
  const catalogSection = ref<HTMLElement | null>(null);
  const requestedCategory = String(route.query.category || '');
  const activeCategory = ref<SupportPackageCategory>(
    ['ai', 'storage', 'combo'].includes(requestedCategory) ? (requestedCategory as SupportPackageCategory) : 'ai',
  );

  const categoryTabs = computed(() => [
    { key: 'ai', label: t('entitlementStore.tabs.ai') },
    { key: 'storage', label: t('entitlementStore.tabs.storage') },
    { key: 'combo', label: t('entitlementStore.tabs.combo') },
  ]);
  const visiblePackages = computed(() =>
    (catalog.value?.packages || [])
      .filter((item) => item.category === activeCategory.value)
      .sort((a, b) => Number(a.amount) - Number(b.amount)),
  );
  const campaignPackages = computed(() => catalog.value?.campaigns || []);
  const accountName = computed(() => {
    if (!storeState.value.authenticated || !user.id) return t('entitlementStore.confirm.currentAccount');
    return user.alias || user.userName || t('entitlementStore.confirm.currentAccount');
  });
  const heroAccountSummary = computed(() => {
    if (!storeState.value.authenticated) return t('entitlementStore.heroAccountGuest');
    if (storeState.value.orderCount > 0) {
      return t('entitlementStore.heroAccountPurchased', { count: storeState.value.orderCount });
    }
    return t('entitlementStore.heroAccountReady');
  });
  const assuranceItems = computed(() => [
    {
      key: 'permanent',
      icon: icon.message.success,
      title: t('entitlementStore.assurancePermanentTitle'),
      description: t('entitlementStore.assurancePermanentDescription'),
    },
    {
      key: 'arrival',
      icon: icon.growth.reward,
      title: t('entitlementStore.assuranceArrivalTitle'),
      description: t('entitlementStore.assuranceArrivalDescription'),
    },
    {
      key: 'choice',
      icon: icon.settings.privacy,
      title: t('entitlementStore.assuranceChoiceTitle'),
      description: t('entitlementStore.assuranceChoiceDescription'),
    },
  ]);
  const purchaseSteps = computed(() => [
    {
      key: 'choose',
      number: '1',
      title: t('entitlementStore.flow.chooseTitle'),
      description: t('entitlementStore.flow.chooseDescription'),
    },
    {
      key: 'pay',
      number: '2',
      title: t('entitlementStore.flow.payTitle'),
      description: t('entitlementStore.flow.payDescription'),
    },
    {
      key: 'return',
      number: '3',
      title: t('entitlementStore.flow.returnTitle'),
      description: t('entitlementStore.flow.returnDescription'),
    },
  ]);
  const showHistory = computed(() => stateReady.value && !stateError.value && storeState.value.authenticated);
  const selectedExpectedBenefit = computed<SupportBenefit>(() => {
    const item = selectedItem.value;
    if (!item) return { aiTokens: 0, storageMb: 0 };
    if ('campaignSkuId' in item) return item.benefit;
    return item.firstPurchaseStatus === 'used' ? item.base : item.firstPurchase;
  });
  const selectedPackageName = computed(() => {
    const item = selectedItem.value;
    if (!item) return '';
    if ('campaignSkuId' in item) return item.title;
    const siblings = (catalog.value?.packages || []).filter((candidate) => candidate.category === item.category);
    const index = Math.max(
      0,
      siblings.findIndex((candidate) => candidate.skuId === item.skuId),
    );
    const tier = ['light', 'regular', 'frequent', 'heavy'][Math.min(index, 3)];
    return t('entitlementStore.packageName', {
      category: t(`entitlementStore.categoryNames.${item.category}`),
      tier: t(`entitlementStore.tiers.${tier}`),
    });
  });

  function formatStorage(mb: number) {
    if (mb >= 1024) return Number((mb / 1024).toFixed(2)) + ' GB';
    return mb + ' MB';
  }
  function formatBenefit(benefit: SupportBenefit) {
    const parts: string[] = [];
    if (benefit.aiTokens > 0)
      parts.push(t('entitlementStore.aiAmount', { amount: formatAiQuotaTokens(benefit.aiTokens, locale.value) }));
    if (benefit.storageMb > 0)
      parts.push(t('entitlementStore.storageAmount', { amount: formatStorage(benefit.storageMb) }));
    return parts.join(' + ');
  }
  function formatOrderBenefit(order: AfdianSupportOrder) {
    const credited = order.rewardStatus === 'credited';
    return formatBenefit({
      aiTokens: credited ? order.grantedTokens : order.rewardTokens,
      storageMb: credited ? order.grantedStorageMb : order.rewardStorageMb,
    });
  }
  function formatDate(value?: string | null) {
    if (!value) return t('common.unknown');
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
  function orderIcon(order: AfdianSupportOrder) {
    if (order.rewardStorageMb && order.rewardTokens) return icon.growth.reward;
    if (order.rewardStorageMb) return icon.growth.storage;
    return icon.growth.ai;
  }
  function scrollToCatalog() {
    catalogSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function canCheckout(item: StoreItem) {
    if (
      !stateReady.value ||
      stateLoading.value ||
      stateError.value ||
      !catalog.value?.checkoutEnabled ||
      !storeState.value.authenticated
    )
      return false;
    if ('limitReached' in item) return !item.limitReached && !item.hasActiveCheckout;
    return item.firstPurchaseStatus !== 'login_required';
  }
  function actionLabel(item: StoreItem) {
    if ('limitReached' in item) {
      if (item.limitReached) return t('entitlementStore.limitReached');
      if (item.hasActiveCheckout) return t('entitlementStore.checkoutPending');
    }
    if (!stateReady.value || stateLoading.value) return t('entitlementStore.stateLoading');
    if (stateError.value) return t('entitlementStore.stateUnavailable');
    if (!catalog.value?.checkoutEnabled) return t('entitlementStore.checkoutUnavailable');
    if (!storeState.value.authenticated || (!('limitReached' in item) && item.firstPurchaseStatus === 'login_required'))
      return t('entitlementStore.loginRequired');
    return t('entitlementStore.buyFor', { amount: item.amount });
  }
  function unavailableMessage(item: StoreItem) {
    if (stateError.value) return t('entitlementStore.stateLoadFailed');
    if (!storeState.value.authenticated) return t('entitlementStore.loginMessage');
    if ('limitReached' in item && item.hasActiveCheckout) return t('entitlementStore.checkoutPendingMessage');
    return t('entitlementStore.unavailable');
  }
  function openCheckoutModal(item: StoreItem) {
    if (!canCheckout(item)) return message.warning(unavailableMessage(item));
    recordEntitlementEvent('select_item', { ...journey.value, skuId: item.skuId });
    selectedItem.value = item;
    checkoutModalVisible.value = true;
  }
  function confirmCheckout() {
    const item = selectedItem.value;
    if (!item || !canCheckout(item)) {
      if (item) message.warning(unavailableMessage(item));
      return;
    }
    const skuId = 'campaignSkuId' in item ? item.campaignSkuId : item.skuId;
    const catalogVersion = 'catalogVersion' in item ? item.catalogVersion : String(catalog.value?.catalogVersion || '');
    const flowId = journey.value?.flowId;
    const owner = user.id;
    void closeCurrentMobileOverlayThen(
      () => {
        checkoutModalVisible.value = false;
      },
      () => {
        if (owner === user.id && canCheckout(item)) return purchaseProgress.value?.start(skuId, catalogVersion, flowId);
      },
    );
  }
  function goBack() {
    if (window.history.length > 1) return router.back();
    void router.push(bookmark.isMobile ? '/personCenter' : '/home');
  }
  function openSupport() {
    void router.push('/support');
    void recordOperation({ module: '资源商店', operation: '前往支持轻笺页面' });
  }
  function syncSelectedItem(nextCatalog: SupportCatalog) {
    const current = selectedItem.value;
    if (!current) return;
    const nextItem =
      'campaignSkuId' in current
        ? nextCatalog.campaigns.find((item) => item.campaignSkuId === current.campaignSkuId)
        : nextCatalog.packages.find((item) => item.skuId === current.skuId);
    if (!nextItem) {
      checkoutModalVisible.value = false;
      return;
    }
    selectedItem.value = nextItem;
  }
  let catalogGeneration = 0,
    stateGeneration = 0;
  onBeforeUnmount(() => {
    ++catalogGeneration;
    ++stateGeneration;
  });
  async function loadCatalog() {
    const gen = ++catalogGeneration;
    const owner = user.id;
    catalogLoading.value = true;
    catalogError.value = false;
    try {
      const nextCatalog = await getEntitlementStoreCatalog();
      if (owner !== user.id || gen !== catalogGeneration) return;
      catalog.value = nextCatalog;
      syncSelectedItem(nextCatalog);
    } catch {
      if (owner !== user.id || gen !== catalogGeneration) return;
      catalogError.value = true;
    } finally {
      if (owner === user.id && gen === catalogGeneration) catalogLoading.value = false;
    }
  }
  async function loadState() {
    const gen = ++stateGeneration;
    const owner = user.id;
    stateLoading.value = true;
    stateError.value = false;
    try {
      const nextState = await getEntitlementStoreState();
      if (owner !== user.id || gen !== stateGeneration) return;
      storeState.value = { ...emptyStoreState, ...nextState };
    } catch {
      if (owner !== user.id || gen !== stateGeneration) return;
      stateError.value = true;
    } finally {
      if (owner === user.id && gen === stateGeneration) {
        stateReady.value = true;
        stateLoading.value = false;
      }
    }
  }
  async function refreshStore() {
    await Promise.all([loadCatalog(), loadState(), refreshQuota({ force: true })]);
  }

  useMobileTopBar(['store'], { title: () => t('entitlementStore.pageTitle'), onBack: goBack, showNotification: false });
  const { markLoaded } = useForegroundRefresh({
    refresh: refreshStore,
    staleMs: 0,
    enabled: () => stateReady.value,
  });
  onMounted(() => {
    void refreshStore().then(markLoaded);
    void recordOperation({ module: '资源商店', operation: '查看资源商店' });
    recordEntitlementEvent('enter_store', journey.value || { source: 'store' });
  });
  watch(
    () => route.query.category,
    (value) => {
      const category = String(value || '');
      if (['ai', 'storage', 'combo'].includes(category)) activeCategory.value = category as SupportPackageCategory;
    },
  );
  watch(
    () => user.id,
    () => {
      journey.value = readEntitlementJourney(user.id);
      checkoutModalVisible.value = false;
      storeState.value = { ...emptyStoreState };
      catalog.value = null;
      selectedItem.value = null;
      stateReady.value = false;
      void refreshStore();
    },
  );
  watch(activeCategory, (category) => {
    if (route.query.category !== category) void router.replace({ query: { ...route.query, category } });
  });
  watch(checkoutModalVisible, (visible) => {
    if (!visible) selectedItem.value = null;
  });
</script>

<style scoped lang="less">
  @import './entitlementStore.less';
</style>

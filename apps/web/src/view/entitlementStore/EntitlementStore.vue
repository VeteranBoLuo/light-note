<template>
  <CommercePageShell class="store-page" :title="t('entitlementStore.pageTitle')" :page-icon="icon.support.store">
    <template #actions>
      <BButton type="text" @click="openOrderRecords()">
        <SvgIcon :src="icon.noteDetail.history" size="16" aria-hidden="true" />
        {{ t('entitlementStore.layout.historyAction') }}
      </BButton>
    </template>

    <CommercePageHero
      :title="t('entitlementStore.layout.heroTitle')"
      :accent="t('entitlementStore.layout.heroAccent')"
      :description="t('entitlementStore.layout.heroDescription')"
      :features="assuranceItems"
    />

    <BCard
      v-if="journey"
      class="store-journey"
      padding="var(--ui-space-12, 12px) var(--ui-space-16, 16px)"
      radius="9px"
    >
      <span>{{ t('entitlementJourney.pending') }}</span>
      <BButton type="text" @click="returnToTask">{{ t('entitlementJourney.returnTask') }}</BButton>
    </BCard>

    <section class="store-catalog" aria-labelledby="store-catalog-title">
      <div class="store-section__heading">
        <div>
          <h2 id="store-catalog-title">{{ t('entitlementStore.catalogTitle') }}</h2>
          <div class="store-catalog__descriptions">
            <p :class="{ 'is-inactive': activeCategory !== 'ai' }" :aria-hidden="activeCategory !== 'ai'">{{
              t('entitlementStore.catalogDescription')
            }}</p>
            <p :class="{ 'is-inactive': activeCategory !== 'storage' }" :aria-hidden="activeCategory !== 'storage'">{{
              t('entitlementStore.storageDescription')
            }}</p>
            <p :class="{ 'is-inactive': activeCategory !== 'combo' }" :aria-hidden="activeCategory !== 'combo'">{{
              t('entitlementStore.comboDescription')
            }}</p>
          </div>
        </div>
        <BTabs
          v-if="catalog?.catalogEnabled"
          v-model:active-tab="activeCategory"
          class="store-tabs"
          variant="solid"
          :options="categoryTabs"
          :aria-label="t('entitlementStore.catalogTitle')"
        >
          <template #label="{ tab }">
            <span class="store-tabs__label">
              <SvgIcon
                class="store-tabs__icon"
                :src="
                  tab.key === 'ai' ? icon.growth.ai : tab.key === 'storage' ? icon.growth.storage : icon.growth.reward
                "
                size="16"
                aria-hidden="true"
              />
              {{ tab.label }}
            </span>
          </template>
        </BTabs>
      </div>

      <div v-if="catalog?.previewMode" class="store-notice store-notice--preview" role="status">
        <SvgIcon class="store-notice__icon" :src="icon.message.info" size="16" aria-hidden="true" />{{
          t('entitlementStore.localPreviewHint')
        }}
      </div>
      <BCard v-if="catalogLoading && !catalog" class="store-state" role="status">
        <BLoading inline loading :title="t('entitlementStore.loading')" />
      </BCard>
      <BCard v-else-if="catalogError && !catalog" class="store-state" role="alert">
        <SvgIcon :src="icon.message.error" size="22" color="var(--error-color)" aria-hidden="true" />
        <span>{{ t('entitlementStore.loadFailed') }}</span>
        <BButton size="small" @click="loadCatalog">{{ t('common.retry') }}</BButton>
      </BCard>
      <BCard v-else-if="!catalog?.catalogEnabled" class="store-state">
        <SvgIcon :src="icon.support.store" size="22" aria-hidden="true" />
        <span>{{ t('entitlementStore.catalogUnavailable') }}</span>
      </BCard>
      <template v-else>
        <div class="package-panels">
          <div
            v-for="group in packageGroups"
            :key="group.key"
            class="package-grid"
            :aria-hidden="activeCategory !== group.key"
            :inert="activeCategory !== group.key || undefined"
            role="tabpanel"
            :aria-label="group.label"
          >
            <EntitlementPackageCard
              v-for="(item, index) in group.items"
              :key="item.skuId"
              :item="item"
              :index="index"
              :preview-mode="Boolean(catalog.previewMode)"
              :action-label="actionLabel(item)"
              :disabled="!canCheckout(item)"
              @select="openCheckoutModal"
            />
          </div>
        </div>
        <p class="store-notice store-notice--identity">
          <SvgIcon
            class="store-notice__icon"
            :src="icon.settings.privacy"
            size="16"
            color="var(--success-color)"
            aria-hidden="true"
          />{{ t('entitlementStore.identityHint') }}
        </p>
        <div v-if="catalogError" class="store-notice store-notice--preview" role="alert">
          <span>{{ t('entitlementStore.loadFailed') }}</span
          ><BButton type="text" size="small" @click="loadCatalog">{{ t('common.retry') }}</BButton>
        </div>
      </template>
    </section>

    <BCard class="store-quota-help" padding="0" radius="9px">
      <BButton
        class="store-quota-help__toggle"
        block
        :aria-expanded="quotaHelpOpen"
        aria-controls="store-quota-help"
        @click="quotaHelpOpen = !quotaHelpOpen"
      >
        <SvgIcon class="store-quota-help__icon" :src="icon.drawingNote.help" size="16" aria-hidden="true" />
        <span>{{ t('entitlementStore.layout.quotaHelp') }}</span>
        <SvgIcon class="store-quota-help__chevron" :src="icon.arrow_right" size="16" aria-hidden="true" />
      </BButton>
      <p v-show="quotaHelpOpen" id="store-quota-help">{{ t('entitlementStore.layout.quotaExplanation') }}</p>
    </BCard>

    <div class="store-lower">
      <BCard as="section" class="store-flow" padding="var(--ui-space-19, 19px) var(--ui-space-21, 21px)" radius="12px">
        <header class="store-panel-heading"
          ><h2>{{ t('entitlementStore.flowTitle') }}</h2></header
        >
        <ol class="store-flow__steps">
          <li v-for="step in purchaseSteps" :key="step.key" class="store-flow__step">
            <span class="store-flow__number" aria-hidden="true">{{ step.number }}</span>
            <strong>{{ step.title }}</strong>
            <p>{{ step.description }}</p>
          </li>
        </ol>
      </BCard>
      <BCard
        as="section"
        class="store-history"
        padding="var(--ui-space-19, 19px) var(--ui-space-21, 21px)"
        radius="12px"
      >
        <header class="store-panel-heading">
          <h2>{{ t('entitlementStore.historyTitle') }}</h2>
          <BButton type="text" size="small" @click="openOrderRecords()"
            >{{ t('entitlementStore.layout.viewHistory')
            }}<SvgIcon :src="icon.arrow_right" size="14" aria-hidden="true"
          /></BButton>
        </header>
        <EntitlementPurchaseHistory
          :orders="storeState.recentOrders.slice(0, 1)"
          :authenticated="storeState.authenticated"
          :ready="stateReady"
          :error="stateError"
          @retry="loadState"
        />
      </BCard>
    </div>
    <div class="store-follow-up"><CampaignEntry /></div>
    <EntitlementPurchaseProgress ref="purchaseProgress" hide-trigger @credited="refreshStore" />
    <footer class="store-crosslink">
      <span
        ><SvgIcon :src="icon.support.heart" size="16" color="var(--workspace-purple-text)" aria-hidden="true" />{{
          t('entitlementStore.layout.supportHint')
        }}</span
      >
    </footer>

    <template #overlays>
      <EntitlementOrderRecords
        v-model:visible="historyVisible"
        v-model:scope="historyScope"
        :authenticated="storeState.authenticated"
        :ready="stateReady"
        :state-error="stateError"
        :revision="historyRevision"
        @retry-state="loadState"
      >
        <template #current-order>
          <BButton v-if="purchaseProgress?.hasOrder" type="text" size="small" @click="showCurrentOrder">
            {{ t('autumn.viewOrder') }}
          </BButton>
        </template>
      </EntitlementOrderRecords>
      <EntitlementCheckoutModal
        v-model:visible="checkoutModalVisible"
        :item="selectedItem"
        :package-name="selectedPackageName"
        :account-name="accountName"
        :expected-benefit="selectedExpectedBenefit"
        :can-confirm="Boolean(selectedItem && canCheckout(selectedItem))"
        @confirm="confirmCheckout"
      />
    </template>
  </CommercePageShell>
</template>

<script setup lang="ts">
  import CommercePageShell from '@/components/support/CommercePageShell.vue';
  import CommercePageHero from '@/components/support/CommercePageHero.vue';
  import EntitlementPurchaseHistory from './EntitlementPurchaseHistory.vue';
  import EntitlementOrderRecords from './EntitlementOrderRecords.vue';
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
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';

  import { bookmarkStore, useUserStore } from '@/store';
  import { recordOperation } from '@/api/commonApi';
  import {
    getEntitlementStoreCatalog,
    getEntitlementStoreState,
    type EntitlementStoreState,
    type EntitlementOrderScope,
    type SupportBenefit,
    type SupportCampaignPackage,
    type SupportCatalog,
    type SupportPackage,
    type SupportPackageCategory,
  } from '@/api/supportApi';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { returnToPreviousPage } from '@/utils/pageReturn';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import EntitlementCheckoutModal from './EntitlementCheckoutModal.vue';
  import EntitlementPackageCard from './EntitlementPackageCard.vue';

  type StoreItem = SupportPackage | SupportCampaignPackage;
  const { t } = useI18n();
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
  const historyVisible = ref(false);
  const historyScope = ref<EntitlementOrderScope>('purchase');
  const historyRevision = ref(0);
  const quotaHelpOpen = ref(false);
  const requestedCategory = String(route.query.category || '');
  const activeCategory = ref<SupportPackageCategory>(
    ['ai', 'storage', 'combo'].includes(requestedCategory) ? (requestedCategory as SupportPackageCategory) : 'ai',
  );

  const categoryTabs = computed(() => [
    { key: 'ai', label: t('entitlementStore.tabs.ai') },
    { key: 'storage', label: t('entitlementStore.tabs.storage') },
    { key: 'combo', label: t('entitlementStore.tabs.combo') },
  ]);
  const packageGroups = computed(() =>
    categoryTabs.value.map(({ key, label }) => ({
      key,
      label,
      items: (catalog.value?.packages || [])
        .filter((item) => item.category === key)
        .sort((a, b) => Number(a.amount) - Number(b.amount)),
    })),
  );
  const accountName = computed(() => {
    if (!storeState.value.authenticated || !user.id) return t('entitlementStore.confirm.currentAccount');
    return user.alias || user.userName || t('entitlementStore.confirm.currentAccount');
  });
  const assuranceItems = computed(() => [
    { icon: icon.growth.reward, label: t('entitlementStore.layout.fixedQuantity') },
    { icon: icon.growth.storage, label: t('entitlementStore.layout.permanent') },
    { icon: icon.settings.privacy, label: t('entitlementStore.layout.arrival') },
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
  const selectedExpectedBenefit = computed<SupportBenefit>(() => {
    const item = selectedItem.value;
    if (!item) return { aiTokens: 0, storageMb: 0 };
    if ('campaignSkuId' in item) return item.benefit;
    return item.firstPurchaseScope === 'none' || item.firstPurchaseStatus === 'used' ? item.base : item.firstPurchase;
  });
  const selectedPackageName = computed(() => {
    const item = selectedItem.value;
    if (!item) return '';
    if ('campaignSkuId' in item) return item.title;
    const siblings = packageGroups.value.find((group) => group.key === item.category)?.items || [];
    const index = Math.max(
      0,
      siblings.findIndex((candidate) => candidate.skuId === item.skuId),
    );
    const tier = ['light', 'regular', 'frequent', 'heavy'][Math.min(index, 3)];
    return t('entitlementStore.tiers.' + tier);
  });

  function canCheckout(item: StoreItem) {
    if (
      !stateReady.value ||
      stateLoading.value ||
      stateError.value ||
      catalogLoading.value ||
      catalogError.value ||
      !catalog.value?.checkoutEnabled ||
      item.checkoutAvailable !== true ||
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
    if (catalogError.value) return t('entitlementStore.layout.checkoutPaused');
    if (catalogLoading.value) return t('entitlementStore.layout.catalogRefreshing');
    if (!catalog.value?.checkoutEnabled || item.checkoutAvailable !== true)
      return t('entitlementStore.layout.checkoutPaused');
    if (!storeState.value.authenticated || (!('limitReached' in item) && item.firstPurchaseStatus === 'login_required'))
      return t('entitlementStore.loginRequired');
    return t('entitlementStore.layout.buy');
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
    returnToPreviousPage(router, bookmark.isMobile ? '/personCenter' : '/home');
  }
  function openOrderRecords(scope: EntitlementOrderScope = 'purchase') {
    historyScope.value = scope;
    historyVisible.value = true;
  }
  function showCurrentOrder() {
    void closeCurrentMobileOverlayThen(
      () => {
        historyVisible.value = false;
      },
      () => purchaseProgress.value?.showOrder(),
    );
  }
  function consumeRecordsLink() {
    if (route.name !== 'entitlementStore') return;
    const { records, afdian, ...query } = route.query;
    if (records !== 'history' && records !== 'purchase') return;
    openOrderRecords(records);
    void router.replace({ query });
    if (afdian === 'bound') message.success(t('support.accountLinkSuccess'));
    if (afdian === 'failed') message.error(t('support.accountLinkFailed'));
    if (afdian === 'session_required') message.warning(t('support.accountLinkSessionRequired'));
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
    historyRevision.value++;
  }

  useMobileTopBar(['entitlementStore'], {
    title: () => t('entitlementStore.pageTitle'),
    onBack: goBack,
    showNotification: false,
    onAuxiliaryAction: () => openOrderRecords(),
    auxiliaryActionLabel: () => t('entitlementStore.layout.historyAction'),
    auxiliaryActionIcon: () => icon.noteDetail.history,
  });
  const { markLoaded } = useForegroundRefresh({
    refresh: refreshStore,
    staleMs: 0,
    enabled: () => stateReady.value,
  });
  onMounted(() => {
    consumeRecordsLink();
    void refreshStore().then(markLoaded);
    void recordOperation({ module: '资源商店', operation: '查看资源商店' });
    recordEntitlementEvent('enter_store', journey.value || { source: 'store' });
  });
  watch(() => route.query.records, consumeRecordsLink);
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
      historyVisible.value = false;
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
  .store-journey {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-10, 10px);
    margin-bottom: var(--ui-space-18, 18px);
  }
  .store-section__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-20, 20px);
    margin-bottom: var(--ui-space-16, 16px);
  }
  .store-section__heading h2 {
    margin: 0;
    font-size: var(--ui-font-17, 17px);
    font-weight: 600;
    line-height: 1.5;
  }
  .store-catalog__descriptions {
    display: grid;
  }
  .store-catalog__descriptions p {
    grid-area: 1 / 1;
    margin: var(--ui-space-4, 4px) 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
  }
  .store-catalog__descriptions .is-inactive {
    visibility: hidden;
  }
  .store-tabs {
    flex-shrink: 0;
  }
  .store-tabs__label {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
  }
  .store-tabs__icon {
    flex-shrink: 0;
  }
  .package-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--ui-space-16, 16px);
  }
  .package-panels {
    display: grid;
    min-width: 0;
  }
  .package-panels > .package-grid {
    grid-area: 1 / 1;
    grid-auto-rows: 1fr;
  }
  .package-grid[aria-hidden='true'] {
    visibility: hidden;
    pointer-events: none;
  }
  .store-notice {
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-7, 7px);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
    color: var(--desc-color);
  }
  .store-notice__icon {
    flex-shrink: 0;
    margin-top: var(--ui-space-2, 2px);
  }
  .store-notice--preview {
    margin: 0 0 var(--ui-space-14, 14px);
    padding: var(--ui-space-10, 10px) var(--ui-space-14, 14px);
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(--card-background);
    color: var(--workspace-file-text);
  }
  .store-notice--identity {
    margin: var(--ui-space-13, 13px) 0 0;
  }
  .store-notice--identity + .store-notice {
    margin-top: var(--ui-space-12, 12px);
  }
  .store-state {
    min-height: var(--ui-layout-280, 280px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-10, 10px);
    text-align: center;
    color: var(--desc-color);
  }
  .store-quota-help {
    margin-top: var(--ui-space-16, 16px);
  }
  .store-quota-help__toggle.b_btn {
    justify-content: flex-start;
    gap: var(--ui-space-9, 9px);
    height: auto;
    min-height: var(--ui-control-44, 44px);
    padding: var(--ui-space-9, 9px) var(--ui-space-16, 16px);
    background: transparent;
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
    white-space: normal;
    text-align: left;
  }
  .store-quota-help__toggle > span {
    flex: 1;
  }
  .store-quota-help__icon {
    flex-shrink: 0;
    color: var(--workspace-purple-text);
  }
  .store-quota-help__chevron {
    transform: rotate(90deg);
  }
  .store-quota-help__toggle[aria-expanded='true'] .store-quota-help__chevron {
    transform: rotate(-90deg);
  }
  .store-quota-help > p {
    margin: 0;
    padding: 0 var(--ui-space-16, 16px) var(--ui-space-14, 14px);
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    line-height: 1.8;
  }
  .store-lower {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: var(--ui-space-18, 18px);
    margin-top: var(--ui-space-24, 24px);
  }
  .store-panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-10, 10px);
    margin-bottom: var(--ui-space-12, 12px);
  }
  .store-panel-heading h2 {
    margin: 0;
    font-size: var(--ui-font-15, 15px);
    font-weight: 600;
  }
  .store-panel-heading .b_btn {
    gap: var(--ui-space-5, 5px);
  }
  .store-flow__steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--ui-space-18, 18px);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .store-flow__step {
    min-width: 0;
  }
  .store-flow__number {
    display: grid;
    place-items: center;
    width: var(--ui-layout-23, 23px);
    height: var(--ui-layout-23, 23px);
    margin-bottom: var(--ui-space-8, 8px);
    border-radius: 50%;
    background: var(--workspace-purple-selected);
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-11, 11px);
  }
  .store-flow__step strong {
    display: block;
    font-size: var(--ui-font-12, 12px);
    font-weight: 600;
  }
  .store-flow__step p {
    margin: var(--ui-space-5, 5px) 0 0;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.7;
    color: var(--desc-color);
  }
  .store-crosslink,
  .store-follow-up {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-10, 10px);
  }
  .store-follow-up {
    margin-top: var(--ui-space-16, 16px);
  }
  .store-follow-up:empty {
    display: none;
  }
  .store-crosslink {
    justify-content: space-between;
    margin-top: var(--ui-space-22, 22px);
    padding-top: var(--ui-space-14, 14px);
    border-top: 1px solid var(--surface-border-color);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .store-crosslink > span {
    display: flex;
    align-items: center;
    gap: var(--ui-space-7, 7px);
  }
  .is-tablet .store-section__heading,
  .is-mobile .store-section__heading {
    align-items: stretch;
    flex-direction: column;
    gap: var(--ui-space-12, 12px);
  }
  .is-tablet .package-grid,
  .is-mobile .package-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .is-mobile .package-grid {
    gap: var(--ui-space-13, 13px) var(--ui-space-10, 10px);
  }
  .is-mobile .store-lower {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-14, 14px);
    margin-top: var(--ui-space-17, 17px);
  }
  .is-mobile .store-tabs {
    width: 100%;
  }
  .is-mobile .store-tabs :deep(.tab) {
    flex: 1;
    min-width: 0;
  }
  .is-mobile .store-tabs__label {
    gap: var(--ui-space-4, 4px);
  }
  .is-mobile .store-flow__steps {
    grid-template-columns: 1fr;
    gap: var(--ui-space-13, 13px);
  }
  .is-mobile .store-flow__step {
    display: grid;
    grid-template-columns: var(--ui-layout-23, 23px) minmax(0, 1fr);
    column-gap: var(--ui-space-10, 10px);
  }
  .is-mobile .store-flow__number {
    grid-row: span 2;
    margin: 0;
  }
  .is-mobile .store-flow__step p {
    grid-column: 2;
  }
  .is-mobile .store-flow,
  .is-mobile .store-history {
    padding: var(--ui-space-16, 16px) var(--ui-space-15, 15px);
  }
</style>

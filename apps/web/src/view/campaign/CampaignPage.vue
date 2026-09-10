<template>
  <div class="campaign-page commerce-surface">
    <MobileTopBar v-if="bookmark.isMobile" />
    <div v-auto-scrollbar class="campaign-page__scroll">
      <BLoading v-if="loading && !presentation" loading :title="t('entitlementStore.loading')" />
      <div v-else-if="!presentation" class="campaign-page__state" role="status"
        ><h1>{{ t(hidden ? 'autumn.unavailable' : 'autumn.error') }}</h1
        ><BButton v-if="!hidden" @click="load">{{ t('common.retry') }}</BButton></div
      >
      <CampaignShowcase v-else :presentation="presentation" @select="select" />
      <div class="campaign-page__back scene-footnotes"
        ><BButton class="scene-link" @click="router.push('/store')">{{ t('autumn.backStore') }}</BButton
        ><BButton v-if="journey" @click="returnToTask">{{ t('entitlementJourney.returnTask') }}</BButton
        ><EntitlementPurchaseProgress ref="progress" @credited="refreshAfterPurchase"
      /></div>
    </div>
    <EntitlementCheckoutModal
      v-model:visible="confirmVisible"
      :item="selected"
      :package-name="selected?.title || ''"
      :account-name="user.alias || user.userName || ''"
      :expected-benefit="selected?.benefit || { aiTokens: 0, storageMb: 0 }"
      :can-confirm="canPurchase(selected)"
      @confirm="purchase"
    />
  </div>
</template>
<script setup lang="ts">
  import { ref, watch, onBeforeUnmount } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, useUserStore } from '@/store';
  import { getCampaignPresentation, type CampaignPresentation, type SupportCampaignPackage } from '@/api/supportApi';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { useAiQuotaStatus } from '@/composables/useAiQuotaStatus';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { readEntitlementJourney, prepareEntitlementReturn } from '@/utils/entitlementJourney';
  import CampaignShowcase from '@/components/support/CampaignShowcase.vue';
  import EntitlementPurchaseProgress from '@/components/support/EntitlementPurchaseProgress.vue';
  import EntitlementCheckoutModal from '@/view/entitlementStore/EntitlementCheckoutModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import MobileTopBar from '@/components/mobile/MobileTopBar.vue';
  const route = useRoute(),
    router = useRouter(),
    user = useUserStore(),
    bookmark = bookmarkStore();
  const { t } = useI18n();
  const presentation = ref<CampaignPresentation | null>(null),
    loading = ref(false),
    hidden = ref(false),
    selected = ref<SupportCampaignPackage | null>(null),
    confirmVisible = ref(false);
  const progress = ref<InstanceType<typeof EntitlementPurchaseProgress>>();
  const journey = ref(readEntitlementJourney(user.id));
  const { load: refreshQuota } = useAiQuotaStatus({ autoLoad: false });
  let generation = 0;
  let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
  async function load() {
    const gen = ++generation;
    loading.value = true;
    clearTimeout(boundaryTimer);
    try {
      const data = await getCampaignPresentation(String(route.params.campaignKey));
      if (gen !== generation) return;
      presentation.value = data;
      hidden.value = false;
      clearTimeout(boundaryTimer);
      const boundary = data.lifecycle === 'upcoming' ? data.startsAt : data.lifecycle === 'active' ? data.endsAt : null;
      if (boundary)
        boundaryTimer = setTimeout(
          () => void load(),
          Math.max(1000, Math.min(new Date(boundary).getTime() - new Date(data.serverNow).getTime() + 100, 2147483647)),
        );
      if (selected.value)
        selected.value = data.packages?.find((p) => p.campaignSkuId === selected.value?.campaignSkuId) || null;
      if (!data.checkoutEnabled || !selected.value) confirmVisible.value = false;
    } catch (error) {
      if (gen !== generation) return;
      presentation.value = null;
      hidden.value = (error as Error).message === 'CAMPAIGN_HIDDEN';
      confirmVisible.value = false;
    } finally {
      if (gen === generation) loading.value = false;
    }
  }
  function select(item: SupportCampaignPackage) {
    if (!canPurchase(item)) return;
    selected.value = item;
    confirmVisible.value = true;
  }
  function canPurchase(item: SupportCampaignPackage | null) {
    return Boolean(item && presentation.value?.checkoutEnabled && !item.limitReached && !item.hasActiveCheckout);
  }
  function purchase() {
    const item = selected.value;
    if (!item || !canPurchase(item)) return;
    const owner = user.id;
    const flowId = journey.value?.flowId;
    void closeCurrentMobileOverlayThen(
      () => {
        confirmVisible.value = false;
      },
      () => {
        if (owner === user.id && canPurchase(item))
          return progress.value?.start(item.campaignSkuId, item.catalogVersion, flowId);
      },
    );
  }
  async function refreshAfterPurchase() {
    await Promise.all([load(), refreshQuota({ force: true })]);
  }
  function returnToTask() {
    const target = prepareEntitlementReturn(user.id);
    if (target) void router.push(target.returnPath);
  }
  useMobileTopBar(['campaign'], {
    title: () => t('autumn.entry'),
    onBack: () => router.push('/store'),
    showNotification: false,
  });
  useForegroundRefresh({ refresh: load, staleMs: 0 });
  watch(
    () => [route.params.campaignKey, user.id],
    () => {
      presentation.value = null;
      selected.value = null;
      confirmVisible.value = false;
      journey.value = readEntitlementJourney(user.id);
      void load();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    ++generation;
    clearTimeout(boundaryTimer);
  });
</script>
<style scoped>
  .campaign-page {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .campaign-page__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .campaign-page__back {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px 20px;
  }
  .campaign-page__state {
    text-align: center;
    padding: 60px 20px;
  }
</style>

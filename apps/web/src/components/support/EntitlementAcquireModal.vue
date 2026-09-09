<template>
  <BModal
    v-model:visible="visible"
    :title="t(asset === 'ai' ? 'support.acquire.aiTitle' : 'support.acquire.storageTitle')"
    width="min(520px, 94vw)"
    :show-footer="false"
    fullscreen-mobile
  >
    <div class="entitlement-acquire">
      <p class="entitlement-acquire__intro">{{ t('support.acquire.description') }}</p>
      <p v-if="asset === 'ai' && status" class="entitlement-acquire__intro"
        >{{ t('entitlementJourney.daily') }} {{ formatAiQuotaTokens(status.dailyRemaining) }} ·
        {{ t('entitlementJourney.permanent') }} {{ formatAiQuotaTokens(status.bonusTokens) }}</p
      >
      <div class="entitlement-acquire__options">
        <BButton class="entitlement-acquire__option" @click="goToPoints">
          <span class="entitlement-acquire__icon is-points" aria-hidden="true">
            <SvgIcon :src="icon.growth.coin" size="21" />
          </span>
          <span class="entitlement-acquire__copy">
            <strong>{{ t('support.acquire.pointsTitle') }}</strong>
            <small>{{ t('support.acquire.pointsDescription') }}</small>
          </span>
          <SvgIcon :src="icon.arrow_right" size="14" aria-hidden="true" />
        </BButton>
        <BButton class="entitlement-acquire__option" @click="goToStore">
          <span class="entitlement-acquire__icon is-store" aria-hidden="true">
            <SvgIcon :src="icon.support.store" size="21" />
          </span>
          <span class="entitlement-acquire__copy">
            <strong>{{ t(asset === 'ai' ? 'entitlementJourney.buyAi' : 'entitlementJourney.buyStorage') }}</strong>
            <small>{{ t('support.acquire.storeDescription') }}</small>
          </span>
          <SvgIcon :src="icon.arrow_right" size="14" aria-hidden="true" />
        </BButton>
      </div>
      <p class="entitlement-acquire__note">{{ t('support.acquire.permanentNote') }}</p>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { watch } from 'vue';
  import { useUserStore } from '@/store';
  import { useAiQuotaStatus, formatAiQuotaTokens } from '@/composables/useAiQuotaStatus';
  import { readEntitlementJourney, saveEntitlementJourney } from '@/utils/entitlementJourney';
  import { recordEntitlementEvent } from '@/api/entitlementEvents';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';

  const props = defineProps<{
    asset: 'ai' | 'storage';
    source?: string;
    returnPath?: string;
    recoveryKey?: string;
    prompt?: string;
  }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();
  const router = useRouter();

  const user = useUserStore();
  const { status, load } = useAiQuotaStatus({ autoLoad: false });
  watch(
    visible,
    (open) => {
      if (open && props.asset === 'ai') void load({ force: true });
    },
    { immediate: true },
  );
  function begin(event: 'enter_points' | 'enter_store') {
    const existing = readEntitlementJourney(user.id);
    const routePath = router.currentRoute?.value?.fullPath || '/aiUsage';
    const journey =
      existing &&
      existing.asset === props.asset &&
      ((existing.recoveryKey === props.recoveryKey && Boolean(props.recoveryKey)) ||
        existing.returnPath === (props.returnPath || routePath))
        ? existing
        : saveEntitlementJourney({
            userId: user.id,
            source: props.source || router.currentRoute?.value?.path?.split('/')[1] || 'other',
            asset: props.asset,
            returnPath: props.returnPath || routePath,
            recoveryKey: props.recoveryKey,
            prompt: props.prompt,
          });
    if (props.source === 'organize') recordEntitlementEvent('quota_insufficient', journey);
    recordEntitlementEvent(event, journey);
  }

  function navigate(to: Parameters<typeof router.push>[0]) {
    void closeCurrentMobileOverlayThen(
      () => {
        visible.value = false;
      },
      () => router.push(to),
    );
  }

  function goToPoints() {
    begin('enter_points');
    navigate({
      path: '/growth',
      query: { section: 'rewards', reward: 'shop', focus: props.asset },
    });
  }

  function goToStore() {
    begin('enter_store');
    navigate({ path: '/store', query: { category: props.asset } });
  }
</script>

<style scoped lang="less">
  .entitlement-acquire {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .entitlement-acquire__intro,
  .entitlement-acquire__note {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.65;
  }

  .entitlement-acquire__options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .entitlement-acquire__option.b_btn {
    width: 100%;
    min-width: 0;
    min-height: 106px;
    height: auto;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    padding: 15px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color);
    color: var(--text-color);
    text-align: left;
    white-space: normal;
  }

  .entitlement-acquire__option.b_btn:hover,
  .entitlement-acquire__option.b_btn:focus-visible {
    border-color: var(--primary-color);
  }

  .entitlement-acquire__icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--primary-color);
    background: var(--primary-btn-bg-color);
  }

  .entitlement-acquire__icon.is-store {
    border-color: var(--primary-color);
  }

  .entitlement-acquire__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .entitlement-acquire__copy strong {
    font-size: 14px;
  }

  .entitlement-acquire__copy small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
    white-space: normal;
  }

  .entitlement-acquire__note {
    padding-top: 2px;
    font-size: 12px;
  }

  @media (max-width: 600px) {
    .entitlement-acquire {
      padding: 4px 0 20px;
    }

    .entitlement-acquire__options {
      grid-template-columns: 1fr;
    }

    .entitlement-acquire__option.b_btn {
      min-height: 96px;
    }
  }

  html.light-note-mobile-rendering .entitlement-acquire__option,
  html.light-note-mobile-rendering .entitlement-acquire__icon {
    box-shadow: none;
  }
</style>

<template>
  <BCard as="section" class="support-account-panel" variant="panel" padding="20px" radius="18px">
    <div class="support-account-panel__header">
      <span class="support-account-panel__icon" aria-hidden="true">
        <SvgIcon :src="icon.settings.account" size="22" />
      </span>
      <div class="support-account-panel__heading">
        <div class="support-account-panel__title-row">
          <h2>{{ t('support.accountTitle') }}</h2>
          <span v-if="state.linked" class="support-account-panel__status">
            {{ t('support.accountLinkedStatus') }}
          </span>
        </div>
        <p v-if="!state.authenticated">{{ t('support.accountGuestDescription') }}</p>
        <p v-else-if="state.linked">{{ t('support.accountLinkedDescription') }}</p>
        <p v-else>{{ t('support.accountUnlinkedDescription') }}</p>
      </div>
      <BButton
        v-if="state.authenticated && state.oauthAvailable"
        class="support-account-panel__action"
        :type="state.linked ? '' : 'primary'"
        :loading="unlinking"
        @click="emit(state.linked ? 'unlink' : 'link')"
      >
        {{ t(state.linked ? 'support.accountUnlinkAction' : 'support.accountLinkAction') }}
      </BButton>
    </div>

    <template v-if="state.authenticated">
      <div v-if="state.linked" class="support-account-panel__provider">
        <img
          v-if="state.providerAccount?.avatarUrl"
          :src="state.providerAccount.avatarUrl"
          :alt="t('support.providerAvatarAlt')"
          decoding="async"
          loading="lazy"
          referrerpolicy="no-referrer"
        />
        <span v-else class="support-account-panel__provider-fallback" aria-hidden="true">
          {{ providerInitial }}
        </span>
        <div>
          <span>{{ t('support.linkedProviderLabel') }}</span>
          <strong>{{ state.providerAccount?.name || t('support.linkedProviderFallback') }}</strong>
        </div>
      </div>

      <div class="support-account-panel__stats">
        <div>
          <span>{{ t('support.accountTotalAmount') }}</span>
          <strong>¥{{ state.totalAmount }}</strong>
        </div>
        <div>
          <span>{{ t('support.accountOrderCount') }}</span>
          <strong>{{ state.orderCount }}</strong>
        </div>
        <div>
          <span>{{ t('support.accountLastSupport') }}</span>
          <strong>{{ formatDate(state.lastSupportAt) }}</strong>
        </div>
      </div>

      <div class="support-account-panel__privacy">
        <div>
          <h3>{{ t('support.rankingPreferenceTitle') }}</h3>
          <p>{{ rankingDescription }}</p>
          <p v-if="state.publicPreference.adminHidden" class="support-account-panel__admin-hidden" role="status">
            {{ t('support.rankingAdminHidden') }}
          </p>
        </div>
        <div class="support-account-panel__privacy-control">
          <span>{{ t('support.rankingShowIdentity') }}</span>
          <BSwitch
            :checked="state.publicPreference.showIdentity"
            :disabled="preferenceSaving || !state.publicPreference.participateInRanking"
            :aria-label="t('support.rankingShowIdentity')"
            @change="toggleIdentity"
          />
        </div>
        <BButton class="support-account-panel__participation" :loading="preferenceSaving" @click="toggleParticipation">
          {{
            t(state.publicPreference.participateInRanking ? 'support.rankingLeaveAction' : 'support.rankingJoinAction')
          }}
        </BButton>
      </div>

      <div v-if="state.recentOrders.length" class="support-account-panel__orders">
        <div class="support-account-panel__orders-heading">
          <h3>{{ t('support.recentOrdersTitle') }}</h3>
          <span>{{ t('support.recentOrdersVerified') }}</span>
        </div>
        <div v-for="order in state.recentOrders" :key="order.id" class="support-account-panel__order">
          <div>
            <strong>¥{{ order.amount }}</strong>
            <span>{{ orderLabel(order) }}</span>
          </div>
          <time>{{ formatDate(order.confirmedAt) }}</time>
        </div>
      </div>

      <p v-if="!state.orderSyncAvailable" class="support-account-panel__warning" role="status">
        {{ t('support.accountSyncUnavailable') }}
      </p>
    </template>
  </BCard>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { AfdianSupportOrder, AfdianSupportState } from '@/api/supportApi';

  const props = defineProps<{
    state: AfdianSupportState;
    unlinking: boolean;
    preferenceSaving: boolean;
  }>();
  const emit = defineEmits<{
    link: [];
    unlink: [];
    preferenceChange: [value: { participateInRanking: boolean; showIdentity: boolean }];
  }>();
  const { t, locale } = useI18n();

  const providerInitial = computed(() => (props.state.providerAccount?.name || t('support.platformName')).slice(0, 1));
  const rankingDescription = computed(() =>
    props.state.publicPreference.participateInRanking
      ? props.state.publicPreference.showIdentity
        ? t('support.rankingNamedDescription')
        : t('support.rankingAnonymousDescription')
      : t('support.rankingExcludedDescription'),
  );

  function formatDate(value?: string | null) {
    if (!value) return t('support.noSupportYet');
    const date = new Date(value.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }

  function orderLabel(order: AfdianSupportOrder) {
    if (order.optionKey) return t(`support.orderOption.${order.optionKey}`);
    return order.month > 1 ? t('support.orderMonths', { count: order.month }) : t('support.orderCustom');
  }

  function toggleIdentity(showIdentity: boolean) {
    emit('preferenceChange', {
      participateInRanking: props.state.publicPreference.participateInRanking,
      showIdentity,
    });
  }

  function toggleParticipation() {
    const participateInRanking = !props.state.publicPreference.participateInRanking;
    emit('preferenceChange', {
      participateInRanking,
      showIdentity: participateInRanking ? props.state.publicPreference.showIdentity : false,
    });
  }
</script>

<style scoped lang="less">
  .support-account-panel {
    --b-card-background: var(--surface-panel-bg);
    margin-top: 20px;
    border-color: var(--surface-border-color);
  }

  .support-account-panel__header {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
  }

  .support-account-panel__icon {
    width: 46px;
    height: 46px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--primary-color);
    border-radius: 14px;
    color: var(--primary-color);
    background: var(--card-background);
  }

  .support-account-panel__title-row,
  .support-account-panel__orders-heading {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 17px;
  }

  h3 {
    font-size: 14px;
  }

  p,
  span,
  time {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }

  .support-account-panel__heading p {
    margin-top: 4px;
    font-size: 13px;
  }

  .support-account-panel__status {
    padding: 2px 8px;
    border: 1px solid var(--success-color);
    border-radius: 999px;
    color: var(--success-color);
    background: var(--card-background);
    font-size: 11px;
    font-weight: 700;
  }

  .support-account-panel__provider {
    margin-top: 18px;
    padding: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .support-account-panel__provider img,
  .support-account-panel__provider-fallback {
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    border-radius: 50%;
    object-fit: cover;
  }

  .support-account-panel__provider-fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-color);
    background: var(--hover-background);
    font-weight: 700;
    line-height: 1;
    text-align: center;
  }

  .support-account-panel__provider > div strong,
  .support-account-panel__provider > div span {
    display: block;
  }

  .support-account-panel__provider strong {
    margin-top: 1px;
    font-size: 14px;
  }

  .support-account-panel__stats {
    margin-top: 14px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .support-account-panel__stats > div {
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .support-account-panel__stats span,
  .support-account-panel__stats strong {
    display: block;
  }

  .support-account-panel__stats strong {
    margin-top: 3px;
    color: var(--text-color);
    font-size: 16px;
  }

  .support-account-panel__privacy {
    margin-top: 14px;
    padding: 14px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 16px;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .support-account-panel__privacy p {
    margin-top: 3px;
  }

  .support-account-panel__privacy-control {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .support-account-panel__privacy-control > span {
    color: var(--text-color);
  }

  .support-account-panel__participation {
    min-height: 36px;
    height: auto;
  }

  .support-account-panel__admin-hidden,
  .support-account-panel__warning {
    color: var(--warning-color);
  }

  .support-account-panel__orders {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--surface-border-color);
  }

  .support-account-panel__orders-heading {
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .support-account-panel__order {
    min-height: 38px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .support-account-panel__order div {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .support-account-panel__order strong {
    color: var(--text-color);
    font-size: 14px;
  }

  .support-account-panel__warning {
    margin-top: 12px;
  }

  @media (max-width: 720px) {
    .support-account-panel__header {
      grid-template-columns: 40px minmax(0, 1fr);
    }

    .support-account-panel__icon {
      width: 40px;
      height: 40px;
    }

    .support-account-panel__action {
      grid-column: 1 / -1;
      width: 100%;
    }

    .support-account-panel__stats {
      grid-template-columns: 1fr;
    }

    .support-account-panel__privacy {
      grid-template-columns: 1fr;
    }

    .support-account-panel__privacy-control {
      justify-content: space-between;
    }
  }
</style>

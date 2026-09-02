<template>
  <BButton
    class="ai-quota-summary"
    :class="[
      `is-${density}`,
      `is-${surface}`,
      `is-${layout}`,
      { 'is-loading': loading, 'is-unavailable': unavailable, 'has-pending-reservation': pendingReservationText },
    ]"
    :aria-label="accessibleLabel"
    :aria-busy="loading"
    :title="accessibleLabel"
    v-click-log="{
      module: 'AI 用量与计费',
      operation: `打开页面【${entrySource}】`,
    }"
    @click="emit('open-details')"
  >
    <span class="ai-quota-summary__icon" aria-hidden="true">
      <SvgIcon :src="icon.growth.ai" size="17" />
    </span>
    <span class="ai-quota-summary__body">
      <span class="ai-quota-summary__copy">
        <span>{{ t('personCenter.aiQuotaLabel') }}</span>
        <span v-if="quotaBreakdown" class="ai-quota-summary__values" aria-hidden="true">
          <span class="ai-quota-summary__primary-value">
            <small>{{ t('personCenter.aiQuotaTodayRemaining') }}</small>
            <strong>{{ quotaBreakdown.daily }}</strong>
          </span>
          <span class="ai-quota-summary__secondary-value">
            <small>{{ t('personCenter.aiQuotaPermanentShort') }}</small>
            <strong>{{ quotaBreakdown.permanent }}</strong>
          </span>
          <span v-if="pendingReservationText" class="ai-quota-summary__pending">
            <span aria-hidden="true"></span>
            {{ pendingReservationText }}
          </span>
        </span>
        <strong v-else class="ai-quota-summary__status">{{ statusText }}</strong>
      </span>
      <BProgress
        v-if="status && !status.exempt && !unavailable"
        size="small"
        :percent="remainingPercent"
        :aria-label="accessibleLabel"
      />
    </span>
    <SvgIcon class="ai-quota-summary__arrow" :src="icon.arrow_right" size="15" aria-hidden="true" />
  </BButton>
</template>

<script setup lang="ts">
  import { computed, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { formatAiQuotaTokens, useAiQuotaStatus } from '@/composables/useAiQuotaStatus';

  const props = withDefaults(
    defineProps<{
      active?: boolean;
      density?: 'compact' | 'comfortable';
      surface?: 'panel' | 'plain';
      layout?: 'row' | 'tile';
      entrySource: '桌面个人中心' | '移动个人中心';
    }>(),
    {
      active: true,
      density: 'compact',
      surface: 'panel',
      layout: 'row',
    },
  );

  const emit = defineEmits<{
    'open-details': [];
  }>();
  const { t, locale } = useI18n();
  const { status, loading, unavailable, remainingPercent, load } = useAiQuotaStatus({ autoLoad: false });

  watch(
    () => props.active,
    (active) => {
      if (active) void load({ force: true });
    },
    { immediate: true },
  );

  const quotaBreakdown = computed(() => {
    if (!status.value || status.value.exempt || unavailable.value) return null;
    if (
      Number.isFinite(status.value.dailyRemaining) &&
      Number.isFinite(status.value.dailyQuota) &&
      Number.isFinite(status.value.bonusTokens)
    ) {
      return {
        daily: formatAiQuotaTokens(status.value.dailyRemaining, locale.value),
        permanent: formatAiQuotaTokens(status.value.bonusTokens, locale.value),
      };
    }
    return null;
  });
  const statusText = computed(() => {
    if (loading.value && !status.value) return t('personCenter.aiQuotaLoading');
    if (unavailable.value || !status.value) return t('personCenter.aiQuotaUnavailable');
    if (status.value.exempt) return t('personCenter.aiQuotaUnlimited');
    if (quotaBreakdown.value) return t('personCenter.aiQuotaBreakdown', quotaBreakdown.value);
    return t('personCenter.aiQuotaRemaining', {
      amount: formatAiQuotaTokens(status.value.remaining, locale.value),
    });
  });
  const pendingReservationText = computed(() => {
    const amount = Number(status.value?.pendingReservedTokens || 0);
    if (!Number.isFinite(amount) || amount <= 0) return '';
    return t('personCenter.aiQuotaSettling', {
      amount: formatAiQuotaTokens(amount, locale.value),
    });
  });
  const accessibleLabel = computed(() =>
    [t('personCenter.aiQuotaLabel'), statusText.value, pendingReservationText.value].filter(Boolean).join('，'),
  );
</script>

<style scoped lang="less">
  .ai-quota-summary.b_btn {
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 46px;
    display: flex;
    justify-content: flex-start;
    gap: 9px;
    padding: 8px 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    color: var(--text-color);
    background: var(--workspace-panel-bg-color);
    line-height: 1.25;
    text-align: left;
    white-space: normal;
  }

  .ai-quota-summary.is-comfortable.b_btn {
    min-height: 52px;
    padding: 9px 11px;
  }

  .ai-quota-summary.is-plain.b_btn {
    padding-right: 2px;
    padding-left: 2px;
    border-color: transparent;
    background: transparent;
  }

  .ai-quota-summary.is-comfortable.is-plain.b_btn {
    min-height: 54px;
    padding-top: 10px;
    padding-bottom: 10px;
  }

  .ai-quota-summary__icon {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--primary-color);
    background: var(--primary-btn-bg-color);
  }

  .ai-quota-summary.is-comfortable.is-plain .ai-quota-summary__icon {
    width: 34px;
    height: 34px;
    flex-basis: 34px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--surface-panel-bg);
  }

  .ai-quota-summary__body {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .ai-quota-summary__copy {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
  }

  .ai-quota-summary__copy > span {
    color: var(--desc-color);
  }

  .ai-quota-summary__copy strong {
    min-width: 0;
    color: var(--text-color);
    font-size: 12px;
    line-height: 1.35;
    text-align: right;
  }

  .ai-quota-summary__arrow {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .ai-quota-summary.is-tile.b_btn {
    position: relative;
    min-height: 68px;
    padding: 8px;
    border-color: var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }

  .ai-quota-summary.is-tile .ai-quota-summary__icon {
    width: 28px;
    height: 28px;
    flex-basis: 28px;
    border-radius: 8px;
  }

  .ai-quota-summary.is-tile .ai-quota-summary__body {
    gap: 5px;
  }

  .ai-quota-summary.is-tile .ai-quota-summary__copy {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
    padding-right: 13px;
  }

  .ai-quota-summary.is-tile .ai-quota-summary__copy > span:first-child {
    font-size: 10px;
  }

  .ai-quota-summary.is-tile .ai-quota-summary__status {
    font-size: 12px;
    text-align: left;
  }

  .ai-quota-summary__values {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .ai-quota-summary__primary-value,
  .ai-quota-summary__secondary-value {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 4px;
    white-space: nowrap;
  }

  .ai-quota-summary__primary-value small,
  .ai-quota-summary__secondary-value small {
    color: var(--desc-color);
    font-size: 9px;
    line-height: 1.1;
  }

  .ai-quota-summary__primary-value strong {
    color: var(--text-color);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }

  .ai-quota-summary__secondary-value strong {
    color: var(--desc-color);
    font-size: 10px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .ai-quota-summary__pending {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--warning-color, #b56a00);
    font-size: 9px;
    font-weight: 600;
    line-height: 1.25;
  }

  .ai-quota-summary__pending > span {
    width: 5px;
    height: 5px;
    flex: 0 0 5px;
    border: 1px solid currentColor;
    border-radius: 50%;
    background: currentColor;
  }

  .ai-quota-summary.is-tile :deep(.b-progress__trail) {
    height: 5px;
  }

  .ai-quota-summary.is-tile .ai-quota-summary__arrow {
    position: absolute;
    top: 8px;
    right: 7px;
  }

  .ai-quota-summary.is-loading .ai-quota-summary__copy strong,
  .ai-quota-summary.is-unavailable .ai-quota-summary__copy strong {
    color: var(--desc-color);
    font-weight: 500;
  }

  .ai-quota-summary.is-loading .ai-quota-summary__icon,
  .ai-quota-summary.is-unavailable .ai-quota-summary__icon {
    color: var(--desc-color);
    background: var(--surface-divider-color);
  }

  @media (hover: hover) and (pointer: fine) {
    .ai-quota-summary.b_btn:hover {
      border-color: var(--primary-color);
      background: var(--primary-btn-h-bg-color);
    }

    .ai-quota-summary.is-plain.b_btn:hover {
      border-color: transparent;
      background: var(--menu-item-h-bg-color);
    }

    .ai-quota-summary.is-tile.b_btn:hover {
      border-color: var(--primary-color);
      background: var(--menu-item-h-bg-color);
    }
  }

  .ai-quota-summary.is-plain.b_btn:focus-visible {
    border-color: var(--primary-color);
    background: var(--menu-item-h-bg-color);
  }

  .ai-quota-summary.is-tile.b_btn:focus-visible {
    border-color: var(--primary-color);
    background: var(--menu-item-h-bg-color);
  }

  html.light-note-mobile-rendering .ai-quota-summary__icon {
    box-shadow: none;
  }
</style>

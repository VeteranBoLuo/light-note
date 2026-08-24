<template>
  <BButton
    class="ai-quota-summary"
    :class="[`is-${density}`, { 'is-loading': loading, 'is-unavailable': unavailable }]"
    :aria-label="accessibleLabel"
    :title="accessibleLabel"
    @click="emit('open-details')"
  >
    <span class="ai-quota-summary__icon" aria-hidden="true">
      <SvgIcon :src="icon.growth.ai" size="17" />
    </span>
    <span class="ai-quota-summary__body">
      <span class="ai-quota-summary__copy">
        <span>{{ t('personCenter.aiQuotaLabel') }}</span>
        <strong>{{ statusText }}</strong>
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
    }>(),
    {
      active: true,
      density: 'compact',
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

  const statusText = computed(() => {
    if (loading.value && !status.value) return t('personCenter.aiQuotaLoading');
    if (unavailable.value || !status.value) return t('personCenter.aiQuotaUnavailable');
    if (status.value.exempt) return t('personCenter.aiQuotaUnlimited');
    if (
      Number.isFinite(status.value.dailyRemaining) &&
      Number.isFinite(status.value.dailyQuota) &&
      Number.isFinite(status.value.bonusTokens)
    ) {
      return t('personCenter.aiQuotaBreakdown', {
        daily: formatAiQuotaTokens(status.value.dailyRemaining, locale.value),
        permanent: formatAiQuotaTokens(status.value.bonusTokens, locale.value),
      });
    }
    return t('personCenter.aiQuotaRemaining', {
      amount: formatAiQuotaTokens(status.value.remaining, locale.value),
    });
  });
  const accessibleLabel = computed(() => `${t('personCenter.aiQuotaLabel')}，${statusText.value}`);
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
  }

  .ai-quota-summary.is-comfortable.b_btn {
    min-height: 52px;
    padding: 9px 11px;
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

  .ai-quota-summary.is-loading .ai-quota-summary__copy strong,
  .ai-quota-summary.is-unavailable .ai-quota-summary__copy strong {
    color: var(--desc-color);
    font-weight: 500;
  }

  @media (hover: hover) and (pointer: fine) {
    .ai-quota-summary.b_btn:hover {
      border-color: var(--primary-color);
      background: var(--primary-btn-h-bg-color);
    }
  }
</style>

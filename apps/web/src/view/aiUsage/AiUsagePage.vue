<template>
  <div class="ai-usage-page">
    <main class="ai-usage-shell">
      <header class="ai-usage-hero">
        <BButton class="ai-usage-back" @click="goBack">
          <SvgIcon :src="icon.arrow_left" size="16" aria-hidden="true" />
          <span>{{ t('common.back') }}</span>
        </BButton>

        <div class="ai-usage-heading">
          <span class="ai-usage-heading__icon" aria-hidden="true">
            <SvgIcon :src="icon.settings.ai" size="23" />
          </span>
          <div>
            <h1>{{ t('settings.ai.pageTitle') }}</h1>
            <p>{{ t('settings.ai.pageDescription') }}</p>
          </div>
        </div>
      </header>

      <BCard
        as="section"
        class="ai-quota-panel"
        variant="raised"
        padding="18px 20px"
        radius="16px"
        aria-labelledby="ai-quota-panel-title"
      >
        <div class="ai-quota-panel__head">
          <div>
            <h2 id="ai-quota-panel-title">{{ t('settings.ai.quota') }}</h2>
            <p>{{ t('settings.ai.quotaDescription') }}</p>
          </div>
          <BButton
            v-if="aiQuotaUnavailable"
            size="small"
            :loading="aiQuotaLoading"
            @click="loadAiQuota({ force: true })"
          >
            {{ t('common.retry') }}
          </BButton>
        </div>

        <div v-if="aiQuotaMetrics.length" class="ai-quota-metrics">
          <BCard
            v-for="metric in aiQuotaMetrics"
            :key="metric.key"
            as="article"
            class="ai-quota-metric"
            variant="panel"
            padding="12px 13px"
            radius="11px"
          >
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <small>{{ metric.hint }}</small>
          </BCard>
        </div>

        <div
          v-else
          class="ai-quota-state"
          :class="{ 'is-error': aiQuotaUnavailable }"
          :role="aiQuotaUnavailable ? 'alert' : aiQuotaStatus ? 'status' : undefined"
          :aria-live="aiQuotaUnavailable || aiQuotaStatus ? 'polite' : undefined"
        >
          <template v-if="aiQuotaUnavailable">
            <SvgIcon :src="icon.message.warning" size="20" aria-hidden="true" />
            <span>{{ t('settings.ai.quotaUnavailable') }}</span>
          </template>
          <template v-else-if="aiQuotaStatus?.exempt">
            <SvgIcon :src="icon.settings.ai" size="20" aria-hidden="true" />
            <strong>{{ t('settings.ai.quotaUnlimited') }}</strong>
          </template>
          <template v-else-if="quotaFallbackText">
            <SvgIcon :src="icon.settings.ai" size="20" aria-hidden="true" />
            <strong>{{ quotaFallbackText }}</strong>
          </template>
          <BLoading v-else inline :loading="true" :title="t('settings.ai.quotaLoading')" />
        </div>
      </BCard>

      <BCard as="section" class="ai-usage-panel" padding="18px 20px" radius="16px">
        <AiUsageCenter />
      </BCard>
    </main>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import AiUsageCenter from '@/components/aiSkills/AiUsageCenter.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { formatAiQuotaTokens, useAiQuotaStatus } from '@/composables/useAiQuotaStatus';
  import icon from '@/config/icon.ts';

  const { t, locale } = useI18n();
  const router = useRouter();
  const {
    status: aiQuotaStatus,
    loading: aiQuotaLoading,
    unavailable: aiQuotaUnavailable,
    load: loadAiQuota,
  } = useAiQuotaStatus();

  const aiQuotaMetrics = computed(() => {
    const status = aiQuotaStatus.value;
    if (
      !status ||
      status.exempt ||
      aiQuotaUnavailable.value ||
      !Number.isFinite(status.dailyQuota) ||
      !Number.isFinite(status.dailyUsed) ||
      !Number.isFinite(status.dailyRemaining) ||
      !Number.isFinite(status.bonusTokens) ||
      !Number.isFinite(status.remaining)
    ) {
      return [];
    }
    return [
      {
        key: 'daily',
        label: t('settings.ai.dailyQuota'),
        value: t('settings.ai.remainingOf', {
          remaining: formatAiQuotaTokens(status.dailyRemaining, locale.value),
          total: formatAiQuotaTokens(status.dailyQuota, locale.value),
        }),
        hint: t('settings.ai.dailyUsed', {
          used: formatAiQuotaTokens(status.dailyUsed, locale.value),
        }),
      },
      {
        key: 'permanent',
        label: t('settings.ai.permanentBalance'),
        value: formatAiQuotaTokens(status.bonusTokens, locale.value),
        hint: t('settings.ai.permanentBalanceHint'),
      },
      {
        key: 'available',
        label: t('settings.ai.totalAvailable'),
        value: formatAiQuotaTokens(status.remaining, locale.value),
        hint: t('settings.ai.totalAvailableHint'),
      },
    ];
  });

  const quotaFallbackText = computed(() => {
    const status = aiQuotaStatus.value;
    if (!status || status.exempt || aiQuotaUnavailable.value) return '';
    if (!Number.isFinite(status.used) || !Number.isFinite(status.quota)) return '';
    return t('settings.ai.quotaUsage', {
      used: formatAiQuotaTokens(status.used, locale.value),
      quota: formatAiQuotaTokens(status.quota, locale.value),
    });
  });

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push('/settings');
  }
</script>

<style scoped lang="less">
  .ai-usage-page {
    height: 100%;
    overflow-y: auto;
    padding: 28px 24px 64px;
    box-sizing: border-box;
    background: var(--background-color);
    color: var(--text-color);
  }

  .ai-usage-shell {
    width: min(100%, 820px);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .ai-usage-hero {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .ai-usage-back.b_btn {
    align-self: flex-start;
    height: 34px;
    gap: 5px;
    padding: 0 12px 0 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    background: transparent;
    color: var(--desc-color);
    font-size: 13px;
  }

  .ai-usage-back.b_btn:hover {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  .ai-usage-heading {
    display: flex;
    align-items: center;
    gap: 13px;
  }

  .ai-usage-heading__icon {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    display: grid;
    place-items: center;
    border-radius: 13px;
    background: var(--primary-btn-bg-color);
    color: var(--primary-color);
  }

  .ai-usage-heading h1,
  .ai-quota-panel__head h2 {
    margin: 0;
    color: var(--text-color);
  }

  .ai-usage-heading h1 {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .ai-usage-heading p,
  .ai-quota-panel__head p {
    margin: 3px 0 0;
    color: var(--desc-color);
    line-height: 1.5;
  }

  .ai-usage-heading p {
    font-size: 13px;
  }

  .ai-quota-panel,
  .ai-usage-panel {
    --b-card-background: var(--workbench-subcard-bg);
  }

  .ai-quota-panel__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 13px;
  }

  .ai-quota-panel__head h2 {
    font-size: 15px;
    font-weight: 650;
  }

  .ai-quota-panel__head p {
    font-size: 12px;
  }

  .ai-quota-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
  }

  .ai-quota-metric {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ai-quota-metric > span,
  .ai-quota-metric > small {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.4;
  }

  .ai-quota-metric > strong {
    overflow-wrap: anywhere;
    color: var(--text-color);
    font-size: 15px;
    line-height: 1.35;
  }

  .ai-quota-state {
    min-height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-sizing: border-box;
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  .ai-quota-state strong {
    color: var(--text-color);
  }

  .ai-quota-state.is-error {
    border-color: var(--error-color, #c33f47);
    color: var(--error-color, #c33f47);
  }

  @media (max-width: 600px) {
    .ai-usage-page {
      padding: 16px 14px 48px;
    }

    .ai-usage-shell {
      gap: 14px;
    }

    .ai-usage-hero {
      gap: 12px;
    }

    .ai-usage-back.b_btn {
      min-width: 44px;
      height: 44px;
      padding-inline: 10px 13px;
    }

    .ai-usage-heading {
      align-items: flex-start;
    }

    .ai-usage-heading h1 {
      font-size: 21px;
    }

    .ai-quota-metrics {
      grid-template-columns: 1fr;
    }

    .ai-quota-metric {
      min-height: 76px;
      box-sizing: border-box;
    }

    .ai-quota-panel__head .b_btn {
      min-height: 44px;
    }
  }

  html.light-note-mobile-rendering .ai-usage-heading__icon,
  html.light-note-mobile-rendering .ai-quota-state {
    box-shadow: none;
  }
</style>

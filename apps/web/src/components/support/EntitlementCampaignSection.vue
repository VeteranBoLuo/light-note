<template>
  <section class="campaign-feature" :aria-label="title">
    <header class="campaign-feature__header">
      <div>
        <BChip :tone="draft ? 'neutral' : 'pending'">{{
          draft ? t('entitlementJourney.draft') : t('entitlementStore.campaigns.limited')
        }}</BChip>
        <p v-if="draft" class="campaign-feature__eyebrow">{{ t('entitlementJourney.holiday') }}</p>
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
      <span v-if="draft" class="campaign-feature__date">{{ t('entitlementJourney.dates') }}</span>
    </header>
    <div class="campaign-feature__grid">
      <template v-if="draft">
        <BCard v-for="name in ['light', 'plus']" :key="name" padding="24px" radius="16px">
          <h4>{{ t(`entitlementJourney.${name}`) }}</h4>
          <p class="campaign-feature__price">{{ t('entitlementJourney.pendingPrice') }}</p>
          <p>{{ t('entitlementJourney.pendingBenefit') }}</p>
        </BCard>
      </template>
      <slot v-else />
    </div>
    <p class="campaign-feature__rules">{{ t('entitlementJourney.rules') }}</p>
  </section>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  defineProps<{ title: string; description: string; draft?: boolean }>();
  const { t } = useI18n();
</script>
<style scoped lang="less">
  .campaign-feature {
    padding: clamp(18px, 3vw, 32px);
    border: 1px solid var(--surface-border-color);
    border-radius: 20px;
    background: var(--workspace-canvas);
    color: var(--text-color);
  }
  .campaign-feature__header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }
  .campaign-feature h3 {
    margin: 14px 0 10px;
    font-size: clamp(22px, 3vw, 32px);
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .campaign-feature p {
    color: var(--desc-color);
    line-height: 1.7;
  }
  .campaign-feature__eyebrow {
    letter-spacing: 0.15em;
    font-size: 12px;
    margin-top: 20px;
  }
  .campaign-feature__date {
    font-size: 12px;
    color: var(--desc-color);
    padding-top: 6px;
  }
  .campaign-feature__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
    gap: 16px;
  }
  .campaign-feature h4 {
    font-size: 17px;
    margin: 0 0 20px;
  }
  .campaign-feature .campaign-feature__price {
    color: var(--text-color);
    font-size: 21px;
    font-weight: 600;
  }
  .campaign-feature__rules {
    margin: 20px 0 0;
    font-size: 12px;
  }
</style>

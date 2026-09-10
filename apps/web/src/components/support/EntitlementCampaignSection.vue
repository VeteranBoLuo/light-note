<template>
  <CampaignShowcase v-if="draft" draft />
  <section v-else class="campaign-feature" :aria-label="title">
    <header class="campaign-feature__header">
      <div>
        <BChip tone="pending">{{ t('entitlementStore.campaigns.limited') }}</BChip>
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
    </header>
    <div class="campaign-feature__grid">
      <slot />
    </div>
    <p class="campaign-feature__rules">{{ t('entitlementJourney.rules') }}</p>
  </section>
</template>
<script setup lang="ts">
  import CampaignShowcase from './CampaignShowcase.vue';
  import { useI18n } from 'vue-i18n';
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
  .campaign-feature__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
    gap: 16px;
  }
  .campaign-feature__rules {
    margin: 20px 0 0;
    font-size: 12px;
  }
</style>

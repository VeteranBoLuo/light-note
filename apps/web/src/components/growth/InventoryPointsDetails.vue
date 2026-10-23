<template>
  <section class="inventory-points" :aria-label="t('growth.pointsLogTitle')">
    <PointsSummary v-if="showSummary" :key="accountKey" compact class="inventory-points-summary" />
    <PointsLedger :key="accountKey" settings-layout />
    <p class="inventory-points-note">{{ t('growth.pointsUsageSettlementHint') }}</p>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import PointsSummary from './PointsSummary.vue';
  import PointsLedger from './PointsLedger.vue';

  withDefaults(defineProps<{ showSummary?: boolean }>(), { showSummary: true });
  const { t } = useI18n();
  const user = useUserStore();
  const accountKey = computed(() => `${user.id}:${user.adminContext?.id || ''}`);
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .inventory-points {
    min-width: 0;
    padding: .ui-space(20px) [];
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
    background: var(--workspace-content);
  }
  .inventory-points-summary {
    padding-bottom: .ui-space(18px) [];
    margin-bottom: .ui-space(18px) [];
    border-bottom: 1px solid var(--workspace-divider);
  }
  .inventory-points-note {
    margin: .ui-space(16px) [] 0 0;
    padding-top: .ui-space(12px) [];
    border-top: 1px solid var(--workspace-divider);
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.6;
  }
  @media (max-width: 767px) {
    .inventory-points {
      padding: .ui-space(14px) [];
    }
  }
</style>

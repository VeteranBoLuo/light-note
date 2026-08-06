<template>
  <BChip class="inbox-pending-badge" tone="pending" size="small">{{ t('inbox.pendingBadge') }}</BChip>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BChip from '@/components/base/BasicComponents/BChip.vue';

  const { t } = useI18n();
</script>

<style scoped>
  .inbox-pending-badge {
    letter-spacing: 0.02em;
  }
</style>

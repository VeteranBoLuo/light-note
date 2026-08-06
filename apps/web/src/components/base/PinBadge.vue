<template>
  <BChip class="pin-badge" tone="pin" size="small">{{ t('common.pin') }}</BChip>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BChip from '@/components/base/BasicComponents/BChip.vue';

  const { t } = useI18n();
</script>

<style scoped>
  .pin-badge {
    letter-spacing: 0.04em;
  }
</style>

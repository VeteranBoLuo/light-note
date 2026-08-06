<template>
  <BChip class="pin-badge" tone="pin" size="small">
    <SvgIcon class="pin-badge__icon" :src="icon.contextMenu.pin" size="10" aria-hidden="true" />
    <span>{{ t('common.pinnedBadge') }}</span>
  </BChip>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const { t } = useI18n();
</script>

<style scoped>
  .pin-badge {
    letter-spacing: 0.04em;
  }

  .pin-badge :deep(.b-chip__content) {
    gap: 3px;
  }

  .pin-badge__icon {
    flex: 0 0 auto;
  }
</style>

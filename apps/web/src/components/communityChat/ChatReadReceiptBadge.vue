<template>
  <BButton class="chat-read-receipt-badge community-message__read-receipt" :loading="loading" @click="emit('open')">
    <SvgIcon :src="icon.communityChat.readReceipt" size="13" aria-hidden="true" />
    <span aria-live="polite">{{ label }}</span>
  </BButton>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = withDefaults(
    defineProps<{
      enabled: boolean;
      readCount?: number;
      loading?: boolean;
    }>(),
    {
      readCount: undefined,
      loading: false,
    },
  );
  const emit = defineEmits<{ open: [] }>();
  const { t } = useI18n();

  const hasReadCount = computed(() => typeof props.readCount === 'number');
  const label = computed(() => {
    if (hasReadCount.value) {
      return t(props.enabled ? 'communityChat.readReceipt.count' : 'communityChat.readReceipt.countPaused', {
        count: props.readCount,
      });
    }
    return t(props.enabled ? 'communityChat.readReceipt.count' : 'communityChat.readReceipt.countPaused', { count: 0 });
  });
</script>

<style scoped lang="less">
  .chat-read-receipt-badge {
    width: fit-content;
    min-width: 0;
    min-height: 24px;
    height: 24px;
    padding: 2px 7px !important;
    gap: 4px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 999px;
    color: var(--desc-color) !important;
    background: var(--card-background) !important;
    font-size: 9px;
    line-height: 1;
  }

  .chat-read-receipt-badge :deep(.btn-spinner) {
    margin-right: 0;
  }
</style>

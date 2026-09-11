<template>
  <div class="community-message__recall-line">
    <span role="status">{{ label }}</span>
    <BButton v-if="canReedit" size="small" class="community-message__recall-reedit" @click.stop="emit('reedit')">
      {{ t('communityChat.recall.reedit') }}
    </BButton>
    <BButton
      v-if="canViewOriginal"
      size="small"
      class="community-message__recall-audit-action"
      @click.stop="emit('viewOriginal')"
    >
      {{ t('communityChat.recall.viewOriginal') }}
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  withDefaults(
    defineProps<{
      label: string;
      canReedit?: boolean;
      canViewOriginal?: boolean;
    }>(),
    {
      canViewOriginal: false,
      canReedit: false,
    },
  );
  const emit = defineEmits<{
    reedit: [];
    viewOriginal: [];
  }>();
  const { t } = useI18n();
</script>

<style scoped lang="less">
  .community-message__recall-line {
    position: relative;
    min-width: 0;
    max-width: calc(100% - 40px);
    min-height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 6px;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.45;
    text-align: center;
  }

  .community-message__recall-line > span {
    overflow-wrap: anywhere;
  }

  .community-message__recall-reedit,
  .community-message__recall-audit-action {
    min-width: 0;
    min-height: 24px;
    height: 24px;
    padding: 2px 6px !important;
    border: 0 !important;
    color: var(--primary-color) !important;
    background: transparent !important;
    font-size: 10px;
  }

  @media (max-width: 767px) {
    .community-message__recall-line {
      min-height: 32px;
      padding-inline: 8px;
    }

    .community-message__recall-reedit {
      min-height: 44px;
      height: 44px;
      margin-block: -6px;
    }
  }
</style>

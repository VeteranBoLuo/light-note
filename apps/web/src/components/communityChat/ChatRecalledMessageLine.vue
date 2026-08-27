<template>
  <div class="community-message__recall-line" @click="emit('surfaceClick', $event)">
    <span role="status">{{ label }}</span>
    <BButton
      v-if="canViewOriginal"
      size="small"
      class="community-message__recall-audit-action"
      @click.stop="emit('viewOriginal')"
    >
      {{ t('communityChat.recall.viewOriginal') }}
    </BButton>
    <BActionMenu
      v-if="actionItems.length"
      class="community-message__recall-more"
      :items="actionItems"
      placement="bottom-left"
      :disabled="busy"
      :aria-label="t('communityChat.messageActions')"
      @select="(action) => emit('action', action)"
    >
      <BButton size="small" :loading="busy" :aria-label="t('communityChat.moreActions')">
        <SvgIcon :src="icon.common.more" size="15" aria-hidden="true" />
      </BButton>
    </BActionMenu>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import type { BActionMenuItem } from '@/components/base/BasicComponents/actionMenu';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  withDefaults(
    defineProps<{
      label: string;
      canViewOriginal?: boolean;
      actionItems?: BActionMenuItem[];
      busy?: boolean;
    }>(),
    {
      canViewOriginal: false,
      actionItems: () => [],
      busy: false,
    },
  );
  const emit = defineEmits<{
    surfaceClick: [event: MouseEvent];
    viewOriginal: [];
    action: [action: string];
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

  .community-message__recall-audit-action,
  .community-message__recall-more :deep(.b_btn) {
    min-width: 0;
    min-height: 24px;
    height: 24px;
    padding: 2px 6px !important;
    border: 0 !important;
    color: var(--primary-color) !important;
    background: transparent !important;
    font-size: 10px;
  }

  .community-message__recall-more {
    position: absolute;
    top: 1px;
    left: calc(100% + 2px);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.16s ease;
  }

  .community-message__recall-line:hover .community-message__recall-more,
  .community-message__recall-line:focus-within .community-message__recall-more {
    opacity: 1;
    pointer-events: auto;
  }

  @media (max-width: 767px) {
    .community-message__recall-line {
      min-height: 32px;
      padding-inline: 8px;
    }

    .community-message__recall-more {
      display: none;
    }
  }
</style>

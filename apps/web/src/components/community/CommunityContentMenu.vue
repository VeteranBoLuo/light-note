<template>
  <template v-if="items.length && isMobile">
    <BButton
      class="community-content-more is-mobile"
      :aria-label="t('community.feed.contentMore')"
      :aria-expanded="mobileOpen"
      aria-haspopup="dialog"
      :disabled="disabled"
      icon-only
      @click="mobileOpen = true"
    >
      <SvgIcon :src="icon.common.more" size="18" />
    </BButton>
    <MobilePageActionsDrawer
      v-model:open="mobileOpen"
      :title="t('community.feed.contentMore')"
      :actions="mobileActions"
      @action="selectMobileAction"
    />
  </template>
  <BActionMenu
    v-else-if="items.length"
    :z-index="810"
    :width="saveActions ? 176 : 104"
    :items="items"
    :placement="placement || 'bottom-right'"
    :disabled="disabled"
    @select="(key) => $emit('select', key)"
  >
    <BButton class="community-content-more" :aria-label="t('community.feed.contentMore')" :disabled="disabled" icon-only
      ><SvgIcon :src="icon.common.more" size="18"
    /></BButton>
  </BActionMenu>
</template>
<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import type { BActionMenuItem, BActionMenuPlacement } from '@/components/base/BasicComponents/actionMenu';
  import { useI18n } from 'vue-i18n';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  const props = defineProps<{
    readonly?: boolean;
    own?: boolean;
    saveActions?: boolean;
    canSave?: boolean;
    disabled?: boolean;
    comment?: boolean;
    placement?: BActionMenuPlacement;
  }>();
  const emit = defineEmits<{ select: [key: string] }>();
  const isMobile = useMobileLayout();
  const mobileOpen = ref(false);
  const { t } = useI18n();
  const items = computed<BActionMenuItem[]>(() => [
    ...(props.saveActions
      ? [
          ...(props.canSave && !props.readonly
            ? [
                { key: 'save-note', label: t('community.feed.saveNote') },
                { key: 'save-bookmark', label: t('community.feed.saveBookmark') },
              ]
            : []),
          { key: 'copy-link', label: t('community.feed.copyLink') },
          ...(!props.readonly ? [{ key: 'save-divider', divider: true }] : []),
        ]
      : []),
    ...(props.own && !props.readonly
      ? [
          {
            key: 'withdraw',
            label: t(props.comment ? 'community.feed.deleteComment' : 'community.feed.withdraw'),
            danger: Boolean(props.comment),
          },
        ]
      : []),
    ...(props.own && !props.comment && !props.readonly
      ? [{ key: 'delete', label: t('community.feed.deletePost'), danger: true }]
      : []),
    ...(!props.own && !props.readonly ? [{ key: 'report', label: t('community.feed.report') }] : []),
  ]);
  const actionIcons: Record<string, string> = {
    'save-note': icon.resource.note,
    'save-bookmark': icon.resource.bookmark,
    'copy-link': icon.toolbox.copy,
    withdraw: icon.toolbox.back,
    delete: icon.toolbox.delete,
    report: icon.message.warning,
  };
  const mobileActions = computed<MobilePageActionItem[]>(() => {
    let dividerBefore = false;
    return items.value.flatMap((item) => {
      if (item.divider) {
        dividerBefore = true;
        return [];
      }
      const action = {
        ...item,
        label: item.label || '',
        icon: props.comment && item.key === 'withdraw' ? icon.toolbox.delete : actionIcons[item.key],
        dividerBefore,
        disabled: props.disabled || item.disabled,
      };
      dividerBefore = false;
      return [action];
    });
  });
  function selectMobileAction(action: MobilePageActionItem) {
    if (!props.disabled && items.value.some((item) => item.key === action.key && !item.divider && !item.disabled)) {
      emit('select', action.key);
    }
  }
  watch([isMobile, () => props.disabled, () => items.value.length], () => {
    if (!isMobile.value || props.disabled || !items.value.length) mobileOpen.value = false;
  });
</script>
<style scoped>
  .community-content-more {
    background: transparent;
    color: var(--desc-color);
    width: var(--ui-layout-32, 32px);
    height: var(--ui-layout-32, 32px);
    padding: var(--ui-space-6, 6px);
  }
  .community-content-more.is-mobile {
    width: 44px;
    height: 44px;
  }
</style>

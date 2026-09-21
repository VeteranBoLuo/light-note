<template>
  <BActionMenu
    v-if="items.length"
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
  import { computed } from 'vue';
  import type { BActionMenuPlacement } from '@/components/base/BasicComponents/actionMenu';
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
  defineEmits<{ select: [key: string] }>();
  const { t } = useI18n();
  const items = computed(() => [
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
</script>
<style scoped>
  .community-content-more {
    background: transparent;
    color: var(--desc-color);
    width: 32px;
    height: 32px;
    padding: 6px;
  }
</style>

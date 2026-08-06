<template>
  <BActionMenu
    class="right-menu-anchor"
    :items="normalizedMenu"
    :triggers="triggers"
    placement="right-start"
    :disabled="!bookmark.isDesktop"
    @select="(key, source) => emit('select', key, source)"
  >
    <slot />
  </BActionMenu>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import type {
    BActionMenuItem,
    BActionMenuSource,
    BActionMenuTrigger,
  } from '@/components/base/BasicComponents/actionMenu';
  import bookmarkStore from '@/store/bookmark';

  type LegacyMenuItem = string | (Partial<BActionMenuItem> & { key?: string; label?: string });

  const props = withDefaults(
    defineProps<{
      menu?: LegacyMenuItem[];
      hoverable?: boolean;
    }>(),
    {
      menu: () => [],
      hoverable: false,
    },
  );

  const emit = defineEmits<{
    select: [key: string, source: BActionMenuSource];
  }>();

  const bookmark = bookmarkStore();
  const triggers = computed<BActionMenuTrigger[]>(() => (props.hoverable ? ['hover', 'contextmenu'] : ['contextmenu']));
  const normalizedMenu = computed<BActionMenuItem[]>(() =>
    props.menu.map((item, index) => {
      if (typeof item === 'string') return { key: item, label: item };
      if (item.divider) return { key: item.key || `divider-${index}`, divider: true };
      return {
        ...item,
        key: item.key || item.label || `action-${index}`,
        label: item.label || '',
      };
    }),
  );
</script>

<style lang="less" scoped>
  .right-menu-anchor {
    display: block;
    width: 100%;
    min-width: 0;
  }
</style>

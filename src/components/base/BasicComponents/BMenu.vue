<template>
  <a-dropdown
    :trigger="trigger"
    :overlay-class-name="overlayClassName"
    :get-popup-container="getPopupContainer"
    @openChange="handleOpenChange"
  >
    <slot />
    <template #overlay>
      <a-menu>
        <a-menu-item v-for="item in menuOptions" :key="item.label" @click="item.function">
          <div class="flex-align-center-gap">
            <svg-icon v-if="item.icon" :src="item.icon" />
            <span>{{ item.label }}</span>
          </div>
        </a-menu-item>
      </a-menu>
    </template>
  </a-dropdown>
</template>

<script lang="ts" setup>
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

  type BMenuTrigger = 'hover' | 'click' | 'contextmenu' | 'focus';

  const emit = defineEmits<{
    openChange: [open: boolean];
  }>();

  withDefaults(
    defineProps<{
      menuOptions: { label: string; icon?: string; function?: () => void }[];
      trigger?: BMenuTrigger | BMenuTrigger[];
      overlayClassName?: string;
      getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
    }>(),
    {
      trigger: 'hover',
    },
  );

  function handleOpenChange(open: boolean) {
    emit('openChange', open);
  }
</script>

<style lang="less" scoped></style>

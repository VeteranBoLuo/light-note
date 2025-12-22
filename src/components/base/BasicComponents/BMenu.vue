<template>
  <a-dropdown :trigger="trigger">
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
  import { Trigger } from 'ant-design-vue/es/dropdown/props';

  const props = withDefaults(
    defineProps<{
      menuOptions: { label: string; icon?: string; function?: () => void }[];
      trigger: Trigger | Trigger[];
    }>(),
    {
      trigger: 'hover',
    },
  );
</script>

<style lang="less" scoped></style>

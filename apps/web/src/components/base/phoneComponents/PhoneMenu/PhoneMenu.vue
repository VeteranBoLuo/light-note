<template>
  <div class="phone-menu" v-for="item in menuList" :key="item.id">
    <div class="phone-menu-item" v-for="cItem in item" @click="$emit('click', cItem)">
      <span class="phone-menu-item-title">{{ cItem[label] }}</span>
      <span class="phone-menu-item-des">
        <slot name="des">
          <svg-icon color="#999fa8" style="rotate: 180deg" :src="icon.arrow_left" size="14" />
        </slot>
      </span>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { PropType } from 'vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

  type MenuListItem = any[] & { id: string | number };

  const props = defineProps({
    menuList: {
      type: Array as PropType<MenuListItem[]>,
      default: () => [],
    },
    label: {
      type: String,
      default: 'label',
    },
  });
</script>

<style lang="less">
  .phone-menu {
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 20px;
  }

  .phone-menu-item {
    background-color: var(--phone-menu-item-bg-color);
    height: 50px;
    display: flex;
    align-items: center;
    padding: 0 20px;
    justify-content: space-between;
    cursor: pointer;
    &:not(:last-child) {
      border-bottom: 1px solid var(--phone-menu-item-border-color);
    }

    .phone-menu-item-des {
      color: #999fa8;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 5px;
      line-height: 100%;
    }
  }
</style>

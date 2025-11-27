<template>
  <div>
    <div class="phone-container no-scrollbar" v-if="bookmark.isMobileDevice">
      <div class="phone-navigation">
        <slot name="navigation">
          <span
            style="position: absolute; left: 0; top: 30px; transform: translateY(-50%)"
            class="flex-align-center dom-hover"
            @click="backClick"
          >
            <svg-icon :src="icon.arrow_left" size="25" />
          </span>
          <span>{{ title }}</span>
        </slot>
      </div>
      <div class="phone-body">
        <slot name="default" />
      </div>
    </div>
    <slot name="default" v-else />
  </div>
</template>

<script lang="ts" setup>
  import router from '@/router';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore } from '@/store';
  import { getCurrentInstance } from 'vue';
  const bookmark = bookmarkStore();
  const props = defineProps({
    title: {
      type: String,
      default: '',
    },
  });
  const emit = defineEmits(['backClick']);
  const instance = getCurrentInstance();
  const hasParentHandler = () => {
    // 检查父组件是否提供了 backClick 处理函数
    return !!instance?.vnode?.props?.onBackClick;
  };
  function backClick() {
    // 如果父组件提供了处理函数，则发出事件
    if (hasParentHandler()) {
      emit('backClick');
    } else {
      // 否则执行默认行为
      router.back();
    }
  }
</script>

<style lang="less" scoped>
  .phone-container {
    position: fixed !important;
    top: 0 !important;
    padding: 0 20px 20px 20px;
    box-sizing: border-box;
    width: 100%;
    height: 100% !important;
    display: flex;
    flex-direction: column;
  }

  .phone-navigation {
    margin: 0 auto;
    font-size: 20px;
    font-weight: 550;
    width: calc(100% - 40px);
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    top: 0;
  }
  .phone-body {
    height: calc(100% - 80px);
    width: calc(100% - 40px);
    position: fixed;
    top: 60px;
    padding-top: 20px;
    box-sizing: border-box;
    overflow: auto;
  }
</style>

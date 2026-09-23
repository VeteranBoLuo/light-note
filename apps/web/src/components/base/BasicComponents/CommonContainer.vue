<template>
  <div :class="{ 'common-container--embedded-mobile': embeddedMobile && bookmark.isMobile }">
    <div
      class="phone-container no-scrollbar"
      :class="{ 'phone-container--embedded': embeddedMobile }"
      v-if="bookmark.isMobile"
    >
      <div v-if="showNavigation" class="phone-navigation">
        <slot name="navigation">
          <BButton
            v-if="showBack"
            style="position: absolute; left: 0; top: 30px; transform: translateY(-50%)"
            class="flex-align-center common-container-back"
            :aria-label="$t('common.back')"
            @click="backClick"
          >
            <svg-icon :src="icon.arrow_left" size="25" />
          </BButton>
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
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore } from '@/store';
  import { getCurrentInstance, onMounted, onBeforeUnmount, onActivated, onDeactivated } from 'vue';
  import { useRoute } from 'vue-router';
  import { backRouterPage } from '@/utils/common';
  const bookmark = bookmarkStore();
  const props = defineProps({
    title: {
      type: String,
      default: '',
    },
    showBack: {
      type: Boolean,
      default: true,
    },
    showNavigation: {
      type: Boolean,
      default: true,
    },
    embeddedMobile: {
      type: Boolean,
      default: false,
    },
  });
  const route = useRoute();
  const routeName = route.name;
  let active = true;
  function onSystemBack(event: Event) {
    if (
      event.defaultPrevented ||
      !active ||
      route.name !== routeName ||
      !bookmark.isMobile ||
      !props.showBack ||
      !props.showNavigation
    )
      return;
    event.preventDefault();
    backClick();
  }
  onMounted(() => window.addEventListener('light-note-system-back', onSystemBack));
  onBeforeUnmount(() => window.removeEventListener('light-note-system-back', onSystemBack));
  onActivated(() => {
    active = true;
  });
  onDeactivated(() => {
    active = false;
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
      backRouterPage();
    }
  }
</script>

<style lang="less" scoped>
  .common-container-back.b_btn {
    padding: 0;
    width: 44px;
    height: 44px;
    background: transparent;
  }
  .phone-container {
    position: fixed !important;
    top: 0 !important;
    padding: 0 var(--ui-space-20, 20px) var(--ui-space-20, 20px) var(--ui-space-20, 20px);
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
    padding-top: var(--ui-space-20, 20px);
    box-sizing: border-box;
    overflow: auto;
  }

  .common-container--embedded-mobile {
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .phone-container--embedded {
    position: relative !important;
    top: auto !important;
    height: 100% !important;
    min-height: 0;
    padding: 0 var(--ui-space-20, 20px) var(--ui-space-20, 20px);
  }

  .phone-container--embedded .phone-navigation {
    position: relative;
    top: auto;
    width: 100%;
    flex: 0 0 60px;
  }

  .phone-container--embedded .phone-body {
    position: relative;
    top: auto;
    width: 100%;
    height: auto;
    min-height: 0;
    flex: 1 1 auto;
  }
</style>

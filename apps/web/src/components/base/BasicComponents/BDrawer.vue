<template>
  <Teleport to="body">
    <div v-if="localVisible" class="b-drawer-wrapper" :class="{ 'is-entered': entered }">
      <div class="b-drawer-mask" @click="handleMaskClick" />
      <div class="b-drawer-panel" :class="{ 'b-drawer-panel--fullscreen': fullScreen }" :style="{ width: panelWidth }">
        <div class="b-drawer-header">
          <span class="b-drawer-title">{{ title }}</span>
          <BButton class="b-drawer-close" @click="handleClose">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </BButton>
        </div>
        <div class="b-drawer-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
  import { computed, ref, watch, nextTick } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  const props = withDefaults(
    defineProps<{
      open: boolean;
      title?: string;
      width?: string;
      maskClosable?: boolean;
      fullScreen?: boolean;
    }>(),
    {
      title: '',
      width: '640px',
      maskClosable: true,
      fullScreen: false,
    },
  );

  const emit = defineEmits<{
    close: [];
  }>();

  const localVisible = ref(false);
  const entered = ref(false);
  let closing = false;

  // 打开：先渲染 DOM，下一帧触发滑入动画
  function doOpen() {
    localVisible.value = true;
    entered.value = false;
    nextTick(() => {
      // 强制回流后触发 enter 动画
      requestAnimationFrame(() => {
        entered.value = true;
      });
    });
  }

  // 关闭：先播放滑出动画，动画结束后销毁 DOM
  function doClose() {
    if (closing) return;
    closing = true;
    entered.value = false;
    setTimeout(() => {
      localVisible.value = false;
      closing = false;
    }, 220); // 略长于 CSS transition 时长
  }

  watch(
    () => props.open,
    (val) => {
      if (val) {
        doOpen();
      } else if (localVisible.value) {
        doClose();
      }
    },
    { immediate: true },
  );

  const panelWidth = computed(() => {
    const w = props.width;
    return isNumeric(w) ? `${w}px` : w;
  });

  function isNumeric(v: string): boolean {
    return /^\d+$/.test(v);
  }

  function handleMaskClick(e: MouseEvent) {
    if (props.maskClosable && e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleClose() {
    emit('close');
  }
</script>

<style lang="less">
  .b-drawer-wrapper {
    position: fixed;
    inset: 0;
    z-index: 99999;
  }

  .b-drawer-mask {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    transition: opacity 0.2s ease;
  }

  .b-drawer-panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    background: var(--background-color);
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
    transform: translateX(100%);
    min-width: 300px;
    max-width: 90vw;

    /* 滚动条主题 */
    ::-webkit-scrollbar {
      width: 6px;
    }
    ::-webkit-scrollbar-thumb {
      background: var(--scrollbar-color, rgba(144, 147, 153, 0.3));
      border-radius: 3px;
    }
  }

  .b-drawer-panel--fullscreen {
    min-width: 100vw;
    max-width: 100vw;
  }

  .is-entered {
    .b-drawer-mask {
      opacity: 1;
    }

    .b-drawer-panel {
      transform: translateX(0);
    }
  }

  /* 初始状态 mask 透明 */
  .b-drawer-mask {
    opacity: 0;
  }

  .b-drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid var(--card-border-color, #e8e8e8);
    flex-shrink: 0;
  }

  .b-drawer-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-color);
  }

  .b-drawer-close {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--desc-color, #999);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;

    &:hover {
      background: var(--menu-item-bg-color, #f2f2f4);
      color: var(--text-color);
    }
  }

  .b-drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }
</style>

<template>
  <Teleport to="body">
    <div v-if="visible" class="mask-container" @click.stop>
      <div
        class="modal-view"
        :class="{ out: isOut }"
        :style="{
          width: props.width !== 'auto' ? props.width : undefined,
          height: props.height !== 'auto' ? props.height : undefined,
        }"
      >
        <div class="modal-header">
          <slot name="title">
            <div class="modal-title">{{ title }}</div>
          </slot>
          <button class="modal-close" @click="handleClose">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="modal-content">
          <slot name="default"></slot>
        </div>
        <slot name="footer" v-if="showFooter">
          <div class="modal-footer">
            <b-space>
              <b-button type="primary" @click="$emit('ok')">{{ t('common.confirm') }}</b-button>
              <b-button @click="handleClose">{{ t('common.cancel') }}</b-button>
            </b-space>
          </div>
        </slot>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();
  const props = withDefaults(
    defineProps<{
      title: string;
      maskClosable?: boolean; // 点击遮罩层关闭
      showFooter?: boolean; // 是否显示底部
      escClosable?: boolean; // 按下esc关闭
      top?: string;
      width?: string;
      height?: string;
    }>(),
    {
      title: '默认标题',
      maskClosable: true,
      showFooter: true,
      escClosable: true,
      top: '50%',
      width: 'auto',
      height: 'auto',
    },
  );
  const visible = defineModel('visible');
  const emit = defineEmits(['ok', 'close']);
  const isOut = ref(false);
  const attrs = useAttrs();
  function handleClose() {
    isOut.value = true;
    const timer = setTimeout(() => {
      isOut.value = false;
      // 检查父组件是否监听了 'close' 事件
      if (attrs.onClose) {
        emit('close');
      } else {
        visible.value = false;
      }
      clearTimeout(timer);
    }, 200);
  }
  function closeMask(e) {
    if (props.maskClosable && !e.target.closest('.modal-view')) {
      handleClose();
    }
  }

  function clickEsc(e) {
    if (props.escClosable && e.keyCode === 27) {
      handleClose();
    }
  }

  onMounted(() => {
    if (visible.value) {
      document.addEventListener('mouseup', closeMask);
      document.addEventListener('keydown', clickEsc);
    }
  });
  watch(
    () => visible.value,
    (val) => {
      if (val) {
        document.addEventListener('mouseup', closeMask);
        document.addEventListener('keydown', clickEsc);
      } else {
        document.removeEventListener('mouseup', closeMask);
        document.removeEventListener('keydown', clickEsc);
      }
    },
  );

  onBeforeUnmount(() => {
    document.removeEventListener('mouseup', closeMask);
    document.removeEventListener('keydown', clickEsc);
  });
  const cssTop = computed(() => {
    return props.top;
  });
</script>

<style lang="less" scoped>
  .mask-container {
    position: fixed;
    height: 100vh;
    width: 100vw;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    animation: mask-in 0.2s ease;
  }

  .modal-view {
    position: absolute;
    left: 50%;
    top: v-bind(cssTop);
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    background-color: var(--background-color);
    padding: 0;
    border-radius: 12px;
    min-width: max-content;
    min-height: 100px;
    max-width: 90%;
    max-height: calc(100vh - 32px);
    width: max-content;
    display: flex;
    flex-direction: column;
    z-index: 1000;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: in-animation 0.25s ease;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px 14px;
    border-bottom: 1px solid var(--menu-item-h-bg-color);
    flex-shrink: 0;
  }

  .modal-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-color);
    margin: 0;
  }

  .modal-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--desc-color);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
    padding: 0;

    &:hover {
      background: var(--menu-item-h-bg-color);
      color: var(--text-color);
    }
  }

  .modal-content {
    padding: 16px 20px 20px;
    word-wrap: break-word;
    overflow-wrap: break-word;
    min-height: 0;
    overflow: auto;
    flex: 1;
  }

  .modal-footer {
    padding: 0 20px 16px;
    place-self: end;
    flex-shrink: 0;
  }

  .out {
    animation: out-animation 0.3s ease;
  }

  @keyframes mask-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes in-animation {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.95);
    }
    100% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  @keyframes out-animation {
    0% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  :deep(.b-input) {
    background-color: var(--modal-input-bg);
  }
  :deep(.b-textarea) {
    background-color: var(--modal-input-bg);
  }

  @media (max-width: 767px) {
    .modal-view {
      top: 50%;
      min-width: 80%;
      max-height: calc(100vh - 20px);
    }
    .modal-content {
      padding: 12px 16px 16px;
    }
    .modal-header {
      padding: 14px 16px 12px;
    }
    .modal-footer {
      padding: 0 16px 12px;
    }
  }
</style>

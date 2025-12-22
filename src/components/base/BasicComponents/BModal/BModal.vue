<template>
  <Teleport to="body">
    <div v-if="visible" class="mask-container" @click.stop>
      <div class="modal-view" :class="{ out: isOut }">
        <span
          style="position: absolute; right: 20px; top: 20px; z-index: 99999; font-size: 20px"
          @click="handleClose"
          class="dom-hover"
        >
          <img src="../../../../assets/icons/close.svg" width="20" height="20" alt="" />
        </span>
        <slot name="title">
          <div class="modal-title">{{ title }}</div>
        </slot>
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
  import { computed, onBeforeUnmount, onMounted, onUnmounted, ref, useAttrs, watch } from 'vue';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();
  const props = withDefaults(
    defineProps<{
      title: string;
      maskClosable?: boolean; // 点击遮罩层关闭
      showFooter?: boolean; // 是否显示底部
      escClosable?: boolean; // 按下esc关闭
      top?: string;
    }>(),
    {
      title: '默认标题',
      maskClosable: true,
      showFooter: true,
      escClosable: true,
      top: '40%',
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
    if (props.maskClosable && !e.target.matches('.modal-view *')) {
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
        document.addEventListener('keydown', clickEsc);
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
    background-color: rgba(0, 0, 0, 0.8);
    z-index: 1000;
  }

  .modal-view {
    position: absolute;
    left: 50%;
    top: v-bind(cssTop);
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    background-color: var(--background-color);
    padding: 20px;
    border-radius: 10px;
    width: max-content;
    min-width: 400px;
    min-height: 100px;
    max-width: 90%;
    display: grid;
    z-index: 1000;
    animation: in-animation 0.3s ease;
  }

  .modal-title {
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 15px;
  }

  .modal-content {
    word-wrap: break-word; /* 允许单词在到达边界时断开换行 */
    overflow-wrap: break-word;
  }
  :deep(.b-input) {
    background-color: var(--modal-input-bg);
  }
  :deep(.b-textarea) {
    background-color: var(--modal-input-bg);
  }
  .modal-footer {
    margin-top: 10px;
    place-self: end;
  }

  .out {
    animation: out-animation 0.3s ease;
  }

  @keyframes in-animation {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
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

  @media (max-width: 1000px) {
    .modal-view {
      top: 45%;
      min-width: 80%;
    }
  }
</style>

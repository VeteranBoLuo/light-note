<template>
  <Teleport to="body">
    <div v-if="visible" class="mask-container" :class="props.maskClass" @click.self="handleMaskClick">
      <div
        ref="modalRef"
        class="modal-view"
        :class="[{ out: isOut }, props.modalClass]"
        :style="{
          width: props.width !== 'auto' ? props.width : undefined,
          height: props.height !== 'auto' ? props.height : undefined,
        }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="modalTitleId"
        tabindex="-1"
        @keydown="handleModalKeydown"
      >
        <div class="modal-header">
          <div :id="modalTitleId" class="modal-title">
            <slot name="title">{{ title || t('common.defaultTitle') }}</slot>
          </div>
          <BButton class="modal-close" :aria-label="t('common.close')" @click="handleClose">
            <SvgIcon :src="icon.navigation.close" size="18" aria-hidden="true" />
          </BButton>
        </div>
        <div class="modal-content" :class="props.contentClass">
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
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { computed, getCurrentInstance, nextTick, onBeforeUnmount, ref, useAttrs, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { acquireModalLayer, isTopModalLayer, releaseModalLayer } from '@/utils/modalLayer';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import {
    registerMobileOverlayHistory,
    releaseMobileOverlayHistory,
    requestMobileOverlayHistoryClose,
    type MobileOverlayHistoryHandle,
  } from '@/utils/mobileOverlayHistory';

  const { t } = useI18n();
  const isMobileLayout = useMobileLayout();
  const props = withDefaults(
    defineProps<{
      title: string;
      maskClosable?: boolean; // 点击遮罩层关闭
      showFooter?: boolean; // 是否显示底部
      escClosable?: boolean; // 按下esc关闭
      top?: string;
      width?: string;
      height?: string;
      modalClass?: string;
      /** 内容区附加类名:用于弹框自行接管滚动(如左右分栏各自滚动),避免深层 CSS 覆盖 */
      contentClass?: string;
      maskClass?: string;
      historyClosable?: boolean;
      /** 弹框打开后优先聚焦的元素选择器；找不到时回退到第一个可聚焦元素。 */
      initialFocus?: string;
    }>(),
    {
      title: '',
      maskClosable: true,
      showFooter: true,
      escClosable: true,
      top: '50%',
      width: 'auto',
      height: 'auto',
      historyClosable: true,
      initialFocus: '',
    },
  );
  const visible = defineModel('visible');
  const emit = defineEmits(['ok', 'close']);
  const isOut = ref(false);
  const modalRef = ref<HTMLElement | null>(null);
  const modalTitleId = `b-modal-title-${getCurrentInstance()?.uid ?? Math.random().toString(36).slice(2)}`;
  const modalLayer = Symbol('b-modal');
  let layerAcquired = false;
  let closeTimer: number | null = null;
  let historyHandle: MobileOverlayHistoryHandle | null = null;
  const attrs = useAttrs();

  function performClose() {
    if (closeTimer !== null || isOut.value) return;
    isOut.value = true;
    closeTimer = window.setTimeout(() => {
      closeTimer = null;
      isOut.value = false;
      // 检查父组件是否监听了 'close' 事件
      if (attrs.onClose) {
        emit('close');
      } else {
        visible.value = false;
      }
    }, 200);
  }

  function closeFromMobileHistory() {
    historyHandle = null;
    performClose();
  }

  function handleClose() {
    if (historyHandle && requestMobileOverlayHistoryClose(historyHandle)) return;
    historyHandle = null;
    performClose();
  }
  // 点遮罩背景关闭:用 @click.self,只在点到遮罩本身(而非弹框内容)时触发。
  // 不再用 document mouseup + closest('.modal-view') 判定 —— 那会把 Teleport 到 body 的浮层
  // (如 BSelect 下拉面板)误判成"弹框外部"而关掉整个弹框;@click.self 天然不受这类浮层影响。
  function handleMaskClick() {
    if (props.maskClosable) {
      handleClose();
    }
  }

  function clickEsc(e) {
    if (props.escClosable && e.key === 'Escape' && isTopModalLayer(modalLayer)) {
      e.preventDefault();
      handleClose();
    }
  }

  const focusableSelector =
    'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function resolveInitialFocusElement() {
    if (!props.initialFocus || !modalRef.value) return null;
    try {
      return modalRef.value.querySelector<HTMLElement>(props.initialFocus);
    } catch {
      return null;
    }
  }

  function handleModalKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab' || !isTopModalLayer(modalLayer)) return;
    const focusable = [...(modalRef.value?.querySelectorAll<HTMLElement>(focusableSelector) || [])].filter(
      (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
    );
    if (!focusable.length) {
      event.preventDefault();
      modalRef.value?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  watch(
    () => visible.value,
    (val) => {
      if (val) {
        acquireModalLayer(modalLayer);
        layerAcquired = true;
        document.addEventListener('keydown', clickEsc);
        nextTick(() => {
          const first = resolveInitialFocusElement() || modalRef.value?.querySelector<HTMLElement>(focusableSelector);
          (first || modalRef.value)?.focus({ preventScroll: true });
        });
      } else {
        document.removeEventListener('keydown', clickEsc);
        if (layerAcquired) releaseModalLayer(modalLayer);
        layerAcquired = false;
      }
    },
    { immediate: true },
  );

  watch(
    () => [visible.value === true, isMobileLayout.value, props.historyClosable] as const,
    ([isVisible, isMobile, historyClosable]) => {
      if (isVisible && isMobile && historyClosable) {
        if (!historyHandle) historyHandle = registerMobileOverlayHistory(closeFromMobileHistory);
        return;
      }
      if (historyHandle) {
        releaseMobileOverlayHistory(historyHandle);
        historyHandle = null;
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    if (closeTimer !== null) window.clearTimeout(closeTimer);
    closeTimer = null;
    if (historyHandle) releaseMobileOverlayHistory(historyHandle);
    historyHandle = null;
    document.removeEventListener('keydown', clickEsc);
    if (layerAcquired) releaseModalLayer(modalLayer);
  });
  const cssTop = computed(() => {
    return props.top;
  });
</script>

<style lang="less" scoped>
  .mask-container {
    position: fixed;
    /* 用 inset:0 而非 100vw/100vh:界面缩放(html zoom)下 vw/vh 会算出比可视视口更小的尺寸,
       导致遮罩盖不满、右/下露白;inset:0 由固定定位的包含块(视口)约束,缩放下始终铺满。 */
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    /* 必须高于 BDrawer(600):否则从抽屉里打开的弹框(如 AI「选段应用到笔记」)会被抽屉整个遮住、全屏时完全看不见。
       仍低于弹框内浮层 BPopover/BDropdown(800)、BSelect(900)、BAlert(1300),使这些下拉/确认框在弹框内照常盖在弹框之上。 */
    z-index: 700;
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
    min-width: 0;
    min-height: 100px;
    max-width: 90%;
    max-height: calc(100% - 32px);
    width: max-content;
    display: flex;
    flex-direction: column;
    z-index: 700;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: in-animation 0.25s ease;
  }

  .modal-header {
    position: relative;
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

  .modal-close.b_btn {
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
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
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
      max-height: calc(100% - 20px);
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

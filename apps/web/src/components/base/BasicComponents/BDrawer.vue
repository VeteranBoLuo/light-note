<template>
  <Teleport to="body">
    <div
      v-if="localVisible"
      class="b-drawer-wrapper"
      :class="{
        'is-entered': entered,
        'is-settled': settled,
        'is-hidden': dormant,
        'is-non-modal': !modal,
      }"
      :aria-hidden="!open || undefined"
    >
      <div v-if="modal" class="b-drawer-mask" aria-hidden="true" @click="handleMaskClick" />
      <div
        ref="panelRef"
        class="b-drawer-panel"
        :class="{
          'b-drawer-panel--fullscreen': fullScreen,
          'b-drawer-panel--mobile-fullscreen': mobileFullScreen,
        }"
        :style="panelStyle"
        role="dialog"
        :aria-modal="modal ? 'true' : undefined"
        :aria-labelledby="title ? drawerTitleId : undefined"
        :aria-label="!title ? ariaLabel || undefined : undefined"
        tabindex="-1"
        @keydown="handleKeydown"
        @transitionend="handlePanelTransitionEnd"
      >
        <div
          v-if="resizable && !fullScreen"
          class="b-drawer-resize-handle"
          role="separator"
          aria-orientation="vertical"
          :aria-label="resizeLabel || t('common.resize')"
          :aria-valuemin="resolvedMinWidth"
          :aria-valuemax="resolvedMaxWidth"
          :aria-valuenow="currentWidth"
          tabindex="0"
          @pointerdown="startResize"
          @keydown="handleResizeKeydown"
        />
        <div class="b-drawer-header">
          <span :id="drawerTitleId" class="b-drawer-title">{{ title }}</span>
          <div class="b-drawer-header-actions">
            <slot name="header-actions" />
            <BButton class="b-drawer-close" :aria-label="closeLabel || t('common.close')" @click="handleClose">
              <SvgIcon size="18" :src="icon.common.close" aria-hidden="true" />
            </BButton>
          </div>
        </div>
        <div class="b-drawer-body" :style="bodyPadding !== undefined ? { padding: bodyPadding } : undefined">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
  import { computed, ref, watch, nextTick, onBeforeUnmount, onMounted, getCurrentInstance } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { getRootZoom } from '@/utils/zoom';

  const { t } = useI18n();

  const props = withDefaults(
    defineProps<{
      open: boolean;
      title?: string;
      width?: string;
      maskClosable?: boolean;
      fullScreen?: boolean;
      mobileFullScreen?: boolean;
      destroyOnClose?: boolean;
      keyboard?: boolean;
      ariaLabel?: string;
      closeLabel?: string;
      modal?: boolean;
      resizable?: boolean;
      minWidth?: number;
      maxWidth?: number;
      resizeLabel?: string;
      bodyPadding?: string;
      closeOnClickOutside?: boolean;
    }>(),
    {
      title: '',
      width: '640px',
      maskClosable: true,
      fullScreen: false,
      mobileFullScreen: false,
      destroyOnClose: true,
      keyboard: true,
      ariaLabel: '',
      closeLabel: '',
      modal: true,
      resizable: false,
      minWidth: 440,
      maxWidth: 720,
      resizeLabel: '',
      closeOnClickOutside: false,
    },
  );

  const emit = defineEmits<{
    close: [];
    resize: [width: number];
  }>();

  const localVisible = ref(false);
  const entered = ref(false);
  const settled = ref(false);
  const dormant = ref(false);
  const panelRef = ref<HTMLElement | null>(null);
  const drawerTitleId = `b-drawer-title-${getCurrentInstance()?.uid ?? Math.random().toString(36).slice(2)}`;
  let closing = false;
  let previouslyFocused: HTMLElement | null = null;
  let openFrame: number | null = null;
  let settleTimer: number | null = null;
  let closeTimer: number | null = null;
  const currentWidth = ref(0);
  const layoutViewportWidth = ref(readLayoutViewportWidth());
  let resizing = false;
  let resizeStartX = 0;
  let resizeStartWidth = 0;

  const clearOpenFrame = () => {
    if (openFrame === null) return;
    cancelAnimationFrame(openFrame);
    openFrame = null;
  };

  const clearSettleTimer = () => {
    if (settleTimer === null) return;
    clearTimeout(settleTimer);
    settleTimer = null;
  };

  const markSettled = () => {
    if (!entered.value || !props.open || !localVisible.value) return;
    settled.value = true;
    clearSettleTimer();
  };

  // 打开：先渲染 DOM，下一帧触发滑入动画
  function doOpen() {
    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    closing = false;
    dormant.value = false;
    clearOpenFrame();
    clearSettleTimer();
    localVisible.value = true;
    entered.value = false;
    settled.value = false;
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    nextTick(() => {
      // 强制回流后触发 enter 动画
      openFrame = requestAnimationFrame(() => {
        openFrame = null;
        if (!props.open || !localVisible.value) return;
        entered.value = true;
        if (props.modal) panelRef.value?.focus({ preventScroll: true });
        // 首次挂载、系统减少动画或页面切换时，浏览器可能不派发 transitionend。
        // 用略长于 CSS 动画的定时器兜底，确保最终一定移除常驻 transform 合成层。
        settleTimer = window.setTimeout(markSettled, 240);
      });
    });
  }

  // 关闭：先播放滑出动画，动画结束后销毁 DOM
  function doClose() {
    if (closing) return;
    closing = true;
    clearOpenFrame();
    clearSettleTimer();
    settled.value = false;
    entered.value = false;
    // 立即把焦点移回触发元素:aria-hidden 随 open=false 立刻置真,须先让焦点离开抽屉,
    // 否则焦点短暂停留在 aria-hidden 子树内(Chrome 报 Blocked aria-hidden 并可能强移焦点)。
    if (props.modal && previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    previouslyFocused = null;
    closeTimer = window.setTimeout(() => {
      closeTimer = null;
      if (props.destroyOnClose) localVisible.value = false;
      else dormant.value = true;
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
  const availablePanelWidth = computed(() => Math.max(1, Math.floor(layoutViewportWidth.value * 0.9)));
  const resolvedMinWidth = computed(() => Math.min(props.minWidth, availablePanelWidth.value));
  const resolvedMaxWidth = computed(() =>
    Math.max(resolvedMinWidth.value, Math.min(props.maxWidth, availablePanelWidth.value)),
  );
  watch(
    () => props.width,
    () => {
      const parsed = Number.parseFloat(panelWidth.value);
      if (Number.isFinite(parsed)) currentWidth.value = clampWidth(parsed);
    },
    { immediate: true },
  );
  watch(layoutViewportWidth, () => {
    if (currentWidth.value) currentWidth.value = clampWidth(currentWidth.value);
  });
  const panelStyle = computed(() =>
    props.fullScreen
      ? { width: '100%', minWidth: '100%', maxWidth: '100%' }
      : {
          width: props.resizable && currentWidth.value ? `${currentWidth.value}px` : panelWidth.value,
          minWidth: props.resizable ? `${resolvedMinWidth.value}px` : undefined,
          maxWidth: props.resizable ? `${resolvedMaxWidth.value}px` : undefined,
        },
  );

  function isNumeric(v: string): boolean {
    return /^\d+$/.test(v);
  }

  function readLayoutViewportWidth() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return props.maxWidth;
    return document.documentElement.clientWidth || Math.max(1, Math.round(window.innerWidth / getRootZoom()));
  }

  function syncLayoutViewportWidth() {
    layoutViewportWidth.value = readLayoutViewportWidth();
  }

  function handleMaskClick(e: MouseEvent) {
    if (props.maskClosable && e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleClose() {
    emit('close');
  }

  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && props.keyboard) {
      event.preventDefault();
      handleClose();
      return;
    }
    if (!props.modal || event.key !== 'Tab' || !panelRef.value) return;
    const focusable = Array.from(panelRef.value.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
    );
    if (!focusable.length) {
      event.preventDefault();
      panelRef.value.focus();
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

  function clampWidth(value: number) {
    return Math.round(Math.max(resolvedMinWidth.value, Math.min(resolvedMaxWidth.value, value)));
  }

  function handleResizeMove(event: PointerEvent) {
    if (!resizing) return;
    // 右侧抽屉:鼠标相对起点左移(clientX 变小)→ 宽度增大;按位移增量算,保证 1:1 跟手
    const delta = (resizeStartX - event.clientX) / getRootZoom();
    currentWidth.value = clampWidth(resizeStartWidth + delta);
  }

  function stopResize() {
    if (!resizing) return;
    resizing = false;
    document.body.classList.remove('b-drawer-is-resizing');
    window.removeEventListener('pointermove', handleResizeMove);
    window.removeEventListener('pointerup', stopResize);
    window.removeEventListener('pointercancel', stopResize);
    emit('resize', currentWidth.value);
  }

  function startResize(event: PointerEvent) {
    if (!props.resizable || props.fullScreen) return;
    event.preventDefault();
    resizing = true;
    // 记录拖拽起点与起始宽度,之后按位移增量调整 —— 不在按下时改宽度(避免"按一下就跳变/闪一下")
    syncLayoutViewportWidth();
    resizeStartX = event.clientX;
    resizeStartWidth =
      currentWidth.value || clampWidth(Number.parseFloat(panelWidth.value) || resolvedMinWidth.value);
    document.body.classList.add('b-drawer-is-resizing');
    window.addEventListener('pointermove', handleResizeMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  }

  function handleResizeKeydown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') currentWidth.value = resolvedMinWidth.value;
    else if (event.key === 'End') currentWidth.value = resolvedMaxWidth.value;
    else {
      const step = event.shiftKey ? 40 : 16;
      currentWidth.value = clampWidth(currentWidth.value + (event.key === 'ArrowLeft' ? step : -step));
    }
  }

  // 无蒙层抽屉的「点击外部关闭」:排除面板本身,以及抽屉内会 teleport 到 body 的浮层(下拉/气泡/弹框/提示等),
  // 避免点这些浮层时误关抽屉。
  const FLOATING_KEEP_OPEN =
    '.select-dropdown, .b-popover-panel, .b-dropdown-panel, .mask-container, .bAlert-bg, .b-tooltip-popup, .b-message, [data-drawer-keep-open]';
  let outsideBindFrame: number | null = null;
  function handleOutsidePointer(event: PointerEvent) {
    const panel = panelRef.value;
    if (!panel) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (panel.contains(target)) return;
    if (target.closest?.(FLOATING_KEEP_OPEN)) return;
    handleClose();
  }
  function bindOutside() {
    unbindOutside();
    // 延迟一帧再绑,避免「打开抽屉的那次点击」冒泡到 document 立即触发关闭
    outsideBindFrame = requestAnimationFrame(() => {
      document.addEventListener('pointerdown', handleOutsidePointer, true);
    });
  }
  function unbindOutside() {
    if (outsideBindFrame !== null) {
      cancelAnimationFrame(outsideBindFrame);
      outsideBindFrame = null;
    }
    document.removeEventListener('pointerdown', handleOutsidePointer, true);
  }
  watch(
    () => props.open && props.closeOnClickOutside && !props.modal && !props.fullScreen,
    (active) => {
      if (active) bindOutside();
      else unbindOutside();
    },
    { immediate: true },
  );

  function handlePanelTransitionEnd(event: TransitionEvent) {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform') return;
    markSettled();
  }

  onMounted(() => {
    syncLayoutViewportWidth();
    window.addEventListener('resize', syncLayoutViewportWidth);
  });

  onBeforeUnmount(() => {
    clearOpenFrame();
    clearSettleTimer();
    if (closeTimer !== null) clearTimeout(closeTimer);
    stopResize();
    unbindOutside();
    window.removeEventListener('resize', syncLayoutViewportWidth);
  });
</script>

<style lang="less">
  .b-drawer-wrapper {
    position: fixed;
    inset: 0;
    z-index: 600;
  }

  .b-drawer-wrapper.is-hidden {
    visibility: hidden;
    pointer-events: none;
  }

  .b-drawer-wrapper.is-non-modal {
    pointer-events: none;

    .b-drawer-panel {
      pointer-events: auto;
    }
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

    &:focus {
      outline: none;
    }

    /* 滚动条主题 */
    ::-webkit-scrollbar {
      width: 6px;
    }
    ::-webkit-scrollbar-thumb {
      background: var(--scrollbar-color, rgba(144, 147, 153, 0.3));
      border-radius: 3px;
    }
  }

  .b-drawer-resize-handle {
    position: absolute;
    z-index: 2;
    top: 0;
    bottom: 0;
    left: -6px;
    width: 12px;
    cursor: col-resize;
    touch-action: none;

    &::after {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 5px;
      width: 2px;
      background: transparent;
      content: '';
      transition: background-color 0.16s ease;
    }

    &:hover::after,
    &:focus-visible::after {
      background: color-mix(in srgb, var(--primary-color) 52%, transparent);
    }

    &:focus-visible {
      outline: none;
    }
  }

  body.b-drawer-is-resizing {
    cursor: col-resize !important;
    user-select: none !important;
  }

  .fullscreen-drawer() {
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
    height: auto;
    box-shadow: none;

    .b-drawer-header {
      padding-top: calc(12px + env(safe-area-inset-top));
      padding-right: max(14px, env(safe-area-inset-right));
      padding-bottom: 12px;
      padding-left: max(14px, env(safe-area-inset-left));
    }

    .b-drawer-body {
      overflow: hidden;
      padding: 12px max(12px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom))
        max(12px, env(safe-area-inset-left));
    }
  }

  .b-drawer-panel--fullscreen {
    .fullscreen-drawer();
  }

  @media (max-width: 767px) {
    .b-drawer-resize-handle {
      display: none;
    }

    .b-drawer-panel--mobile-fullscreen {
      .fullscreen-drawer();
    }
  }

  .is-entered {
    .b-drawer-mask {
      opacity: 1;
    }

    .b-drawer-panel {
      transform: translateX(0);
    }
  }

  /* 滑入完成后移除恒驻 transform 合成层，避免长列表滚动时旧帧在部分 Chrome/GPU 上残影叠加。 */
  .is-entered.is-settled {
    .b-drawer-panel {
      transform: none;
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

  .b-drawer-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
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
    transition:
      background 0.15s,
      color 0.15s;

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

  @media (prefers-reduced-motion: reduce) {
    .b-drawer-mask,
    .b-drawer-panel {
      transition-duration: 0.01ms;
    }
  }
</style>

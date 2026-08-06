<template>
  <div
    ref="anchorRef"
    class="b-action-menu-anchor"
    :class="{ 'is-menu-open': open }"
    :aria-expanded="open"
    aria-haspopup="menu"
    @mouseenter="handleAnchorEnter"
    @mouseleave="handleHoverLeave"
    @pointerdown="handleAnchorPointerDown"
    @click="handleAnchorClick"
    @contextmenu="handleContextMenu"
    @keydown="handleAnchorKeydown"
  >
    <slot :open="open" />

    <Teleport to="body">
      <Transition name="b-action-menu" :css="!disabled">
        <div
          v-if="open"
          ref="panelRef"
          class="b-action-menu-panel"
          :data-placement="resolvedPlacement"
          :data-source="openSource"
          :style="[panelStyle, { width: menuWidth }]"
          role="menu"
          :aria-label="ariaLabel || undefined"
          @mouseenter="handlePanelEnter"
          @mouseleave="handleHoverLeave"
          @keydown="handlePanelKeydown"
        >
          <template v-for="(item, index) in items" :key="item.key || `divider-${index}`">
            <div v-if="item.divider" class="b-action-menu__divider" role="separator" />
            <BButton
              v-else
              class="b-action-menu__item"
              :class="{ 'is-danger': item.danger }"
              :disabled="item.disabled"
              role="menuitem"
              @click="selectItem(item)"
            >
              <span v-if="item.icon" class="b-action-menu__icon" aria-hidden="true">
                <SvgIcon :src="item.icon" size="15" />
              </span>
              <span class="b-action-menu__label">{{ item.label }}</span>
            </BButton>
          </template>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { getRootZoom } from '@/utils/zoom';
  import type { BActionMenuItem, BActionMenuPlacement, BActionMenuSource, BActionMenuTrigger } from './actionMenu';

  const props = withDefaults(
    defineProps<{
      items: BActionMenuItem[];
      triggers?: BActionMenuTrigger[];
      placement?: BActionMenuPlacement;
      openDelay?: number;
      closeDelay?: number;
      offset?: number;
      width?: number | string;
      disabled?: boolean;
      ariaLabel?: string;
    }>(),
    {
      triggers: () => ['click'],
      placement: 'bottom-left',
      openDelay: 260,
      closeDelay: 180,
      offset: 8,
      width: 176,
      disabled: false,
      ariaLabel: '',
    },
  );

  const emit = defineEmits<{
    select: [key: string, source: BActionMenuSource];
    openChange: [open: boolean, source: BActionMenuSource];
  }>();

  const anchorRef = ref<HTMLElement | null>(null);
  const panelRef = ref<HTMLElement | null>(null);
  const open = ref(false);
  const openSource = ref<BActionMenuSource>('click');
  const resolvedPlacement = ref<BActionMenuPlacement | 'cursor'>(props.placement);
  const panelStyle = reactive<Record<string, string>>({
    position: 'fixed',
    left: '0px',
    top: '0px',
    visibility: 'hidden',
  });
  const contextPoint = reactive({ x: 0, y: 0 });
  let openTimer: number | null = null;
  let closeTimer: number | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const triggerSet = computed(() => new Set(props.triggers));
  const menuWidth = computed(() => (typeof props.width === 'number' ? `${props.width}px` : props.width));

  function clearOpenTimer() {
    if (openTimer === null) return;
    window.clearTimeout(openTimer);
    openTimer = null;
  }

  function clearCloseTimer() {
    if (closeTimer === null) return;
    window.clearTimeout(closeTimer);
    closeTimer = null;
  }

  function clearTimers() {
    clearOpenTimer();
    clearCloseTimer();
  }

  function estimatePanelHeight() {
    return props.items.reduce((height, item) => height + (item.divider ? 9 : 30), 10);
  }

  function numericMenuWidth() {
    if (panelRef.value?.offsetWidth) return panelRef.value.offsetWidth;
    if (typeof props.width === 'number') return props.width;
    return Number.parseFloat(props.width) || 176;
  }

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(value, max));
  }

  function computePosition() {
    const anchor = anchorRef.value;
    const panel = panelRef.value;
    if (!anchor || !panel || !open.value) return;

    const zoom = getRootZoom();
    const rect = anchor.getBoundingClientRect();
    const anchorRect = {
      left: rect.left / zoom,
      right: rect.right / zoom,
      top: rect.top / zoom,
      bottom: rect.bottom / zoom,
    };
    const viewportWidth = document.documentElement.clientWidth / zoom;
    const viewportHeight = document.documentElement.clientHeight / zoom;
    const panelWidth = numericMenuWidth();
    const panelHeight = panel.offsetHeight || estimatePanelHeight();
    const edge = 8;
    const offset = Math.max(0, props.offset);
    let left = 0;
    let top = 0;
    let placement: BActionMenuPlacement | 'cursor' = props.placement;

    if (openSource.value === 'contextmenu') {
      placement = 'cursor';
      left = contextPoint.x;
      top = contextPoint.y;
    } else if (props.placement === 'right-start' || props.placement === 'left-start') {
      const preferRight = props.placement === 'right-start';
      const rightLeft = anchorRect.right + offset;
      const leftLeft = anchorRect.left - panelWidth - offset;
      const rightFits = rightLeft + panelWidth <= viewportWidth - edge;
      const leftFits = leftLeft >= edge;
      const placeRight = preferRight ? rightFits || !leftFits : !leftFits && rightFits;
      left = placeRight ? rightLeft : leftLeft;
      top = anchorRect.top;
      placement = placeRight ? 'right-start' : 'left-start';
    } else {
      const alignRight = props.placement.endsWith('right');
      const preferTop = props.placement.startsWith('top');
      const below = anchorRect.bottom + offset;
      const above = anchorRect.top - panelHeight - offset;
      const belowFits = below + panelHeight <= viewportHeight - edge;
      const aboveFits = above >= edge;
      const placeAbove = preferTop ? aboveFits || !belowFits : !belowFits && aboveFits;
      left = alignRight ? anchorRect.right - panelWidth : anchorRect.left;
      top = placeAbove ? above : below;
      placement = `${placeAbove ? 'top' : 'bottom'}-${alignRight ? 'right' : 'left'}` as BActionMenuPlacement;
    }

    panelStyle.left = `${clamp(left, edge, Math.max(edge, viewportWidth - panelWidth - edge))}px`;
    panelStyle.top = `${clamp(top, edge, Math.max(edge, viewportHeight - panelHeight - edge))}px`;
    panelStyle.visibility = 'visible';
    resolvedPlacement.value = placement;
  }

  function focusFirstItem() {
    panelRef.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  function bindOpenListeners() {
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    document.addEventListener('contextmenu', handleDocumentContextMenu, true);
    document.addEventListener('keydown', handleDocumentKeydown, true);
    window.addEventListener('scroll', handleWindowScroll, true);
    window.addEventListener('resize', computePosition);
  }

  function unbindOpenListeners() {
    document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    document.removeEventListener('contextmenu', handleDocumentContextMenu, true);
    document.removeEventListener('keydown', handleDocumentKeydown, true);
    window.removeEventListener('scroll', handleWindowScroll, true);
    window.removeEventListener('resize', computePosition);
  }

  function doOpen(source: BActionMenuSource, event?: MouseEvent | KeyboardEvent) {
    clearTimers();
    if (props.disabled || !props.items.some((item) => !item.divider)) return;
    if (source === 'contextmenu' && event instanceof MouseEvent) {
      const zoom = getRootZoom();
      contextPoint.x = event.clientX / zoom;
      contextPoint.y = event.clientY / zoom + 5;
    }
    openSource.value = source;
    panelStyle.visibility = 'hidden';
    if (!open.value) {
      open.value = true;
      emit('openChange', true, source);
      bindOpenListeners();
    }
    void nextTick(() => {
      computePosition();
      resizeObserver?.disconnect();
      if (panelRef.value && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(computePosition);
        resizeObserver.observe(panelRef.value);
      }
      if (source === 'keyboard') focusFirstItem();
    });
  }

  function doClose() {
    clearTimers();
    if (!open.value) return;
    open.value = false;
    resizeObserver?.disconnect();
    resizeObserver = null;
    unbindOpenListeners();
    emit('openChange', false, openSource.value);
  }

  function scheduleOpen(source: BActionMenuSource) {
    clearOpenTimer();
    clearCloseTimer();
    if (props.disabled) return;
    openTimer = window.setTimeout(
      () => {
        openTimer = null;
        doOpen(source);
      },
      Math.max(0, props.openDelay),
    );
  }

  function scheduleClose() {
    clearOpenTimer();
    clearCloseTimer();
    closeTimer = window.setTimeout(
      () => {
        closeTimer = null;
        doClose();
      },
      Math.max(0, props.closeDelay),
    );
  }

  function handleAnchorEnter() {
    if (triggerSet.value.has('hover')) scheduleOpen('hover');
  }

  function handlePanelEnter() {
    if (!triggerSet.value.has('hover')) return;
    clearCloseTimer();
  }

  function handleHoverLeave() {
    if (triggerSet.value.has('hover')) scheduleClose();
  }

  function handleAnchorPointerDown(event: PointerEvent) {
    clearOpenTimer();
    if (event.button === 0 && openSource.value === 'hover') doClose();
  }

  function handleAnchorClick() {
    if (!triggerSet.value.has('click') || props.disabled) return;
    open.value ? doClose() : doOpen('click');
  }

  function handleContextMenu(event: MouseEvent) {
    if (!triggerSet.value.has('contextmenu') || props.disabled) return;
    event.stopPropagation();
    event.preventDefault();
    doOpen('contextmenu', event);
  }

  function handleAnchorKeydown(event: KeyboardEvent) {
    const wantsContextMenu = event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
    if (!wantsContextMenu || !triggerSet.value.has('contextmenu') || props.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    doOpen('keyboard', event);
  }

  function handlePanelKeydown(event: KeyboardEvent) {
    const buttons = Array.from(panelRef.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
    if (!buttons.length) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % buttons.length;
    if (event.key === 'ArrowUp')
      nextIndex = currentIndex < 0 ? buttons.length - 1 : (currentIndex - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = buttons.length - 1;
    if (event.key === 'Tab') doClose();
    if (nextIndex === null) return;
    event.preventDefault();
    buttons[nextIndex]?.focus();
  }

  function handleDocumentPointerDown(event: PointerEvent) {
    const target = event.target as Node;
    if (anchorRef.value?.contains(target) || panelRef.value?.contains(target)) return;
    doClose();
  }

  function handleDocumentContextMenu(event: MouseEvent) {
    const target = event.target as Node;
    if (anchorRef.value?.contains(target) || panelRef.value?.contains(target)) return;
    doClose();
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    doClose();
    anchorRef.value?.focus({ preventScroll: true });
  }

  function handleWindowScroll(event: Event) {
    const target = event.target;
    if (target instanceof Node && panelRef.value?.contains(target)) return;
    doClose();
  }

  function selectItem(item: BActionMenuItem) {
    if (item.disabled || item.divider) return;
    const source = openSource.value;
    doClose();
    emit('select', item.key, source);
  }

  watch(
    () => props.disabled,
    (disabled) => {
      if (disabled) doClose();
    },
  );

  watch(
    () => props.placement,
    () => {
      if (open.value) void nextTick(computePosition);
    },
  );

  onBeforeUnmount(() => {
    clearTimers();
    resizeObserver?.disconnect();
    unbindOpenListeners();
  });
</script>

<style lang="less" scoped>
  .b-action-menu-anchor {
    display: inline-flex;
    min-width: 0;
  }
</style>

<style lang="less">
  .b-action-menu-panel {
    z-index: 500;
    max-width: calc(100vw - 16px);
    padding: 5px 0;
    box-sizing: border-box;
    border: 1px solid var(--action-menu-border-color, var(--surface-border-color));
    border-radius: 10px;
    color: var(--text-color);
    background: var(--menu-body-bg-color);
    box-shadow: var(--action-menu-shadow);
    overflow: hidden;
    transform-origin: top left;
  }

  .b-action-menu__item.b_btn {
    width: 100%;
    min-width: 0;
    height: 30px;
    padding: 0 12px;
    justify-content: flex-start;
    gap: 8px;
    border: 0;
    border-radius: 0;
    color: var(--text-color);
    background: transparent;
    font-size: 13px;
    line-height: 1.2;
    text-align: left;
  }

  .b-action-menu__item.b_btn:hover,
  .b-action-menu__item.b_btn:focus-visible {
    color: var(--text-color);
    background: var(--menu-item-h-bg-color);
    outline: none;
  }

  .b-action-menu__item.b_btn.is-danger {
    color: var(--danger-color, #f04455);
  }

  .b-action-menu__item.b_btn.is-danger:hover,
  .b-action-menu__item.b_btn.is-danger:focus-visible {
    color: var(--danger-color, #f04455);
    background: var(--action-menu-danger-hover-bg, #fff0f1);
  }

  .b-action-menu__item.b_btn:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  .b-action-menu__icon {
    display: inline-flex;
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    align-items: center;
    justify-content: center;
  }

  .b-action-menu__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .b-action-menu__divider {
    height: 1px;
    margin: 4px 12px;
    background: var(--surface-divider-color);
  }

  .b-action-menu-enter-active,
  .b-action-menu-leave-active {
    transition:
      opacity 140ms ease,
      transform 140ms ease;
  }

  .b-action-menu-enter-from,
  .b-action-menu-leave-to {
    opacity: 0;
    transform: scale(0.985);
  }

  .b-action-menu-panel[data-placement='right-start'].b-action-menu-enter-from,
  .b-action-menu-panel[data-placement='right-start'].b-action-menu-leave-to {
    transform: translateX(-4px) scale(0.985);
  }

  .b-action-menu-panel[data-placement='left-start'].b-action-menu-enter-from,
  .b-action-menu-panel[data-placement='left-start'].b-action-menu-leave-to {
    transform: translateX(4px) scale(0.985);
  }

  .b-action-menu-panel[data-placement^='bottom'].b-action-menu-enter-from,
  .b-action-menu-panel[data-placement^='bottom'].b-action-menu-leave-to {
    transform: translateY(-3px) scale(0.985);
  }

  .b-action-menu-panel[data-placement^='top'].b-action-menu-enter-from,
  .b-action-menu-panel[data-placement^='top'].b-action-menu-leave-to {
    transform: translateY(3px) scale(0.985);
  }

  @media (prefers-reduced-motion: reduce) {
    .b-action-menu-enter-active,
    .b-action-menu-leave-active {
      transition: none;
    }
  }
</style>

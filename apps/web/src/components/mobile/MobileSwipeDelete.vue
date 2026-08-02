<template>
  <div
    ref="rootRef"
    class="mobile-swipe-delete"
    :class="{
      'is-enabled': enabled,
      'is-open': open,
      'is-dragging': dragging,
      'is-disabled': disabled,
    }"
    :style="{ '--swipe-action-width': `${ACTION_WIDTH}px` }"
    @click.capture="handleClickCapture"
  >
    <div v-if="enabled" class="mobile-swipe-delete__action" :aria-hidden="!open">
      <BButton
        type="danger"
        :loading="loading"
        :disabled="disabled"
        :tabindex="open ? 0 : -1"
        :aria-label="label"
        @pointerdown.stop
        @click.stop="requestDelete"
      >
        <SvgIcon :src="icon.table_delete" size="18" aria-hidden="true" />
        <span>{{ label }}</span>
      </BButton>
    </div>
    <div
      ref="contentRef"
      class="mobile-swipe-delete__content"
      :style="contentStyle"
      @pointerdown="startGesture"
      @pointermove="moveGesture"
      @pointerup="finishGesture"
      @pointercancel="cancelGesture"
    >
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const ACTION_WIDTH = 84;
  const INTENT_THRESHOLD = 8;
  const DIRECTION_THRESHOLD = 24;
  const INTERACTIVE_SELECTOR =
    'button, a, input, textarea, select, [role="button"], [role="checkbox"], [contenteditable="true"]';

  const props = withDefaults(
    defineProps<{
      enabled?: boolean;
      open?: boolean;
      disabled?: boolean;
      loading?: boolean;
      allowInteractiveStart?: boolean;
      label: string;
    }>(),
    {
      enabled: false,
      open: false,
      disabled: false,
      loading: false,
      allowInteractiveStart: false,
    },
  );
  const emit = defineEmits<{
    'update:open': [open: boolean];
    'swipe-start': [];
    delete: [];
  }>();

  const contentRef = ref<HTMLElement | null>(null);
  const rootRef = ref<HTMLElement | null>(null);
  const offset = ref(0);
  const dragging = ref(false);
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startOffset = 0;
  let horizontalGesture = false;
  let suppressNextClick = false;
  let suppressClickTimer = 0;

  const contentStyle = computed(() => ({ transform: `translate3d(${offset.value}px, 0, 0)` }));

  watch(
    () => props.open,
    (open) => {
      if (!dragging.value) offset.value = open && props.enabled ? -ACTION_WIDTH : 0;
      syncOutsidePointerListener(Boolean(open && props.enabled && !props.disabled));
    },
    { immediate: true },
  );
  watch(
    () => [props.enabled, props.disabled],
    ([enabled, disabled]) => {
      syncOutsidePointerListener(Boolean(enabled && !disabled && props.open));
      if (enabled && !disabled) return;
      resetGesture();
      offset.value = 0;
      if (props.open) emit('update:open', false);
    },
  );

  onBeforeUnmount(() => {
    window.clearTimeout(suppressClickTimer);
    syncOutsidePointerListener(false);
  });

  function syncOutsidePointerListener(active: boolean) {
    if (typeof document === 'undefined') return;
    document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    if (active) document.addEventListener('pointerdown', handleOutsidePointerDown, true);
  }

  function handleOutsidePointerDown(event: PointerEvent) {
    const target = event.target as Node | null;
    if (!target || rootRef.value?.contains(target)) return;
    offset.value = 0;
    emit('update:open', false);
  }

  function startGesture(event: PointerEvent) {
    if (!props.enabled || props.disabled || event.pointerType === 'mouse') return;
    const target = event.target as HTMLElement | null;
    // 卡片里的复选框、菜单等控件优先保留自身操作，不从这些热区发起横滑。
    if (!props.allowInteractiveStart && target?.closest(INTERACTIVE_SELECTOR)) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startOffset = props.open ? -ACTION_WIDTH : 0;
    horizontalGesture = false;
    contentRef.value?.setPointerCapture?.(event.pointerId);
  }

  function moveGesture(event: PointerEvent) {
    if (pointerId !== event.pointerId || props.disabled) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!horizontalGesture) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < INTENT_THRESHOLD) return;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        cancelGesture(event);
        return;
      }
      horizontalGesture = true;
      dragging.value = true;
      emit('swipe-start');
    }
    if (event.cancelable) event.preventDefault();
    offset.value = Math.min(0, Math.max(-ACTION_WIDTH, startOffset + deltaX));
  }

  function finishGesture(event: PointerEvent) {
    if (pointerId !== event.pointerId) return;
    const deltaX = event.clientX - startX;
    if (horizontalGesture) {
      const nextOpen =
        deltaX <= -DIRECTION_THRESHOLD
          ? true
          : deltaX >= DIRECTION_THRESHOLD
            ? false
            : offset.value <= -ACTION_WIDTH / 2;
      offset.value = nextOpen ? -ACTION_WIDTH : 0;
      emit('update:open', nextOpen);
      suppressGeneratedClick();
    }
    releasePointer(event.pointerId);
    resetGesture();
  }

  function cancelGesture(event?: PointerEvent) {
    if (event && pointerId !== event.pointerId) return;
    offset.value = props.open ? -ACTION_WIDTH : 0;
    if (pointerId !== null) releasePointer(pointerId);
    resetGesture();
  }

  function releasePointer(id: number) {
    if (contentRef.value?.hasPointerCapture?.(id)) contentRef.value.releasePointerCapture(id);
  }

  function resetGesture() {
    pointerId = null;
    horizontalGesture = false;
    dragging.value = false;
  }

  function suppressGeneratedClick() {
    suppressNextClick = true;
    window.clearTimeout(suppressClickTimer);
    suppressClickTimer = window.setTimeout(() => {
      suppressNextClick = false;
    }, 350);
  }

  function handleClickCapture(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    const inAction = Boolean(target?.closest('.mobile-swipe-delete__action'));
    // Android WebView 仍可能在 pointerup 后延迟派发兼容 click；操作按钮不受这层拦截。
    if (suppressNextClick && !inAction) {
      suppressNextClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (props.open && !inAction) {
      event.preventDefault();
      event.stopImmediatePropagation();
      offset.value = 0;
      emit('update:open', false);
    }
  }

  function requestDelete() {
    if (props.disabled || props.loading) return;
    offset.value = 0;
    emit('update:open', false);
    emit('delete');
  }
</script>

<style scoped lang="less">
  .mobile-swipe-delete {
    min-width: 0;
  }
  .mobile-swipe-delete.is-enabled {
    position: relative;
    overflow: hidden;
    border-radius: var(--swipe-border-radius, 14px);
  }
  .mobile-swipe-delete__action {
    position: absolute;
    z-index: 0;
    top: 0;
    right: 0;
    bottom: 0;
    width: var(--swipe-action-width);
    background: #fe2c55;
  }
  .mobile-swipe-delete__action :deep(.b_btn) {
    width: 100%;
    height: 100%;
    min-height: 44px;
    flex-direction: column;
    gap: 3px;
    padding: 8px 6px;
    border-radius: 0;
    font-size: 12px;
    line-height: 1.2;
  }
  .mobile-swipe-delete__content {
    position: relative;
    z-index: 1;
    min-width: 0;
    transition: transform 180ms cubic-bezier(0.22, 0.8, 0.3, 1);
  }
  .is-enabled .mobile-swipe-delete__content {
    touch-action: pan-y;
  }
  .is-dragging .mobile-swipe-delete__content {
    transition: none;
    user-select: none;
  }
  .is-disabled .mobile-swipe-delete__content {
    touch-action: auto;
  }
  @media (prefers-reduced-motion: reduce) {
    .mobile-swipe-delete__content {
      transition-duration: 1ms;
    }
  }
</style>

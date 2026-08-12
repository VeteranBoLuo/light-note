<template>
  <div
    ref="rootRef"
    class="mobile-swipe-actions"
    :class="{
      'is-enabled': swipeEnabled,
      'is-open': open,
      'is-dragging': dragging,
      'is-disabled': disabled,
      'mobile-swipe-delete': legacyDeleteClasses,
    }"
    :style="{
      '--swipe-actions-width': `${actionsWidth}px`,
      '--swipe-action-width': `${actionWidth}px`,
    }"
    @click.capture="handleClickCapture"
  >
    <div
      v-if="swipeEnabled"
      class="mobile-swipe-actions__actions"
      :class="{ 'mobile-swipe-delete__action': legacyDeleteClasses }"
      :aria-hidden="!open"
    >
      <BButton
        v-for="action in visibleActions"
        :key="action.key"
        class="mobile-swipe-actions__action"
        :class="`mobile-swipe-actions__action--${action.tone || 'neutral'}`"
        :type="buttonType(action.tone)"
        :loading="action.loading"
        :disabled="disabled || action.disabled"
        :tabindex="open ? 0 : -1"
        :aria-label="action.label"
        @pointerdown.stop
        @click.stop="requestAction(action)"
      >
        <SvgIcon v-if="action.icon" :src="action.icon" size="18" aria-hidden="true" />
        <span>{{ action.label }}</span>
      </BButton>
    </div>
    <div
      ref="contentRef"
      class="mobile-swipe-actions__content"
      :class="{ 'mobile-swipe-delete__content': legacyDeleteClasses }"
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

<script lang="ts">
  export type MobileSwipeActionTone = 'neutral' | 'primary' | 'success' | 'danger';

  export interface MobileSwipeActionItem {
    key: string;
    label: string;
    icon?: string;
    tone?: MobileSwipeActionTone;
    disabled?: boolean;
    loading?: boolean;
  }
</script>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

  const MAX_ACTIONS = 2;
  const INTENT_THRESHOLD = 8;
  const DIRECTION_THRESHOLD = 24;
  const INTERACTIVE_SELECTOR =
    'button, a, input, textarea, select, [role="button"], [role="checkbox"], [contenteditable="true"]';

  const props = withDefaults(
    defineProps<{
      actions: MobileSwipeActionItem[];
      enabled?: boolean;
      open?: boolean;
      disabled?: boolean;
      allowInteractiveStart?: boolean;
      legacyDeleteClasses?: boolean;
      actionWidth?: number;
    }>(),
    {
      enabled: false,
      open: false,
      disabled: false,
      allowInteractiveStart: false,
      legacyDeleteClasses: false,
      actionWidth: 76,
    },
  );
  const emit = defineEmits<{
    'update:open': [open: boolean];
    'swipe-start': [];
    action: [action: MobileSwipeActionItem];
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

  const visibleActions = computed(() => props.actions.slice(0, MAX_ACTIONS));
  const actionWidth = computed(() => Math.max(64, Math.min(96, props.actionWidth)));
  const actionsWidth = computed(() => visibleActions.value.length * actionWidth.value);
  const swipeEnabled = computed(() => props.enabled && actionsWidth.value > 0);
  const contentStyle = computed(() => ({ transform: `translate3d(${offset.value}px, 0, 0)` }));

  watch(
    () => [props.open, actionsWidth.value, swipeEnabled.value] as const,
    ([open]) => {
      if (!dragging.value) offset.value = open && swipeEnabled.value ? -actionsWidth.value : 0;
      syncOutsidePointerListener(Boolean(open && swipeEnabled.value && !props.disabled));
    },
    { immediate: true },
  );
  watch(
    () => [swipeEnabled.value, props.disabled] as const,
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

  function buttonType(tone: MobileSwipeActionTone | undefined) {
    if (tone === 'primary' || tone === 'success' || tone === 'danger') return tone;
    return undefined;
  }

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
    if (!swipeEnabled.value || props.disabled || event.pointerType === 'mouse') return;
    const target = event.target as HTMLElement | null;
    if (!props.allowInteractiveStart && target?.closest(INTERACTIVE_SELECTOR)) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startOffset = props.open ? -actionsWidth.value : 0;
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
    offset.value = Math.min(0, Math.max(-actionsWidth.value, startOffset + deltaX));
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
            : offset.value <= -actionsWidth.value / 2;
      offset.value = nextOpen ? -actionsWidth.value : 0;
      emit('update:open', nextOpen);
      suppressGeneratedClick();
    }
    releasePointer(event.pointerId);
    resetGesture();
  }

  function cancelGesture(event?: PointerEvent) {
    if (event && pointerId !== event.pointerId) return;
    offset.value = props.open ? -actionsWidth.value : 0;
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
    const inAction = Boolean(target?.closest('.mobile-swipe-actions__actions'));
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

  function requestAction(action: MobileSwipeActionItem) {
    if (props.disabled || action.disabled || action.loading) return;
    offset.value = 0;
    emit('update:open', false);
    emit('action', action);
  }
</script>

<style scoped lang="less">
  .mobile-swipe-actions {
    min-width: 0;
  }
  .mobile-swipe-actions.is-enabled {
    position: relative;
    overflow: hidden;
    border-radius: var(--swipe-border-radius, 14px);
  }
  .mobile-swipe-actions__actions {
    position: absolute;
    z-index: 0;
    top: 0;
    right: 0;
    bottom: 0;
    width: var(--swipe-actions-width);
    display: flex;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 0s linear 180ms,
      visibility 0s linear 180ms;
  }
  .mobile-swipe-actions.is-open .mobile-swipe-actions__actions,
  .mobile-swipe-actions.is-dragging .mobile-swipe-actions__actions {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition-delay: 0s;
  }
  .mobile-swipe-actions__action {
    width: var(--swipe-action-width);
    min-width: var(--swipe-action-width);
    height: 100%;
    min-height: 44px;
    flex-direction: column;
    gap: 3px;
    padding: 8px 6px;
    border-radius: 0;
    font-size: 12px;
    line-height: 1.2;
  }
  .mobile-swipe-actions__action--neutral {
    background: var(--desc-color) !important;
    color: var(--background-color) !important;
  }
  .mobile-swipe-actions__content {
    position: relative;
    z-index: 1;
    min-width: 0;
    transition: transform 180ms cubic-bezier(0.22, 0.8, 0.3, 1);
  }
  .mobile-swipe-delete.is-open .mobile-swipe-delete__content :deep(.todo-item) {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .is-enabled .mobile-swipe-actions__content {
    touch-action: pan-y;
  }
  .is-dragging .mobile-swipe-actions__content {
    transition: none;
    user-select: none;
  }
  .is-disabled .mobile-swipe-actions__content {
    touch-action: auto;
  }
  @media (prefers-reduced-motion: reduce) {
    .mobile-swipe-actions__actions {
      transition-delay: 1ms;
    }
    .mobile-swipe-actions__content {
      transition-duration: 1ms;
    }
  }
</style>

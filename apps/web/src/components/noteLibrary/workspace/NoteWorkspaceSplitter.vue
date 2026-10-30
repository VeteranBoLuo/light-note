<template>
  <BTooltip class="note-workspace-splitter__tooltip" :title="t('note.resetPageSidebarWidthHint')" :delay="1000" follow-cursor>
    <!-- 分隔条没有对应的 B 组件：按 WAI-ARIA 窗口分隔条模式实现，左右键调宽、Enter 收起。 -->
    <div
      class="note-workspace-splitter"
      :class="[`is-${side}`, { 'is-dragging': dragging, 'is-collapse-pending': collapsePending }]"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      :aria-label="label"
      :aria-valuenow="Math.round(width)"
      :aria-valuemin="Math.round(minWidth)"
      :aria-valuemax="Math.round(maxWidth)"
      @pointerdown="startDrag"
      @dblclick.stop.prevent="emit('reset')"
      @keydown="handleKeydown"
    >
      <span v-if="collapsePending" class="note-workspace-splitter__release" aria-hidden="true">
        <SvgIcon :src="side === 'start' ? icon.arrow_left : icon.arrow_right" size="13" />
        {{ t('note.releaseToCollapse') }}
      </span>
    </div>
  </BTooltip>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { NOTE_WORKSPACE_COLLAPSE_DRAG_DISTANCE } from '@/utils/noteWorkspaceLayout';

  const props = defineProps<{
    /** start：面板在分隔条左侧（页面树）；end：面板在右侧（右侧卡片）。 */
    side: 'start' | 'end';
    width: number;
    minWidth: number;
    maxWidth: number;
    label: string;
  }>();

  const emit = defineEmits<{
    resize: [width: number];
    reset: [];
    collapse: [];
    collapsePending: [pending: boolean];
    dragging: [dragging: boolean];
  }>();

  const KEYBOARD_STEP = 12;
  const { t } = useI18n();
  const dragging = ref(false);
  const collapsePending = ref(false);
  let pointerId: number | null = null;
  let captureTarget: HTMLElement | null = null;
  let startX = 0;
  let startWidth = 0;

  function clamp(width: number) {
    return Math.min(props.maxWidth, Math.max(props.minWidth, Math.round(width)));
  }

  function setCollapsePending(value: boolean) {
    if (collapsePending.value === value) return;
    collapsePending.value = value;
    emit('collapsePending', value);
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    const delta = (event.clientX - startX) * (props.side === 'start' ? 1 : -1);
    const raw = startWidth + delta;
    setCollapsePending(raw < props.minWidth - NOTE_WORKSPACE_COLLAPSE_DRAG_DISTANCE);
    const next = clamp(raw);
    if (next !== Math.round(props.width)) emit('resize', next);
  }

  function stopDrag() {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', finishDrag);
    document.removeEventListener('pointercancel', cancelDrag);
    window.removeEventListener('blur', cancelDragOnBlur);
    if (captureTarget && pointerId !== null && captureTarget.hasPointerCapture?.(pointerId)) {
      captureTarget.releasePointerCapture(pointerId);
    }
    captureTarget = null;
    pointerId = null;
    if (dragging.value) emit('dragging', false);
    dragging.value = false;
    setCollapsePending(false);
    document.body.style.removeProperty('user-select');
  }

  function finishDrag(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    const shouldCollapse = collapsePending.value;
    const restoreWidth = startWidth;
    stopDrag();
    if (!shouldCollapse) return;
    // 收起后再展开要回到拖动前的宽度，而不是被拖到底的最小宽度。
    emit('resize', restoreWidth);
    emit('collapse');
  }

  function cancelDrag(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    const restoreWidth = startWidth;
    stopDrag();
    emit('resize', restoreWidth);
  }

  function cancelDragOnBlur() {
    if (pointerId === null) return;
    const restoreWidth = startWidth;
    stopDrag();
    emit('resize', restoreWidth);
  }

  function startDrag(event: PointerEvent) {
    if (event.button !== 0 || pointerId !== null) return;
    pointerId = event.pointerId;
    // 捕获指针：拖动划过页面树时不触发行上的悬停菜单与提示。
    captureTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    try {
      captureTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      captureTarget = null;
    }
    startX = event.clientX;
    startWidth = Math.round(props.width);
    dragging.value = true;
    emit('dragging', true);
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', finishDrag);
    document.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelDragOnBlur);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    const grow = props.side === 'start' ? 'ArrowRight' : 'ArrowLeft';
    const shrink = props.side === 'start' ? 'ArrowLeft' : 'ArrowRight';
    if (event.key === grow || event.key === shrink) {
      event.preventDefault();
      emit('resize', clamp(props.width + (event.key === grow ? KEYBOARD_STEP : -KEYBOARD_STEP)));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      emit('resize', event.key === 'Home' ? props.minWidth : props.maxWidth);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      emit('collapse');
    }
  }

  onBeforeUnmount(stopDrag);
</script>

<style scoped lang="less">
  .note-workspace-splitter__tooltip {
    position: static;
    display: flex;
    width: 0;
    height: 0;
  }

  .note-workspace-splitter {
    position: absolute;
    z-index: 6;
    top: 0;
    bottom: 0;
    /* ui-density-fixed: 指针命中区按物理像素保持，不随界面密度缩放 */
    width: 12px;
    cursor: col-resize;
    touch-action: none;
    outline: none;

    // 页面在面板与内容卡片之间留白时，分隔条落在留白正中；没有留白就压在边框上。
    &.is-start {
      /* ui-density-fixed: 命中区一半宽度，叠加页面声明的留白 */
      right: calc(-6px - var(--note-workspace-splitter-gap, 0px) / 2);
    }

    &.is-end {
      /* ui-density-fixed: 命中区一半宽度，叠加页面声明的留白 */
      left: calc(-6px - var(--note-workspace-splitter-gap, 0px) / 2);
    }

    // 拖动时显示整条强调线。
    &::before {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 50%;
      /* ui-density-fixed: 1 像素描边线 */
      width: 2px;
      transform: translateX(-50%);
      background: var(--primary-color, #615ced);
      content: '';
      opacity: 0;
      transition: opacity 120ms ease;
    }

    // 常显的小把手，提示这里可以拖动。
    &::after {
      position: absolute;
      top: 50%;
      left: 50%;
      /* ui-density-fixed: 把手粗细是装饰几何 */
      width: 4px;
      height: var(--ui-layout-36, 36px);
      transform: translate(-50%, -50%);
      border-radius: 999px;
      background: var(--desc-color);
      content: '';
      opacity: 0.36;
      transition:
        background-color 120ms ease,
        opacity 120ms ease;
    }

    &:hover::before,
    &.is-dragging::before,
    &:focus-visible::before {
      opacity: 1;
    }

    &:hover::after,
    &.is-dragging::after,
    &:focus-visible::after {
      background: var(--primary-color, #615ced);
      opacity: 1;
    }
  }

  .note-workspace-splitter__release {
    position: absolute;
    top: 50%;
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    padding: var(--ui-space-4, 4px) var(--ui-space-10, 10px);
    transform: translateY(-50%);
    border-radius: 999px;
    color: #fff;
    background: var(--primary-color, #615ced);
    box-shadow: 0 4px 12px rgba(97, 92, 237, 0.32);
    font-size: var(--ui-font-12, 12px);
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
  }

  .note-workspace-splitter.is-start .note-workspace-splitter__release {
    right: calc(100% + var(--ui-space-8, 8px));
  }

  .note-workspace-splitter.is-end .note-workspace-splitter__release {
    left: calc(100% + var(--ui-space-8, 8px));
  }

  // 触屏放宽命中区，视觉宽度不变；收起依赖面板标题行里的按钮。
  @media (pointer: coarse) {
    .note-workspace-splitter {
      /* ui-density-fixed: 触控命中区按物理像素保持 */
      width: 24px;

      &.is-start {
        /* ui-density-fixed: 触控命中区一半宽度，叠加页面声明的留白 */
        right: calc(-12px - var(--note-workspace-splitter-gap, 0px) / 2);
      }

      &.is-end {
        /* ui-density-fixed: 触控命中区一半宽度，叠加页面声明的留白 */
        left: calc(-12px - var(--note-workspace-splitter-gap, 0px) / 2);
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .note-workspace-splitter::before,
    .note-workspace-splitter::after {
      transition: none;
    }
  }
</style>

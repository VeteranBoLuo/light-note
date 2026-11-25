<template>
  <div class="repair-canvas">
    <div
      ref="viewport"
      class="repair-canvas__viewport"
      :class="{ 'is-focus-outline-suppressed': suppressFocusOutline }"
      :style="{ cursor }"
      tabindex="0"
      role="application"
      :aria-label="t('toolbox.imageRepair.canvasLabel')"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endPointer($event, true)"
      @pointercancel="endPointer($event, false)"
      @lostpointercapture="onLostPointerCapture"
      @pointerleave="clearHover"
      @wheel="onWheel"
      @keydown="onCanvasKey"
      @blur="onCanvasBlur"
    >
      <div class="repair-canvas__image" :style="imageStyle">
        <img :src="src" :alt="t('toolbox.imageRepair.imagePreview')" draggable="false" />
        <canvas ref="overlay" aria-hidden="true" />
      </div>
    </div>
    <slot name="feedback" />

    <Teleport :to="controlsTarget || 'body'" :disabled="!controlsTarget">
      <div class="repair-canvas__controls">
        <div class="repair-canvas__view">
          <div class="repair-canvas__zoom" :aria-label="t('toolbox.imageRepair.zoom')" role="group">
            <BButton
              icon-only
              :disabled="zoom <= 1"
              :aria-label="t('toolbox.imageRepair.zoomOut')"
              @click="zoomFromButton($event, 1 / 1.5)"
            >
              −
            </BButton>
            <BButton
              :aria-label="t('toolbox.imageRepair.fit')"
              :title="t('toolbox.imageRepair.fit')"
              @click="zoomFromButton($event)"
            >
              {{ zoom === 1 ? t('toolbox.imageRepair.fit') : zoomLabel }}
            </BButton>
            <BButton
              icon-only
              :disabled="zoom >= MAX_ZOOM"
              :aria-label="t('toolbox.imageRepair.zoomIn')"
              @click="zoomFromButton($event, 1.5)"
            >
              +
            </BButton>
          </div>
          <p class="repair-canvas__gesture">{{ t('toolbox.imageRepair.touchGesture') }}</p>
        </div>
        <slot />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { useUiDensity } from '@/composables/useUiDensity';
  import {
    applyRepairSelection,
    clampRepairValue,
    hitRepairRectangle,
    moveRepairRectangle,
    paintRepairSelection,
    pointOnImage,
    rectangleBetween,
    repairRectangleHandles,
    resizeRepairRectangle,
    type ImagePoint,
    type RepairHandle,
    type RepairRectangle,
    type RepairSelection,
  } from '../imageRepairSelection';

  const props = defineProps<{
    src: string;
    controlsTarget?: HTMLElement | null;
    width: number;
    height: number;
    selections: readonly RepairSelection[];
    activeIndex: number;
    mode: RepairSelection['kind'] | 'pan';
    brushSize: number;
    temporaryPan: boolean;
    editable: boolean;
    showSelections: boolean;
  }>();
  const emit = defineEmits<{
    select: [selection: RepairSelection];
    activate: [index: number];
  }>();
  const { t } = useI18n();
  const { density, dimension } = useUiDensity();
  const MAX_ZOOM = 6;
  const HANDLE_SIZE_ON_SCREEN = 7;
  const RECTANGLE_EDGE_TOLERANCE = 6;
  const MIN_RECTANGLE_SIDE = 2;
  const origin = { x: 0, y: 0 };
  const viewport = ref<HTMLElement>();
  const suppressFocusOutline = ref(false);
  const overlay = ref<HTMLCanvasElement>();
  const viewportSize = shallowRef({ width: 0, height: 0 });
  const camera = shallowRef({ zoom: 1, ...origin });
  const zoom = computed(() => camera.value.zoom);
  const fit = computed(() =>
    Math.min(1, viewportSize.value.width / props.width, viewportSize.value.height / props.height),
  );
  const scale = computed(() => fit.value * zoom.value);
  const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`);
  const imageStyle = computed(() => ({
    left: `${camera.value.x}px`,
    top: `${camera.value.y}px`,
    width: `${props.width * scale.value}px`,
    height: `${props.height * scale.value}px`,
  }));
  const panning = computed(() => props.temporaryPan || props.mode === 'pan' || !props.editable);

  type Drag =
    | { id: number; kind: 'pan'; start: ImagePoint; camera: ImagePoint }
    | { id: number; kind: 'new' | 'brush'; start: ImagePoint }
    | { id: number; kind: 'adjust'; start: ImagePoint; rect: RepairRectangle; handle?: RepairHandle };

  let drag: Drag | undefined;
  let draft: RepairSelection | undefined;
  let hover: ImagePoint | undefined;
  let keyboardCursor: ImagePoint | undefined;
  let keyboardStart: ImagePoint | undefined;
  let frame = 0;
  const cursor = ref('crosshair');
  const touches = new Map<number, ImagePoint>();
  let multiTouch = false;
  let pinch: { anchor: ImagePoint; zoom: number; distance: number } | undefined;

  function setCamera(nextZoom: number, x: number, y: number) {
    const width = props.width * fit.value * nextZoom;
    const height = props.height * fit.value * nextZoom;
    const horizontal = viewportSize.value.width - width;
    const vertical = viewportSize.value.height - height;
    camera.value = {
      zoom: nextZoom,
      x: horizontal >= 0 ? horizontal / 2 : clampRepairValue(x, horizontal, 0),
      y: vertical >= 0 ? vertical / 2 : clampRepairValue(y, vertical, 0),
    };
  }

  function center(): ImagePoint {
    return { x: viewportSize.value.width / 2, y: viewportSize.value.height / 2 };
  }

  function viewPoint(event: MouseEvent): ImagePoint {
    const rect = viewport.value!.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - viewport.value!.clientLeft,
      y: event.clientY - rect.top - viewport.value!.clientTop,
    };
  }

  function imagePoint(point: ImagePoint): ImagePoint {
    return pointOnImage(
      point,
      { ...camera.value, width: props.width * scale.value, height: props.height * scale.value },
      props.width,
      props.height,
    );
  }

  function inImage(point: ImagePoint, tolerance = 0) {
    const { x, y } = camera.value;
    return (
      point.x >= x - tolerance &&
      point.y >= y - tolerance &&
      point.x <= x + props.width * scale.value + tolerance &&
      point.y <= y + props.height * scale.value + tolerance
    );
  }

  function canStartSelection(point: ImagePoint) {
    const tolerance = props.mode === 'rectangle' ? dimension(RECTANGLE_EDGE_TOLERANCE, 'layout') : 0;
    return inImage(point, tolerance);
  }

  function anchorZoom(nextZoom: number, anchor: ImagePoint, local: ImagePoint) {
    const next = clampRepairValue(nextZoom, 1, MAX_ZOOM);
    const nextScale = fit.value * next;
    setCamera(next, local.x - anchor.x * nextScale, local.y - anchor.y * nextScale);
  }

  function zoomBy(factor: number, local = center()) {
    if (!scale.value) return;
    anchorZoom(zoom.value * factor, imagePoint(local), local);
  }

  function resetZoom() {
    setCamera(1, 0, 0);
  }

  function zoomFromButton(event: MouseEvent, factor?: number) {
    if (factor == null) resetZoom();
    else zoomBy(factor);
    if (event.detail > 0) focusCanvas();
  }

  function onWheel(event: WheelEvent) {
    if ((!event.altKey && !event.ctrlKey) || !event.deltaY) return;
    event.preventDefault();
    const delta =
      event.deltaMode === 1
        ? event.deltaY * 16
        : event.deltaMode === 2
          ? event.deltaY * viewportSize.value.height
          : event.deltaY;
    zoomBy(Math.exp(-clampRepairValue(delta, -240, 240) / 300), viewPoint(event));
  }

  function pinchPoints() {
    const [first, second] = touches.values();
    if (!first || !second) return;
    return {
      center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
    };
  }

  function beginPinch() {
    const points = pinchPoints();
    pinch = points && { anchor: imagePoint(points.center), zoom: zoom.value, distance: points.distance };
  }

  function setCursor(point?: ImagePoint) {
    if (drag?.kind === 'pan') cursor.value = 'grabbing';
    else if (panning.value) cursor.value = 'grab';
    else if (drag?.kind === 'adjust') cursor.value = drag.handle ? `${drag.handle}-resize` : 'move';
    else {
      const hit =
        point && props.mode === 'rectangle'
          ? hitRepairRectangle(props.selections, props.activeIndex, point, dimension(10, 'layout') / scale.value)
          : undefined;
      cursor.value = hit?.handle ? `${hit.handle}-resize` : hit ? 'move' : point ? 'crosshair' : 'default';
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || !scale.value) return;
    const local = viewPoint(event);
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, local);
      viewport.value!.setPointerCapture(event.pointerId);
      if (touches.size > 1) {
        multiTouch = true;
        cancelInteraction();
        beginPinch();
        return;
      }
    } else {
      if (drag && drag.id !== event.pointerId) return;
      // A new press from the same pointer can follow a missed release.
      if (drag) finishInterruptedDrag();
      viewport.value!.focus({ preventScroll: true });
    }

    cancelKeyboard();
    if (panning.value) {
      drag = { id: event.pointerId, kind: 'pan', start: local, camera: camera.value };
    } else if (canStartSelection(local)) {
      const point = imagePoint(local);
      if (props.mode === 'brush') {
        drag = { id: event.pointerId, kind: 'brush', start: point };
        draft = { kind: 'brush', points: [point], radius: Math.max(1, props.brushSize / (2 * scale.value)) };
        hover = point;
      } else {
        const radius = event.pointerType === 'touch' ? 18 : dimension(10, 'layout');
        const hit = hitRepairRectangle(props.selections, props.activeIndex, point, radius / scale.value);
        const rect = hit && props.selections[hit.index];
        if (rect?.kind === 'rectangle') {
          emit('activate', hit.index);
          drag = { id: event.pointerId, kind: 'adjust', start: point, rect, handle: hit.handle };
        } else {
          drag = { id: event.pointerId, kind: 'new', start: point };
        }
      }
    }
    if (drag) viewport.value!.setPointerCapture(event.pointerId);
    setCursor(canStartSelection(local) ? imagePoint(local) : undefined);
    scheduleOverlay();
  }

  function onPointerMove(event: PointerEvent) {
    if (!scale.value) return;
    if (
      event.type === 'pointermove' &&
      event.pointerType !== 'touch' &&
      drag?.id === event.pointerId &&
      (event.buttons & 1) === 0
    ) {
      finishInterruptedDrag();
    }
    const local = viewPoint(event);
    if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
      touches.set(event.pointerId, local);
      if (multiTouch) {
        const points = pinchPoints();
        if (pinch && points) anchorZoom((pinch.zoom * points.distance) / pinch.distance, pinch.anchor, points.center);
        return;
      }
    }
    if (!drag || event.pointerId !== drag.id) {
      hover = event.pointerType !== 'touch' && canStartSelection(local) ? imagePoint(local) : undefined;
      setCursor(hover);
      scheduleOverlay();
      return;
    }
    const point = imagePoint(local);
    const delta = { x: point.x - drag.start.x, y: point.y - drag.start.y };
    if (drag.kind === 'pan') {
      setCamera(zoom.value, drag.camera.x + local.x - drag.start.x, drag.camera.y + local.y - drag.start.y);
    } else if (drag.kind === 'brush' && draft?.kind === 'brush') {
      hover = inImage(local) ? point : undefined;
      const last = draft.points[draft.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) * scale.value >= 1) draft.points.push(point);
    } else if (drag.kind === 'new') {
      const rectangle = rectangleBetween(drag.start, point);
      const side = Math.min(rectangle.width, rectangle.height);
      draft = side >= MIN_RECTANGLE_SIDE && side * scale.value >= MIN_RECTANGLE_SIDE ? rectangle : undefined;
    } else if (drag.kind === 'adjust') {
      draft = drag.handle
        ? resizeRepairRectangle(drag.rect, drag.handle, delta, props.width, props.height)
        : moveRepairRectangle(drag.rect, delta, props.width, props.height);
    }
    scheduleOverlay();
  }

  function endPointer(event: PointerEvent, commit: boolean) {
    if (touches.delete(event.pointerId) && multiTouch) {
      if (touches.size >= 2) beginPinch();
      else pinch = undefined;
      if (!touches.size) multiTouch = false;
      return;
    }
    if (drag?.id !== event.pointerId) return;
    if (commit) {
      const previous = drag.kind === 'new' ? draft : undefined;
      onPointerMove(event);
      // Keep the visible rectangle if the release alone falls below the drag threshold.
      commitPointerDraft(draft ?? previous);
    }
    drag = draft = undefined;
    const local = viewPoint(event);
    const point = canStartSelection(local) ? imagePoint(local) : undefined;
    hover = commit && event.pointerType !== 'touch' ? point : undefined;
    setCursor(point);
    scheduleOverlay();
  }

  function commitPointerDraft(selection: RepairSelection | undefined) {
    if (!selection || !drag) return;
    if (drag.kind === 'adjust' && selection.kind === 'rectangle') {
      const { rect } = drag;
      if (
        rect.x === selection.x &&
        rect.y === selection.y &&
        rect.width === selection.width &&
        rect.height === selection.height
      )
        return;
    }
    emit('select', selection);
  }

  function finishInterruptedDrag() {
    // A desktop rectangle already displayed can be kept if the pointer stream is interrupted.
    if (drag && !touches.has(drag.id) && draft?.kind === 'rectangle') commitPointerDraft(draft);
    cancelInteraction();
  }

  function onLostPointerCapture(event: PointerEvent) {
    if (viewport.value?.hasPointerCapture(event.pointerId)) return;
    if (event.pointerType !== 'touch' && drag?.id === event.pointerId) finishInterruptedDrag();
    else endPointer(event, false);
  }

  function finishInterruptedInteraction() {
    finishInterruptedDrag();
    touches.clear();
    multiTouch = false;
    pinch = undefined;
  }

  function clearHover() {
    hover = undefined;
    scheduleOverlay();
  }

  function cancelKeyboard() {
    if (!keyboardCursor) return;
    keyboardCursor = keyboardStart = undefined;
    if (!drag) draft = undefined;
    scheduleOverlay();
  }

  function onCanvasBlur() {
    suppressFocusOutline.value = false;
    cancelKeyboard();
  }

  function cancelInteraction() {
    if (!drag && !keyboardCursor) return false;
    drag = draft = keyboardCursor = keyboardStart = undefined;
    clearHover();
    setCursor();
    return true;
  }

  const directions: Record<string, ImagePoint> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  };

  function onCanvasKey(event: KeyboardEvent) {
    suppressFocusOutline.value = event.key === 'Escape';
    if (
      !props.editable ||
      panning.value ||
      drag ||
      props.mode !== 'rectangle' ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const direction = directions[event.key];
    if (event.key !== 'Enter' && !direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const rect = props.selections[props.activeIndex];
    if (direction && !keyboardCursor && rect?.kind === 'rectangle') {
      const moved = moveRepairRectangle(
        rect,
        { x: direction.x * step, y: direction.y * step },
        props.width,
        props.height,
      );
      if (moved.x !== rect.x || moved.y !== rect.y) emit('select', moved);
      return;
    }
    keyboardCursor ||= imagePoint(center());
    if (direction) {
      const keyboardStep = Math.max(step, step / scale.value);
      keyboardCursor = {
        x: clampRepairValue(keyboardCursor.x + direction.x * keyboardStep, 0, props.width),
        y: clampRepairValue(keyboardCursor.y + direction.y * keyboardStep, 0, props.height),
      };
      if (keyboardStart) draft = rectangleBetween(keyboardStart, keyboardCursor);
    } else if (!keyboardStart) {
      keyboardStart = keyboardCursor;
    } else if (draft?.kind === 'rectangle' && draft.width >= 2 && draft.height >= 2) {
      emit('select', draft);
      cancelKeyboard();
    }
    scheduleOverlay();
  }

  function drawOverlay() {
    frame = 0;
    const canvas = overlay.value;
    if (!canvas || !scale.value) return;
    const widthOnScreen = props.width * scale.value;
    const heightOnScreen = props.height * scale.value;
    const ratio = Math.min(window.devicePixelRatio || 1, 1600 / Math.max(widthOnScreen, heightOnScreen));
    const width = Math.max(1, Math.round(widthOnScreen * ratio));
    const height = Math.max(1, Math.round(heightOnScreen * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!props.showSelections) return;
    context.setTransform(width / props.width, 0, 0, height / props.height, 0, 0);
    const style = getComputedStyle(canvas);
    const color = style.color;
    context.fillStyle = context.strokeStyle = color;
    const visible = draft ? applyRepairSelection(props.selections, draft) : props.selections;
    const activeIndex = draft ? visible.length - 1 : props.activeIndex;
    for (const [index, selection] of visible.entries()) {
      const selected = index === activeIndex;
      context.setLineDash([]);
      if (selection.kind === 'brush') context.globalAlpha = selection === draft ? 0.62 : 0.5;
      else context.globalAlpha = selected ? 0.23 : 0.1;
      paintRepairSelection(context, selection);
      context.globalAlpha = 1;
      if (selection.kind !== 'rectangle') continue;
      context.lineWidth = (selected ? 2 : 1.5) / scale.value;
      context.setLineDash(selected ? [] : [4 / scale.value, 3 / scale.value]);
      context.strokeRect(selection.x, selection.y, selection.width, selection.height);
    }

    context.setLineDash([]);
    const selected = visible[activeIndex];
    if (selected?.kind === 'rectangle' && props.editable && !panning.value) {
      const size = dimension(HANDLE_SIZE_ON_SCREEN, 'layout') / scale.value;
      context.fillStyle = style.getPropertyValue('--workspace-content').trim();
      context.lineWidth = 1.5 / scale.value;
      for (const { x, y } of repairRectangleHandles(selected)) {
        context.fillRect(x - size / 2, y - size / 2, size, size);
        context.strokeRect(x - size / 2, y - size / 2, size, size);
      }
    }

    const marker = keyboardCursor ?? (props.mode === 'brush' ? hover : undefined);
    if (marker && props.editable && !panning.value && (!drag || drag.kind === 'brush')) {
      const radius = keyboardCursor ? 5 / scale.value : Math.max(1, props.brushSize / (2 * scale.value));
      context.beginPath();
      context.arc(marker.x, marker.y, radius, 0, 2 * Math.PI);
      // Keep the cursor edge readable in screen pixels at every image zoom.
      context.strokeStyle = '#151725';
      context.lineWidth = 4 / scale.value;
      context.stroke();
      context.strokeStyle = 'white';
      context.lineWidth = 2 / scale.value;
      context.stroke();
    }
  }

  function scheduleOverlay() {
    if (!frame) frame = requestAnimationFrame(drawOverlay);
  }

  let observer: ResizeObserver | undefined;
  onMounted(() => {
    const view = viewport.value!;
    function measure() {
      const anchor = scale.value ? imagePoint(center()) : undefined;
      viewportSize.value = { width: view.clientWidth, height: view.clientHeight };
      if (anchor) anchorZoom(zoom.value, anchor, center());
      else resetZoom();
    }
    measure();
    observer = new ResizeObserver(measure);
    observer.observe(view);
  });

  watch([() => props.editable, () => props.mode, () => props.temporaryPan], () => {
    cancelInteraction();
    setCursor();
    scheduleOverlay();
  });
  watch(
    [
      scale,
      density,
      () => props.selections,
      () => props.activeIndex,
      () => props.brushSize,
      () => props.showSelections,
    ],
    scheduleOverlay,
    { flush: 'post' },
  );
  onBeforeUnmount(() => {
    observer?.disconnect();
    cancelAnimationFrame(frame);
  });

  function focusCanvas() {
    viewport.value?.focus({ preventScroll: true });
  }

  defineExpose({ cancelInteraction, finishInterruptedInteraction, focusCanvas, zoomBy, resetZoom });
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';

  .repair-canvas {
    min-width: 0;
    position: relative;
  }

  .repair-canvas__viewport {
    .workspace-canvas-surface();
    position: relative;
    block-size: clamp(var(--ui-layout-320, 320px), 57vh, calc(var(--ui-layout-320, 320px) * 2.2));
    overflow: hidden;
    user-select: none;
    touch-action: none;
    outline-offset: -2px;
  }

  .repair-canvas__viewport:focus-visible {
    outline: 2px solid var(--primary-color);
  }

  .repair-canvas__viewport.is-focus-outline-suppressed:focus-visible {
    outline: none;
  }

  .repair-canvas__image {
    position: absolute;
  }

  .repair-canvas__image img,
  .repair-canvas__image canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .repair-canvas__image canvas {
    color: var(--primary-color);
  }

  .repair-canvas__controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
  }

  .repair-canvas__view {
    min-width: 0;
  }

  .repair-canvas__zoom {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--ui-space-6, 6px);
  }

  .repair-canvas__gesture {
    display: none;
  }

  @media (min-width: 768px) {
    .repair-canvas {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-block-size: var(--ui-layout-180, 180px);
    }

    .repair-canvas__viewport {
      flex: 1;
      block-size: auto;
      min-block-size: 0;
      border-radius: 0 0 14px 14px;
    }

    .repair-canvas__controls > .repair-canvas__view {
      padding-inline-start: var(--ui-space-12, 12px);
      border-inline-start: 1px solid var(--workspace-divider);
    }
  }

  @media (max-width: 767px) {
    .repair-canvas__viewport {
      block-size: min(100vw, 52vh);
    }

    .repair-canvas__controls {
      display: contents;
    }

    .repair-canvas__view {
      padding: var(--ui-space-8, 8px);
    }

    .repair-canvas__zoom :deep(.b_btn) {
      min-height: var(--ui-control-40, 40px);
    }

    .repair-canvas__gesture {
      display: block;
      margin: var(--ui-space-5, 5px) 0 0;
      font-size: var(--ui-font-12, 12px);
      color: var(--workspace-muted);
      text-align: center;
    }
  }
</style>

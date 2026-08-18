<template>
  <div ref="rootRef" class="drawing-editor" :class="{ 'is-readonly': readonly }" tabindex="0" @keydown="handleKeydown">
    <div v-if="!readonly" class="drawing-toolbar" role="toolbar" :aria-label="t('note.drawingToolbar')">
      <BTooltip v-for="item in tools" :key="item.key" :title="item.label">
        <BButton
          size="small"
          class="drawing-tool-button"
          :class="{ 'is-active': tool === item.key }"
          :aria-label="item.label"
          :aria-pressed="tool === item.key"
          @click="tool = item.key"
        >
          <SvgIcon :src="item.icon" size="17" aria-hidden="true" />
        </BButton>
      </BTooltip>

      <span class="drawing-toolbar-separator" aria-hidden="true" />
      <BPopover
        v-model:open="colorPopoverOpen"
        trigger="click"
        placement="bottom-left"
        overlay-class-name="drawing-color-popover"
        @open-change="handleColorPopoverChange"
      >
        <BTooltip :title="t('note.drawingChooseColor')">
          <BButton size="small" class="drawing-color-button" :aria-label="t('note.drawingChooseColor')">
            <span class="drawing-color-dot" :style="{ backgroundColor: activeColor }" />
          </BButton>
        </BTooltip>
        <template #content>
          <div class="drawing-color-panel">
            <strong>{{ t('note.drawingColor') }}</strong>
            <div class="drawing-color-presets" role="list" :aria-label="t('note.drawingPresetColors')">
              <BButton
                v-for="color in DRAWING_COLORS"
                :key="color"
                class="drawing-color-preset"
                :class="{ 'is-active': activeColor === color }"
                :aria-label="color"
                :aria-pressed="activeColor === color"
                @click="selectColor(color)"
              >
                <span class="drawing-color-dot" :style="{ backgroundColor: color }" />
              </BButton>
            </div>
            <label for="drawing-custom-color">{{ t('note.drawingCustomColor') }}</label>
            <BInput
              id="drawing-custom-color"
              v-model:value="activeColor"
              class="drawing-custom-color"
              type="color"
              height="40px"
              @change="colorPopoverOpen = false"
            />
          </div>
        </template>
      </BPopover>
      <BPopover
        v-if="showSizeControl"
        v-model:open="sizePopoverOpen"
        trigger="click"
        placement="bottom-left"
        overlay-class-name="drawing-size-popover"
        @open-change="handleSizePopoverChange"
      >
        <BTooltip :title="activeSizeLabel">
          <BButton size="small" class="drawing-value-button drawing-size-trigger" :aria-label="activeSizeLabel">
            {{ activeSize }} px
          </BButton>
        </BTooltip>
        <template #content>
          <div class="drawing-size-panel">
            <strong>{{ activeSizeLabel }}</strong>
            <div class="drawing-size-options" role="list" :aria-label="activeSizeLabel">
              <BButton
                v-for="size in activeSizeOptions"
                :key="size"
                class="drawing-size-option"
                :class="{ 'is-active': activeSize === size }"
                :aria-label="`${activeSizeLabel} ${size} px`"
                :aria-pressed="activeSize === size"
                @click="setActiveSize(size)"
              >
                {{ size }} px
              </BButton>
            </div>
            <div class="drawing-size-range-row">
              <input
                class="drawing-size-range"
                type="range"
                :min="activeSizeRange.min"
                :max="activeSizeRange.max"
                :value="activeSize"
                :aria-label="activeSizeLabel"
                @input="setActiveSizeFromInput"
              />
              <span class="drawing-size-current">{{ activeSize }} px</span>
            </div>
          </div>
        </template>
      </BPopover>

      <span class="drawing-toolbar-separator" aria-hidden="true" />
      <BTooltip :title="t('note.drawingUndo')">
        <BButton
          size="small"
          class="drawing-tool-button"
          :disabled="!undoStack.length"
          :aria-label="t('note.drawingUndo')"
          @click="undo"
        >
          <SvgIcon :src="icon.noteDetail.toolbar.undo" size="17" aria-hidden="true" />
        </BButton>
      </BTooltip>
      <BTooltip :title="t('note.drawingRedo')">
        <BButton
          size="small"
          class="drawing-tool-button"
          :disabled="!redoStack.length"
          :aria-label="t('note.drawingRedo')"
          @click="redo"
        >
          <SvgIcon :src="icon.noteDetail.toolbar.redo" size="17" aria-hidden="true" />
        </BButton>
      </BTooltip>
      <BTooltip :title="t('note.drawingClear')">
        <BButton
          size="small"
          class="drawing-tool-button"
          :disabled="!scene.elements.length"
          :aria-label="t('note.drawingClear')"
          @click="confirmClearDrawing"
        >
          <SvgIcon :src="icon.noteDetail.imageToolbar.delete" size="17" aria-hidden="true" />
        </BButton>
      </BTooltip>

      <span class="drawing-toolbar-spacer" />
      <BButton size="small" class="drawing-value-button" :disabled="zoomIndex === 0" @click="changeZoom(-1)">
        −
      </BButton>
      <span class="drawing-zoom-label">{{ Math.round(zoom * 100) }}%</span>
      <BButton
        size="small"
        class="drawing-value-button"
        :disabled="zoomIndex === ZOOM_LEVELS.length - 1"
        @click="changeZoom(1)"
      >
        +
      </BButton>
    </div>

    <div ref="workspaceRef" class="drawing-workspace">
      <div
        ref="pageRef"
        class="drawing-page"
        :style="{ width: `${DRAWING_PAGE.width * zoom}px`, height: `${DRAWING_PAGE.height * zoom}px` }"
      >
        <canvas
          ref="canvasRef"
          class="drawing-canvas"
          :class="`is-tool-${tool}`"
          :aria-label="t('note.drawingCanvas')"
          @contextmenu.prevent
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerUp"
          @pointercancel="handlePointerCancel"
          @pointerleave="handlePointerLeave"
        />
        <div
          v-if="textDraft"
          class="drawing-text-editor"
          :style="{
            left: `${textDraft.x * zoom}px`,
            top: `${textEditorTop(textDraft) * zoom}px`,
            width: `${textDraft.width * zoom}px`,
            fontSize: `${textDraft.fontSize * zoom}px`,
            color: textDraft.color,
          }"
        >
          <BInput
            ref="textInputRef"
            v-model:value="textDraft.text"
            type="textarea"
            :rows="textDraftRows"
            :maxlength="4000"
            submit-on-enter
            :placeholder="t('note.drawingTextPlaceholder')"
            @enter="commitTextDraft"
            @focusout="commitTextDraft"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    DRAWING_COLORS,
    DRAWING_FONT_SIZE_RANGE,
    DRAWING_FONT_SIZES,
    DRAWING_PAGE,
    DRAWING_SCENE_LIMITS,
    DRAWING_STROKE_WIDTH_RANGE,
    DRAWING_STROKE_WIDTHS,
    createEmptyDrawingScene,
    parseDrawingScene,
    serializeDrawingScene,
    type DrawingColor,
    type DrawingElement,
    type DrawingFontSize,
    type DrawingScene,
    type DrawingStrokeElement,
    type DrawingStrokeWidth,
    type DrawingTextElement,
  } from '@lightnote/shared/drawing-note';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';
  import { buildExportFileName, deliverGeneratedFile } from '@/utils/fileDelivery';
  import { isLightNoteAndroidApp } from '@/utils/androidBridge';
  import { deliverExportViaAndroidBridge } from '@/utils/androidFileExport';
  import { bookmarkStore } from '@/store';
  import { eraseDrawingElementsAt, type DrawingPoint } from '@/utils/drawingEraser';
  import {
    cloneDrawingElement,
    drawingRectsIntersect,
    normalizeDrawingRect,
    readDrawingClipboard,
    translateDrawingElement,
    writeDrawingClipboard,
    type DrawingRect,
  } from '@/utils/drawingSelection';

  type DrawingTool = 'pen' | 'eraser' | 'text' | 'select' | 'hand';

  const props = withDefaults(
    defineProps<{
      content?: string;
      readonly?: boolean;
      noteId?: string;
      title?: string;
    }>(),
    { content: '', readonly: false, noteId: '', title: '' },
  );
  const emit = defineEmits<{
    'update:content': [content: string];
    ready: [];
  }>();
  const { t } = useI18n();
  const bookmark = bookmarkStore();

  const rootRef = ref<HTMLElement | null>(null);
  const workspaceRef = ref<HTMLElement | null>(null);
  const pageRef = ref<HTMLElement | null>(null);
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  const textInputRef = ref<{ focus?: () => void } | null>(null);
  const scene = shallowRef<DrawingScene>(createEmptyDrawingScene());
  const tool = ref<DrawingTool>('pen');
  const activeColor = ref<DrawingColor>(DRAWING_COLORS[0]);
  const strokeWidth = ref<DrawingStrokeWidth>(DRAWING_STROKE_WIDTHS[1]);
  const fontSize = ref<DrawingFontSize>(DRAWING_FONT_SIZES[0]);
  const eraserSize = ref(18);
  const selectedIds = ref<string[]>([]);
  const colorPopoverOpen = ref(false);
  const sizePopoverOpen = ref(false);
  const textDraft = ref<DrawingTextElement | null>(null);
  const textDraftRows = computed(() => {
    const draft = textDraft.value;
    if (!draft) return 1;
    const context = canvasRef.value?.getContext('2d');
    if (!context) return Math.max(1, draft.text.split('\n').length);
    context.font = `${draft.fontSize}px sans-serif`;
    return Math.max(1, Math.min(12, layoutText(context, draft).length));
  });
  const undoStack = ref<string[]>([]);
  const redoStack = ref<string[]>([]);
  const ZOOM_LEVELS = [0.3, 0.35, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5] as const;
  const zoomIndex = ref(6);
  const readonlyFitZoom = ref(1);
  const zoom = computed(() => (props.readonly ? readonlyFitZoom.value : ZOOM_LEVELS[zoomIndex.value]));
  const HISTORY_MAX_STATES = 20;
  const HISTORY_MAX_CHARS = 8_000_000;
  const TEXT_DRAG_THRESHOLD_PX = 4;
  const MARQUEE_DRAG_THRESHOLD_PX = 3;
  const DRAWING_TEXT_LINE_HEIGHT = 1.35;
  const DRAWING_ERASER_SIZE_RANGE = Object.freeze({ min: 4, max: 64 });
  const DRAWING_ERASER_SIZES = Object.freeze([8, 18, 36]);

  const tools = computed(() => [
    { key: 'pen' as const, label: t('note.drawingPen'), icon: icon.drawingNote.pen },
    { key: 'eraser' as const, label: t('note.drawingEraser'), icon: icon.drawingNote.eraser },
    { key: 'text' as const, label: t('note.drawingText'), icon: icon.drawingNote.text },
    { key: 'select' as const, label: t('note.drawingSelect'), icon: icon.drawingNote.select },
    { key: 'hand' as const, label: t('note.drawingHand'), icon: icon.drawingNote.hand },
  ]);
  const showSizeControl = computed(() => tool.value === 'pen' || tool.value === 'eraser' || tool.value === 'text');
  const activeSize = computed(() => {
    if (tool.value === 'text') return fontSize.value;
    if (tool.value === 'eraser') return eraserSize.value;
    return strokeWidth.value;
  });
  const activeSizeLabel = computed(() => {
    if (tool.value === 'text') return t('note.drawingTextSize');
    if (tool.value === 'eraser') return t('note.drawingEraserSize');
    return t('note.drawingStrokeSize');
  });
  const activeSizeOptions = computed<readonly number[]>(() => {
    if (tool.value === 'text') return DRAWING_FONT_SIZES;
    if (tool.value === 'eraser') return DRAWING_ERASER_SIZES;
    return DRAWING_STROKE_WIDTHS;
  });
  const activeSizeRange = computed(() => {
    if (tool.value === 'text') return DRAWING_FONT_SIZE_RANGE;
    if (tool.value === 'eraser') return DRAWING_ERASER_SIZE_RANGE;
    return DRAWING_STROKE_WIDTH_RANGE;
  });

  let activePointerId: number | null = null;
  let activeCanvasRect: DOMRect | null = null;
  let activeStroke: DrawingStrokeElement | null = null;
  let activeStrokeMaxPairs = 0;
  let mutationSnapshot = '';
  let eraserChanged = false;
  let eraserLimitReached = false;
  let eraserPreviewElements: DrawingElement[] | null = null;
  let eraserCursorPoint: DrawingPoint | null = null;
  let dragStart: {
    x: number;
    y: number;
    elements: DrawingElement[];
    elementsById: Map<string, DrawingElement>;
    dx: number;
    dy: number;
  } | null = null;
  let marqueeSelection: { start: DrawingPoint; current: DrawingPoint; baseIds: string[] } | null = null;
  let editSelectedTextOnRelease = false;
  let panStart: { x: number; y: number; left: number; top: number } | null = null;
  let workspaceResizeObserver: ResizeObserver | null = null;
  let frameId = 0;
  let lastEmittedContent = '';
  const textLayoutCache = new Map<string, string[]>();
  const elementBoundsCache = new WeakMap<DrawingElement, { x: number; y: number; width: number; height: number }>();

  function createElementId() {
    const cryptoSource = globalThis.crypto;
    if (cryptoSource && typeof cryptoSource.randomUUID === 'function') {
      return cryptoSource.randomUUID().replace(/-/gu, '');
    }
    if (cryptoSource && typeof cryptoSource.getRandomValues === 'function') {
      const bytes = new Uint32Array(4);
      cryptoSource.getRandomValues(bytes);
      return Array.from(bytes, (value) => value.toString(36)).join('');
    }
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }

  function setSelectedIds(ids: readonly string[]) {
    const availableIds = new Set(scene.value.elements.map((element) => element.id));
    selectedIds.value = Array.from(new Set(ids)).filter((id) => availableIds.has(id));
  }

  function currentMarqueeRect(): DrawingRect | null {
    return marqueeSelection ? normalizeDrawingRect(marqueeSelection.start, marqueeSelection.current) : null;
  }

  function marqueeSelectedIds(context: CanvasRenderingContext2D, elements: readonly DrawingElement[]) {
    const rect = currentMarqueeRect();
    if (!rect || !marqueeSelection) return selectedIds.value;
    const ids = new Set(marqueeSelection.baseIds);
    if (Math.max(rect.width, rect.height) * zoom.value < MARQUEE_DRAG_THRESHOLD_PX) return Array.from(ids);
    for (const element of elements) {
      if (drawingRectsIntersect(rect, elementBounds(context, element))) ids.add(element.id);
    }
    return Array.from(ids);
  }

  function selectedElements() {
    const ids = new Set(selectedIds.value);
    return scene.value.elements.filter((element) => ids.has(element.id));
  }

  function previewElement(element: DrawingElement) {
    if (!dragStart) return element;
    const original = dragStart.elementsById.get(element.id);
    return original ? translateDrawingElement(original, dragStart.dx, dragStart.dy) : element;
  }

  function unionElementBounds(context: CanvasRenderingContext2D, elements: readonly DrawingElement[]) {
    if (!elements.length) return null;
    const bounds = elements.map((element) => elementBounds(context, element));
    const minX = Math.min(...bounds.map((item) => item.x));
    const minY = Math.min(...bounds.map((item) => item.y));
    const maxX = Math.max(...bounds.map((item) => item.x + item.width));
    const maxY = Math.max(...bounds.map((item) => item.y + item.height));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function setActiveSize(size: number) {
    const range = activeSizeRange.value;
    const normalized = Math.max(range.min, Math.min(range.max, Math.round(size)));
    if (tool.value === 'text') {
      fontSize.value = normalized;
      sizePopoverOpen.value = false;
      return;
    }
    if (tool.value === 'eraser') eraserSize.value = normalized;
    else strokeWidth.value = normalized;
    sizePopoverOpen.value = false;
  }

  function setActiveSizeFromInput(event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    const range = activeSizeRange.value;
    const normalized = Math.max(range.min, Math.min(range.max, Math.round(value)));
    if (tool.value === 'text') fontSize.value = normalized;
    else if (tool.value === 'eraser') eraserSize.value = normalized;
    else strokeWidth.value = normalized;
  }

  function selectColor(color: DrawingColor) {
    activeColor.value = color;
    colorPopoverOpen.value = false;
  }

  function handleColorPopoverChange(open: boolean) {
    if (open) sizePopoverOpen.value = false;
  }

  function handleSizePopoverChange(open: boolean) {
    if (open) colorPopoverOpen.value = false;
  }

  function changeZoom(delta: number) {
    zoomIndex.value = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, zoomIndex.value + delta));
    nextTick(() => {
      resizeCanvas();
      centerMobileWorkspace();
    });
  }

  function scheduleDraw() {
    if (frameId) return;
    frameId = requestAnimationFrame(() => {
      frameId = 0;
      draw();
    });
  }

  function layoutText(context: CanvasRenderingContext2D, element: DrawingTextElement) {
    const cacheKey = `${element.id}:${element.fontSize}:${element.width}:${element.text}`;
    const cached = textLayoutCache.get(cacheKey);
    if (cached) return cached;
    const lines: string[] = [];
    for (const paragraph of element.text.split('\n')) {
      if (!paragraph) {
        lines.push('');
        continue;
      }
      let line = '';
      for (const character of paragraph) {
        const candidate = `${line}${character}`;
        if (line && context.measureText(candidate).width > element.width) {
          lines.push(line);
          line = character;
        } else {
          line = candidate;
        }
      }
      lines.push(line);
    }
    textLayoutCache.set(cacheKey, lines);
    return lines;
  }

  function textEditorTop(element: DrawingTextElement) {
    return element.y - (element.fontSize * (DRAWING_TEXT_LINE_HEIGHT - 1)) / 2;
  }

  function elementBounds(context: CanvasRenderingContext2D, element: DrawingElement) {
    const cached = elementBoundsCache.get(element);
    if (cached) return cached;
    let bounds: { x: number; y: number; width: number; height: number };
    if (element.kind === 'text') {
      context.font = `${element.fontSize}px sans-serif`;
      const lines = layoutText(context, element);
      bounds = {
        x: element.x,
        y: textEditorTop(element),
        width: element.width,
        height: Math.max(
          element.fontSize * DRAWING_TEXT_LINE_HEIGHT,
          lines.length * element.fontSize * DRAWING_TEXT_LINE_HEIGHT,
        ),
      };
    } else {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let index = 0; index < element.points.length; index += 2) {
        minX = Math.min(minX, element.points[index]);
        minY = Math.min(minY, element.points[index + 1]);
        maxX = Math.max(maxX, element.points[index]);
        maxY = Math.max(maxY, element.points[index + 1]);
      }
      const padding = element.width + 3;
      bounds = {
        x: minX - padding,
        y: minY - padding,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
      };
    }
    elementBoundsCache.set(element, bounds);
    return bounds;
  }

  function paintElement(context: CanvasRenderingContext2D, element: DrawingElement) {
    if (element.kind === 'stroke') {
      const points = element.points;
      context.beginPath();
      context.strokeStyle = element.color;
      context.fillStyle = element.color;
      context.lineWidth = element.width;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      if (points.length === 2) {
        context.arc(points[0], points[1], element.width / 2, 0, Math.PI * 2);
        context.fill();
        return;
      }
      context.moveTo(points[0], points[1]);
      for (let index = 2; index < points.length; index += 2) context.lineTo(points[index], points[index + 1]);
      context.stroke();
      return;
    }
    context.fillStyle = element.color;
    context.font = `${element.fontSize}px sans-serif`;
    context.textBaseline = 'top';
    layoutText(context, element).forEach((line, index) => {
      context.fillText(line, element.x, element.y + index * element.fontSize * DRAWING_TEXT_LINE_HEIGHT, element.width);
    });
  }

  function paintScene(context: CanvasRenderingContext2D, target: DrawingScene, scale: number, showSelection: boolean) {
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, DRAWING_PAGE.width, DRAWING_PAGE.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, DRAWING_PAGE.width, DRAWING_PAGE.height);
    const paintedElements = showSelection && eraserPreviewElements ? eraserPreviewElements : target.elements;
    paintedElements.forEach((element) => {
      // 编辑框已经承载同一文本；画布暂时隐藏原元素，避免视觉上叠成两份。
      if (textDraft.value?.id !== element.id) {
        paintElement(context, previewElement(element));
      }
    });
    if (activeStroke) paintElement(context, activeStroke);
    if (showSelection) {
      const activeSelectedIds = new Set(marqueeSelectedIds(context, paintedElements));
      paintedElements.forEach((element) => {
        if (!activeSelectedIds.has(element.id) || textDraft.value?.id === element.id) return;
        const bounds = elementBounds(context, previewElement(element));
        context.save();
        context.strokeStyle = '#615ced';
        context.lineWidth = 1.5;
        context.setLineDash([6, 4]);
        context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        context.restore();
      });
      const marqueeRect = currentMarqueeRect();
      if (marqueeRect) {
        context.save();
        context.fillStyle = 'rgba(97, 92, 237, 0.1)';
        context.strokeStyle = '#615ced';
        context.lineWidth = 1.5;
        context.setLineDash([5, 3]);
        context.fillRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
        context.strokeRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
        context.restore();
      }
    }
    if (showSelection && tool.value === 'eraser' && eraserCursorPoint) {
      context.save();
      context.beginPath();
      context.arc(eraserCursorPoint.x, eraserCursorPoint.y, eraserSize.value / 2, 0, Math.PI * 2);
      context.strokeStyle = '#615ced';
      context.lineWidth = 1.5;
      context.setLineDash([5, 3]);
      context.stroke();
      context.restore();
    }
  }

  function draw() {
    const canvas = canvasRef.value;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    paintScene(context, scene.value, canvas.width / DRAWING_PAGE.width, true);
  }

  function resizeCanvas() {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const ratio = Math.min(1.5, Math.max(0.5, (window.devicePixelRatio || 1) * zoom.value));
    canvas.width = Math.round(DRAWING_PAGE.width * ratio);
    canvas.height = Math.round(DRAWING_PAGE.height * ratio);
    canvas.style.width = `${DRAWING_PAGE.width * zoom.value}px`;
    canvas.style.height = `${DRAWING_PAGE.height * zoom.value}px`;
    scheduleDraw();
  }

  function centerMobileWorkspace() {
    const workspace = workspaceRef.value;
    if (!bookmark.isMobile || !workspace || workspace.scrollWidth <= workspace.clientWidth) return;
    workspace.scrollLeft = Math.max(0, (workspace.scrollWidth - workspace.clientWidth) / 2);
  }

  function resolveInitialZoomIndex() {
    const workspace = workspaceRef.value;
    if (!workspace) return 0;
    const style = getComputedStyle(workspace);
    const horizontalPadding =
      (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
    const verticalPadding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
    const widthFit = Math.max(0.1, (workspace.clientWidth - horizontalPadding) / DRAWING_PAGE.width);
    const heightFit = Math.max(0.1, (workspace.clientHeight - verticalPadding) / DRAWING_PAGE.height);
    // 手机竖屏若只按宽度适配，会在短画纸下方留下大量不可用区域；允许有限横向平移来换取更大的书写面积。
    const preferred = bookmark.isMobile ? Math.min(1, heightFit, widthFit * 1.4) : Math.min(1, widthFit);
    return ZOOM_LEVELS.reduce(
      (best, value, index) => (Math.abs(value - preferred) < Math.abs(ZOOM_LEVELS[best] - preferred) ? index : best),
      0,
    );
  }

  function fitReadonlyPage() {
    const workspace = workspaceRef.value;
    if (!props.readonly || !workspace) return;
    const style = getComputedStyle(workspace);
    const horizontalPadding =
      (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
    const contentWidth = Math.max(1, workspace.clientWidth - horizontalPadding);
    const pageStyle = pageRef.value ? getComputedStyle(pageRef.value) : null;
    const horizontalBorder = pageStyle
      ? (Number.parseFloat(pageStyle.borderLeftWidth) || 0) + (Number.parseFloat(pageStyle.borderRightWidth) || 0)
      : 0;
    readonlyFitZoom.value = Math.min(1, Math.max(1, contentWidth - horizontalBorder) / DRAWING_PAGE.width);
    nextTick(resizeCanvas);
  }

  function canvasPoint(event: PointerEvent) {
    const rect = activeCanvasRect || canvasRef.value?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(DRAWING_PAGE.width, ((event.clientX - rect.left) / rect.width) * DRAWING_PAGE.width)),
      y: Math.max(0, Math.min(DRAWING_PAGE.height, ((event.clientY - rect.top) / rect.height) * DRAWING_PAGE.height)),
    };
  }

  function pointSegmentDistance(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (!dx && !dy) return Math.hypot(x - x1, y - y1);
    const ratio = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (x1 + ratio * dx), y - (y1 + ratio * dy));
  }

  function hitElement(point: { x: number; y: number }) {
    const context = canvasRef.value?.getContext('2d');
    if (!context) return null;
    for (let index = scene.value.elements.length - 1; index >= 0; index -= 1) {
      const element = scene.value.elements[index];
      const bounds = elementBounds(context, element);
      const boundsPadding = element.kind === 'text' ? 6 : Math.max(8, element.width + 5);
      if (
        point.x < bounds.x - boundsPadding ||
        point.x > bounds.x + bounds.width + boundsPadding ||
        point.y < bounds.y - boundsPadding ||
        point.y > bounds.y + bounds.height + boundsPadding
      ) {
        continue;
      }
      if (element.kind === 'text') {
        if (
          point.x >= bounds.x - 6 &&
          point.x <= bounds.x + bounds.width + 6 &&
          point.y >= bounds.y - 6 &&
          point.y <= bounds.y + bounds.height + 6
        ) {
          return element;
        }
        continue;
      }
      const threshold = Math.max(8, element.width + 5);
      if (
        element.points.length === 2 &&
        Math.hypot(point.x - element.points[0], point.y - element.points[1]) <= threshold
      ) {
        return element;
      }
      for (let offset = 0; offset + 3 < element.points.length; offset += 2) {
        if (
          pointSegmentDistance(
            point.x,
            point.y,
            element.points[offset],
            element.points[offset + 1],
            element.points[offset + 2],
            element.points[offset + 3],
          ) <= threshold
        ) {
          return element;
        }
      }
    }
    return null;
  }

  function beginMutation() {
    mutationSnapshot = serializeDrawingScene(scene.value);
  }

  function trimHistory(stack: string[]) {
    while (stack.length > HISTORY_MAX_STATES || stack.reduce((sum, item) => sum + item.length, 0) > HISTORY_MAX_CHARS) {
      stack.shift();
    }
  }

  function emitScene(snapshot = mutationSnapshot) {
    try {
      const serialized = serializeDrawingScene(scene.value);
      if (serialized === snapshot) return false;
      if (snapshot) {
        undoStack.value.push(snapshot);
        trimHistory(undoStack.value);
      }
      redoStack.value = [];
      lastEmittedContent = serialized;
      emit('update:content', serialized);
      return true;
    } catch (error) {
      if (snapshot) scene.value = parseDrawingScene(snapshot);
      message.error(error instanceof Error ? error.message : t('note.drawingInvalid'));
      scheduleDraw();
      return false;
    } finally {
      mutationSnapshot = '';
    }
  }

  function appendStrokePoint(stroke: DrawingStrokeElement, point: { x: number; y: number }) {
    const lastX = stroke.points.at(-2) ?? point.x;
    const lastY = stroke.points.at(-1) ?? point.y;
    if (stroke.points.length > 2 && Math.hypot(point.x - lastX, point.y - lastY) < 0.8) return;
    stroke.points.push(point.x, point.y);
  }

  function totalPointPairs() {
    return scene.value.elements.reduce(
      (total, element) => total + (element.kind === 'stroke' ? element.points.length / 2 : 0),
      0,
    );
  }

  function eraseAt(point: { x: number; y: number }) {
    const source = eraserPreviewElements || scene.value.elements;
    const result = eraseDrawingElementsAt(source, point, eraserSize.value / 2, createElementId, {
      maxElements: DRAWING_SCENE_LIMITS.maxElements,
      maxStrokes: DRAWING_SCENE_LIMITS.maxStrokes,
    });
    if (result.limitReached) eraserLimitReached = true;
    if (!result.changed) return;
    eraserPreviewElements = result.elements;
    selectedIds.value = [];
    eraserChanged = true;
    scheduleDraw();
  }

  function handlePointerDown(event: PointerEvent) {
    if (props.readonly || textDraft.value || activePointerId !== null || event.button !== 0) return;
    rootRef.value?.focus({ preventScroll: true });
    activePointerId = event.pointerId;
    canvasRef.value?.setPointerCapture(event.pointerId);
    activeCanvasRect = canvasRef.value?.getBoundingClientRect() || null;
    const point = canvasPoint(event);
    if (tool.value === 'hand') {
      const workspace = workspaceRef.value;
      if (workspace)
        panStart = { x: event.clientX, y: event.clientY, left: workspace.scrollLeft, top: workspace.scrollTop };
      return;
    }
    event.preventDefault();
    if (tool.value === 'pen') {
      if (
        scene.value.elements.filter((element) => element.kind === 'stroke').length >= DRAWING_SCENE_LIMITS.maxStrokes ||
        totalPointPairs() >= DRAWING_SCENE_LIMITS.maxPointPairs
      ) {
        message.warning(t('note.drawingLimitReached'));
        canvasRef.value?.releasePointerCapture(event.pointerId);
        activePointerId = null;
        activeCanvasRect = null;
        return;
      }
      beginMutation();
      activeStrokeMaxPairs = DRAWING_SCENE_LIMITS.maxPointPairs - totalPointPairs();
      activeStroke = {
        id: createElementId(),
        kind: 'stroke',
        color: activeColor.value,
        width: strokeWidth.value,
        points: [point.x, point.y],
      };
      scheduleDraw();
      return;
    }
    if (tool.value === 'eraser') {
      beginMutation();
      eraserChanged = false;
      eraserLimitReached = false;
      eraserPreviewElements = scene.value.elements;
      eraserCursorPoint = point;
      eraseAt(point);
      return;
    }
    if (tool.value === 'text') {
      canvasRef.value?.releasePointerCapture(event.pointerId);
      activePointerId = null;
      activeCanvasRect = null;
      if (scene.value.elements.filter((element) => element.kind === 'text').length >= DRAWING_SCENE_LIMITS.maxTexts) {
        message.warning(t('note.drawingLimitReached'));
        return;
      }
      textDraft.value = {
        id: createElementId(),
        kind: 'text',
        x: Math.min(point.x, DRAWING_PAGE.width - 80),
        y: point.y,
        width: Math.max(80, Math.min(360, DRAWING_PAGE.width - point.x)),
        fontSize: fontSize.value,
        color: activeColor.value,
        text: '',
      };
      nextTick(() => textInputRef.value?.focus?.());
      return;
    }
    const hit = hitElement(point);
    const additiveSelection = event.shiftKey || event.metaKey || event.ctrlKey;
    const wasSelected = Boolean(hit && selectedIds.value.includes(hit.id));
    const shouldEditSelectedText =
      !additiveSelection && hit?.kind === 'text' && wasSelected && selectedIds.value.length === 1;
    if (!hit) {
      const baseIds = additiveSelection ? [...selectedIds.value] : [];
      setSelectedIds(baseIds);
      marqueeSelection = { start: point, current: point, baseIds };
      scheduleDraw();
      return;
    }
    if (additiveSelection && wasSelected) {
      setSelectedIds(selectedIds.value.filter((id) => id !== hit.id));
      scheduleDraw();
      return;
    }
    if (additiveSelection) setSelectedIds([...selectedIds.value, hit.id]);
    else if (!wasSelected) setSelectedIds([hit.id]);
    const originals = selectedElements().map((element) => cloneDrawingElement(element));
    if (originals.length) {
      beginMutation();
      dragStart = {
        x: point.x,
        y: point.y,
        elements: originals,
        elementsById: new Map(originals.map((element) => [element.id, element])),
        dx: 0,
        dy: 0,
      };
      editSelectedTextOnRelease = shouldEditSelectedText;
    }
    scheduleDraw();
  }

  function handlePointerMove(event: PointerEvent) {
    if (tool.value === 'eraser') {
      eraserCursorPoint = canvasPoint(event);
      scheduleDraw();
    }
    if (event.pointerId !== activePointerId) return;
    if (panStart && workspaceRef.value) {
      workspaceRef.value.scrollLeft = panStart.left - (event.clientX - panStart.x);
      workspaceRef.value.scrollTop = panStart.top - (event.clientY - panStart.y);
      return;
    }
    event.preventDefault();
    const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
    if (activeStroke) {
      for (const sample of samples) {
        if (activeStroke.points.length / 2 >= activeStrokeMaxPairs) break;
        appendStrokePoint(activeStroke, canvasPoint(sample));
      }
      scheduleDraw();
      return;
    }
    if (tool.value === 'eraser') {
      for (const sample of samples) eraseAt(canvasPoint(sample));
      return;
    }
    const point = canvasPoint(event);
    if (marqueeSelection) {
      marqueeSelection.current = point;
      scheduleDraw();
      return;
    }
    if (dragStart && selectedIds.value.length) {
      dragStart.dx = point.x - dragStart.x;
      dragStart.dy = point.y - dragStart.y;
      if (editSelectedTextOnRelease && Math.hypot(dragStart.dx, dragStart.dy) * zoom.value >= TEXT_DRAG_THRESHOLD_PX) {
        editSelectedTextOnRelease = false;
      }
      scheduleDraw();
    }
  }

  function releasePointer(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return false;
    canvasRef.value?.releasePointerCapture(event.pointerId);
    activePointerId = null;
    activeCanvasRect = null;
    panStart = null;
    return true;
  }

  function handlePointerUp(event: PointerEvent) {
    if (!releasePointer(event)) return;
    if (activeStroke) {
      scene.value = { ...scene.value, elements: [...scene.value.elements, activeStroke] };
      activeStroke = null;
      activeStrokeMaxPairs = 0;
      emitScene();
    } else if (marqueeSelection) {
      const context = canvasRef.value?.getContext('2d');
      if (context) setSelectedIds(marqueeSelectedIds(context, scene.value.elements));
      marqueeSelection = null;
      mutationSnapshot = '';
    } else if (dragStart) {
      if (editSelectedTextOnRelease && dragStart.elements.length === 1 && dragStart.elements[0].kind === 'text') {
        mutationSnapshot = '';
        textDraft.value = cloneDrawingElement(dragStart.elements[0]) as DrawingTextElement;
        nextTick(() => textInputRef.value?.focus?.());
      } else {
        const { dx, dy, elements } = dragStart;
        const movedById = new Map(elements.map((element) => [element.id, translateDrawingElement(element, dx, dy)]));
        scene.value = {
          ...scene.value,
          elements: scene.value.elements.map((element) => movedById.get(element.id) || element),
        };
        emitScene();
      }
    } else if (tool.value === 'eraser' && eraserChanged) {
      scene.value = {
        ...scene.value,
        elements: eraserPreviewElements || scene.value.elements,
      };
      emitScene();
    } else {
      mutationSnapshot = '';
    }
    if (eraserLimitReached) message.warning(t('note.drawingLimitReached'));
    eraserChanged = false;
    eraserLimitReached = false;
    eraserPreviewElements = null;
    dragStart = null;
    marqueeSelection = null;
    editSelectedTextOnRelease = false;
    scheduleDraw();
  }

  function handlePointerCancel(event: PointerEvent) {
    if (!releasePointer(event)) return;
    if (mutationSnapshot) scene.value = parseDrawingScene(mutationSnapshot);
    mutationSnapshot = '';
    activeStroke = null;
    activeStrokeMaxPairs = 0;
    eraserChanged = false;
    eraserLimitReached = false;
    eraserPreviewElements = null;
    dragStart = null;
    marqueeSelection = null;
    editSelectedTextOnRelease = false;
    scheduleDraw();
  }

  function handlePointerLeave() {
    if (activePointerId !== null || !eraserCursorPoint) return;
    eraserCursorPoint = null;
    scheduleDraw();
  }

  function commitTextDraft() {
    const draft = textDraft.value;
    if (!draft) return;
    textDraft.value = null;
    if (!draft.text.trim()) return;
    const existingText = scene.value.elements.some((element) => element.id === draft.id && element.kind === 'text');
    beginMutation();
    const committedDraft = { ...draft, text: draft.text.slice(0, 4000) };
    scene.value = {
      ...scene.value,
      elements: existingText
        ? scene.value.elements.map((element) => (element.id === draft.id ? committedDraft : element))
        : [...scene.value.elements, committedDraft],
    };
    setSelectedIds([draft.id]);
    textLayoutCache.clear();
    emitScene();
    scheduleDraw();
  }

  function applyHistory(serialized: string, targetStack: string[]) {
    targetStack.push(serializeDrawingScene(scene.value));
    trimHistory(targetStack);
    scene.value = parseDrawingScene(serialized);
    selectedIds.value = [];
    textLayoutCache.clear();
    lastEmittedContent = serializeDrawingScene(scene.value);
    emit('update:content', lastEmittedContent);
    scheduleDraw();
  }

  function undo() {
    const previous = undoStack.value.pop();
    if (previous) applyHistory(previous, redoStack.value);
  }

  function redo() {
    const next = redoStack.value.pop();
    if (next) applyHistory(next, undoStack.value);
  }

  function copySelectedElements() {
    const elements = selectedElements();
    if (!elements.length) return false;
    writeDrawingClipboard(elements);
    return true;
  }

  function deleteSelectedElements() {
    if (!selectedIds.value.length) return false;
    const ids = new Set(selectedIds.value);
    if (!scene.value.elements.some((element) => ids.has(element.id))) return false;
    beginMutation();
    scene.value = { ...scene.value, elements: scene.value.elements.filter((element) => !ids.has(element.id)) };
    selectedIds.value = [];
    const changed = emitScene();
    scheduleDraw();
    return changed;
  }

  function pasteDrawingElements() {
    const clipboard = readDrawingClipboard(createElementId);
    if (!clipboard.elements.length) return;
    const context = canvasRef.value?.getContext('2d');
    if (!context) return;
    const bounds = unionElementBounds(context, clipboard.elements);
    if (!bounds) return;
    const desiredOffset = clipboard.sequence * 24;
    const dx = Math.max(-bounds.x, Math.min(desiredOffset, DRAWING_PAGE.width - bounds.x - bounds.width));
    const dy = Math.max(-bounds.y, Math.min(desiredOffset, DRAWING_PAGE.height - bounds.y - bounds.height));
    const pasted = clipboard.elements.map((element) => translateDrawingElement(element, dx, dy));
    const previousSelection = [...selectedIds.value];
    beginMutation();
    scene.value = { ...scene.value, elements: [...scene.value.elements, ...pasted] };
    setSelectedIds(pasted.map((element) => element.id));
    if (!emitScene()) setSelectedIds(previousSelection);
    else tool.value = 'select';
    scheduleDraw();
  }

  function clearDrawing() {
    if (!scene.value.elements.length) return;
    beginMutation();
    scene.value = { ...scene.value, elements: [] };
    selectedIds.value = [];
    textDraft.value = null;
    eraserPreviewElements = null;
    dragStart = null;
    marqueeSelection = null;
    textLayoutCache.clear();
    emitScene();
    scheduleDraw();
    // 确认框关闭后清屏按钮会进入 disabled，浏览器无法把焦点还给原触发按钮；
    // 主动聚焦编辑器，保证 Command/Ctrl+Z 无需再次点击画布即可撤销。
    void nextTick(() => rootRef.value?.focus({ preventScroll: true }));
  }

  function confirmClearDrawing() {
    if (!scene.value.elements.length) return;
    Alert.alert({
      title: t('note.drawingClearConfirmTitle'),
      content: t('note.drawingClearConfirmContent'),
      okText: t('note.drawingClear'),
      okType: 'danger',
      onOk: clearDrawing,
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (props.readonly || textDraft.value) return;
    const commandKey = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (commandKey && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (commandKey && key === 'a') {
      event.preventDefault();
      tool.value = 'select';
      setSelectedIds(scene.value.elements.map((element) => element.id));
      scheduleDraw();
      return;
    }
    if (commandKey && key === 'c') {
      event.preventDefault();
      copySelectedElements();
      return;
    }
    if (commandKey && key === 'x') {
      event.preventDefault();
      if (copySelectedElements()) deleteSelectedElements();
      return;
    }
    if (commandKey && key === 'v') {
      event.preventDefault();
      pasteDrawingElements();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      selectedIds.value = [];
      marqueeSelection = null;
      scheduleDraw();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelectedElements();
    }
  }

  async function deliverExport(content: string | Blob, extension: 'png' | 'json', mimeType: string) {
    const fileName = buildExportFileName(props.title, t('note.untitled'), extension);
    try {
      if (isLightNoteAndroidApp()) {
        if (!props.noteId) {
          message.warning(t('note.drawingSaveBeforeExport'));
          return;
        }
        const result = await deliverExportViaAndroidBridge({
          noteId: props.noteId,
          content,
          fileName,
          format: extension,
          mimeType,
        });
        if (!result.ok) message.error(result.message || t('noteDetail.exportFailed'));
        return;
      }
      const result = await deliverGeneratedFile({ content, fileName, mimeType, preferShare: true });
      if (result === 'downloaded' || result === 'shared') message.success(t('noteDetail.exportDownloaded'));
      else if (result === 'unavailable') message.error(t('noteDetail.exportFailed'));
    } catch {
      message.error(t('noteDetail.exportFailed'));
    }
  }

  async function exportJson() {
    await deliverExport(serializeDrawingScene(scene.value), 'json', 'application/json');
  }

  async function exportPng() {
    const output = document.createElement('canvas');
    const scale = 2;
    output.width = DRAWING_PAGE.width * scale;
    output.height = DRAWING_PAGE.height * scale;
    const context = output.getContext('2d');
    if (!context) return;
    paintScene(context, scene.value, scale, false);
    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
    if (!blob) {
      message.error(t('noteDetail.exportFailed'));
      return;
    }
    await deliverExport(blob, 'png', 'image/png');
  }

  async function replaceContentWithUndo(content: string) {
    try {
      const previous = serializeDrawingScene(scene.value);
      const next = parseDrawingScene(content);
      const serialized = serializeDrawingScene(next);
      if (serialized === previous) return true;
      undoStack.value.push(previous);
      trimHistory(undoStack.value);
      redoStack.value = [];
      scene.value = next;
      lastEmittedContent = serialized;
      emit('update:content', serialized);
      textLayoutCache.clear();
      scheduleDraw();
      return true;
    } catch {
      return false;
    }
  }

  watch(
    () => props.content,
    (content) => {
      if (content === lastEmittedContent) return;
      try {
        scene.value = content ? parseDrawingScene(content) : createEmptyDrawingScene();
        lastEmittedContent = serializeDrawingScene(scene.value);
        selectedIds.value = [];
        eraserPreviewElements = null;
        undoStack.value = [];
        redoStack.value = [];
        textLayoutCache.clear();
        scheduleDraw();
      } catch {
        scene.value = createEmptyDrawingScene();
        lastEmittedContent = '';
        message.error(t('note.drawingInvalid'));
        scheduleDraw();
      }
    },
    { immediate: true },
  );

  watch(tool, () => {
    colorPopoverOpen.value = false;
    sizePopoverOpen.value = false;
    eraserCursorPoint = null;
    scheduleDraw();
  });

  onMounted(() => {
    if (props.readonly) {
      fitReadonlyPage();
      if (typeof ResizeObserver !== 'undefined' && workspaceRef.value) {
        workspaceResizeObserver = new ResizeObserver(fitReadonlyPage);
        workspaceResizeObserver.observe(workspaceRef.value);
      }
    } else {
      zoomIndex.value = resolveInitialZoomIndex();
      resizeCanvas();
      nextTick(centerMobileWorkspace);
    }
    emit('ready');
  });

  onBeforeUnmount(() => {
    workspaceResizeObserver?.disconnect();
    if (frameId) cancelAnimationFrame(frameId);
  });

  defineExpose({ exportJson, exportPng, replaceContentWithUndo });
</script>

<style scoped lang="less">
  .drawing-editor {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    outline: none;
    color: var(--text-color);
    background: var(--workspace-panel-bg-color);
  }

  .drawing-editor.is-readonly {
    min-height: 0;
    height: auto;
  }

  .drawing-toolbar {
    z-index: 2;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 5px;
    min-width: 0;
    padding: 8px 10px;
    overflow-x: auto;
    border-bottom: 1px solid var(--surface-border-color, var(--card-border-color));
    background: var(--card-background);
    scrollbar-width: thin;
  }

  .drawing-tool-button,
  .drawing-color-button,
  .drawing-value-button {
    flex: 0 0 auto;
    min-width: 30px;
    padding: 0 7px;
    border: 1px solid transparent !important;
  }

  .drawing-tool-button {
    gap: 4px;
  }

  .drawing-tool-button.is-active,
  .drawing-color-preset.is-active,
  .drawing-size-option.is-active {
    color: var(--primary-color);
    border-color: var(--primary-color) !important;
    background: var(--primary-btn-h-bg-color);
  }

  .drawing-color-button {
    padding: 0;
  }

  .drawing-color-dot {
    width: 14px;
    height: 14px;
    border: 1px solid rgba(0, 0, 0, 0.14);
    border-radius: 50%;
  }

  .drawing-toolbar-separator {
    flex: 0 0 auto;
    width: 1px;
    height: 20px;
    margin: 0 3px;
    background: var(--surface-border-color, var(--card-border-color));
  }

  .drawing-toolbar-spacer {
    flex: 1 0 12px;
  }

  .drawing-zoom-label {
    flex: 0 0 42px;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  .drawing-color-panel,
  .drawing-size-panel {
    width: 236px;
    padding: 12px;
    box-sizing: border-box;
    display: grid;
    gap: 10px;
    color: var(--text-color);
    font-size: 12px;
  }

  .drawing-color-presets,
  .drawing-size-options {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .drawing-color-preset,
  .drawing-size-option {
    flex: 0 0 44px;
    width: 44px;
    min-width: 44px;
    height: 44px;
    min-height: 44px;
    padding: 0;
    border: 1px solid var(--surface-border-color, var(--card-border-color)) !important;
    border-radius: 10px;
    background: var(--card-background);
  }

  .drawing-color-preset .drawing-color-dot {
    width: 20px;
    height: 20px;
  }

  .drawing-size-range-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .drawing-size-range {
    flex: 1 1 auto;
    min-width: 0;
    height: 28px;
    margin: 0;
    accent-color: #615ced;
    cursor: pointer;
  }

  .drawing-size-current {
    flex: 0 0 42px;
    color: var(--desc-color);
    text-align: right;
  }

  .drawing-custom-color :deep(.b-input) {
    padding: 3px !important;
    border: 1px solid var(--surface-border-color) !important;
    background: var(--card-background);
    cursor: pointer;
  }

  .drawing-workspace {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 24px;
    overscroll-behavior: contain;
    background: var(--body-background, #f4f5f7);
  }

  .drawing-editor.is-readonly .drawing-workspace {
    flex: 0 0 auto;
    overflow: visible;
  }

  .drawing-page {
    position: relative;
    margin: 0 auto;
    overflow: hidden;
    border: 1px solid #d7d9df;
    background: #fff;
    box-shadow: 0 3px 14px rgba(31, 41, 55, 0.12);
  }

  .drawing-canvas {
    position: absolute;
    inset: 0;
    display: block;
    touch-action: none;
  }

  .drawing-canvas.is-tool-pen,
  .drawing-canvas.is-tool-text {
    cursor: crosshair;
  }

  .drawing-canvas.is-tool-eraser {
    cursor: cell;
  }

  .drawing-canvas.is-tool-select {
    cursor: default;
  }

  .drawing-canvas.is-tool-hand {
    cursor: grab;
  }

  .drawing-canvas.is-tool-hand:active {
    cursor: grabbing;
  }

  .drawing-text-editor {
    position: absolute;
    z-index: 2;
    min-width: 120px;
  }

  .drawing-text-editor :deep(.b-textarea) {
    display: block;
    min-height: 0;
    padding: 0 !important;
    overflow: hidden;
    color: inherit;
    background-color: rgba(255, 255, 255, 0.97) !important;
    border: 0 !important;
    outline: 2px solid #615ced;
    outline-offset: 0;
    box-shadow: none !important;
    font-family: sans-serif;
    font-size: inherit;
    line-height: 1.35;
    resize: none;
  }

  html.light-note-mobile-rendering & {
    .drawing-page {
      border-color: #cfd2d9;
      box-shadow: 0 2px 8px rgba(31, 41, 55, 0.16);
    }

    .drawing-tool-button.is-active,
    .drawing-color-preset.is-active,
    .drawing-size-option.is-active {
      color: #615ced;
      border-color: #615ced !important;
      background: #eeedff;
    }
  }

  @media (max-width: 768px) {
    .drawing-editor {
      min-height: 0;
      height: 100%;
    }

    .drawing-toolbar {
      padding-inline: 8px;
    }

    .drawing-workspace {
      padding: 12px;
    }

    .drawing-color-panel,
    .drawing-size-panel {
      width: min(236px, calc(100vw - 24px));
    }
  }
</style>

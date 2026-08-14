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
      <BTooltip v-for="color in DRAWING_COLORS" :key="color" :title="t('note.drawingColor')">
        <BButton
          size="small"
          class="drawing-color-button"
          :class="{ 'is-active': activeColor === color }"
          :aria-label="t('note.drawingColor')"
          :aria-pressed="activeColor === color"
          @click="activeColor = color"
        >
          <span class="drawing-color-dot" :style="{ backgroundColor: color }" />
        </BButton>
      </BTooltip>
      <BButton size="small" class="drawing-value-button" @click="cycleStrokeWidth"> {{ strokeWidth }} px </BButton>
      <BButton size="small" class="drawing-value-button" @click="cycleFontSize"> {{ fontSize }} px </BButton>

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
      <BTooltip :title="t('note.drawingExportPng')">
        <BButton size="small" class="drawing-tool-button" :aria-label="t('note.drawingExportPng')" @click="exportPng">
          <SvgIcon :src="icon.noteDetail.diagramTools.download" size="17" aria-hidden="true" />
          <span class="drawing-export-label">PNG</span>
        </BButton>
      </BTooltip>
      <BTooltip :title="t('note.drawingExportJson')">
        <BButton size="small" class="drawing-tool-button" :aria-label="t('note.drawingExportJson')" @click="exportJson">
          <SvgIcon :src="icon.noteDetail.diagramTools.download" size="17" aria-hidden="true" />
          <span class="drawing-export-label">JSON</span>
        </BButton>
      </BTooltip>
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
    DRAWING_FONT_SIZES,
    DRAWING_PAGE,
    DRAWING_SCENE_LIMITS,
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
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';
  import { buildExportFileName, deliverGeneratedFile } from '@/utils/fileDelivery';
  import { isLightNoteAndroidApp } from '@/utils/androidBridge';
  import { deliverExportViaAndroidBridge } from '@/utils/androidFileExport';

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
  const selectedId = ref('');
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
  const ZOOM_LEVELS = [0.35, 0.5, 0.75, 1, 1.25, 1.5] as const;
  const zoomIndex = ref(3);
  const readonlyFitZoom = ref(1);
  const zoom = computed(() => (props.readonly ? readonlyFitZoom.value : ZOOM_LEVELS[zoomIndex.value]));
  const HISTORY_MAX_STATES = 20;
  const HISTORY_MAX_CHARS = 8_000_000;
  const TEXT_DRAG_THRESHOLD_PX = 4;
  const DRAWING_TEXT_LINE_HEIGHT = 1.35;

  const tools = computed(() => [
    { key: 'pen' as const, label: t('note.drawingPen'), icon: icon.drawingNote.pen },
    { key: 'eraser' as const, label: t('note.drawingEraser'), icon: icon.drawingNote.eraser },
    { key: 'text' as const, label: t('note.drawingText'), icon: icon.drawingNote.text },
    { key: 'select' as const, label: t('note.drawingSelect'), icon: icon.drawingNote.select },
    { key: 'hand' as const, label: t('note.drawingHand'), icon: icon.drawingNote.hand },
  ]);

  let activePointerId: number | null = null;
  let activeCanvasRect: DOMRect | null = null;
  let activeStroke: DrawingStrokeElement | null = null;
  let activeStrokeMaxPairs = 0;
  let mutationSnapshot = '';
  let eraserChanged = false;
  const erasedElementIds = new Set<string>();
  let dragStart: { x: number; y: number; element: DrawingElement } | null = null;
  let dragPreview: DrawingElement | null = null;
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

  function cycleValue<T>(values: readonly T[], value: T) {
    return values[(values.indexOf(value) + 1) % values.length];
  }

  function cycleStrokeWidth() {
    strokeWidth.value = cycleValue(DRAWING_STROKE_WIDTHS, strokeWidth.value);
  }

  function cycleFontSize() {
    fontSize.value = cycleValue(DRAWING_FONT_SIZES, fontSize.value);
  }

  function changeZoom(delta: number) {
    zoomIndex.value = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, zoomIndex.value + delta));
    nextTick(resizeCanvas);
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
    target.elements.forEach((element) => {
      // 编辑框已经承载同一文本；画布暂时隐藏原元素，避免视觉上叠成两份。
      if (!erasedElementIds.has(element.id) && textDraft.value?.id !== element.id) {
        paintElement(context, dragPreview?.id === element.id ? dragPreview : element);
      }
    });
    if (activeStroke) paintElement(context, activeStroke);
    if (showSelection && selectedId.value && textDraft.value?.id !== selectedId.value) {
      const selected =
        dragPreview?.id === selectedId.value
          ? dragPreview
          : target.elements.find((element) => element.id === selectedId.value);
      if (selected) {
        const bounds = elementBounds(context, selected);
        context.save();
        context.strokeStyle = '#615ced';
        context.lineWidth = 1.5;
        context.setLineDash([6, 4]);
        context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        context.restore();
      }
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
      if (erasedElementIds.has(element.id)) continue;
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
    const hit = hitElement(point);
    if (!hit) return;
    erasedElementIds.add(hit.id);
    if (selectedId.value === hit.id) selectedId.value = '';
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
      erasedElementIds.clear();
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
    const shouldEditSelectedText = hit?.kind === 'text' && hit.id === selectedId.value;
    selectedId.value = hit?.id || '';
    if (hit) {
      beginMutation();
      dragStart = {
        x: point.x,
        y: point.y,
        element: hit.kind === 'stroke' ? { ...hit, points: [...hit.points] } : { ...hit },
      };
      dragPreview = dragStart.element;
      editSelectedTextOnRelease = shouldEditSelectedText;
    }
    scheduleDraw();
  }

  function handlePointerMove(event: PointerEvent) {
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
    const point = canvasPoint(event);
    if (tool.value === 'eraser') {
      eraseAt(point);
      return;
    }
    if (dragStart && selectedId.value) {
      const dx = point.x - dragStart.x;
      const dy = point.y - dragStart.y;
      if (editSelectedTextOnRelease && Math.hypot(dx, dy) * zoom.value >= TEXT_DRAG_THRESHOLD_PX) {
        editSelectedTextOnRelease = false;
      }
      const original = dragStart.element;
      const moved: DrawingElement =
        original.kind === 'text'
          ? { ...original, x: original.x + dx, y: original.y + dy }
          : { ...original, points: original.points.map((value, index) => value + (index % 2 === 0 ? dx : dy)) };
      dragPreview = moved;
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
    } else if (dragStart && dragPreview) {
      if (editSelectedTextOnRelease && dragStart.element.kind === 'text') {
        mutationSnapshot = '';
        textDraft.value = { ...dragStart.element };
        nextTick(() => textInputRef.value?.focus?.());
      } else {
        scene.value = {
          ...scene.value,
          elements: scene.value.elements.map((element) => (element.id === dragPreview?.id ? dragPreview : element)),
        };
        emitScene();
      }
    } else if (tool.value === 'eraser' && eraserChanged) {
      scene.value = {
        ...scene.value,
        elements: scene.value.elements.filter((element) => !erasedElementIds.has(element.id)),
      };
      emitScene();
    } else {
      mutationSnapshot = '';
    }
    eraserChanged = false;
    erasedElementIds.clear();
    dragStart = null;
    dragPreview = null;
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
    erasedElementIds.clear();
    dragStart = null;
    dragPreview = null;
    editSelectedTextOnRelease = false;
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
    selectedId.value = draft.id;
    textLayoutCache.clear();
    emitScene();
    scheduleDraw();
  }

  function applyHistory(serialized: string, targetStack: string[]) {
    targetStack.push(serializeDrawingScene(scene.value));
    trimHistory(targetStack);
    scene.value = parseDrawingScene(serialized);
    selectedId.value = '';
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

  function handleKeydown(event: KeyboardEvent) {
    if (props.readonly || textDraft.value) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const selected = scene.value.elements.find((element) => element.id === selectedId.value);
      if (!selected) return;
      event.preventDefault();
      beginMutation();
      scene.value = { ...scene.value, elements: scene.value.elements.filter((element) => element.id !== selected.id) };
      selectedId.value = '';
      emitScene();
      scheduleDraw();
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
        selectedId.value = '';
        erasedElementIds.clear();
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

  onMounted(() => {
    if (props.readonly) {
      fitReadonlyPage();
      if (typeof ResizeObserver !== 'undefined' && workspaceRef.value) {
        workspaceResizeObserver = new ResizeObserver(fitReadonlyPage);
        workspaceResizeObserver.observe(workspaceRef.value);
      }
    } else {
      const availableWidth = Math.max(320, (workspaceRef.value?.clientWidth || window.innerWidth) - 32);
      const preferred = Math.min(1, availableWidth / DRAWING_PAGE.width);
      zoomIndex.value = ZOOM_LEVELS.reduce(
        (best, value, index) => (Math.abs(value - preferred) < Math.abs(ZOOM_LEVELS[best] - preferred) ? index : best),
        0,
      );
      resizeCanvas();
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
    min-height: 560px;
    height: calc(100vh - 150px);
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
  .drawing-color-button.is-active {
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

  .drawing-export-label {
    font-size: 10px;
    font-weight: 700;
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
    .drawing-color-button.is-active {
      color: #615ced;
      border-color: #615ced !important;
      background: #eeedff;
    }
  }

  @media (max-width: 768px) {
    .drawing-editor {
      min-height: 480px;
      height: calc(100vh - 128px);
    }

    .drawing-toolbar {
      padding-inline: 8px;
    }

    .drawing-workspace {
      padding: 12px;
    }

    .drawing-export-label {
      display: none;
    }
  }
</style>

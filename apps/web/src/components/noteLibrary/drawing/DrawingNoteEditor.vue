<template>
  <div ref="rootRef" class="drawing-editor" :class="{ 'is-readonly': readonly }" tabindex="0" @keydown="handleKeydown">
    <div
      v-if="!readonly"
      ref="toolbarRef"
      class="drawing-toolbar"
      role="toolbar"
      :aria-label="t('note.drawingToolbar')"
      @pointerdown="handleToolbarPointerDown"
      @pointermove="handleToolbarPointerMove"
      @pointerup="finishToolbarPointerGesture"
      @pointercancel="finishToolbarPointerGesture"
      @click.capture="handleToolbarClickCapture"
    >
      <div ref="toolbarScrollRef" class="drawing-toolbar-scroll" @scroll.passive="syncToolbarScrollState">
        <template v-for="item in tools" :key="item.key">
          <BPopover
            v-if="item.key === 'shape'"
            v-model:open="shapePopoverOpen"
            trigger="click"
            placement="bottom-left"
            overlay-class-name="drawing-shape-popover"
            @open-change="(open) => open && switchDrawingTool('shape')"
          >
            <BTooltip :title="`${item.label}：${activeShapeLabel}`">
              <BButton
                size="small"
                class="drawing-tool-button"
                :class="{ 'is-active': tool === item.key }"
                :aria-label="`${item.label}：${activeShapeLabel}`"
                :aria-pressed="tool === item.key"
                @click="switchDrawingTool(item.key)"
              >
                <SvgIcon :src="item.icon" size="17" aria-hidden="true" />
              </BButton>
            </BTooltip>
            <template #content>
              <div class="drawing-shape-panel" role="list" :aria-label="t('note.drawingChooseShape')">
                <BButton
                  v-for="shape in shapeOptions"
                  :key="shape.key"
                  class="drawing-shape-option"
                  :class="{ 'is-active': activeShapeType === shape.key }"
                  :aria-label="shape.label"
                  :aria-pressed="activeShapeType === shape.key"
                  @click="rememberShapeType(shape.key)"
                >
                  <SvgIcon :src="shape.icon" size="20" aria-hidden="true" />
                  <span>{{ shape.label }}</span>
                </BButton>
              </div>
            </template>
          </BPopover>
          <BTooltip v-else :title="item.label">
            <BButton
              size="small"
              class="drawing-tool-button"
              :class="{ 'is-active': tool === item.key }"
              :aria-label="item.label"
              :aria-pressed="tool === item.key"
              @click="switchDrawingTool(item.key)"
            >
              <SvgIcon :src="item.icon" size="17" aria-hidden="true" />
            </BButton>
          </BTooltip>
        </template>

        <div v-if="isMobileLayout" class="drawing-toolbar-zoom-mobile" :aria-label="t('note.drawingZoom')">
          <BButton
            size="small"
            class="drawing-value-button"
            :disabled="zoomIndex === 0"
            :aria-label="t('note.drawingZoomOut')"
            @click="changeZoom(-1)"
          >
            <SvgIcon :src="icon.cloudSpace.preview.zoomOut" size="16" aria-hidden="true" />
          </BButton>
          <BButton
            size="small"
            class="drawing-mobile-zoom-value"
            :aria-label="t('note.drawingFitCanvas')"
            @click="fitEditablePage"
          >
            {{ Math.round(zoom * 100) }}%
          </BButton>
          <BButton
            size="small"
            class="drawing-value-button"
            :disabled="zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]"
            :aria-label="t('note.drawingZoomIn')"
            @click="changeZoom(1)"
          >
            <SvgIcon :src="icon.cloudSpace.preview.zoomIn" size="16" aria-hidden="true" />
          </BButton>
        </div>

        <span v-if="!isMobileLayout" class="drawing-toolbar-separator" aria-hidden="true" />
        <BPopover
          v-if="(showColorControl || showSizeControl) && !isMobileLayout"
          v-model:open="stylePopoverOpen"
          trigger="click"
          placement="bottom-left"
          overlay-class-name="drawing-style-popover"
        >
          <BTooltip :title="t('note.drawingStyle')">
            <BButton size="small" class="drawing-style-trigger" :aria-label="t('note.drawingStyle')">
              <SvgIcon :src="icon.drawingNote.style" size="16" aria-hidden="true" />
              <span v-if="showColorControl" class="drawing-color-dot" :style="{ backgroundColor: displayedColor }" />
              <span v-if="showSizeControl" class="drawing-style-size">{{ activeSize }}</span>
            </BButton>
          </BTooltip>
          <template #content>
            <DrawingStylePanel
              :active-color="displayedColor"
              :common-colors="DRAWING_COLORS"
              :palette-colors="DRAWING_PALETTE"
              :recent-colors="recentColors"
              :color-enabled="showColorControl"
              :size-enabled="showSizeControl"
              :active-size="activeSize"
              :size-label="activeSizeLabel"
              :size-options="activeSizeOptions"
              :size-range="activeSizeRange"
              @choose-color="selectColor"
              @choose-size="setActiveSize"
            />
          </template>
        </BPopover>
        <BTooltip :title="t('note.drawingClear')">
          <BButton
            size="small"
            class="drawing-tool-button drawing-clear-desktop"
            :disabled="!scene.elements.length"
            :aria-label="t('note.drawingClear')"
            @click="confirmClearDrawing"
          >
            <SvgIcon :src="icon.noteDetail.imageToolbar.delete" size="17" aria-hidden="true" />
          </BButton>
        </BTooltip>
      </div>

      <BButton
        v-if="isMobileLayout"
        v-show="toolbarCanScrollLeft || toolbarCanScrollRight"
        size="small"
        class="drawing-toolbar-more"
        :class="{ 'is-forward': toolbarCanScrollRight }"
        :aria-label="toolbarCanScrollRight ? t('note.drawingToolbarMoreTools') : t('note.drawingToolbarPreviousTools')"
        @click.stop="nudgeToolbarTools"
      >
        <SvgIcon :src="toolbarCanScrollRight ? icon.arrow_right : icon.arrow_left" size="16" aria-hidden="true" />
      </BButton>

      <div class="drawing-toolbar-history">
        <BTooltip v-if="isMobileLayout" :title="t('note.drawingStyle')">
          <BButton
            size="small"
            class="drawing-style-trigger drawing-style-trigger-mobile"
            :disabled="mobileStyleUsesFallback"
            :aria-label="t('note.drawingStyle')"
            @click="styleDrawerOpen = true"
          >
            <span
              v-if="showColorControl || mobileStyleUsesFallback"
              class="drawing-color-dot"
              :style="{ backgroundColor: mobileDisplayedColor }"
            />
            <span v-if="showSizeControl || mobileStyleUsesFallback" class="drawing-style-size">
              {{ mobileDisplayedSize }}
            </span>
          </BButton>
        </BTooltip>
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
        <BPopover
          v-model:open="helpPopoverOpen"
          trigger="click"
          placement="bottom-right"
          overlay-class-name="drawing-help-popover"
        >
          <BTooltip :title="isMobileLayout ? t('note.drawingTouchHelp') : t('note.drawingHelp')">
            <BButton
              size="small"
              class="drawing-tool-button drawing-help-button"
              :aria-label="isMobileLayout ? t('note.drawingTouchHelp') : t('note.drawingHelp')"
            >
              <SvgIcon :src="icon.drawingNote.help" size="17" aria-hidden="true" />
            </BButton>
          </BTooltip>
          <template #content>
            <div class="drawing-help-panel">
              <strong>{{ isMobileLayout ? t('note.drawingTouchHelpTitle') : t('note.drawingHelpTitle') }}</strong>
              <dl v-if="isMobileLayout">
                <div>
                  <dt>{{ t('note.drawingToolbarSwipe') }}</dt>
                  <dd>{{ t('note.drawingToolbarSwipeHint') }}</dd>
                </div>
                <div>
                  <dt>{{ t('note.drawingTouchPan') }}</dt>
                  <dd>{{ t('note.drawingTouchPanHint') }}</dd>
                </div>
                <div>
                  <dt>{{ t('note.drawingTouchPinch') }}</dt>
                  <dd>{{ t('note.drawingTouchPinchHint') }}</dd>
                </div>
                <div>
                  <dt>{{ t('note.drawingTouchZoomControl') }}</dt>
                  <dd>{{ t('note.drawingTouchZoomControlHint') }}</dd>
                </div>
              </dl>
              <dl v-else>
                <div
                  ><dt><kbd>P</kbd></dt
                  ><dd>{{ t('note.drawingPen') }}</dd></div
                >
                <div
                  ><dt><kbd>V</kbd></dt
                  ><dd>{{ t('note.drawingSelect') }}</dd></div
                >
                <div
                  ><dt><kbd>⌘/Ctrl Z</kbd></dt
                  ><dd>{{ t('note.drawingUndo') }}</dd></div
                >
                <div
                  ><dt><kbd>⌘/Ctrl ⇧ Z</kbd></dt
                  ><dd>{{ t('note.drawingRedo') }}</dd></div
                >
                <div
                  ><dt><kbd>⌘/Ctrl A</kbd></dt
                  ><dd>{{ t('note.drawingShortcutSelectAll') }}</dd></div
                >
                <div
                  ><dt><kbd>⌘/Ctrl C / V</kbd></dt
                  ><dd>{{ t('note.drawingShortcutCopyPaste') }}</dd></div
                >
                <div
                  ><dt><kbd>⌫ / Delete</kbd></dt
                  ><dd>{{ t('note.drawingShortcutDelete') }}</dd></div
                >
                <div
                  ><dt><kbd>Esc</kbd></dt
                  ><dd>{{ t('note.drawingShortcutCancel') }}</dd></div
                >
                <div
                  ><dt>{{ t('note.drawingMouseWheel') }}</dt
                  ><dd>{{ t('note.drawingShortcutZoom') }}</dd></div
                >
                <div
                  ><dt>{{ t('note.drawingHorizontalWheel') }}</dt
                  ><dd>{{ t('note.drawingShortcutHorizontalPan') }}</dd></div
                >
                <div
                  ><dt>{{ t('note.drawingMiddleRightMouse') }}</dt
                  ><dd>{{ t('note.drawingShortcutPan') }}</dd></div
                >
                <div
                  ><dt><kbd>Shift</kbd></dt
                  ><dd>{{ t('note.drawingShortcutConstrainShape') }}</dd></div
                >
              </dl>
              <BButton
                type="danger"
                size="small"
                class="drawing-help-clear"
                :disabled="!scene.elements.length"
                @click="
                  helpPopoverOpen = false;
                  confirmClearDrawing();
                "
              >
                {{ t('note.drawingClear') }}
              </BButton>
            </div>
          </template>
        </BPopover>
      </div>

      <div class="drawing-toolbar-zoom">
        <BButton
          size="small"
          class="drawing-value-button"
          :disabled="zoomIndex === 0"
          :aria-label="t('note.drawingZoomOut')"
          @click="changeZoom(-1)"
        >
          <SvgIcon :src="icon.cloudSpace.preview.zoomOut" size="16" aria-hidden="true" />
        </BButton>
        <span class="drawing-zoom-label">{{ Math.round(zoom * 100) }}%</span>
        <BButton
          size="small"
          class="drawing-value-button"
          :disabled="zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]"
          :aria-label="t('note.drawingZoomIn')"
          @click="changeZoom(1)"
        >
          <SvgIcon :src="icon.cloudSpace.preview.zoomIn" size="16" aria-hidden="true" />
        </BButton>
      </div>
    </div>

    <BDrawer
      :open="styleDrawerOpen"
      placement="bottom"
      height="min(78dvh, 680px)"
      :title="t('note.drawingStyle')"
      :mobile-centered-header="true"
      body-padding="12px"
      @close="styleDrawerOpen = false"
    >
      <DrawingStylePanel
        :active-color="displayedColor"
        :common-colors="DRAWING_COLORS"
        :palette-colors="DRAWING_PALETTE"
        :recent-colors="recentColors"
        :color-enabled="showColorControl"
        :size-enabled="showSizeControl"
        :active-size="activeSize"
        :size-label="activeSizeLabel"
        :size-options="activeSizeOptions"
        :size-range="activeSizeRange"
        @choose-color="selectColor"
        @choose-size="setActiveSize"
      />
    </BDrawer>

    <div ref="workspaceRef" class="drawing-workspace" @wheel="handleWheel">
      <div ref="pageRef" class="drawing-page" :style="pageStyle">
        <canvas
          ref="canvasRef"
          class="drawing-canvas"
          :class="[`is-tool-${tool}`, { 'is-panning': isPanning }]"
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
            @keydown="handleTextDraftKeydown"
            @focusout="commitTextDraft"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    DRAWING_COLORS,
    DRAWING_FONT_SIZE_RANGE,
    DRAWING_FONT_SIZES,
    DRAWING_PAGE,
    DRAWING_SCENE_LIMITS,
    DRAWING_SHAPE_TYPES,
    DRAWING_STROKE_WIDTH_RANGE,
    DRAWING_STROKE_WIDTHS,
    createEmptyDrawingScene,
    parseDrawingScene,
    serializeDrawingScene,
    upgradeDrawingScene,
    type DrawingColor,
    type DrawingElement,
    type DrawingFontSize,
    type DrawingScene,
    type DrawingShapeElement,
    type DrawingShapeType,
    type DrawingStrokeElement,
    type DrawingStrokeWidth,
    type DrawingTextElement,
  } from '@lightnote/shared/drawing-note';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import DrawingStylePanel from './DrawingStylePanel.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';
  import { buildExportFileName, deliverGeneratedFile } from '@/utils/fileDelivery';
  import { isLightNoteAndroidApp } from '@/utils/androidBridge';
  import { deliverExportViaAndroidBridge } from '@/utils/androidFileExport';
  import { eraseDrawingElementsAt, type DrawingPoint } from '@/utils/drawingEraser';
  import { getRootZoom } from '@/utils/zoom';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import {
    constrainDrawingShapeEnd,
    drawingShapeBounds,
    drawingShapeBox,
    paintDrawingShape,
  } from '@/utils/drawingShape';
  import {
    cloneDrawingElement,
    drawingRectsIntersect,
    normalizeDrawingRect,
    readDrawingClipboard,
    transformDrawingShapeErasures,
    translateDrawingElement,
    writeDrawingClipboard,
    type DrawingRect,
  } from '@/utils/drawingSelection';
  import { paintDrawingStroke } from '@/utils/drawingStroke';

  type DrawingTool = 'pen' | 'eraser' | 'text' | 'shape' | 'select' | 'hand';
  type ShapeResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'start' | 'end';

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
  const isMobileLayout = useMobileLayout();
  const activePinia = getCurrentInstance()?.appContext.config.globalProperties.$pinia as
    { state: { value: Record<string, unknown> } } | undefined;

  const rootRef = ref<HTMLElement | null>(null);
  const toolbarRef = ref<HTMLElement | null>(null);
  const toolbarScrollRef = ref<HTMLElement | null>(null);
  const workspaceRef = ref<HTMLElement | null>(null);
  const pageRef = ref<HTMLElement | null>(null);
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  const textInputRef = ref<{ focus?: () => void } | null>(null);
  const scene = shallowRef<DrawingScene>(createEmptyDrawingScene());
  const tool = ref<DrawingTool>('pen');
  const activeColor = ref<DrawingColor>(DRAWING_COLORS[0]);
  const strokeWidth = ref<DrawingStrokeWidth>(DRAWING_STROKE_WIDTHS[1]);
  const fontSize = ref<DrawingFontSize>(DRAWING_FONT_SIZES[0]);
  const DEFAULT_ERASER_SIZE = 18;
  const eraserSize = ref(DEFAULT_ERASER_SIZE);
  const activeShapeType = ref<DrawingShapeType>(readSavedShapeType());
  const selectedIds = ref<string[]>([]);
  const stylePopoverOpen = ref(false);
  const styleDrawerOpen = ref(false);
  const shapePopoverOpen = ref(false);
  const helpPopoverOpen = ref(false);
  const toolbarCanScrollLeft = ref(false);
  const toolbarCanScrollRight = ref(false);
  const recentColors = ref<DrawingColor[]>(readRecentColors());
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
  const ZOOM_LEVELS = [0.3, 0.35, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
  const editableZoom = ref(1);
  const readonlyFitZoom = ref(1);
  const zoom = computed(() => (props.readonly ? readonlyFitZoom.value : editableZoom.value));
  const zoomIndex = computed(() => {
    const exactIndex = ZOOM_LEVELS.findIndex((value) => value >= zoom.value - 0.0001);
    return exactIndex < 0 ? ZOOM_LEVELS.length - 1 : exactIndex;
  });
  const cameraX = ref(0);
  const cameraY = ref(0);
  const isPanning = ref(false);
  const pageStyle = computed(() => ({
    width: `${DRAWING_PAGE.width * zoom.value}px`,
    height: `${DRAWING_PAGE.height * zoom.value}px`,
    transform: props.readonly ? undefined : `translate3d(${cameraX.value}px, ${cameraY.value}px, 0)`,
  }));
  const HISTORY_MAX_STATES = 20;
  const HISTORY_MAX_CHARS = 8_000_000;
  const TEXT_DRAG_THRESHOLD_PX = 4;
  const MARQUEE_DRAG_THRESHOLD_PX = 3;
  const DRAWING_TEXT_LINE_HEIGHT = 1.35;
  const DRAWING_ERASER_SIZE_RANGE = Object.freeze({ min: 4, max: 64 });
  const DRAWING_ERASER_SIZES = Object.freeze([8, 18, 36]);
  const WHEEL_ZOOM_SENSITIVITY = 0.0015;
  const SHAPE_MIN_SIZE = 4;
  const SHAPE_HANDLE_RADIUS_PX = 6;
  const DRAWING_PALETTE = Object.freeze([
    '#7f1d1d',
    '#b91c1c',
    '#ef4444',
    '#fca5a5',
    '#7c2d12',
    '#c2410c',
    '#f97316',
    '#fdba74',
    '#713f12',
    '#ca8a04',
    '#facc15',
    '#fde047',
    '#14532d',
    '#15803d',
    '#22c55e',
    '#86efac',
    '#134e4a',
    '#0f766e',
    '#14b8a6',
    '#99f6e4',
    '#1e3a8a',
    '#1d4ed8',
    '#3b82f6',
    '#93c5fd',
    '#4c1d95',
    '#6d28d9',
    '#8b5cf6',
    '#c4b5fd',
    '#701a75',
    '#a21caf',
    '#d946ef',
    '#f0abfc',
  ] as DrawingColor[]);

  const tools = computed(() => [
    { key: 'pen' as const, label: t('note.drawingPen'), icon: icon.drawingNote.pen },
    { key: 'eraser' as const, label: t('note.drawingEraser'), icon: icon.drawingNote.eraser },
    { key: 'text' as const, label: t('note.drawingText'), icon: icon.drawingNote.text },
    { key: 'shape' as const, label: t('note.drawingShape'), icon: icon.drawingNote.shape },
    { key: 'select' as const, label: t('note.drawingSelect'), icon: icon.drawingNote.select },
    { key: 'hand' as const, label: t('note.drawingHand'), icon: icon.drawingNote.hand },
  ]);
  const shapeOptions = computed(() => [
    { key: 'line' as const, label: t('note.drawingShapeLine'), icon: icon.drawingNote.shapeTypes.line },
    { key: 'arrow' as const, label: t('note.drawingShapeArrow'), icon: icon.drawingNote.shapeTypes.arrow },
    { key: 'rectangle' as const, label: t('note.drawingShapeRectangle'), icon: icon.drawingNote.shapeTypes.rectangle },
    {
      key: 'rounded-rectangle' as const,
      label: t('note.drawingShapeRoundedRectangle'),
      icon: icon.drawingNote.shapeTypes.roundedRectangle,
    },
    { key: 'ellipse' as const, label: t('note.drawingShapeEllipse'), icon: icon.drawingNote.shapeTypes.ellipse },
    { key: 'triangle' as const, label: t('note.drawingShapeTriangle'), icon: icon.drawingNote.shapeTypes.triangle },
    { key: 'diamond' as const, label: t('note.drawingShapeDiamond'), icon: icon.drawingNote.shapeTypes.diamond },
  ]);
  const activeShapeLabel = computed(
    () => shapeOptions.value.find((shape) => shape.key === activeShapeType.value)?.label || t('note.drawingShape'),
  );
  const showSizeControl = computed(
    () =>
      tool.value === 'pen' ||
      tool.value === 'eraser' ||
      tool.value === 'text' ||
      tool.value === 'shape' ||
      (tool.value === 'select' && selectedIds.value.length > 0),
  );
  const showColorControl = computed(
    () => tool.value !== 'eraser' && tool.value !== 'hand' && (tool.value !== 'select' || selectedIds.value.length > 0),
  );
  const activeSize = computed(() => {
    if (tool.value === 'text') return fontSize.value;
    if (tool.value === 'eraser') return eraserSize.value;
    if (tool.value === 'select') {
      const first = selectedElements()[0];
      if (first?.kind === 'text') return first.fontSize;
      if (first?.kind === 'shape') return first.strokeWidth;
      if (first?.kind === 'stroke') return first.width;
    }
    return strokeWidth.value;
  });
  const activeSizeLabel = computed(() => {
    if (tool.value === 'text') return t('note.drawingTextSize');
    if (tool.value === 'eraser') return t('note.drawingEraserSize');
    if (tool.value === 'select' && selectedElements()[0]?.kind === 'text') return t('note.drawingTextSize');
    return t('note.drawingStrokeSize');
  });
  const activeSizeOptions = computed<readonly number[]>(() => {
    if (tool.value === 'text' || (tool.value === 'select' && selectedElements()[0]?.kind === 'text')) {
      return DRAWING_FONT_SIZES;
    }
    if (tool.value === 'eraser') return DRAWING_ERASER_SIZES;
    return DRAWING_STROKE_WIDTHS;
  });
  const activeSizeRange = computed(() => {
    if (tool.value === 'text' || (tool.value === 'select' && selectedElements()[0]?.kind === 'text')) {
      return DRAWING_FONT_SIZE_RANGE;
    }
    if (tool.value === 'eraser') return DRAWING_ERASER_SIZE_RANGE;
    return DRAWING_STROKE_WIDTH_RANGE;
  });
  const displayedColor = computed(() => {
    if (tool.value === 'select') return selectedElements()[0]?.color || activeColor.value;
    return activeColor.value;
  });
  const mobileStyleUsesFallback = computed(() => !showColorControl.value && !showSizeControl.value);
  const mobileDisplayedColor = computed(() =>
    mobileStyleUsesFallback.value ? activeColor.value : displayedColor.value,
  );
  const mobileDisplayedSize = computed(() => (mobileStyleUsesFallback.value ? strokeWidth.value : activeSize.value));

  let activePointerId: number | null = null;
  let activeCanvasRect: DOMRect | null = null;
  let activeStroke: DrawingStrokeElement | null = null;
  let activeShape: DrawingShapeElement | null = null;
  let activeStrokeMaxPairs = 0;
  let mutationSnapshot = '';
  let eraserChanged = false;
  let eraserLimitReached = false;
  let eraserPreviewElements: DrawingElement[] | null = null;
  let activeErasureId = '';
  let eraserCursorPoint: DrawingPoint | null = null;
  let dragStart: {
    x: number;
    y: number;
    elements: DrawingElement[];
    elementsById: Map<string, DrawingElement>;
    dx: number;
    dy: number;
  } | null = null;
  let resizeStart: {
    element: DrawingShapeElement;
    handle: ShapeResizeHandle;
    anchor: DrawingPoint;
    current: DrawingPoint;
    start: DrawingPoint;
    constrained: boolean;
  } | null = null;
  let marqueeSelection: { start: DrawingPoint; current: DrawingPoint; baseIds: string[] } | null = null;
  let editSelectedTextOnRelease = false;
  let panStart: { x: number; y: number; cameraX: number; cameraY: number } | null = null;
  const handTouchPoints = new Map<number, DrawingPoint>();
  let pinchStart: {
    distance: number;
    zoom: number;
    cameraX: number;
    cameraY: number;
    documentX: number;
    documentY: number;
  } | null = null;
  let toolbarPointerGesture: {
    pointerId: number;
    x: number;
    y: number;
    scrollLeft: number;
    moved: boolean;
  } | null = null;
  let suppressToolbarClick = false;
  let workspaceResizeObserver: ResizeObserver | null = null;
  let toolbarResizeObserver: ResizeObserver | null = null;
  let frameId = 0;
  let zoomResizeFrame = 0;
  let toolbarClickResetFrame = 0;
  let lastEmittedContent = '';
  const textLayoutCache = new Map<string, string[]>();
  const elementBoundsCache = new WeakMap<DrawingElement, { x: number; y: number; width: number; height: number }>();

  function drawingPreferenceKey(name: string) {
    const userId = (activePinia?.state.value.user as { id?: string } | undefined)?.id || 'visitor';
    return `light-note:drawing:${userId}:${name}`;
  }

  function readSavedShapeType(): DrawingShapeType {
    try {
      const value = localStorage.getItem(drawingPreferenceKey('shape')) as DrawingShapeType | null;
      return value && DRAWING_SHAPE_TYPES.includes(value) ? value : 'line';
    } catch {
      return 'line';
    }
  }

  function readRecentColors(): DrawingColor[] {
    try {
      const value = JSON.parse(localStorage.getItem(drawingPreferenceKey('recent-colors')) || '[]');
      return Array.isArray(value)
        ? value.filter((color): color is DrawingColor => /^#[0-9a-f]{6}$/iu.test(String(color))).slice(0, 6)
        : [];
    } catch {
      return [];
    }
  }

  function rememberShapeType(shape: DrawingShapeType) {
    activeShapeType.value = shape;
    switchDrawingTool('shape');
    shapePopoverOpen.value = false;
    try {
      localStorage.setItem(drawingPreferenceKey('shape'), shape);
    } catch {
      // 隐私模式或存储配额不足时，仅保留当前编辑会话内的选择。
    }
  }

  function rememberColor(color: DrawingColor) {
    recentColors.value = [color, ...recentColors.value.filter((item) => item !== color)].slice(0, 6);
    try {
      localStorage.setItem(drawingPreferenceKey('recent-colors'), JSON.stringify(recentColors.value));
    } catch {
      // 最近颜色是可选偏好，存储失败不影响绘画。
    }
  }

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
    if (resizeStart && element.id === resizeStart.element.id) return resizedShapePreview() || element;
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

  function pointInRect(point: DrawingPoint, rect: DrawingRect) {
    return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
  }

  function shapeResizeHandles(element: DrawingShapeElement) {
    if (element.shape === 'line' || element.shape === 'arrow') {
      return [
        { handle: 'start' as const, point: { x: element.x, y: element.y } },
        { handle: 'end' as const, point: { x: element.x + element.width, y: element.y + element.height } },
      ];
    }
    const box = drawingShapeBox(element);
    return [
      { handle: 'nw' as const, point: { x: box.x, y: box.y } },
      { handle: 'ne' as const, point: { x: box.x + box.width, y: box.y } },
      { handle: 'sw' as const, point: { x: box.x, y: box.y + box.height } },
      { handle: 'se' as const, point: { x: box.x + box.width, y: box.y + box.height } },
    ];
  }

  function oppositeShapeAnchor(element: DrawingShapeElement, handle: ShapeResizeHandle) {
    if (handle === 'start') return { x: element.x + element.width, y: element.y + element.height };
    if (handle === 'end') return { x: element.x, y: element.y };
    const box = drawingShapeBox(element);
    if (handle === 'nw') return { x: box.x + box.width, y: box.y + box.height };
    if (handle === 'ne') return { x: box.x, y: box.y + box.height };
    if (handle === 'sw') return { x: box.x + box.width, y: box.y };
    return { x: box.x, y: box.y };
  }

  function hitShapeResizeHandle(point: DrawingPoint) {
    const selected = selectedElements();
    if (selected.length !== 1 || selected[0].kind !== 'shape') return null;
    const radius = (SHAPE_HANDLE_RADIUS_PX + 4) / Math.max(zoom.value, 0.01);
    return (
      shapeResizeHandles(selected[0]).find(
        (item) => Math.hypot(point.x - item.point.x, point.y - item.point.y) <= radius,
      ) || null
    );
  }

  function resizedShapePreview() {
    if (!resizeStart) return null;
    const original = resizeStart.element;
    let current = resizeStart.current;
    if (resizeStart.constrained) {
      current = constrainDrawingShapeEnd(
        { ...original, x: resizeStart.anchor.x, y: resizeStart.anchor.y },
        current,
        true,
      );
    }
    current = clampShapeEnd(resizeStart.anchor, current);
    if (resizeStart.handle === 'start') {
      return transformDrawingShapeErasures(original, {
        ...original,
        x: current.x,
        y: current.y,
        width: resizeStart.anchor.x - current.x,
        height: resizeStart.anchor.y - current.y,
      });
    }
    return transformDrawingShapeErasures(original, {
      ...original,
      x: resizeStart.anchor.x,
      y: resizeStart.anchor.y,
      width: current.x - resizeStart.anchor.x,
      height: current.y - resizeStart.anchor.y,
    });
  }

  function clampShapeEnd(start: DrawingPoint, end: DrawingPoint) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let scale = 1;
    if (dx > 0) scale = Math.min(scale, (DRAWING_PAGE.width - start.x) / dx);
    if (dx < 0) scale = Math.min(scale, -start.x / dx);
    if (dy > 0) scale = Math.min(scale, (DRAWING_PAGE.height - start.y) / dy);
    if (dy < 0) scale = Math.min(scale, -start.y / dy);
    return { x: start.x + dx * scale, y: start.y + dy * scale };
  }

  function setActiveSize(size: number) {
    const range = activeSizeRange.value;
    const normalized = Math.max(range.min, Math.min(range.max, Math.round(size)));
    if (tool.value === 'select' && selectedIds.value.length) {
      const firstKind = selectedElements()[0]?.kind;
      beginMutation();
      scene.value = {
        ...scene.value,
        elements: scene.value.elements.map((element) => {
          const sameSizeFamily = firstKind === 'text' ? element.kind === 'text' : element.kind !== 'text';
          if (!selectedIds.value.includes(element.id) || !sameSizeFamily) return element;
          if (element.kind === 'text') return { ...element, fontSize: normalized };
          if (element.kind === 'shape') return { ...element, strokeWidth: normalized };
          return { ...element, width: normalized };
        }),
      };
      emitScene();
      scheduleDraw();
      return;
    }
    if (tool.value === 'text') {
      fontSize.value = normalized;
      return;
    }
    if (tool.value === 'eraser') eraserSize.value = normalized;
    else strokeWidth.value = normalized;
  }

  function selectColor(color: DrawingColor) {
    const normalized = color.toLowerCase();
    if (!/^#[0-9a-f]{6}$/u.test(normalized)) return;
    rememberColor(normalized);
    if (tool.value === 'select' && selectedIds.value.length) {
      beginMutation();
      const ids = new Set(selectedIds.value);
      scene.value = {
        ...scene.value,
        elements: scene.value.elements.map((element) =>
          ids.has(element.id) ? { ...element, color: normalized } : element,
        ),
      };
      emitScene();
      scheduleDraw();
      return;
    }
    activeColor.value = normalized;
  }

  function syncToolbarScrollState() {
    const toolbar = toolbarScrollRef.value;
    if (!toolbar || !isMobileLayout.value) {
      toolbarCanScrollLeft.value = false;
      toolbarCanScrollRight.value = false;
      return;
    }
    const maxScrollLeft = Math.max(0, toolbar.scrollWidth - toolbar.clientWidth);
    toolbarCanScrollLeft.value = toolbar.scrollLeft > 2;
    toolbarCanScrollRight.value = toolbar.scrollLeft < maxScrollLeft - 2;
  }

  function nudgeToolbarTools() {
    const toolbar = toolbarScrollRef.value;
    if (!toolbar) return;
    const direction = toolbarCanScrollRight.value ? 1 : -1;
    const maxScrollLeft = Math.max(0, toolbar.scrollWidth - toolbar.clientWidth);
    const nextScrollLeft = Math.min(
      maxScrollLeft,
      Math.max(0, toolbar.scrollLeft + direction * Math.max(96, toolbar.clientWidth * 0.72)),
    );
    toolbar.scrollLeft = nextScrollLeft;
    syncToolbarScrollState();
  }

  function handleToolbarPointerDown(event: PointerEvent) {
    const toolbar = toolbarScrollRef.value;
    if (!isMobileLayout.value || event.pointerType !== 'touch' || !toolbar) return;
    if (toolbar.scrollWidth <= toolbar.clientWidth + 2) return;
    toolbarPointerGesture = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: toolbar.scrollLeft,
      moved: false,
    };
  }

  function handleToolbarPointerMove(event: PointerEvent) {
    const gesture = toolbarPointerGesture;
    const toolbar = toolbarScrollRef.value;
    if (!gesture || !toolbar || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.moved) {
      if (Math.abs(dx) < 7 || Math.abs(dx) <= Math.abs(dy)) return;
      gesture.moved = true;
      toolbarRef.value?.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    toolbar.scrollLeft = gesture.scrollLeft - dx;
    syncToolbarScrollState();
  }

  function finishToolbarPointerGesture(event: PointerEvent) {
    const gesture = toolbarPointerGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.moved) suppressToolbarClick = true;
    if (gesture.moved) {
      try {
        toolbarRef.value?.releasePointerCapture(event.pointerId);
      } catch {
        // 纵向页面滚动可能先触发 pointercancel，捕获已释放时只清理本地状态。
      }
    }
    toolbarPointerGesture = null;
    syncToolbarScrollState();
    if (toolbarClickResetFrame) cancelAnimationFrame(toolbarClickResetFrame);
    toolbarClickResetFrame = requestAnimationFrame(() => {
      toolbarClickResetFrame = 0;
      suppressToolbarClick = false;
    });
  }

  function handleToolbarClickCapture(event: MouseEvent) {
    if (!suppressToolbarClick) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function changeZoom(delta: number) {
    const next =
      delta > 0
        ? ZOOM_LEVELS.find((value) => value > zoom.value + 0.0001) || ZOOM_LEVELS[ZOOM_LEVELS.length - 1]
        : [...ZOOM_LEVELS].reverse().find((value) => value < zoom.value - 0.0001) || ZOOM_LEVELS[0];
    setEditableZoom(next);
    scheduleCanvasResize();
  }

  function scheduleCanvasResize() {
    if (zoomResizeFrame) return;
    zoomResizeFrame = requestAnimationFrame(() => {
      zoomResizeFrame = 0;
      resizeCanvas();
    });
  }

  function workspaceContentSize() {
    const workspace = workspaceRef.value;
    if (!workspace) return { width: 1, height: 1 };
    const style = getComputedStyle(workspace);
    return {
      width: Math.max(
        1,
        workspace.clientWidth -
          (Number.parseFloat(style.paddingLeft) || 0) -
          (Number.parseFloat(style.paddingRight) || 0),
      ),
      height: Math.max(
        1,
        workspace.clientHeight -
          (Number.parseFloat(style.paddingTop) || 0) -
          (Number.parseFloat(style.paddingBottom) || 0),
      ),
    };
  }

  function workspacePointFromClient(clientX: number, clientY: number) {
    const workspace = workspaceRef.value;
    if (!workspace) return { x: 0, y: 0 };
    const style = getComputedStyle(workspace);
    const rect = workspace.getBoundingClientRect();
    const rootZoom = getRootZoom();
    return {
      x: (clientX - rect.left) / rootZoom - (Number.parseFloat(style.paddingLeft) || 0),
      y: (clientY - rect.top) / rootZoom - (Number.parseFloat(style.paddingTop) || 0),
    };
  }

  function centerCamera() {
    if (props.readonly) return;
    const size = workspaceContentSize();
    cameraX.value = (size.width - DRAWING_PAGE.width * zoom.value) / 2;
    cameraY.value = (size.height - DRAWING_PAGE.height * zoom.value) / 2;
  }

  function clampCamera() {
    if (props.readonly) return;
    const size = workspaceContentSize();
    const pageWidth = DRAWING_PAGE.width * zoom.value;
    const pageHeight = DRAWING_PAGE.height * zoom.value;
    const visibleMargin = 56;
    cameraX.value =
      pageWidth <= size.width
        ? (size.width - pageWidth) / 2
        : Math.max(size.width - pageWidth - visibleMargin, Math.min(visibleMargin, cameraX.value));
    cameraY.value =
      pageHeight <= size.height
        ? (size.height - pageHeight) / 2
        : Math.max(size.height - pageHeight - visibleMargin, Math.min(visibleMargin, cameraY.value));
  }

  function setEditableZoom(nextZoom: number, anchor?: DrawingPoint) {
    if (props.readonly) return;
    const size = workspaceContentSize();
    const anchorX = anchor?.x ?? size.width / 2;
    const anchorY = anchor?.y ?? size.height / 2;
    const oldZoom = Math.max(0.01, editableZoom.value);
    const documentX = (anchorX - cameraX.value) / oldZoom;
    const documentY = (anchorY - cameraY.value) / oldZoom;
    editableZoom.value = Math.max(ZOOM_LEVELS[0], Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], nextZoom));
    cameraX.value = anchorX - documentX * editableZoom.value;
    cameraY.value = anchorY - documentY * editableZoom.value;
    clampCamera();
  }

  function normalizedWheelDelta(value: number, deltaMode: number, pageSize: number) {
    if (deltaMode === 1) return value * 16;
    if (deltaMode === 2) return value * pageSize;
    return value;
  }

  function handleWheel(event: WheelEvent) {
    const workspace = workspaceRef.value;
    if (props.readonly || !workspace) return;
    event.preventDefault();
    if (activePointerId !== null) return;
    rootRef.value?.focus({ preventScroll: true });
    const size = workspaceContentSize();
    const rootZoom = getRootZoom();
    const anchor = workspacePointFromClient(event.clientX, event.clientY);
    const rawDeltaX = normalizedWheelDelta(event.deltaX, event.deltaMode, size.width);
    const rawDeltaY = normalizedWheelDelta(event.deltaY, event.deltaMode, size.height);
    const horizontalDelta = event.shiftKey && Math.abs(rawDeltaX) < 0.01 ? rawDeltaY : rawDeltaX;
    const zoomDelta = event.shiftKey ? 0 : rawDeltaY;
    if (Math.abs(zoomDelta) >= 0.01) {
      const limitedDelta = Math.max(-240, Math.min(240, zoomDelta));
      setEditableZoom(editableZoom.value * Math.exp(-limitedDelta * WHEEL_ZOOM_SENSITIVITY), anchor);
      scheduleCanvasResize();
    }
    if (Math.abs(horizontalDelta) >= 0.01) {
      cameraX.value -= horizontalDelta / rootZoom;
      clampCamera();
    }
  }

  function fitEditablePage() {
    if (props.readonly) return;
    const size = workspaceContentSize();
    // 编辑态优先提供足够大的书写区域：宽屏保持 100%，窄屏才按可用宽度缩小。
    // 画纸高度超出视口时仍由相机居中，并通过手形工具平移查看，不引入原生滚动条。
    editableZoom.value = Math.min(1, size.width / DRAWING_PAGE.width);
    centerCamera();
    resizeCanvas();
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
    } else if (element.kind === 'shape') {
      bounds = drawingShapeBounds(element);
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

  function paintElement(context: CanvasRenderingContext2D, element: DrawingElement, scale: number) {
    if (element.kind === 'stroke') {
      paintDrawingStroke(context, element, scale);
      return;
    }
    if (element.kind === 'shape') {
      paintDrawingShape(context, element, scale);
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
        paintElement(context, previewElement(element), scale);
      }
    });
    if (activeStroke) paintElement(context, activeStroke, scale);
    if (activeShape) paintElement(context, activeShape, scale);
    if (showSelection && tool.value === 'select') {
      const activeSelectedIds = new Set(marqueeSelectedIds(context, paintedElements));
      const selectedPreviewElements = paintedElements
        .filter((element) => activeSelectedIds.has(element.id) && textDraft.value?.id !== element.id)
        .map((element) => previewElement(element));
      const selectionBounds =
        !marqueeSelection && selectedPreviewElements.length > 1
          ? [unionElementBounds(context, selectedPreviewElements)].filter((bounds): bounds is DrawingRect =>
              Boolean(bounds),
            )
          : selectedPreviewElements.map((element) => elementBounds(context, element));
      selectionBounds.forEach((bounds) => {
        context.save();
        context.strokeStyle = '#615ced';
        context.lineWidth = 1.5;
        context.setLineDash([6, 4]);
        context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        context.restore();
      });
      if (!marqueeSelection && selectedPreviewElements.length === 1 && selectedPreviewElements[0].kind === 'shape') {
        shapeResizeHandles(selectedPreviewElements[0]).forEach(({ point }) => {
          context.save();
          context.beginPath();
          context.arc(point.x, point.y, SHAPE_HANDLE_RADIUS_PX / Math.max(zoom.value, 0.01), 0, Math.PI * 2);
          context.fillStyle = '#ffffff';
          context.strokeStyle = '#615ced';
          context.lineWidth = 1.5 / Math.max(zoom.value, 0.01);
          context.fill();
          context.stroke();
          context.restore();
        });
      }
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
    const nextWidth = Math.round(DRAWING_PAGE.width * ratio);
    const nextHeight = Math.round(DRAWING_PAGE.height * ratio);
    const backingStoreChanged = canvas.width !== nextWidth || canvas.height !== nextHeight;
    if (backingStoreChanged) {
      // 修改 width/height 会立即清空 Canvas；必须在同一任务内重绘，不能再延后一帧，否则连续滚轮缩放会暴露空白帧。
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    canvas.style.width = `${DRAWING_PAGE.width * zoom.value}px`;
    canvas.style.height = `${DRAWING_PAGE.height * zoom.value}px`;
    if (backingStoreChanged) draw();
    else scheduleDraw();
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
      const boundsPadding = element.kind === 'text' ? 6 : element.kind === 'shape' ? 6 : Math.max(8, element.width + 5);
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
      if (element.kind === 'shape') {
        const threshold = Math.max(8, element.strokeWidth + 5);
        if (element.shape === 'line' || element.shape === 'arrow') {
          if (
            pointSegmentDistance(
              point.x,
              point.y,
              element.x,
              element.y,
              element.x + element.width,
              element.y + element.height,
            ) <= threshold
          ) {
            return element;
          }
        } else if (pointInRect(point, bounds)) {
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
    const result = eraseDrawingElementsAt(source, point, eraserSize.value, activeErasureId, {
      maxErasureTrails: DRAWING_SCENE_LIMITS.maxErasureTrails,
      maxErasurePointPairs: DRAWING_SCENE_LIMITS.maxErasurePointPairs,
    });
    if (result.limitReached) eraserLimitReached = true;
    if (!result.changed) return;
    eraserPreviewElements = result.elements;
    selectedIds.value = [];
    eraserChanged = true;
    scheduleDraw();
  }

  function handTouchPair() {
    const points = Array.from(handTouchPoints.values());
    if (points.length < 2) return null;
    const [first, second] = points;
    return {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    };
  }

  function handleHandTouchPointerDown(event: PointerEvent) {
    if (tool.value !== 'hand' || event.pointerType !== 'touch') return false;
    if (handTouchPoints.size >= 2 && !handTouchPoints.has(event.pointerId)) {
      event.preventDefault();
      return true;
    }
    event.preventDefault();
    rootRef.value?.focus({ preventScroll: true });
    handTouchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvasRef.value?.setPointerCapture(event.pointerId);
    eraserCursorPoint = null;
    isPanning.value = true;
    if (handTouchPoints.size === 1) {
      activePointerId = event.pointerId;
      panStart = { x: event.clientX, y: event.clientY, cameraX: cameraX.value, cameraY: cameraY.value };
      pinchStart = null;
      scheduleDraw();
      return true;
    }
    const pair = handTouchPair();
    if (!pair) return true;
    const anchor = workspacePointFromClient(pair.midpoint.x, pair.midpoint.y);
    const startZoom = Math.max(0.01, editableZoom.value);
    activePointerId = null;
    panStart = null;
    pinchStart = {
      distance: pair.distance,
      zoom: editableZoom.value,
      cameraX: cameraX.value,
      cameraY: cameraY.value,
      documentX: (anchor.x - cameraX.value) / startZoom,
      documentY: (anchor.y - cameraY.value) / startZoom,
    };
    return true;
  }

  function handleHandTouchPointerMove(event: PointerEvent) {
    if (!handTouchPoints.has(event.pointerId)) return false;
    event.preventDefault();
    handTouchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchStart && handTouchPoints.size >= 2) {
      const pair = handTouchPair();
      if (!pair) return true;
      const anchor = workspacePointFromClient(pair.midpoint.x, pair.midpoint.y);
      editableZoom.value = Math.max(
        ZOOM_LEVELS[0],
        Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], pinchStart.zoom * (pair.distance / pinchStart.distance)),
      );
      cameraX.value = anchor.x - pinchStart.documentX * editableZoom.value;
      cameraY.value = anchor.y - pinchStart.documentY * editableZoom.value;
      clampCamera();
      scheduleCanvasResize();
      return true;
    }
    if (panStart && handTouchPoints.size === 1) {
      cameraX.value = panStart.cameraX + (event.clientX - panStart.x);
      cameraY.value = panStart.cameraY + (event.clientY - panStart.y);
      clampCamera();
    }
    return true;
  }

  function finishHandTouchPointer(event: PointerEvent) {
    if (!handTouchPoints.has(event.pointerId)) return false;
    try {
      canvasRef.value?.releasePointerCapture(event.pointerId);
    } catch {
      // 系统手势可能先释放指针捕获；本地触控状态仍需结束。
    }
    handTouchPoints.delete(event.pointerId);
    pinchStart = null;
    const remaining = Array.from(handTouchPoints.entries())[0];
    if (remaining) {
      const [pointerId, point] = remaining;
      activePointerId = pointerId;
      panStart = { x: point.x, y: point.y, cameraX: cameraX.value, cameraY: cameraY.value };
      isPanning.value = true;
    } else {
      activePointerId = null;
      activeCanvasRect = null;
      panStart = null;
      isPanning.value = false;
    }
    scheduleDraw();
    return true;
  }

  function handlePointerDown(event: PointerEvent) {
    const isDirectPanButton = event.button === 1 || event.button === 2;
    if (props.readonly || textDraft.value) return;
    if (handleHandTouchPointerDown(event)) return;
    if (activePointerId !== null || (!isDirectPanButton && event.button !== 0)) return;
    rootRef.value?.focus({ preventScroll: true });
    activePointerId = event.pointerId;
    canvasRef.value?.setPointerCapture(event.pointerId);
    activeCanvasRect = canvasRef.value?.getBoundingClientRect() || null;
    const point = canvasPoint(event);
    if (isDirectPanButton || tool.value === 'hand') {
      event.preventDefault();
      const workspace = workspaceRef.value;
      if (workspace) {
        panStart = { x: event.clientX, y: event.clientY, cameraX: cameraX.value, cameraY: cameraY.value };
        isPanning.value = true;
        eraserCursorPoint = null;
        scheduleDraw();
      }
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
      activeErasureId = createElementId();
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
    if (tool.value === 'shape') {
      if (
        scene.value.elements.length >= DRAWING_SCENE_LIMITS.maxElements ||
        scene.value.elements.filter((element) => element.kind === 'shape').length >= DRAWING_SCENE_LIMITS.maxShapes
      ) {
        message.warning(t('note.drawingLimitReached'));
        canvasRef.value?.releasePointerCapture(event.pointerId);
        activePointerId = null;
        activeCanvasRect = null;
        return;
      }
      beginMutation();
      selectedIds.value = [];
      activeShape = {
        id: createElementId(),
        kind: 'shape',
        shape: activeShapeType.value,
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        color: activeColor.value,
        strokeWidth: strokeWidth.value,
      };
      scheduleDraw();
      return;
    }
    const resizeHandle = hitShapeResizeHandle(point);
    if (resizeHandle) {
      const selected = selectedElements()[0] as DrawingShapeElement;
      beginMutation();
      resizeStart = {
        element: cloneDrawingElement(selected) as DrawingShapeElement,
        handle: resizeHandle.handle,
        anchor: oppositeShapeAnchor(selected, resizeHandle.handle),
        current: resizeHandle.point,
        start: resizeHandle.point,
        constrained: event.shiftKey,
      };
      scheduleDraw();
      return;
    }
    const hit = hitElement(point);
    const additiveSelection = event.shiftKey || event.metaKey || event.ctrlKey;
    const wasSelected = Boolean(hit && selectedIds.value.includes(hit.id));
    const shouldEditSelectedText =
      !additiveSelection && hit?.kind === 'text' && wasSelected && selectedIds.value.length === 1;
    const context = canvasRef.value?.getContext('2d');
    const selectedBounds =
      !additiveSelection && context && selectedIds.value.length
        ? unionElementBounds(context, selectedElements())
        : null;
    if (!hit && selectedBounds && pointInRect(point, selectedBounds)) {
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
      }
      scheduleDraw();
      return;
    }
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
    if (handleHandTouchPointerMove(event)) return;
    if (tool.value === 'eraser' && !panStart) {
      eraserCursorPoint = canvasPoint(event);
      scheduleDraw();
    }
    if (event.pointerId !== activePointerId) return;
    if (panStart && workspaceRef.value) {
      cameraX.value = panStart.cameraX + (event.clientX - panStart.x);
      cameraY.value = panStart.cameraY + (event.clientY - panStart.y);
      clampCamera();
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
    if (activeShape) {
      const end = clampShapeEnd(activeShape, constrainDrawingShapeEnd(activeShape, canvasPoint(event), event.shiftKey));
      activeShape.width = end.x - activeShape.x;
      activeShape.height = end.y - activeShape.y;
      scheduleDraw();
      return;
    }
    if (tool.value === 'eraser') {
      for (const sample of samples) eraseAt(canvasPoint(sample));
      return;
    }
    const point = canvasPoint(event);
    if (resizeStart) {
      resizeStart.current = point;
      resizeStart.constrained = event.shiftKey;
      scheduleDraw();
      return;
    }
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
    isPanning.value = false;
    return true;
  }

  function hasActiveGesture() {
    return Boolean(
      activePointerId !== null ||
      handTouchPoints.size > 0 ||
      pinchStart ||
      activeStroke ||
      activeShape ||
      mutationSnapshot ||
      eraserPreviewElements ||
      dragStart ||
      resizeStart ||
      marqueeSelection ||
      panStart,
    );
  }

  function switchDrawingTool(nextTool: DrawingTool) {
    if (hasActiveGesture()) return false;
    tool.value = nextTool;
    scheduleDraw();
    return true;
  }

  function cancelActiveGesture() {
    if (!hasActiveGesture()) return false;
    const cameraSnapshot = panStart;
    const pinchSnapshot = pinchStart;
    const pointerId = activePointerId;
    const pointerIds = new Set(handTouchPoints.keys());
    if (pointerId !== null) pointerIds.add(pointerId);
    for (const capturedPointerId of pointerIds) {
      try {
        canvasRef.value?.releasePointerCapture(capturedPointerId);
      } catch {
        // 指针捕获可能已由浏览器释放；仍需继续清理本地手势状态。
      }
    }
    if (mutationSnapshot) scene.value = parseDrawingScene(mutationSnapshot);
    if (cameraSnapshot) {
      cameraX.value = cameraSnapshot.cameraX;
      cameraY.value = cameraSnapshot.cameraY;
      clampCamera();
    } else if (pinchSnapshot) {
      editableZoom.value = pinchSnapshot.zoom;
      cameraX.value = pinchSnapshot.cameraX;
      cameraY.value = pinchSnapshot.cameraY;
      clampCamera();
      scheduleCanvasResize();
    }
    activePointerId = null;
    activeCanvasRect = null;
    handTouchPoints.clear();
    pinchStart = null;
    mutationSnapshot = '';
    activeStroke = null;
    activeShape = null;
    activeStrokeMaxPairs = 0;
    eraserChanged = false;
    eraserLimitReached = false;
    eraserPreviewElements = null;
    activeErasureId = '';
    dragStart = null;
    resizeStart = null;
    marqueeSelection = null;
    panStart = null;
    isPanning.value = false;
    editSelectedTextOnRelease = false;
    scheduleDraw();
    return true;
  }

  function handlePointerUp(event: PointerEvent) {
    if (finishHandTouchPointer(event)) return;
    if (!releasePointer(event)) return;
    if (activeStroke) {
      scene.value = { ...scene.value, elements: [...scene.value.elements, activeStroke] };
      activeStroke = null;
      activeStrokeMaxPairs = 0;
      emitScene();
    } else if (activeShape) {
      const isLinear = activeShape.shape === 'line' || activeShape.shape === 'arrow';
      const isLargeEnough = isLinear
        ? Math.hypot(activeShape.width, activeShape.height) >= SHAPE_MIN_SIZE
        : Math.abs(activeShape.width) >= SHAPE_MIN_SIZE && Math.abs(activeShape.height) >= SHAPE_MIN_SIZE;
      if (isLargeEnough) {
        scene.value = { ...scene.value, elements: [...scene.value.elements, activeShape] };
        emitScene();
      } else {
        mutationSnapshot = '';
      }
      activeShape = null;
    } else if (resizeStart) {
      const resized = resizedShapePreview();
      const movedEnough =
        Math.hypot(resizeStart.current.x - resizeStart.start.x, resizeStart.current.y - resizeStart.start.y) *
          zoom.value >=
        2;
      const isLinear = resized?.shape === 'line' || resized?.shape === 'arrow';
      const isLargeEnough = Boolean(
        resized &&
        (isLinear
          ? Math.hypot(resized.width, resized.height) >= SHAPE_MIN_SIZE
          : Math.abs(resized.width) >= SHAPE_MIN_SIZE && Math.abs(resized.height) >= SHAPE_MIN_SIZE),
      );
      if (resized && isLargeEnough && movedEnough) {
        scene.value = {
          ...scene.value,
          elements: scene.value.elements.map((element) => (element.id === resized.id ? resized : element)),
        };
        emitScene();
      } else {
        mutationSnapshot = '';
      }
      resizeStart = null;
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
    activeErasureId = '';
    dragStart = null;
    resizeStart = null;
    marqueeSelection = null;
    editSelectedTextOnRelease = false;
    scheduleDraw();
  }

  function handlePointerCancel(event: PointerEvent) {
    if (finishHandTouchPointer(event)) return;
    if (event.pointerId !== activePointerId) return;
    cancelActiveGesture();
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
    if (tool.value === 'select') setSelectedIds([draft.id]);
    else selectedIds.value = [];
    textLayoutCache.clear();
    emitScene();
    scheduleDraw();
  }

  function cancelTextDraft(event: KeyboardEvent) {
    if (!textDraft.value || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    event.stopPropagation();
    const draftId = textDraft.value.id;
    textDraft.value = null;
    if (tool.value === 'select' && scene.value.elements.some((element) => element.id === draftId)) {
      setSelectedIds([draftId]);
    } else {
      selectedIds.value = [];
    }
    scheduleDraw();
    void nextTick(() => rootRef.value?.focus({ preventScroll: true }));
  }

  function handleTextDraftKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') cancelTextDraft(event);
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
    // pointerup 前的笔画/擦除/拖动尚未进入 scene，撤销必须先取消这次临时手势，不能误删上一条已提交历史。
    if (cancelActiveGesture()) return;
    const previous = undoStack.value.pop();
    if (previous) applyHistory(previous, redoStack.value);
  }

  function redo() {
    // 临时手势仍在进行时不允许切换已提交历史，否则松开指针会把手势追加到错误的 scene。
    if (hasActiveGesture()) return;
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
    else switchDrawingTool('select');
    scheduleDraw();
  }

  function clearDrawing() {
    if (!scene.value.elements.length) return;
    beginMutation();
    scene.value = { ...scene.value, elements: [] };
    selectedIds.value = [];
    textDraft.value = null;
    eraserPreviewElements = null;
    activeShape = null;
    dragStart = null;
    resizeStart = null;
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
    if (props.readonly || textDraft.value || event.isComposing || event.keyCode === 229) return;
    const commandKey = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (commandKey && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (commandKey && key === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (commandKey && key === 'a') {
      event.preventDefault();
      switchDrawingTool('select');
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
    if (!commandKey && !event.altKey && !event.shiftKey && (key === 'p' || key === 'v')) {
      if (!switchDrawingTool(key === 'p' ? 'pen' : 'select')) return;
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (cancelActiveGesture()) return;
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
      const next = upgradeDrawingScene(content);
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
        scene.value = content ? upgradeDrawingScene(content) : createEmptyDrawingScene();
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

  watch(tool, (nextTool) => {
    stylePopoverOpen.value = false;
    styleDrawerOpen.value = false;
    if (nextTool !== 'shape') shapePopoverOpen.value = false;
    eraserCursorPoint = null;
    if (nextTool !== 'select') selectedIds.value = [];
    scheduleDraw();
  });

  watch(isMobileLayout, () => {
    void nextTick(syncToolbarScrollState);
  });

  onMounted(() => {
    if (props.readonly) {
      fitReadonlyPage();
      if (typeof ResizeObserver !== 'undefined' && workspaceRef.value) {
        workspaceResizeObserver = new ResizeObserver(fitReadonlyPage);
        workspaceResizeObserver.observe(workspaceRef.value);
      }
    } else {
      fitEditablePage();
      if (typeof ResizeObserver !== 'undefined' && workspaceRef.value) {
        workspaceResizeObserver = new ResizeObserver(fitEditablePage);
        workspaceResizeObserver.observe(workspaceRef.value);
      }
    }
    if (typeof ResizeObserver !== 'undefined' && toolbarScrollRef.value) {
      toolbarResizeObserver = new ResizeObserver(syncToolbarScrollState);
      toolbarResizeObserver.observe(toolbarScrollRef.value);
    }
    void nextTick(syncToolbarScrollState);
    emit('ready');
  });

  onBeforeUnmount(() => {
    workspaceResizeObserver?.disconnect();
    toolbarResizeObserver?.disconnect();
    if (frameId) cancelAnimationFrame(frameId);
    if (zoomResizeFrame) cancelAnimationFrame(zoomResizeFrame);
    if (toolbarClickResetFrame) cancelAnimationFrame(toolbarClickResetFrame);
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
    overflow: hidden;
    border-bottom: 1px solid var(--surface-border-color, var(--card-border-color));
    background: var(--card-background);
  }

  .drawing-toolbar-scroll {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    min-width: 0;
    gap: 5px;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
  }

  .drawing-toolbar-scroll::-webkit-scrollbar {
    display: none;
  }

  .drawing-toolbar-more {
    display: none;
  }

  .drawing-toolbar-zoom-mobile {
    display: none;
  }

  .drawing-toolbar-history,
  .drawing-toolbar-zoom {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 5px;
  }

  .drawing-toolbar-history {
    padding-left: 8px;
    border-left: 1px solid var(--surface-border-color, var(--card-border-color));
  }

  .drawing-toolbar-zoom {
    margin-left: auto;
  }

  .drawing-tool-button,
  .drawing-style-trigger,
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
  .drawing-shape-option.is-active {
    color: var(--primary-color);
    border-color: var(--primary-color) !important;
    background: var(--primary-btn-h-bg-color);
  }

  .drawing-style-trigger {
    gap: 5px;
    min-width: 48px;
    padding-inline: 7px;
  }

  .drawing-style-trigger-mobile {
    flex: 0 0 54px;
    width: 54px;
    min-width: 54px;
    padding-inline: 5px;
    gap: 4px;

    .drawing-style-size {
      flex-basis: 20px;
      width: 20px;
      text-align: center;
    }
  }

  .drawing-color-dot {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    border: 1px solid rgba(0, 0, 0, 0.14);
    border-radius: 50%;
  }

  .drawing-style-size {
    flex: 0 0 24px;
    width: 24px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    line-height: 1;
    text-align: right;
  }

  .drawing-toolbar-separator {
    flex: 0 0 auto;
    width: 1px;
    height: 20px;
    margin: 0 3px;
    background: var(--surface-border-color, var(--card-border-color));
  }

  .drawing-zoom-label {
    flex: 0 0 42px;
    color: var(--desc-color);
    font-size: 12px;
    text-align: center;
  }

  .drawing-shape-panel {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 268px;
    padding: 12px;
    box-sizing: border-box;
    gap: 8px;
    color: var(--text-color);
    font-size: 12px;
  }

  .drawing-shape-option {
    display: flex;
    min-width: 0;
    height: 42px;
    padding: 0 10px;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    border: 1px solid var(--surface-border-color, var(--card-border-color)) !important;
    background: var(--card-background);
  }

  .drawing-help-button {
    width: 30px;
    min-width: 30px;
    max-width: 30px;
    padding: 0;
    color: var(--primary-color, #615ced);
    border-radius: 6px;
    background: var(--primary-btn-bg-color);
    box-shadow: none;
  }

  .drawing-help-panel {
    display: grid;
    width: min(340px, calc(100vw - 24px));
    max-height: min(70vh, 520px);
    padding: 14px;
    overflow: auto;
    box-sizing: border-box;
    gap: 12px;
    color: var(--text-color);
    font-size: 12px;
  }

  .drawing-help-panel dl {
    display: grid;
    margin: 0;
    gap: 8px;
  }

  .drawing-help-panel dl > div {
    display: grid;
    grid-template-columns: minmax(108px, auto) 1fr;
    align-items: center;
    gap: 12px;
  }

  .drawing-help-panel dt,
  .drawing-help-panel dd {
    margin: 0;
  }

  .drawing-help-panel dt {
    color: var(--text-color);
    font-weight: 600;
  }

  .drawing-help-panel dd {
    color: var(--desc-color);
  }

  .drawing-help-panel kbd {
    padding: 2px 5px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-bottom-width: 2px;
    border-radius: 5px;
    color: var(--text-color);
    background: var(--surface-panel-bg, #f4f5f7);
    font-family: inherit;
    font-size: 11px;
  }

  .drawing-help-clear {
    display: none;
    justify-self: stretch;
    width: 100%;
  }

  .drawing-toolbar-zoom-mobile {
    flex: 0 0 auto;
    align-items: center;
    margin-left: 2px;
    padding-left: 6px;
    gap: 3px;
    border-left: 1px solid var(--surface-border-color, var(--card-border-color));
  }

  .drawing-mobile-zoom-value {
    flex: 0 0 42px;
    width: 42px;
    min-width: 42px;
    padding: 0 3px;
    color: var(--text-color);
    border: 1px solid transparent !important;
    background: var(--primary-btn-bg-color);
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    text-align: center;
  }

  .drawing-workspace {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
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

  .drawing-editor:not(.is-readonly) .drawing-page {
    position: absolute;
    top: 24px;
    left: 24px;
    margin: 0;
    will-change: transform;
  }

  .drawing-canvas {
    position: absolute;
    inset: 0;
    display: block;
    touch-action: none;
  }

  .drawing-editor.is-readonly .drawing-canvas {
    touch-action: pan-y;
  }

  .drawing-canvas.is-tool-pen,
  .drawing-canvas.is-tool-text,
  .drawing-canvas.is-tool-shape {
    cursor: crosshair;
  }

  .drawing-canvas.is-tool-eraser {
    cursor: none;
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

  .drawing-canvas.is-panning {
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
    .drawing-shape-option.is-active {
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
      gap: 3px;
      padding-inline: 8px;
      touch-action: pan-y;
    }

    .drawing-toolbar-scroll {
      padding-right: 4px;
      scroll-behavior: smooth;
    }

    .drawing-toolbar-more {
      position: relative;
      z-index: 2;
      display: flex;
      flex: 0 0 26px;
      width: 26px;
      min-width: 26px;
      padding: 0;
      color: var(--primary-color);
      border: 1px solid var(--primary-color) !important;
      background: var(--card-background);
      box-shadow: -7px 0 10px var(--card-background);
    }

    .drawing-toolbar-more.is-forward {
      color: #fff;
      background: var(--primary-color);
    }

    .drawing-toolbar-history {
      position: relative;
      z-index: 1;
      padding-left: 4px;
      gap: 3px;
      background: var(--card-background);
    }

    .drawing-toolbar-zoom,
    .drawing-clear-desktop {
      display: none;
    }

    .drawing-toolbar-zoom-mobile {
      display: flex;
    }

    .drawing-help-clear {
      display: flex;
    }

    .drawing-help-panel dl > div {
      grid-template-columns: minmax(92px, auto) 1fr;
      gap: 10px;
    }

    .drawing-workspace {
      padding: 12px;
    }

    .drawing-editor:not(.is-readonly) .drawing-page {
      top: 12px;
      left: 12px;
    }

    .drawing-shape-panel {
      width: min(286px, calc(100vw - 24px));
    }
  }
</style>

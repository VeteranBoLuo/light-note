<template>
  <div class="pdf-preview" role="document" :aria-label="fileName">
    <aside v-if="!isMobileLayout && navigatorOpen" class="pdf-preview__sidebar">
      <PdfPageNavigator
        :document="pdfDocumentRef"
        :page-count="pageCount"
        :active-page="currentPage"
        :outline="outlineItems"
        @select-page="selectPage"
      />
    </aside>

    <section ref="workspaceRef" class="pdf-preview__workspace">
      <div class="pdf-preview__toolbar" role="toolbar">
        <div class="pdf-preview__tool-group">
          <BTooltip :title="t('cloudSpace.previewPanel.pdfToggleNavigator')">
            <BButton
              class="pdf-preview__icon-button"
              :class="{ 'is-active': isMobileLayout ? mobileNavigatorOpen : navigatorOpen }"
              :aria-label="t('cloudSpace.previewPanel.pdfToggleNavigator')"
              @click="toggleNavigator"
            >
              <SvgIcon :src="icon.cloudSpace.preview.sidebar" size="18" aria-hidden="true" />
            </BButton>
          </BTooltip>
        </div>

        <div class="pdf-preview__tool-group pdf-preview__page-controls">
          <BTooltip :title="t('cloudSpace.previewPanel.pdfPreviousPage')">
            <BButton
              class="pdf-preview__icon-button"
              :disabled="currentPage <= 1"
              :aria-label="t('cloudSpace.previewPanel.pdfPreviousPage')"
              @click="goRelative(-1)"
            >
              <SvgIcon :src="icon.arrow_left" size="18" aria-hidden="true" />
            </BButton>
          </BTooltip>
          <BInput
            v-model:value="pageInput"
            class="pdf-preview__page-input"
            type="text"
            inputmode="numeric"
            :aria-label="t('cloudSpace.previewPanel.pdfGoToPage', { page: currentPage })"
            @enter="commitPageInput"
            @blur="commitPageInput"
          />
          <span class="pdf-preview__page-total">/ {{ pageCount }}</span>
          <BTooltip :title="t('cloudSpace.previewPanel.pdfNextPage')">
            <BButton
              class="pdf-preview__icon-button"
              :disabled="currentPage >= pageCount"
              :aria-label="t('cloudSpace.previewPanel.pdfNextPage')"
              @click="goRelative(1)"
            >
              <SvgIcon :src="icon.arrow_right" size="18" aria-hidden="true" />
            </BButton>
          </BTooltip>
        </div>

        <div class="pdf-preview__tool-group">
          <BTooltip :title="t('cloudSpace.previewPanel.zoomOut')">
            <BButton
              class="pdf-preview__icon-button"
              :disabled="zoomScale <= MIN_ZOOM"
              :aria-label="t('cloudSpace.previewPanel.zoomOut')"
              @click="changeZoom(-ZOOM_STEP)"
            >
              <SvgIcon :src="icon.cloudSpace.preview.zoomOut" size="18" aria-hidden="true" />
            </BButton>
          </BTooltip>
          <BButton
            class="pdf-preview__zoom-value"
            :aria-label="t('cloudSpace.previewPanel.pdfZoomPercent', { percent: zoomPercent })"
            @click="resetZoom"
          >
            {{ zoomPercent }}%
          </BButton>
          <BTooltip :title="t('cloudSpace.previewPanel.zoomIn')">
            <BButton
              class="pdf-preview__icon-button"
              :disabled="zoomScale >= MAX_ZOOM"
              :aria-label="t('cloudSpace.previewPanel.zoomIn')"
              @click="changeZoom(ZOOM_STEP)"
            >
              <SvgIcon :src="icon.cloudSpace.preview.zoomIn" size="18" aria-hidden="true" />
            </BButton>
          </BTooltip>
        </div>

        <div class="pdf-preview__tool-group">
          <BTooltip v-if="!isMobileLayout" :title="t('cloudSpace.previewPanel.pdfFitWidth')">
            <BButton
              class="pdf-preview__icon-button"
              :class="{ 'is-active': fitMode === 'width' && zoomScale === 1 }"
              :aria-label="t('cloudSpace.previewPanel.pdfFitWidth')"
              @click="setFitMode('width')"
            >
              <SvgIcon :src="icon.cloudSpace.preview.fitWidth" size="18" aria-hidden="true" />
            </BButton>
          </BTooltip>
          <BTooltip v-if="!isMobileLayout" :title="t('cloudSpace.previewPanel.pdfFitPage')">
            <BButton
              class="pdf-preview__icon-button"
              :class="{ 'is-active': fitMode === 'page' && zoomScale === 1 }"
              :aria-label="t('cloudSpace.previewPanel.pdfFitPage')"
              @click="setFitMode('page')"
            >
              <SvgIcon :src="icon.cloudSpace.preview.fitPage" size="18" aria-hidden="true" />
            </BButton>
          </BTooltip>
          <BTooltip :title="t('cloudSpace.previewPanel.rotate')">
            <BButton
              class="pdf-preview__icon-button"
              :aria-label="t('cloudSpace.previewPanel.rotate')"
              @click="rotatePages"
            >
              <SvgIcon :src="icon.cloudSpace.preview.rotate" size="18" aria-hidden="true" />
            </BButton>
          </BTooltip>
        </div>

        <div v-if="!isMobileLayout || spreadViewAvailable" class="pdf-preview__tool-group pdf-preview__view-controls">
          <BTooltip v-if="!isMobileLayout" :title="t('cloudSpace.previewPanel.pdfSinglePageView')">
            <BButton
              class="pdf-preview__icon-button"
              :class="{ 'is-active': viewMode === 'single' }"
              :aria-label="t('cloudSpace.previewPanel.pdfSinglePageView')"
              @click="setViewMode('single')"
            >
              <SvgIcon :src="icon.cloudSpace.preview.singlePage" size="18" aria-hidden="true" />
            </BButton>
          </BTooltip>
          <BTooltip v-if="spreadViewAvailable" :title="t('cloudSpace.previewPanel.pdfSpreadView')">
            <BButton
              class="pdf-preview__icon-button"
              :class="{ 'is-active': viewMode === 'spread' }"
              :aria-label="t('cloudSpace.previewPanel.pdfSpreadView')"
              @click="setViewMode('spread')"
            >
              <SvgIcon :src="icon.cloudSpace.preview.spread" size="18" aria-hidden="true" />
            </BButton>
          </BTooltip>
        </div>
      </div>

      <div
        ref="viewerRef"
        class="pdf-preview__viewport"
        @scroll.passive="handleViewerScroll"
        @wheel="handleWheel"
        @touchstart="handleTouchStart"
        @touchmove="handleTouchMove"
        @touchend="handleTouchEnd"
        @touchcancel="handleTouchEnd"
        @pointerdown="handleViewerPointerDown"
        @pointermove="handleViewerPointerMove"
        @contextmenu="handleViewerContextMenu"
      >
        <div ref="pagesRef" class="pdf-preview__pages" :class="`is-${viewMode}`" :style="pagesGestureStyle">
          <div
            v-for="pageNumber in displayedPageNumbers"
            :key="pageNumber"
            :ref="(element) => setPageElement(pageNumber, element)"
            class="pdf-preview__page"
            :style="pageStyle(pageNumber)"
            :data-page-number="pageNumber"
          >
            <canvas :ref="(element) => setPageCanvas(pageNumber, element)" class="pdf-preview__canvas" />
            <div :ref="(element) => setPageTextLayer(pageNumber, element)" class="pdf-preview__text-layer" />
            <span class="pdf-preview__page-number" aria-hidden="true">{{ pageNumber }} / {{ pageCount }}</span>
          </div>
        </div>
      </div>

      <PdfExcerptBar
        v-if="excerptVisible && selectedExcerpt"
        ref="excerptBarRef"
        :style="excerptBarStyle"
        :mode="excerptMode"
        :status="excerptStatus"
        :mobile="isMobileLayout"
        :excerpt="selectedExcerpt"
        :file="excerpt?.file"
        :busy="excerptBusy"
        @copy="copyExcerpt"
        @insert="insertExcerpt"
        @undo="undoExcerpt"
        @hold-change="excerptHeld = $event"
      />
      <div v-if="scanTip" class="pdf-preview__scan-tip" role="status" :style="{ left: `${scanTip.left}px`, top: `${scanTip.top}px` }">
        <SvgIcon :src="icon.message.info" size="14" aria-hidden="true" />
        <span>{{ t('cloudSpace.previewPanel.pdfScannedPage') }}</span>
      </div>
    </section>

    <BDrawer
      v-if="isMobileLayout"
      :open="mobileNavigatorOpen"
      placement="bottom"
      height="min(72dvh, 620px)"
      :title="t('cloudSpace.previewPanel.pdfToggleNavigator')"
      body-padding="0"
      :z-index="960"
      @close="mobileNavigatorOpen = false"
    >
      <PdfPageNavigator
        :document="pdfDocumentRef"
        :page-count="pageCount"
        :active-page="currentPage"
        :outline="outlineItems"
        @select-page="selectPageFromMobile"
      />
    </BDrawer>
  </div>
</template>

<script setup lang="ts">
  import { withForegroundActivity } from '@/http/requestActivity';
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
  import type { ComponentPublicInstance, CSSProperties } from 'vue';
  import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import PdfPageNavigator, { type PdfOutlineItem } from './PdfPageNavigator.vue';
  import PdfExcerptBar from './PdfExcerptBar.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { normalizePdfSelectionText, type PdfExcerpt, type PdfExcerptHandler } from '@/utils/pdfExcerpt';
  import icon from '@/config/icon';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { loadPdfJsRuntime } from '@/utils/pdfJsRuntime';

  type PdfJsRuntime = Awaited<ReturnType<typeof loadPdfJsRuntime>>;
  type PdfTextLayer = InstanceType<PdfJsRuntime['TextLayer']>;

  type PdfViewMode = 'single' | 'spread';
  type FitMode = 'width' | 'page';
  interface PageSize {
    width: number;
    height: number;
  }
  interface RawOutlineItem {
    title?: string;
    dest?: unknown;
    items?: RawOutlineItem[];
  }

  const props = defineProps<{
    src?: string;
    fileName?: string;
    /** 打开后先跳到这一页（摘录来源链接、回到摘录所在页）。 */
    initialPage?: number;
    /** 选中文字后除复制外还能做什么；不传时只能复制。 */
    excerpt?: PdfExcerptHandler;
  }>();

  const emit = defineEmits<{
    rendered: [];
    error: [error: Error];
    /** 手机底部摘录条显示时为 true，宿主据此让开同在底部的悬浮控制栏。 */
    'excerpt-docked': [docked: boolean];
  }>();

  const { t } = useI18n();
  const isMobileLayout = useMobileLayout();
  const DEFAULT_PAGE_ASPECT_RATIO = '1 / 1.4142';
  const MAX_OUTPUT_SCALE = 2;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4;
  const ZOOM_STEP = 0.2;
  const viewerRef = ref<HTMLElement | null>(null);
  const pagesRef = ref<HTMLElement | null>(null);
  const pageCount = ref(0);
  const currentPage = ref(1);
  const pageInput = ref<string | number>('1');
  const pageAspectRatios = ref(new Map<number, string>());
  const pageSizes = ref(new Map<number, PageSize>());
  const viewMode = ref<PdfViewMode>('single');
  const fitMode = ref<FitMode>('page');
  const zoomScale = ref(1);
  const rotation = ref(0);
  const navigatorOpen = ref(true);
  const mobileNavigatorOpen = ref(false);
  const outlineItems = ref<PdfOutlineItem[]>([]);
  const viewportWidth = ref(typeof window === 'undefined' ? 1024 : window.innerWidth);
  const viewportHeight = ref(typeof window === 'undefined' ? 768 : window.innerHeight);
  const pdfDocumentRef = shallowRef<PDFDocumentProxy | null>(null);
  const pageElements = new Map<number, HTMLElement>();
  const pageCanvases = new Map<number, HTMLCanvasElement>();
  const pageProxies = new Map<number, PDFPageProxy>();
  const renderTasks = new Map<number, RenderTask>();
  const renderRevisions = new Map<number, number>();
  const renderedPages = new Set<number>();
  const renderingPages = new Set<number>();
  // 文字层：页面画完后空闲时生成，随页面一起释放；没有文字的页（扫描件）单独记下。
  const pageTextLayers = new Map<number, HTMLDivElement>();
  const textLayerTasks = new Map<number, PdfTextLayer>();
  const textlessPages = new Set<number>();
  const workspaceRef = ref<HTMLElement | null>(null);
  const excerptBarRef = ref<ComponentPublicInstance | null>(null);
  const selectedExcerpt = shallowRef<PdfExcerpt | null>(null);
  const excerptStatus = ref<'idle' | 'copied' | 'inserted'>('idle');
  const excerptBarPosition = ref<{ left: number; top: number } | null>(null);
  const excerptBusy = ref(false);
  const excerptHeld = ref(false);
  const scanTip = ref<{ left: number; top: number } | null>(null);
  let TextLayerClass: PdfJsRuntime['TextLayer'] | null = null;
  let excerptStatusTimer: number | null = null;
  let scanTipTimer: number | null = null;
  let scanTipShown = false;
  let selectionFrame: number | null = null;
  let mouseSelecting = false;
  let scanDragStart: { x: number; y: number } | null = null;
  let pendingInitialPage = 0;

  let pdfDocument: PDFDocumentProxy | null = null;
  let loadingTask: PDFDocumentLoadingTask | null = null;
  let fetchController: AbortController | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let loadGeneration = 0;
  let firstPageRendered = false;
  let resizeTimer: number | null = null;
  let scrollFrame: number | null = null;
  let lastViewerWidth = 0;
  let lastViewerHeight = 0;
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;
  let pinchTargetZoom = 1;
  const pinchPreviewScale = ref(1);
  const pinchOrigin = ref('50% 50%');

  const zoomPercent = computed(() => Math.round(zoomScale.value * 100));
  const spreadViewAvailable = computed(() => !isMobileLayout.value || viewportWidth.value > viewportHeight.value);
  const displayedPageNumbers = computed(() => Array.from({ length: pageCount.value }, (_, index) => index + 1));
  const pagesGestureStyle = computed<CSSProperties>(() =>
    pinchPreviewScale.value === 1
      ? {}
      : {
          transform: `scale(${pinchPreviewScale.value})`,
          transformOrigin: pinchOrigin.value,
        },
  );

  const excerptMode = computed(() => props.excerpt?.mode ?? 'copy');
  // 双指缩放时页面正在变形，先隐藏摘录条；电脑上要算出位置后才显示，避免先闪在角落。
  const excerptVisible = computed(
    () =>
      Boolean(selectedExcerpt.value) &&
      pinchPreviewScale.value === 1 &&
      (isMobileLayout.value || Boolean(excerptBarPosition.value)),
  );
  const excerptBarStyle = computed<CSSProperties | undefined>(() =>
    isMobileLayout.value || !excerptBarPosition.value
      ? undefined
      : { left: `${excerptBarPosition.value.left}px`, top: `${excerptBarPosition.value.top}px` },
  );

  function normalizeElement<T extends Element>(element: Element | ComponentPublicInstance | null): T | null {
    return element instanceof Element ? (element as T) : null;
  }

  function setPageElement(pageNumber: number, element: Element | ComponentPublicInstance | null) {
    const pageElement = normalizeElement<HTMLElement>(element);
    if (pageElement) pageElements.set(pageNumber, pageElement);
    else pageElements.delete(pageNumber);
  }

  function setPageCanvas(pageNumber: number, element: Element | ComponentPublicInstance | null) {
    const canvas = normalizeElement<HTMLCanvasElement>(element);
    if (canvas) pageCanvases.set(pageNumber, canvas);
    else pageCanvases.delete(pageNumber);
  }

  function setPageTextLayer(pageNumber: number, element: Element | ComponentPublicInstance | null) {
    const layer = normalizeElement<HTMLDivElement>(element);
    if (layer) pageTextLayers.set(pageNumber, layer);
    else pageTextLayers.delete(pageNumber);
  }

  function pageStyle(pageNumber: number): CSSProperties {
    const size = pageSizes.value.get(pageNumber);
    return {
      aspectRatio: pageAspectRatios.value.get(pageNumber) || DEFAULT_PAGE_ASPECT_RATIO,
      width: size ? `${size.width}px` : undefined,
      height: size ? `${size.height}px` : undefined,
    };
  }

  function clampPage(pageNumber: number) {
    return Math.max(1, Math.min(pageCount.value || 1, Math.round(pageNumber)));
  }

  function isCancelledRenderError(error: unknown) {
    return error instanceof Error && error.name === 'RenderingCancelledException';
  }

  function cancelTextLayer(pageNumber: number) {
    textLayerTasks.get(pageNumber)?.cancel();
    textLayerTasks.delete(pageNumber);
    pageTextLayers.get(pageNumber)?.replaceChildren();
  }

  async function renderTextLayer(
    pageNumber: number,
    page: PDFPageProxy,
    viewport: ReturnType<PDFPageProxy['getViewport']>,
    isCurrent: () => boolean,
  ) {
    const container = pageTextLayers.get(pageNumber);
    const TextLayer = TextLayerClass;
    if (!container || !TextLayer || !isCurrent()) return;
    cancelTextLayer(pageNumber);
    container.style.setProperty('--scale-factor', String(viewport.scale));
    const layer = new TextLayer({ textContentSource: page.streamTextContent(), container, viewport });
    textLayerTasks.set(pageNumber, layer);
    try {
      await layer.render();
    } catch {
      return; // 页面释放、缩放或旋转时会取消重建，不算错误
    }
    if (!isCurrent() || textLayerTasks.get(pageNumber) !== layer) return;
    textLayerTasks.delete(pageNumber);
    // pdf.js 查看器的做法：拖选时把它铺满整页，避免选区跳到页面其它位置。
    const endOfContent = document.createElement('div');
    endOfContent.className = 'endOfContent';
    container.append(endOfContent);
    if (layer.textDivs.length) textlessPages.delete(pageNumber);
    else textlessPages.add(pageNumber);
  }

  /** 文字层不影响首屏：等这一页画完、浏览器空闲时再生成。 */
  function scheduleTextLayer(
    pageNumber: number,
    page: PDFPageProxy,
    viewport: ReturnType<PDFPageProxy['getViewport']>,
    isCurrent: () => boolean,
  ) {
    if (!TextLayerClass || typeof page.streamTextContent !== 'function') return;
    const run = () => void renderTextLayer(pageNumber, page, viewport, isCurrent);
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 400 });
    else window.setTimeout(run, 30);
  }

  function releaseRenderedPage(pageNumber: number, clearCanvas = true) {
    cancelTextLayer(pageNumber);
    renderRevisions.set(pageNumber, (renderRevisions.get(pageNumber) || 0) + 1);
    renderTasks.get(pageNumber)?.cancel();
    renderTasks.delete(pageNumber);
    renderingPages.delete(pageNumber);
    pageProxies.get(pageNumber)?.cleanup();
    pageProxies.delete(pageNumber);
    renderedPages.delete(pageNumber);
    const pageElement = pageElements.get(pageNumber);
    if (pageElement) delete pageElement.dataset.rendered;
    const canvas = pageCanvases.get(pageNumber);
    if (canvas && clearCanvas) {
      canvas.width = 1;
      canvas.height = 1;
      canvas.style.width = '';
      canvas.style.height = '';
    }
  }

  function calculatePageSize(naturalWidth: number, naturalHeight: number): PageSize {
    const viewer = viewerRef.value;
    const columns = viewMode.value === 'spread' ? 2 : 1;
    const horizontalPadding = isMobileLayout.value ? 16 : 32;
    const pageGap = viewMode.value === 'spread' ? 12 : 0;
    const availableWidth = Math.max(
      120,
      ((viewer?.clientWidth || 760) - horizontalPadding - pageGap * (columns - 1)) / columns,
    );
    const availableHeight = Math.max(160, (viewer?.clientHeight || 720) - (isMobileLayout.value ? 20 : 32));
    const widthScale = availableWidth / naturalWidth;
    const fitScale = fitMode.value === 'page' ? Math.min(widthScale, availableHeight / naturalHeight) : widthScale;
    const cssScale = Math.max(0.05, fitScale * zoomScale.value);
    return {
      width: Math.round(naturalWidth * cssScale),
      height: Math.round(naturalHeight * cssScale),
    };
  }

  async function renderPage(pageNumber: number, generation = loadGeneration) {
    if (
      generation !== loadGeneration ||
      !pdfDocument ||
      renderedPages.has(pageNumber) ||
      renderingPages.has(pageNumber)
    )
      return;
    const canvas = pageCanvases.get(pageNumber);
    const pageElement = pageElements.get(pageNumber);
    if (!canvas || !pageElement) return;

    const revision = (renderRevisions.get(pageNumber) || 0) + 1;
    renderRevisions.set(pageNumber, revision);
    renderingPages.add(pageNumber);
    let activeTask: RenderTask | null = null;
    const isCurrentRender = () => generation === loadGeneration && renderRevisions.get(pageNumber) === revision;
    try {
      const page = await pdfDocument.getPage(pageNumber);
      if (!isCurrentRender()) {
        page.cleanup();
        return;
      }
      pageProxies.set(pageNumber, page);
      const naturalViewport = page.getViewport({ scale: 1, rotation: rotation.value });
      const size = calculatePageSize(naturalViewport.width, naturalViewport.height);
      const viewport = page.getViewport({ scale: size.width / naturalViewport.width, rotation: rotation.value });
      const outputScale = Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_OUTPUT_SCALE);
      const renderCanvas = document.createElement('canvas');
      const renderContext = renderCanvas.getContext('2d', { alpha: false });
      if (!renderContext) throw new Error('PDF canvas context is unavailable');
      renderCanvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      renderCanvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      activeTask = page.render({
        canvasContext: renderContext,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        background: '#ffffff',
      });
      renderTasks.set(pageNumber, activeTask);
      await activeTask.promise;
      if (renderTasks.get(pageNumber) === activeTask) renderTasks.delete(pageNumber);
      if (!isCurrentRender() || pageCanvases.get(pageNumber) !== canvas || pageElements.get(pageNumber) !== pageElement)
        return;

      const visibleContext = canvas.getContext('2d', { alpha: false });
      if (!visibleContext) throw new Error('PDF canvas context is unavailable');
      pageAspectRatios.value.set(pageNumber, `${naturalViewport.width} / ${naturalViewport.height}`);
      pageAspectRatios.value = new Map(pageAspectRatios.value);
      pageSizes.value.set(pageNumber, size);
      pageSizes.value = new Map(pageSizes.value);
      pageElement.style.width = `${size.width}px`;
      pageElement.style.height = `${size.height}px`;
      canvas.width = renderCanvas.width;
      canvas.height = renderCanvas.height;
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      visibleContext.drawImage(renderCanvas, 0, 0);
      renderedPages.add(pageNumber);
      pageElement.dataset.rendered = 'true';
      scheduleTextLayer(pageNumber, page, viewport, () => isCurrentRender() && renderedPages.has(pageNumber));
      alignInitialPage();
      if (!firstPageRendered) {
        firstPageRendered = true;
        emit('rendered');
      }
    } catch (error) {
      if (activeTask && renderTasks.get(pageNumber) === activeTask) renderTasks.delete(pageNumber);
      if (!isCurrentRender() || isCancelledRenderError(error)) return;
      emit('error', error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (renderRevisions.get(pageNumber) === revision) renderingPages.delete(pageNumber);
    }
  }

  function setupPageObserver() {
    intersectionObserver?.disconnect();
    if (typeof IntersectionObserver === 'undefined') {
      displayedPageNumbers.value.forEach((pageNumber) => void renderPage(pageNumber));
      return;
    }
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber || 0);
          if (!pageNumber) return;
          if (entry.isIntersecting) void renderPage(pageNumber);
          else if (renderedPages.has(pageNumber)) releaseRenderedPage(pageNumber);
        });
      },
      { root: viewerRef.value, rootMargin: '120% 0px', threshold: 0.01 },
    );
    pageElements.forEach((element) => intersectionObserver?.observe(element));
  }

  function rerenderDisplayedPages() {
    const viewer = viewerRef.value;
    const viewerRect = viewer?.getBoundingClientRect();
    const pagesToRender = !viewerRect
      ? displayedPageNumbers.value
      : displayedPageNumbers.value.filter((pageNumber) => {
          const element = pageElements.get(pageNumber);
          if (!element) return pageNumber === currentPage.value;
          const rect = element.getBoundingClientRect();
          return rect.bottom >= viewerRect.top - viewerRect.height && rect.top <= viewerRect.bottom + viewerRect.height;
        });
    pagesToRender.forEach((pageNumber) => {
      if (renderedPages.has(pageNumber) || renderingPages.has(pageNumber)) releaseRenderedPage(pageNumber, false);
      window.setTimeout(() => void renderPage(pageNumber), 0);
    });
  }

  function scheduleRerender() {
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = null;
      rerenderDisplayedPages();
    }, 80);
  }

  function setupResizeObserver() {
    resizeObserver?.disconnect();
    if (typeof ResizeObserver === 'undefined' || !viewerRef.value) return;
    resizeObserver = new ResizeObserver(() => {
      const currentWidth = viewerRef.value?.clientWidth || 0;
      const currentHeight = viewerRef.value?.clientHeight || 0;
      if (!lastViewerWidth) {
        lastViewerWidth = currentWidth;
        lastViewerHeight = currentHeight;
        return;
      }
      const widthChanged = Math.abs(currentWidth - lastViewerWidth) >= 2;
      const heightChanged = Math.abs(currentHeight - lastViewerHeight) >= 2;
      lastViewerWidth = currentWidth;
      lastViewerHeight = currentHeight;
      if (!widthChanged && !(fitMode.value === 'page' && heightChanged)) return;
      scheduleRerender();
    });
    resizeObserver.observe(viewerRef.value);
  }

  function handleViewerScroll() {
    if (scrollFrame !== null) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      const viewer = viewerRef.value;
      if (!viewer) return;
      const viewerRect = viewer.getBoundingClientRect();
      const targetY = viewerRect.top + Math.min(viewerRect.height * 0.35, 220);
      let closestPage = currentPage.value;
      let closestDistance = Number.POSITIVE_INFINITY;
      pageElements.forEach((element, pageNumber) => {
        const rect = element.getBoundingClientRect();
        const distance =
          rect.top <= targetY && rect.bottom >= targetY
            ? 0
            : Math.min(Math.abs(rect.top - targetY), Math.abs(rect.bottom - targetY));
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = pageNumber;
        }
      });
      if (closestPage !== currentPage.value) currentPage.value = closestPage;
      // 选笔记浮层打开期间选区已移到搜索框，不能按选区重算，否则摘录条和浮层会被关掉。
      if (selectedExcerpt.value && excerptStatus.value === 'idle' && !excerptHeld.value) updateExcerptBarPosition();
    });
  }

  async function selectPage(pageNumber: number) {
    const targetPage = clampPage(pageNumber);
    currentPage.value = targetPage;
    pageInput.value = String(targetPage);
    await nextTick();
    const viewer = viewerRef.value;
    const pageElement = pageElements.get(targetPage);
    if (viewer && pageElement) viewer.scrollTo({ top: Math.max(0, pageElement.offsetTop - 10), behavior: 'smooth' });
  }

  function selectPageFromMobile(pageNumber: number) {
    mobileNavigatorOpen.value = false;
    void selectPage(pageNumber);
  }

  function goRelative(direction: -1 | 1) {
    const step = viewMode.value === 'spread' ? 2 : 1;
    void selectPage(currentPage.value + direction * step);
  }

  function commitPageInput() {
    const parsed = Number.parseInt(String(pageInput.value), 10);
    if (!Number.isFinite(parsed)) {
      pageInput.value = String(currentPage.value);
      return;
    }
    void selectPage(parsed);
  }

  function toggleNavigator() {
    if (isMobileLayout.value) mobileNavigatorOpen.value = true;
    else navigatorOpen.value = !navigatorOpen.value;
  }

  function setZoom(value: number) {
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    if (Math.abs(nextZoom - zoomScale.value) < 0.001) return;
    zoomScale.value = Math.round(nextZoom * 100) / 100;
    scheduleRerender();
  }

  function changeZoom(delta: number) {
    setZoom(zoomScale.value + delta);
  }

  function resetZoom() {
    setZoom(1);
  }

  function setFitMode(mode: FitMode) {
    fitMode.value = mode;
    zoomScale.value = 1;
    scheduleRerender();
  }

  function rotatePages() {
    rotation.value = (rotation.value + 90) % 360;
    pageAspectRatios.value = new Map();
    pageSizes.value = new Map();
    scheduleRerender();
  }

  function resizePagePlaceholders() {
    const nextSizes = new Map<number, PageSize>();
    pageSizes.value.forEach((currentSize, pageNumber) => {
      const nextSize = calculatePageSize(currentSize.width, currentSize.height);
      nextSizes.set(pageNumber, nextSize);
      const pageElement = pageElements.get(pageNumber);
      if (pageElement) {
        pageElement.style.width = `${nextSize.width}px`;
        pageElement.style.height = `${nextSize.height}px`;
      }
      const canvas = pageCanvases.get(pageNumber);
      if (canvas) {
        canvas.style.width = `${nextSize.width}px`;
        canvas.style.height = `${nextSize.height}px`;
      }
    });
    pageSizes.value = nextSizes;
  }

  async function setViewMode(mode: PdfViewMode) {
    if (mode === 'spread' && !spreadViewAvailable.value) return;
    if (viewMode.value === mode) return;
    intersectionObserver?.disconnect();
    displayedPageNumbers.value.forEach((pageNumber) => releaseRenderedPage(pageNumber, false));
    viewMode.value = mode;
    resizePagePlaceholders();
    await nextTick();
    const viewer = viewerRef.value;
    const currentPageElement = pageElements.get(currentPage.value);
    if (viewer && currentPageElement && typeof viewer.scrollTo === 'function') {
      viewer.scrollTo({ top: Math.max(0, currentPageElement.offsetTop - 10), behavior: 'auto' });
    }
    setupPageObserver();
    rerenderDisplayedPages();
  }

  /** 指定起始页时，前面的页还是占位尺寸；相邻页画完会改变高度，在用户动手前保持对准。 */
  function alignInitialPage() {
    const viewer = viewerRef.value;
    const pageElement = pendingInitialPage ? pageElements.get(pendingInitialPage) : null;
    if (viewer && pageElement) viewer.scrollTop = Math.max(0, pageElement.offsetTop - 10);
  }

  function closestTextLayer(node: Node | null) {
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest<HTMLElement>('.pdf-preview__text-layer') || null;
  }

  function textLayerPageNumber(layer: HTMLElement) {
    return Number(layer.closest<HTMLElement>('[data-page-number]')?.dataset.pageNumber || 0);
  }

  /** 只认落在本预览文字层里的选区；跨到工具栏、其它页面区域的选择不算摘录。 */
  function readSelectedExcerpt() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const startLayer = closestTextLayer(range.startContainer);
    const endLayer = closestTextLayer(range.endContainer);
    const pages = pagesRef.value;
    if (!pages || !startLayer || !endLayer || !pages.contains(startLayer) || !pages.contains(endLayer)) return null;
    const text = normalizePdfSelectionText(selection.toString());
    const first = textLayerPageNumber(startLayer);
    const last = textLayerPageNumber(endLayer);
    if (!text || !first || !last) return null;
    return { range, excerpt: { text, pageStart: Math.min(first, last), pageEnd: Math.max(first, last) } };
  }

  function clearExcerptStatusTimer() {
    if (excerptStatusTimer !== null) window.clearTimeout(excerptStatusTimer);
    excerptStatusTimer = null;
  }

  function clearExcerpt() {
    clearExcerptStatusTimer();
    selectedExcerpt.value = null;
    excerptStatus.value = 'idle';
    excerptBarPosition.value = null;
  }

  function showExcerptStatus(status: 'copied' | 'inserted', duration: number) {
    clearExcerptStatusTimer();
    excerptStatus.value = status;
    excerptStatusTimer = window.setTimeout(clearExcerpt, duration);
  }

  /** 电脑上摘录条浮在选区上方，上方放不下时放到下方；选区滚出可视区时隐藏。手机固定在底部。 */
  function updateExcerptBarPosition(range?: Range | null) {
    if (isMobileLayout.value) return;
    const workspace = workspaceRef.value;
    const viewer = viewerRef.value;
    const activeRange = range ?? readSelectedExcerpt()?.range;
    const rects =
      typeof activeRange?.getClientRects === 'function'
        ? Array.from(activeRange.getClientRects()).filter((rect) => rect.width && rect.height)
        : [];
    if (!workspace || !viewer || !rects.length) {
      excerptBarPosition.value = null;
      return;
    }
    const base = workspace.getBoundingClientRect();
    const view = viewer.getBoundingClientRect();
    const top = Math.min(...rects.map((rect) => rect.top));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    const left = Math.min(...rects.map((rect) => rect.left));
    const right = Math.max(...rects.map((rect) => rect.right));
    if (bottom < view.top || top > view.bottom) {
      excerptBarPosition.value = null;
      return;
    }
    const bar = excerptBarRef.value?.$el as HTMLElement | undefined;
    const width = bar?.offsetWidth || 220;
    const height = bar?.offsetHeight || 42;
    const gap = 8;
    const y = top - height - gap >= view.top ? top - height - gap : Math.min(bottom + gap, view.bottom - height - 4);
    const x = Math.min(Math.max(8, (left + right) / 2 - width / 2 - base.left), Math.max(8, base.width - width - 8));
    excerptBarPosition.value = { left: Math.round(x), top: Math.round(y - base.top) };
  }

  function handleSelectionChange() {
    if (selectionFrame !== null) return;
    selectionFrame = requestAnimationFrame(() => {
      selectionFrame = null;
      // 选笔记浮层打开、插入或跳转进行中时，焦点离开了 PDF，保留这次摘录；鼠标拖选中途也先不弹出。
      if (excerptHeld.value || excerptBusy.value || mouseSelecting) return;
      const result = readSelectedExcerpt();
      if (!result) {
        if (excerptStatus.value === 'idle') clearExcerpt();
        return;
      }
      clearExcerptStatusTimer();
      excerptStatus.value = 'idle';
      selectedExcerpt.value = result.excerpt;
      updateExcerptBarPosition(result.range);
      void nextTick(() => updateExcerptBarPosition());
    });
  }

  function showScanTip(clientX: number, clientY: number) {
    const workspace = workspaceRef.value;
    scanDragStart = null;
    if (!workspace) return;
    scanTipShown = true;
    const base = workspace.getBoundingClientRect();
    scanTip.value = {
      left: Math.round(Math.max(8, Math.min(clientX - base.left + 12, base.width - 280))),
      top: Math.round(Math.max(8, Math.min(clientY - base.top + 16, base.height - 48))),
    };
    if (scanTipTimer !== null) window.clearTimeout(scanTipTimer);
    scanTipTimer = window.setTimeout(() => {
      scanTip.value = null;
      scanTipTimer = null;
    }, 2000);
  }

  function pageNumberAt(target: EventTarget | null) {
    const element = target instanceof Element ? target : null;
    return Number(element?.closest<HTMLElement>('[data-page-number]')?.dataset.pageNumber || 0);
  }

  function handleViewerPointerDown(event: PointerEvent) {
    pendingInitialPage = 0;
    scanDragStart = null;
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    mouseSelecting = true;
    closestTextLayer(event.target as Node | null)?.classList.add('selecting');
    const pageNumber = pageNumberAt(event.target);
    if (!scanTipShown && textlessPages.has(pageNumber)) scanDragStart = { x: event.clientX, y: event.clientY };
  }

  function handleViewerPointerMove(event: PointerEvent) {
    if (!scanDragStart || !(event.buttons & 1)) return;
    if (Math.hypot(event.clientX - scanDragStart.x, event.clientY - scanDragStart.y) < 8) return;
    showScanTip(event.clientX, event.clientY);
  }

  // 手机长按会触发 contextmenu：扫描页上长按选不到字时同样提示一次。
  function handleViewerContextMenu(event: MouseEvent) {
    if (!scanTipShown && isMobileLayout.value && textlessPages.has(pageNumberAt(event.target))) {
      showScanTip(event.clientX, event.clientY);
    }
  }

  function handleDocumentPointerUp() {
    scanDragStart = null;
    if (!mouseSelecting) return;
    mouseSelecting = false;
    pageTextLayers.forEach((layer) => layer.classList.remove('selecting'));
    handleSelectionChange();
  }

  // 复制时合并 PDF 的硬折行，快捷键、系统菜单和摘录条的「复制」得到同样的文字。
  function handleDocumentCopy(event: ClipboardEvent) {
    const result = readSelectedExcerpt();
    if (!result || !event.clipboardData) return;
    event.clipboardData.setData('text/plain', result.excerpt.text);
    event.preventDefault();
  }

  async function copyExcerpt() {
    const excerpt = selectedExcerpt.value;
    if (!excerpt) return;
    if (!(await copyTextToClipboard(excerpt.text))) {
      message.warning(t('cloudSpace.previewPanel.pdfExcerptCopyFailed'));
      return;
    }
    showExcerptStatus('copied', 2000);
  }

  async function insertExcerpt() {
    const handler = props.excerpt;
    const excerpt = selectedExcerpt.value;
    if (handler?.mode !== 'insert' || !excerpt || excerptBusy.value) return;
    excerptBusy.value = true;
    let inserted = false;
    try {
      inserted = await handler.insert(excerpt, handler.file);
    } catch {
      inserted = false;
    } finally {
      excerptBusy.value = false;
    }
    if (!inserted) {
      message.error(t('cloudSpace.previewPanel.pdfExcerptInsertFailed'));
      return;
    }
    showExcerptStatus('inserted', 4000);
    // 插入后焦点通常已回到编辑器；只有选区还留在 PDF 上时才清掉，不能顺手清掉编辑器里的光标。
    if (readSelectedExcerpt()) window.getSelection()?.removeAllRanges();
  }

  function undoExcerpt() {
    if (props.excerpt?.mode === 'insert') props.excerpt.undo();
    clearExcerpt();
  }

  function handleWheel(event: WheelEvent) {
    pendingInitialPage = 0;
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    changeZoom(event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
  }

  function touchDistance(touches: TouchList) {
    const first = touches[0];
    const second = touches[1];
    return first && second ? Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY) : 0;
  }

  function handleTouchStart(event: TouchEvent) {
    pendingInitialPage = 0;
    if (event.touches.length !== 2) return;
    pinchStartDistance = touchDistance(event.touches);
    pinchStartZoom = zoomScale.value;
    pinchTargetZoom = pinchStartZoom;
    const viewerRect = viewerRef.value?.getBoundingClientRect();
    const first = event.touches[0];
    const second = event.touches[1];
    if (viewerRect && first && second) {
      const x = (first.clientX + second.clientX) / 2 - viewerRect.left + (viewerRef.value?.scrollLeft || 0);
      const y = (first.clientY + second.clientY) / 2 - viewerRect.top + (viewerRef.value?.scrollTop || 0);
      pinchOrigin.value = `${x}px ${y}px`;
    }
  }

  function handleTouchMove(event: TouchEvent) {
    if (event.touches.length !== 2 || !pinchStartDistance) return;
    event.preventDefault();
    const ratio = touchDistance(event.touches) / pinchStartDistance;
    pinchTargetZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStartZoom * ratio));
    pinchPreviewScale.value = pinchTargetZoom / pinchStartZoom;
  }

  function handleTouchEnd(event: TouchEvent) {
    if (!pinchStartDistance || event.touches.length >= 2) return;
    pinchStartDistance = 0;
    pinchPreviewScale.value = 1;
    setZoom(pinchTargetZoom);
  }

  async function resolveOutlinePage(destination: unknown) {
    if (!pdfDocument || destination == null) return null;
    try {
      const explicitDestination =
        typeof destination === 'string' ? await pdfDocument.getDestination(destination) : destination;
      if (!Array.isArray(explicitDestination) || !explicitDestination[0]) return null;
      const reference = explicitDestination[0];
      if (typeof reference === 'number') return clampPage(reference + 1);
      return clampPage((await pdfDocument.getPageIndex(reference)) + 1);
    } catch {
      return null;
    }
  }

  async function flattenOutline(items: RawOutlineItem[], depth = 0, prefix = 'outline') {
    const result: PdfOutlineItem[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item) continue;
      const id = `${prefix}-${index}`;
      result.push({
        id,
        title: item.title?.trim() || t('cloudSpace.previewPanel.pdfOutline'),
        pageNumber: await resolveOutlinePage(item.dest),
        depth,
      });
      if (item.items?.length) result.push(...(await flattenOutline(item.items, depth + 1, id)));
    }
    return result;
  }

  async function loadOutline(generation: number) {
    if (!pdfDocument) return;
    try {
      const outline = (await pdfDocument.getOutline()) as RawOutlineItem[] | null;
      if (generation !== loadGeneration) return;
      outlineItems.value = outline?.length ? await flattenOutline(outline) : [];
    } catch {
      outlineItems.value = [];
    }
  }

  function syncViewportSize() {
    viewportWidth.value = window.innerWidth;
    viewportHeight.value = window.innerHeight;
    if (!spreadViewAvailable.value && viewMode.value === 'spread') void setViewMode('single');
  }

  async function destroyPdf() {
    loadGeneration += 1;
    fetchController?.abort();
    fetchController = null;
    intersectionObserver?.disconnect();
    intersectionObserver = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = null;
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
    renderTasks.forEach((task) => task.cancel());
    renderTasks.clear();
    textLayerTasks.forEach((layer) => layer.cancel());
    textLayerTasks.clear();
    textlessPages.clear();
    clearExcerpt();
    scanTipShown = false;
    scanTip.value = null;
    pendingInitialPage = 0;
    renderRevisions.clear();
    renderingPages.clear();
    pageProxies.forEach((page) => page.cleanup());
    pageProxies.clear();
    renderedPages.clear();
    pageElements.clear();
    pageCanvases.clear();
    pageTextLayers.clear();
    pageAspectRatios.value = new Map();
    pageSizes.value = new Map();
    pageCount.value = 0;
    currentPage.value = 1;
    pageInput.value = '1';
    outlineItems.value = [];
    firstPageRendered = false;
    lastViewerWidth = 0;
    lastViewerHeight = 0;
    const activeLoadingTask = loadingTask;
    const activeDocument = pdfDocument;
    loadingTask = null;
    pdfDocument = null;
    pdfDocumentRef.value = null;
    if (activeLoadingTask) await activeLoadingTask.destroy().catch(() => undefined);
    else await activeDocument?.destroy().catch(() => undefined);
  }

  async function loadPdf(src?: string) {
    return withForegroundActivity(async () => {
      await destroyPdf();
      const generation = loadGeneration;
      if (!src) {
        emit('error', new Error('PDF URL is empty'));
        return;
      }
      fetchController = new AbortController();
      try {
        const [pdfjs, response] = await Promise.all([
          loadPdfJsRuntime(),
          fetch(src, { mode: 'cors', signal: fetchController.signal }),
        ]);
        if (!response.ok) throw new Error(`PDF request failed with status ${response.status}`);
        const data = new Uint8Array(await response.arrayBuffer());
        if (generation !== loadGeneration) return;
        TextLayerClass = 'TextLayer' in pdfjs ? pdfjs.TextLayer : null;
        loadingTask = pdfjs.getDocument({ data, isEvalSupported: false });
        pdfDocument = await loadingTask.promise;
        if (generation !== loadGeneration) return;
        if (!pdfDocument.numPages) throw new Error('PDF contains no pages');
        pdfDocumentRef.value = pdfDocument;
        pageCount.value = pdfDocument.numPages;
        currentPage.value = 1;
        pageInput.value = '1';
        await nextTick();
        if (generation !== loadGeneration) return;
        // 先滚到起始页再开始观察，避免把第一页也白画一遍。
        const startPage = clampPage(props.initialPage || 1);
        if (startPage > 1) {
          pendingInitialPage = startPage;
          currentPage.value = startPage;
          alignInitialPage();
          window.setTimeout(() => {
            if (generation === loadGeneration) pendingInitialPage = 0;
          }, 3000);
        }
        setupPageObserver();
        setupResizeObserver();
        void loadOutline(generation);
      } catch (error) {
        if (generation !== loadGeneration || (error instanceof Error && error.name === 'AbortError')) return;
        emit('error', error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  watch(currentPage, (pageNumber) => {
    pageInput.value = String(pageNumber);
  });

  watch(displayedPageNumbers, async () => {
    await nextTick();
    setupPageObserver();
    rerenderDisplayedPages();
  });

  watch(
    () => props.src,
    (src) => void loadPdf(src),
    { immediate: true },
  );

  watch(isMobileLayout, (mobile) => {
    if (!mobile) mobileNavigatorOpen.value = false;
  });

  watch(
    () => excerptVisible.value && isMobileLayout.value,
    (docked) => emit('excerpt-docked', docked),
  );

  watch(excerptHeld, (held) => {
    if (!held) handleSelectionChange();
  });

  onMounted(() => {
    window.addEventListener('resize', syncViewportSize, { passive: true });
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('pointerup', handleDocumentPointerUp);
    document.addEventListener('pointercancel', handleDocumentPointerUp);
    document.addEventListener('copy', handleDocumentCopy);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', syncViewportSize);
    document.removeEventListener('selectionchange', handleSelectionChange);
    document.removeEventListener('pointerup', handleDocumentPointerUp);
    document.removeEventListener('pointercancel', handleDocumentPointerUp);
    document.removeEventListener('copy', handleDocumentCopy);
    if (selectionFrame !== null) cancelAnimationFrame(selectionFrame);
    selectionFrame = null;
    if (scanTipTimer !== null) window.clearTimeout(scanTipTimer);
    scanTipTimer = null;
    void destroyPdf();
  });
</script>

<style scoped lang="less">
  .pdf-preview {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    color: var(--text-color);
    background: var(--workspace-panel-bg-color);
  }

  .pdf-preview__sidebar {
    width: var(--ui-layout-220, 220px);
    min-width: var(--ui-layout-220, 220px);
    height: 100%;
    border-right: 1px solid var(--card-border-color);
    background: var(--background-color);
  }

  .pdf-preview__workspace {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .pdf-preview__toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    // 窄宽度（参考栏）里内容超宽时从左侧开始，避免左边的缩略图开关和翻页被挤出可滚动区域。
    justify-content: safe center;
    min-height: var(--ui-layout-46, 46px);
    padding: var(--ui-space-6, 6px) var(--ui-space-10, 10px);
    gap: var(--ui-space-6, 6px);
    overflow-x: auto;
    box-sizing: border-box;
    border-bottom: 1px solid var(--card-border-color);
    background: color-mix(in srgb, var(--background-color) 94%, transparent);
    scrollbar-width: none;
  }

  .pdf-preview__toolbar::-webkit-scrollbar {
    display: none;
  }

  .pdf-preview__tool-group {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--ui-space-2, 2px);
    padding-right: var(--ui-space-6, 6px);
    border-right: 1px solid var(--card-border-color);
  }

  .pdf-preview__tool-group:last-child {
    padding-right: 0;
    border-right: 0;
  }

  :deep(.pdf-preview__icon-button.b_btn),
  :deep(.pdf-preview__zoom-value.b_btn) {
    width: var(--ui-layout-32, 32px);
    height: var(--ui-layout-32, 32px);
    padding: 0;
    line-height: 1;
    color: var(--desc-color);
    background: transparent;
  }

  :deep(.pdf-preview__icon-button.b_btn:hover),
  :deep(.pdf-preview__icon-button.b_btn.is-active),
  :deep(.pdf-preview__zoom-value.b_btn:hover) {
    color: var(--primary-color);
    background: var(--hover-background);
  }

  :deep(.pdf-preview__zoom-value.b_btn) {
    width: var(--ui-layout-48, 48px);
    font-size: var(--ui-font-12, 12px);
  }

  .pdf-preview__page-input {
    width: var(--ui-layout-44, 44px);
  }

  :deep(.pdf-preview__page-input .b-input) {
    height: var(--ui-layout-28, 28px);
    padding: 0 var(--ui-space-6, 6px) !important;
    text-align: center;
  }

  .pdf-preview__page-total {
    min-width: var(--ui-layout-30, 30px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    white-space: nowrap;
  }

  .pdf-preview__viewport {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 16px 16px 88px;
    box-sizing: border-box;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-x pan-y;
  }

  .pdf-preview__pages {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: max-content;
    min-width: 100%;
    min-height: 100%;
    transition: transform 60ms linear;
  }

  .pdf-preview__pages.is-single {
    flex-direction: column;
    justify-content: flex-start;
    gap: 14px;
  }

  .pdf-preview__pages.is-spread {
    display: grid;
    grid-template-columns: repeat(2, max-content);
    align-content: start;
    justify-content: center;
    align-items: start;
    gap: 14px 12px;
  }

  .pdf-preview__page {
    position: relative;
    width: min(100%, 960px);
    flex: 0 0 auto;
    overflow: hidden;
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 1px 4px rgb(15 23 42 / 10%);
  }

  .pdf-preview__canvas {
    display: block;
    width: 100%;
    height: 100%;
    background: #fff;
  }

  .pdf-preview__page-number {
    position: absolute;
    right: 8px;
    bottom: 8px;
    padding: var(--ui-space-3, 3px) var(--ui-space-7, 7px);
    border-radius: 999px;
    background: rgb(20 22 30 / 58%);
    color: #fff;
    font-size: var(--ui-font-11, 11px);
    line-height: 1.2;
    pointer-events: none;
    user-select: none;
    z-index: 2;
  }

  .pdf-preview__scan-tip {
    position: absolute;
    z-index: 7;
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    max-width: calc(100% - var(--ui-space-16, 16px));
    padding: var(--ui-space-7, 7px) var(--ui-space-10, 10px);
    border-radius: 8px;
    background: rgb(20 22 30 / 88%);
    color: #fff;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.4;
    pointer-events: none;
    box-shadow: 0 6px 18px rgb(0 0 0 / 22%);
  }

  @media (max-width: 600px) {
    .pdf-preview__toolbar {
      justify-content: flex-start;
      min-height: var(--ui-layout-44, 44px);
      padding: var(--ui-space-5, 5px) var(--ui-space-6, 6px);
    }

    .pdf-preview__tool-group {
      padding-right: var(--ui-space-3, 3px);
    }

    .pdf-preview__viewport {
      padding: 10px 8px 78px;
    }

    .pdf-preview__pages.is-single {
      gap: 10px;
    }

    .pdf-preview__page {
      border-radius: 2px;
      box-shadow: 0 1px 3px rgb(15 23 42 / 9%);
    }
  }
</style>

<style lang="less">
  // pdf.js 文字层（spans 由 pdf.js 生成，不带 scoped 属性）。取自 pdf_viewer.css 的最小子集：
  // 文字透明叠在画布上，只负责选择和复制；旋转随 data-main-rotation 变换。
  .pdf-preview__text-layer {
    position: absolute;
    inset: 0;
    z-index: 1;
    overflow: hidden;
    overflow: clip;
    line-height: 1;
    text-align: initial;
    text-size-adjust: none;
    forced-color-adjust: none;
    transform-origin: 0 0;
  }

  .pdf-preview__text-layer span,
  .pdf-preview__text-layer br {
    position: absolute;
    color: transparent;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
  }

  // 文字片段要压在 endOfContent 之上：拖选时 endOfContent 铺满整页，否则鼠标移动会落到它上面选不到字。
  .pdf-preview__text-layer > :not(.markedContent),
  .pdf-preview__text-layer .markedContent span:not(.markedContent) {
    z-index: 1;
  }

  .pdf-preview__text-layer span.markedContent {
    top: 0;
    height: 0;
  }

  .pdf-preview__text-layer ::selection {
    background: rgb(97 92 237 / 28%);
  }

  .pdf-preview__text-layer br::selection {
    background: transparent;
  }

  .pdf-preview__text-layer .endOfContent {
    position: absolute;
    inset: 100% 0 0;
    z-index: 0;
    display: block;
    cursor: default;
    user-select: none;
  }

  .pdf-preview__text-layer.selecting .endOfContent {
    top: 0;
  }

  .pdf-preview__text-layer[data-main-rotation='90'] {
    transform: rotate(90deg) translateY(-100%);
  }

  .pdf-preview__text-layer[data-main-rotation='180'] {
    transform: rotate(180deg) translate(-100%, -100%);
  }

  .pdf-preview__text-layer[data-main-rotation='270'] {
    transform: rotate(270deg) translateX(-100%);
  }
</style>

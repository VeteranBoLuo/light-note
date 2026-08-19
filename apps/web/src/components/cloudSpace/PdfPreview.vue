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

    <section class="pdf-preview__workspace">
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
            <span class="pdf-preview__page-number" aria-hidden="true">{{ pageNumber }} / {{ pageCount }}</span>
          </div>
        </div>
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
  import icon from '@/config/icon';
  import { useMobileLayout } from '@/composables/useMobileLayout';

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
  }>();

  const emit = defineEmits<{
    rendered: [];
    error: [error: Error];
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
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;
  let pinchTargetZoom = 1;
  const pinchPreviewScale = ref(1);
  const pinchOrigin = ref('50% 50%');

  let pdfRuntimePromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;

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

  async function loadPdfRuntime() {
    if (!pdfRuntimePromise) {
      pdfRuntimePromise = Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
      ]).then(([pdfjs, workerModule]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
        return pdfjs;
      });
    }
    return pdfRuntimePromise;
  }

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

  function releaseRenderedPage(pageNumber: number, clearCanvas = true) {
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
      if (!lastViewerWidth) {
        lastViewerWidth = currentWidth;
        return;
      }
      if (Math.abs(currentWidth - lastViewerWidth) < 2) return;
      lastViewerWidth = currentWidth;
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

  function handleWheel(event: WheelEvent) {
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
    renderRevisions.clear();
    renderingPages.clear();
    pageProxies.forEach((page) => page.cleanup());
    pageProxies.clear();
    renderedPages.clear();
    pageElements.clear();
    pageCanvases.clear();
    pageAspectRatios.value = new Map();
    pageSizes.value = new Map();
    pageCount.value = 0;
    currentPage.value = 1;
    pageInput.value = '1';
    outlineItems.value = [];
    firstPageRendered = false;
    lastViewerWidth = 0;
    const activeLoadingTask = loadingTask;
    const activeDocument = pdfDocument;
    loadingTask = null;
    pdfDocument = null;
    pdfDocumentRef.value = null;
    if (activeLoadingTask) await activeLoadingTask.destroy().catch(() => undefined);
    else await activeDocument?.destroy().catch(() => undefined);
  }

  async function loadPdf(src?: string) {
    await destroyPdf();
    const generation = loadGeneration;
    if (!src) {
      emit('error', new Error('PDF URL is empty'));
      return;
    }
    fetchController = new AbortController();
    try {
      const [pdfjs, response] = await Promise.all([
        loadPdfRuntime(),
        fetch(src, { mode: 'cors', signal: fetchController.signal }),
      ]);
      if (!response.ok) throw new Error(`PDF request failed with status ${response.status}`);
      const data = new Uint8Array(await response.arrayBuffer());
      if (generation !== loadGeneration) return;
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
      setupPageObserver();
      setupResizeObserver();
      void loadOutline(generation);
    } catch (error) {
      if (generation !== loadGeneration || (error instanceof Error && error.name === 'AbortError')) return;
      emit('error', error instanceof Error ? error : new Error(String(error)));
    }
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

  onMounted(() => window.addEventListener('resize', syncViewportSize, { passive: true }));

  onBeforeUnmount(() => {
    window.removeEventListener('resize', syncViewportSize);
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
    width: 220px;
    min-width: 220px;
    height: 100%;
    border-right: 1px solid var(--card-border-color);
    background: var(--background-color);
  }

  .pdf-preview__workspace {
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
    min-height: 46px;
    padding: 6px 10px;
    gap: 6px;
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
    gap: 2px;
    padding-right: 6px;
    border-right: 1px solid var(--card-border-color);
  }

  .pdf-preview__tool-group:last-child {
    padding-right: 0;
    border-right: 0;
  }

  :deep(.pdf-preview__icon-button.b_btn),
  :deep(.pdf-preview__zoom-value.b_btn) {
    width: 32px;
    height: 32px;
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
    width: 48px;
    font-size: 12px;
  }

  .pdf-preview__page-input {
    width: 44px;
  }

  :deep(.pdf-preview__page-input .b-input) {
    height: 28px;
    padding: 0 6px !important;
    text-align: center;
  }

  .pdf-preview__page-total {
    min-width: 30px;
    color: var(--desc-color);
    font-size: 12px;
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
    padding: 3px 7px;
    border-radius: 999px;
    background: rgb(20 22 30 / 58%);
    color: #fff;
    font-size: 11px;
    line-height: 1.2;
    pointer-events: none;
  }

  @media (max-width: 600px) {
    .pdf-preview__toolbar {
      justify-content: flex-start;
      min-height: 44px;
      padding: 5px 6px;
    }

    .pdf-preview__tool-group {
      padding-right: 3px;
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

<template>
  <div ref="viewerRef" class="pdf-preview" role="document" :aria-label="fileName">
    <div class="pdf-preview__pages">
      <div
        v-for="pageNumber in pageCount"
        :key="pageNumber"
        :ref="(element) => setPageElement(pageNumber, element)"
        class="pdf-preview__page"
        :style="{ aspectRatio: pageAspectRatios.get(pageNumber) || DEFAULT_PAGE_ASPECT_RATIO }"
        :data-page-number="pageNumber"
      >
        <canvas :ref="(element) => setPageCanvas(pageNumber, element)" class="pdf-preview__canvas" />
        <span class="pdf-preview__page-number" aria-hidden="true">{{ pageNumber }} / {{ pageCount }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import type { ComponentPublicInstance } from 'vue';
  import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

  const props = defineProps<{
    src?: string;
    fileName?: string;
  }>();

  const emit = defineEmits<{
    rendered: [];
    error: [error: Error];
  }>();

  const DEFAULT_PAGE_ASPECT_RATIO = '1 / 1.4142';
  const MAX_OUTPUT_SCALE = 2;
  const viewerRef = ref<HTMLElement | null>(null);
  const pageCount = ref(0);
  const pageAspectRatios = ref(new Map<number, string>());
  const pageElements = new Map<number, HTMLElement>();
  const pageCanvases = new Map<number, HTMLCanvasElement>();
  const pageProxies = new Map<number, PDFPageProxy>();
  const renderTasks = new Map<number, RenderTask>();
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
  let lastViewerWidth = 0;

  let pdfRuntimePromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.js')> | null = null;

  async function loadPdfRuntime() {
    if (!pdfRuntimePromise) {
      pdfRuntimePromise = Promise.all([
        import('pdfjs-dist/legacy/build/pdf.js'),
        import('pdfjs-dist/legacy/build/pdf.worker.min.js?url'),
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

  function isCancelledRenderError(error: unknown) {
    return error instanceof Error && error.name === 'RenderingCancelledException';
  }

  function releaseRenderedPage(pageNumber: number) {
    renderTasks.get(pageNumber)?.cancel();
    renderTasks.delete(pageNumber);
    pageProxies.get(pageNumber)?.cleanup();
    pageProxies.delete(pageNumber);
    renderedPages.delete(pageNumber);

    const pageElement = pageElements.get(pageNumber);
    if (pageElement) delete pageElement.dataset.rendered;

    const canvas = pageCanvases.get(pageNumber);
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
      canvas.style.width = '';
      canvas.style.height = '';
    }
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

    renderingPages.add(pageNumber);
    try {
      const page = await pdfDocument.getPage(pageNumber);
      if (generation !== loadGeneration) {
        page.cleanup();
        return;
      }
      pageProxies.set(pageNumber, page);

      const naturalViewport = page.getViewport({ scale: 1 });
      pageAspectRatios.value.set(pageNumber, `${naturalViewport.width} / ${naturalViewport.height}`);
      pageAspectRatios.value = new Map(pageAspectRatios.value);

      const availableWidth = Math.max(1, pageElement.clientWidth || viewerRef.value?.clientWidth || 720);
      const cssScale = availableWidth / naturalViewport.width;
      const viewport = page.getViewport({ scale: cssScale });
      const outputScale = Math.min(Math.max(window.devicePixelRatio || 1, 1), MAX_OUTPUT_SCALE);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('PDF canvas context is unavailable');

      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const task = page.render({
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        background: '#ffffff',
      });
      renderTasks.set(pageNumber, task);
      await task.promise;
      renderTasks.delete(pageNumber);
      if (generation !== loadGeneration) return;

      renderedPages.add(pageNumber);
      pageElement.dataset.rendered = 'true';
      if (!firstPageRendered) {
        firstPageRendered = true;
        emit('rendered');
      }
    } catch (error) {
      renderTasks.delete(pageNumber);
      if (generation !== loadGeneration || isCancelledRenderError(error)) return;
      emit('error', error instanceof Error ? error : new Error(String(error)));
    } finally {
      renderingPages.delete(pageNumber);
    }
  }

  function setupPageObserver() {
    intersectionObserver?.disconnect();
    if (typeof IntersectionObserver === 'undefined') {
      void renderPage(1);
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
      {
        root: viewerRef.value,
        rootMargin: '120% 0px',
        threshold: 0.01,
      },
    );
    pageElements.forEach((element) => intersectionObserver?.observe(element));
  }

  function renderVisiblePagesAfterResize() {
    resizeTimer = null;
    const viewer = viewerRef.value;
    if (!viewer) return;
    const viewerRect = viewer.getBoundingClientRect();
    pageElements.forEach((element, pageNumber) => {
      const rect = element.getBoundingClientRect();
      const isNearViewport = rect.bottom >= viewerRect.top - viewerRect.height && rect.top <= viewerRect.bottom + viewerRect.height;
      if (!isNearViewport || !renderedPages.has(pageNumber)) return;
      releaseRenderedPage(pageNumber);
      void renderPage(pageNumber);
    });
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
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(renderVisiblePagesAfterResize, 120);
    });
    resizeObserver.observe(viewerRef.value);
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
    renderTasks.forEach((task) => task.cancel());
    renderTasks.clear();
    renderingPages.clear();
    pageProxies.forEach((page) => page.cleanup());
    pageProxies.clear();
    renderedPages.clear();
    pageElements.clear();
    pageCanvases.clear();
    pageAspectRatios.value = new Map();
    pageCount.value = 0;
    firstPageRendered = false;
    lastViewerWidth = 0;
    const activeLoadingTask = loadingTask;
    const activeDocument = pdfDocument;
    loadingTask = null;
    pdfDocument = null;
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

      // 用户上传的 PDF 属于不可信输入；关闭 PDF.js 的动态代码求值路径，
      // 避免畸形字体数据触发脚本执行，同时不影响常规 PDF 渲染。
      loadingTask = pdfjs.getDocument({ data, isEvalSupported: false });
      pdfDocument = await loadingTask.promise;
      if (generation !== loadGeneration) return;
      if (!pdfDocument.numPages) throw new Error('PDF contains no pages');

      pageCount.value = pdfDocument.numPages;
      await nextTick();
      if (generation !== loadGeneration) return;
      setupPageObserver();
      setupResizeObserver();
    } catch (error) {
      if (generation !== loadGeneration || (error instanceof Error && error.name === 'AbortError')) return;
      emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  watch(
    () => props.src,
    (src) => void loadPdf(src),
    { immediate: true },
  );

  onBeforeUnmount(() => {
    void destroyPdf();
  });
</script>

<style scoped lang="less">
  .pdf-preview {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    box-sizing: border-box;
    padding: 16px 16px 88px;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-x pan-y pinch-zoom;
    background: var(--workspace-panel-bg-color);
  }

  .pdf-preview__pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    min-width: 0;
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
    .pdf-preview {
      padding: 10px 8px 78px;
    }

    .pdf-preview__pages {
      gap: 10px;
    }

    .pdf-preview__page {
      border-radius: 2px;
      box-shadow: 0 1px 3px rgb(15 23 42 / 9%);
    }
  }
</style>

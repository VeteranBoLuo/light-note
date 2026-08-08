<template>
  <div class="pdf-navigator">
    <BTabs v-model:active-tab="activeTab" :options="tabs" variant="segment" class="pdf-navigator__tabs" />

    <div v-if="activeTab === 'pages'" ref="listRef" class="pdf-navigator__list">
      <BButton
        v-for="pageNumber in pageCount"
        :key="pageNumber"
        :ref="(element) => setThumbnailButton(pageNumber, element)"
        class="pdf-navigator__thumbnail"
        :class="{ 'is-active': activePage === pageNumber }"
        :aria-label="t('cloudSpace.previewPanel.pdfGoToPage', { page: pageNumber })"
        :data-page-number="pageNumber"
        @click="emit('select-page', pageNumber)"
      >
        <span class="pdf-navigator__paper">
          <canvas :ref="(element) => setThumbnailCanvas(pageNumber, element)" />
        </span>
        <span class="pdf-navigator__page-label">{{ pageNumber }}</span>
      </BButton>
    </div>

    <div v-else class="pdf-navigator__outline">
      <BButton
        v-for="item in outline"
        :key="item.id"
        class="pdf-navigator__outline-item"
        :class="{ 'is-active': item.pageNumber === activePage }"
        :style="{ paddingInlineStart: `${12 + item.depth * 16}px` }"
        :disabled="!item.pageNumber"
        @click="item.pageNumber && emit('select-page', item.pageNumber)"
      >
        <span class="pdf-navigator__outline-title">{{ item.title }}</span>
        <span v-if="item.pageNumber" class="pdf-navigator__outline-page">{{ item.pageNumber }}</span>
      </BButton>
      <p v-if="!outline.length" class="pdf-navigator__empty">
        {{ t('cloudSpace.previewPanel.pdfNoOutline') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import type { ComponentPublicInstance } from 'vue';
  import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';

  export interface PdfOutlineItem {
    id: string;
    title: string;
    pageNumber: number | null;
    depth: number;
  }

  const props = defineProps<{
    document: PDFDocumentProxy | null;
    pageCount: number;
    activePage: number;
    outline: PdfOutlineItem[];
  }>();

  const emit = defineEmits<{
    'select-page': [pageNumber: number];
  }>();

  const { t } = useI18n();
  const activeTab = ref('pages');
  const listRef = ref<HTMLElement | null>(null);
  const thumbnailButtons = new Map<number, HTMLElement>();
  const thumbnailCanvases = new Map<number, HTMLCanvasElement>();
  const renderTasks = new Map<number, RenderTask>();
  const renderedPages = new Set<number>();
  let observer: IntersectionObserver | null = null;

  const tabs = computed(() => [
    { key: 'pages', label: t('cloudSpace.previewPanel.pdfThumbnails') },
    { key: 'outline', label: t('cloudSpace.previewPanel.pdfOutline') },
  ]);

  function normalizeElement<T extends Element>(element: Element | ComponentPublicInstance | null): T | null {
    if (element instanceof Element) return element as T;
    const root = element?.$el;
    return root instanceof Element ? (root as T) : null;
  }

  function setThumbnailButton(pageNumber: number, element: Element | ComponentPublicInstance | null) {
    const button = normalizeElement<HTMLElement>(element);
    if (button) thumbnailButtons.set(pageNumber, button);
    else thumbnailButtons.delete(pageNumber);
  }

  function setThumbnailCanvas(pageNumber: number, element: Element | ComponentPublicInstance | null) {
    const canvas = normalizeElement<HTMLCanvasElement>(element);
    if (canvas) thumbnailCanvases.set(pageNumber, canvas);
    else thumbnailCanvases.delete(pageNumber);
  }

  async function renderThumbnail(pageNumber: number) {
    if (!props.document || renderedPages.has(pageNumber) || renderTasks.has(pageNumber)) return;
    const canvas = thumbnailCanvases.get(pageNumber);
    if (!canvas) return;
    try {
      const page = await props.document.getPage(pageNumber);
      const naturalViewport = page.getViewport({ scale: 1 });
      const cssWidth = 132;
      const viewport = page.getViewport({ scale: cssWidth / naturalViewport.width });
      const outputScale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 1.5);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;
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
      renderedPages.add(pageNumber);
    } catch (error) {
      renderTasks.delete(pageNumber);
      if (error instanceof Error && error.name === 'RenderingCancelledException') return;
    }
  }

  function setupObserver() {
    observer?.disconnect();
    if (activeTab.value !== 'pages') return;
    if (typeof IntersectionObserver === 'undefined') {
      void renderThumbnail(props.activePage);
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber || 0);
          if (pageNumber) void renderThumbnail(pageNumber);
        });
      },
      { root: listRef.value, rootMargin: '100% 0px', threshold: 0.01 },
    );
    thumbnailButtons.forEach((button) => observer?.observe(button));
  }

  function resetThumbnails() {
    observer?.disconnect();
    renderTasks.forEach((task) => task.cancel());
    renderTasks.clear();
    renderedPages.clear();
    thumbnailCanvases.forEach((canvas) => {
      canvas.width = 1;
      canvas.height = 1;
    });
  }

  watch(
    () => [props.document, props.pageCount, activeTab.value],
    async () => {
      if (!props.document || !props.pageCount) return;
      await nextTick();
      setupObserver();
    },
    { immediate: true },
  );

  watch(
    () => props.document,
    () => resetThumbnails(),
  );

  watch(
    () => props.activePage,
    async (pageNumber) => {
      await nextTick();
      const button = thumbnailButtons.get(pageNumber);
      if (typeof button?.scrollIntoView === 'function') button.scrollIntoView({ block: 'nearest' });
      void renderThumbnail(pageNumber);
    },
  );

  onBeforeUnmount(resetThumbnails);
</script>

<style scoped lang="less">
  .pdf-navigator {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    padding: 12px;
    box-sizing: border-box;
    background: var(--background-color);
  }

  .pdf-navigator__list,
  .pdf-navigator__outline {
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
  }

  :deep(.pdf-navigator__tabs .tab) {
    min-width: 0;
    flex: 1 1 50%;
    justify-content: center;
  }

  :deep(.pdf-navigator__thumbnail.b_btn) {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: auto;
    padding: 9px 8px 7px;
    margin-bottom: 8px;
    gap: 6px;
    line-height: 1;
    border: 1px solid transparent !important;
    background: transparent;
  }

  :deep(.pdf-navigator__thumbnail.b_btn:hover) {
    background: var(--hover-background);
  }

  :deep(.pdf-navigator__thumbnail.b_btn.is-active) {
    border-color: var(--primary-color) !important;
    background: var(--primary-light-color);
  }

  .pdf-navigator__paper {
    display: grid;
    place-items: center;
    width: 136px;
    min-height: 100px;
    max-width: 100%;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 1px 4px rgb(15 23 42 / 12%);
  }

  .pdf-navigator__paper canvas {
    display: block;
    max-width: 100%;
    height: auto;
  }

  .pdf-navigator__page-label {
    color: var(--desc-color);
    font-size: 12px;
  }

  :deep(.pdf-navigator__outline-item.b_btn) {
    justify-content: space-between;
    width: 100%;
    height: 36px;
    padding-right: 10px;
    gap: 8px;
    line-height: 1.2;
    background: transparent;
  }

  :deep(.pdf-navigator__outline-item.b_btn:hover),
  :deep(.pdf-navigator__outline-item.b_btn.is-active) {
    color: var(--primary-color);
    background: var(--hover-background);
  }

  .pdf-navigator__outline-title {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pdf-navigator__outline-page {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 12px;
  }

  .pdf-navigator__empty {
    padding: 32px 12px;
    color: var(--desc-color);
    font-size: 13px;
    text-align: center;
  }
</style>

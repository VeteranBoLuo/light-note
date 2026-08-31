<template>
  <section class="local-tool" aria-labelledby="pdf-organizer-title">
    <div
      v-if="!pages.length && !preparing"
      class="local-tool__drop-zone"
      :class="{ 'is-dragging': dragging }"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <span class="local-tool__drop-icon"><SvgIcon :src="icon.toolbox.pdf" size="34" /></span>
      <h2 id="pdf-organizer-title">{{ t('toolbox.tool.pdf_organizer.name') }}</h2>
      <p>{{ t('toolbox.local.dropHintPdf') }}</p>
      <BUpload
        raw-file
        multiple
        accept="application/pdf,.pdf"
        :max-total-size="null"
        :aria-label="t('toolbox.local.choosePdf')"
        @change="handleFiles"
      >
        <BButton type="primary">
          <SvgIcon :src="icon.toolbox.upload" size="16" />
          {{ t('toolbox.local.choosePdf') }}
        </BButton>
      </BUpload>
    </div>

    <div v-else-if="preparing" class="local-tool__loading">
      <BLoading inline loading :title="t('toolbox.local.preparing')" />
    </div>

    <template v-else>
      <header class="local-tool__toolbar">
        <div>
          <strong>{{ t('toolbox.local.pages', { count: pages.length }) }}</strong>
          <span>{{ t('toolbox.local.files', { count: sources.length }) }}</span>
        </div>
        <div class="local-tool__toolbar-actions">
          <BButton size="small" :disabled="Boolean(exporting)" @click="toggleSelectAll">
            {{ allSelected ? t('toolbox.local.clearSelection') : t('toolbox.local.selectAll') }}
          </BButton>
          <BUpload
            raw-file
            multiple
            accept="application/pdf,.pdf"
            :max-total-size="null"
            :disabled="Boolean(exporting)"
            :aria-label="t('toolbox.local.addMore')"
            @change="handleFiles"
          >
            <BButton size="small" :disabled="Boolean(exporting)"
              ><SvgIcon :src="icon.toolbox.upload" size="14" />{{ t('toolbox.local.addMore') }}</BButton
            >
          </BUpload>
        </div>
      </header>

      <div class="local-tool__selection-bar" :class="{ 'has-selection': selectedPages.length > 0 }">
        <span>{{ t('toolbox.local.selectedPages', { count: selectedPages.length }) }}</span>
        <div>
          <BButton
            size="small"
            :disabled="!selectedPages.length"
            :loading="exporting === 'selected'"
            @click="exportSelection"
          >
            <SvgIcon :src="icon.toolbox.download" size="14" />{{ t('toolbox.local.exportSelected') }}
          </BButton>
          <BButton type="primary" size="small" :loading="exporting === 'all'" @click="exportAll">
            <SvgIcon :src="icon.toolbox.download" size="14" />{{ t('toolbox.local.exportAll') }}
          </BButton>
        </div>
      </div>

      <VueDraggable
        v-model="pages"
        class="pdf-page-grid"
        :animation="180"
        :delay="80"
        :force-fallback="true"
        :disabled="Boolean(exporting)"
        handle=".pdf-page-card__drag"
      >
        <article
          v-for="(page, index) in pages"
          :key="page.id"
          class="pdf-page-card"
          :class="{ 'is-selected': page.selected }"
        >
          <div class="pdf-page-card__top">
            <BCheckbox
              :checked="page.selected"
              :disabled="Boolean(exporting)"
              :aria-label="`${index + 1}`"
              @update:checked="page.selected = $event"
            />
            <span class="pdf-page-card__drag" aria-hidden="true">•••</span>
          </div>
          <div class="pdf-page-card__preview" :style="{ transform: `rotate(${page.rotation}deg)` }">
            <PdfPageThumbnail
              v-if="sourceFor(page)"
              :source="sourceFor(page)!"
              :source-page-index="page.sourcePageIndex"
            />
          </div>
          <div class="pdf-page-card__meta">
            <strong>{{ index + 1 }}</strong>
            <span :title="page.sourceName">{{ page.sourceName }} · {{ page.sourcePageIndex + 1 }}</span>
          </div>
          <div class="pdf-page-card__actions">
            <BTooltip :title="t('toolbox.local.moveBefore')">
              <BButton
                :disabled="Boolean(exporting) || index === 0"
                :aria-label="t('toolbox.local.moveBefore')"
                @click="move(index, -1)"
              >
                <SvgIcon class="is-left" :src="icon.toolbox.arrow" size="15" />
              </BButton>
            </BTooltip>
            <BTooltip :title="t('toolbox.local.rotateRight')">
              <BButton
                :disabled="Boolean(exporting)"
                :aria-label="t('toolbox.local.rotateRight')"
                @click="rotate(page, 90)"
              >
                <SvgIcon :src="icon.toolbox.rotate" size="15" />
              </BButton>
            </BTooltip>
            <BTooltip :title="t('toolbox.local.deletePage')">
              <BButton
                :disabled="Boolean(exporting)"
                :aria-label="t('toolbox.local.deletePage')"
                @click="removePage(index)"
              >
                <SvgIcon :src="icon.toolbox.delete" size="15" />
              </BButton>
            </BTooltip>
            <BTooltip :title="t('toolbox.local.moveAfter')">
              <BButton
                :disabled="Boolean(exporting) || index === pages.length - 1"
                :aria-label="t('toolbox.local.moveAfter')"
                @click="move(index, 1)"
              >
                <SvgIcon :src="icon.toolbox.arrow" size="15" />
              </BButton>
            </BTooltip>
          </div>
        </article>
      </VueDraggable>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onDeactivated, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { VueDraggable } from 'vue-draggable-plus';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import {
    exportPdfPages,
    parsePdfFiles,
    PDF_ORGANIZER_MAX_BYTES,
    PDF_ORGANIZER_MAX_FILES,
    PDF_ORGANIZER_MAX_PAGES,
    PdfOrganizerError,
    releasePdfThumbnailSources,
    type PdfOrganizerPage,
    type PdfOrganizerSource,
  } from '@/utils/pdfOrganizer';
  import { downloadToolboxBlob } from '@/utils/toolboxLocal';
  import PdfPageThumbnail from './PdfPageThumbnail.vue';

  const { t } = useI18n();
  const sources = ref<PdfOrganizerSource[]>([]);
  const pages = ref<PdfOrganizerPage[]>([]);
  const preparing = ref(false);
  const exporting = ref<'all' | 'selected' | null>(null);
  const dragging = ref(false);
  let dragDepth = 0;
  const selectedPages = computed(() => pages.value.filter((page) => page.selected));
  const allSelected = computed(() => pages.value.length > 0 && selectedPages.value.length === pages.value.length);

  function sourceFor(page: PdfOrganizerPage) {
    return sources.value.find((source) => source.id === page.sourceId);
  }

  function showError(error: unknown) {
    if (error instanceof PdfOrganizerError) {
      if (error.code === 'INVALID_TYPE') return message.warning(t('toolbox.local.invalidType'));
      if (error.code === 'TOO_MANY') return message.warning(t('toolbox.local.tooMany'));
      if (error.code === 'TOO_LARGE') return message.warning(t('common.maxTotalSize', { n: 80 }));
      if (error.code === 'TOO_MANY_PAGES')
        return message.warning(t('toolbox.local.tooManyPages', { max: PDF_ORGANIZER_MAX_PAGES }));
    }
    message.error(t('toolbox.local.localFailed'));
  }

  async function handleFiles(value: File[]) {
    const files = Array.isArray(value) ? value : [];
    if (!files.length) return;
    if (sources.value.length + files.length > PDF_ORGANIZER_MAX_FILES) {
      message.warning(t('toolbox.local.tooMany'));
      return;
    }
    if (
      sources.value.reduce((sum, source) => sum + source.size, 0) + files.reduce((sum, file) => sum + file.size, 0) >
      PDF_ORGANIZER_MAX_BYTES
    ) {
      message.warning(t('common.maxTotalSize', { n: 80 }));
      return;
    }
    preparing.value = true;
    try {
      const parsed = await parsePdfFiles(files);
      if (pages.value.length + parsed.pages.length > PDF_ORGANIZER_MAX_PAGES)
        throw new PdfOrganizerError('TOO_MANY_PAGES');
      sources.value.push(...parsed.sources);
      pages.value.push(...parsed.pages);
    } catch (error) {
      showError(error);
    } finally {
      preparing.value = false;
    }
  }

  function onDragEnter() {
    dragDepth += 1;
    dragging.value = true;
  }

  function onDragLeave() {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dragging.value = false;
  }

  function onDrop(event: DragEvent) {
    dragDepth = 0;
    dragging.value = false;
    void handleFiles(Array.from(event.dataTransfer?.files || []));
  }

  function toggleSelectAll() {
    const next = !allSelected.value;
    pages.value.forEach((page) => (page.selected = next));
  }

  function rotate(page: PdfOrganizerPage, angle: number) {
    page.rotation = (((page.rotation + angle) % 360) + 360) % 360;
  }

  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= pages.value.length) return;
    const [page] = pages.value.splice(index, 1);
    if (page) pages.value.splice(target, 0, page);
  }

  function removePage(index: number) {
    const [removed] = pages.value.splice(index, 1);
    if (!removed || pages.value.some((page) => page.sourceId === removed.sourceId)) return;
    sources.value = sources.value.filter((source) => source.id !== removed.sourceId);
    void releasePdfThumbnailSources([removed.sourceId]);
  }

  async function runExport(kind: 'all' | 'selected') {
    const sourcePages = kind === 'selected' ? selectedPages.value : pages.value;
    const outputPages = sourcePages.map((page) => ({ ...page }));
    if (!outputPages.length) {
      message.warning(t('toolbox.local.emptyExport'));
      return;
    }
    exporting.value = kind;
    try {
      const result = await exportPdfPages(sources.value, outputPages);
      downloadToolboxBlob(result.blob, result.fileName);
    } catch (error) {
      showError(error);
    } finally {
      exporting.value = null;
    }
  }

  const exportAll = () => runExport('all');
  const exportSelection = () => runExport('selected');

  function releaseThumbnails() {
    void releasePdfThumbnailSources(sources.value.map((source) => source.id));
  }

  onDeactivated(releaseThumbnails);
  onBeforeUnmount(releaseThumbnails);
</script>

<style scoped lang="less">
  .local-tool {
    display: grid;
    gap: 18px;
  }
  .local-tool__drop-zone {
    min-height: 350px;
    padding: 42px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1px dashed color-mix(in srgb, var(--primary-color) 38%, var(--surface-border-color));
    border-radius: 20px;
    text-align: center;
    background: color-mix(in srgb, var(--primary-color) 3%, var(--card-background));
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      transform 0.18s ease;
  }
  .local-tool__drop-zone.is-dragging {
    transform: translateY(-2px);
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
  }
  .local-tool__drop-icon {
    width: 64px;
    height: 64px;
    margin-bottom: 14px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--primary-color) 20%, var(--surface-border-color));
    border-radius: 19px;
    color: var(--primary-color);
    background: var(--card-background);
    box-shadow: 0 12px 30px rgba(38, 35, 82, 0.08);
  }
  .local-tool__drop-zone h2 {
    margin: 0;
    font-size: 21px;
  }
  .local-tool__drop-zone p {
    max-width: 480px;
    margin: 9px 0 20px;
    color: var(--desc-color);
    line-height: 1.65;
  }
  .local-tool__drop-zone :deep(.b_btn),
  .local-tool__toolbar-actions :deep(.b_btn),
  .local-tool__selection-bar :deep(.b_btn) {
    gap: 7px;
  }
  .local-tool__loading {
    min-height: 260px;
    display: grid;
    place-items: center;
  }
  .local-tool__toolbar,
  .local-tool__selection-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .local-tool__toolbar > div:first-child {
    display: grid;
    gap: 3px;
  }
  .local-tool__toolbar strong {
    font-size: 16px;
  }
  .local-tool__toolbar span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .local-tool__toolbar-actions,
  .local-tool__selection-bar > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .local-tool__selection-bar {
    min-height: 50px;
    padding: 8px 10px 8px 14px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    color: var(--desc-color);
    background: var(--card-background);
  }
  .local-tool__selection-bar.has-selection {
    border-color: var(--primary-color);
    color: var(--text-color);
  }
  .pdf-page-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
    gap: 14px;
    align-items: start;
  }
  .pdf-page-card {
    position: relative;
    min-width: 0;
    padding: 8px;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--card-background);
    transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;
  }
  .pdf-page-card.is-selected {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 1px var(--primary-color);
  }
  .pdf-page-card__top {
    position: absolute;
    z-index: 2;
    top: 11px;
    right: 11px;
    left: 11px;
    display: flex;
    justify-content: space-between;
    pointer-events: none;
  }
  .pdf-page-card__top :deep(.b-checkbox),
  .pdf-page-card__drag {
    pointer-events: auto;
  }
  .pdf-page-card__top :deep(.b-checkbox) {
    padding: 3px;
    border-radius: 7px;
    background: var(--card-background);
  }
  .pdf-page-card__drag {
    padding: 2px 6px;
    border: 1px solid var(--surface-border-color);
    border-radius: 7px;
    color: var(--desc-color);
    background: var(--card-background);
    cursor: grab;
    letter-spacing: 2px;
  }
  .pdf-page-card__preview {
    margin: 0 auto;
    transform-origin: center;
    transition: transform 0.2s ease;
  }
  .pdf-page-card__meta {
    min-width: 0;
    padding: 9px 2px 7px;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .pdf-page-card__meta strong {
    min-width: 23px;
    height: 23px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
    font-size: 12px;
  }
  .pdf-page-card__meta span {
    min-width: 0;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pdf-page-card__actions {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .pdf-page-card__actions :deep(.b_btn) {
    width: 100%;
    height: 28px;
    padding: 0;
    color: var(--desc-color);
    background: transparent;
  }
  .pdf-page-card__actions .is-left {
    transform: rotate(180deg);
  }
  @media (hover: hover) and (pointer: fine) {
    .pdf-page-card:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--primary-color) 35%, var(--surface-border-color));
      box-shadow: 0 12px 28px rgba(31, 34, 66, 0.08);
    }
  }
  @media (max-width: 767px) {
    .local-tool {
      gap: 13px;
    }
    .local-tool__drop-zone {
      min-height: 280px;
      padding: 30px 18px;
      border-radius: 16px;
    }
    .local-tool__toolbar {
      align-items: flex-start;
    }
    .local-tool__toolbar-actions {
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .local-tool__selection-bar {
      align-items: flex-start;
      flex-direction: column;
    }
    .local-tool__selection-bar > div {
      width: 100%;
    }
    .local-tool__selection-bar :deep(.b_btn) {
      flex: 1;
      width: auto;
    }
    .pdf-page-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
  }
  html.light-note-mobile-rendering .local-tool__drop-zone,
  html.light-note-mobile-rendering .pdf-page-card__meta strong {
    background: var(--card-background);
  }
</style>

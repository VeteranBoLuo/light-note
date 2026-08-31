<template>
  <section class="pdf-image-tool" :aria-label="t('toolbox.tool.pdf_to_images.name')">
    <div
      v-if="!files.length"
      class="pdf-image-tool__drop-zone"
      :class="{ 'is-dragging': dragging }"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <span><SvgIcon :src="icon.toolbox.pdfToImages" size="36" /></span>
      <h2>{{ t('toolbox.tool.pdf_to_images.name') }}</h2>
      <p>{{ t('toolbox.local.pdfToImagesDropHint') }}</p>
      <BUpload raw-file multiple accept="application/pdf,.pdf" :max-total-size="null" @change="addFiles">
        <BButton type="primary"
          ><SvgIcon :src="icon.toolbox.upload" size="16" />{{ t('toolbox.local.choosePdf') }}</BButton
        >
      </BUpload>
    </div>

    <template v-else>
      <div class="pdf-image-tool__settings">
        <div>
          <label id="pdf-image-format">{{ t('toolbox.local.format') }}</label>
          <BSelect
            v-model:value="format"
            :options="formatOptions"
            :disabled="converting"
            aria-labelledby="pdf-image-format"
          />
        </div>
        <div>
          <label id="pdf-image-scale">{{ t('toolbox.local.resolution') }}</label>
          <BSelect
            v-model:value="scale"
            :options="scaleOptions"
            :disabled="converting"
            aria-labelledby="pdf-image-scale"
          />
        </div>
        <div>
          <label id="pdf-image-quality">{{ t('toolbox.local.quality') }}</label>
          <BSelect
            v-model:value="quality"
            :options="qualityOptions"
            :disabled="converting || format === 'image/png'"
            aria-labelledby="pdf-image-quality"
          />
        </div>
        <BUpload
          raw-file
          multiple
          accept="application/pdf,.pdf"
          :max-total-size="null"
          :disabled="converting"
          @change="addFiles"
        >
          <BButton :disabled="converting"
            ><SvgIcon :src="icon.toolbox.upload" size="15" />{{ t('toolbox.local.addMore') }}</BButton
          >
        </BUpload>
        <BButton type="primary" :loading="converting" @click="convert">
          {{
            converting
              ? t('toolbox.local.convertingPages', { current: progress.completed, total: progress.total || '—' })
              : t('toolbox.local.convertToImages')
          }}
        </BButton>
      </div>

      <BProgress
        v-if="converting && progress.total"
        :percent="Math.round((progress.completed / progress.total) * 100)"
        show-info
      />

      <div class="pdf-image-tool__files">
        <article v-for="(file, index) in files" :key="`${file.name}:${file.lastModified}:${index}`">
          <span><SvgIcon :src="icon.toolbox.pdf" size="18" /></span>
          <div
            ><strong :title="file.name">{{ file.name }}</strong
            ><small>{{ formatToolboxBytes(file.size) }}</small></div
          >
          <BTooltip :title="t('toolbox.workbench.removeFile')">
            <BButton :disabled="converting" :aria-label="t('toolbox.workbench.removeFile')" @click="removeFile(index)">
              <SvgIcon :src="icon.toolbox.delete" size="15" />
            </BButton>
          </BTooltip>
        </article>
      </div>

      <div v-if="results.length" class="pdf-image-tool__result-head">
        <div
          ><strong>{{ t('toolbox.local.imagesReady', { count: results.length }) }}</strong
          ><span>{{ t('toolbox.local.pdfImageResultHint') }}</span></div
        >
        <BButton type="primary" :loading="bundling" @click="downloadAll">
          <SvgIcon :src="icon.toolbox.download" size="15" />{{ t('toolbox.local.downloadAll') }}
        </BButton>
      </div>

      <div v-if="results.length" class="pdf-image-tool__results">
        <article v-for="result in results" :key="`${result.sourceName}:${result.pageNumber}`">
          <img :src="result.previewUrl" :alt="result.fileName" />
          <div>
            <strong :title="result.fileName">{{ result.fileName }}</strong>
            <small>{{ result.width }}×{{ result.height }} · {{ formatToolboxBytes(result.blob.size) }}</small>
          </div>
          <BButton size="small" @click="downloadOne(result)">
            <SvgIcon :src="icon.toolbox.download" size="14" />{{ t('toolbox.local.downloadOne') }}
          </BButton>
        </article>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import {
    bundlePdfImageResults,
    convertPdfsToImages,
    PdfToImagesError,
    releasePdfImageResults,
    validatePdfToImageFiles,
    type PdfImageFormat,
    type PdfImageResult,
  } from '@/utils/pdfToImages';
  import { downloadToolboxBlob, formatToolboxBytes } from '@/utils/toolboxLocal';

  const { t } = useI18n();
  const files = ref<File[]>([]);
  const format = ref<PdfImageFormat>('image/jpeg');
  const scale = ref<1 | 1.5 | 2>(1.5);
  const quality = ref(0.9);
  const converting = ref(false);
  const bundling = ref(false);
  const progress = ref({ completed: 0, total: 0 });
  const results = ref<PdfImageResult[]>([]);
  const dragging = ref(false);
  let dragDepth = 0;

  const formatOptions = computed(() => [
    { value: 'image/jpeg', label: 'JPG' },
    { value: 'image/png', label: 'PNG' },
  ]);
  const scaleOptions = computed(() => [
    { value: 1, label: t('toolbox.local.resolutionStandard') },
    { value: 1.5, label: t('toolbox.local.resolutionClear') },
    { value: 2, label: t('toolbox.local.resolutionHigh') },
  ]);
  const qualityOptions = computed(() => [
    { value: 0.78, label: t('toolbox.local.qualityCompact') },
    { value: 0.9, label: t('toolbox.local.qualityBalanced') },
    { value: 0.96, label: t('toolbox.local.qualityHigh') },
  ]);

  function clearResults() {
    releasePdfImageResults(results.value);
    results.value = [];
    progress.value = { completed: 0, total: 0 };
  }

  function showError(error: unknown) {
    if (error instanceof PdfToImagesError) {
      if (error.code === 'TOO_MANY') return message.warning(t('toolbox.local.pdfToImagesTooMany'));
      if (error.code === 'TOO_LARGE') return message.warning(t('common.maxTotalSize', { n: 80 }));
      if (error.code === 'TOO_MANY_PAGES') return message.warning(t('toolbox.local.pdfToImagesTooManyPages'));
      if (error.code === 'INVALID_TYPE') return message.warning(t('toolbox.local.invalidType'));
      if (error.code === 'INVALID_PDF') return message.error(t('toolbox.local.invalidPdf'));
    }
    message.error(t('toolbox.local.localFailed'));
  }

  function addFiles(value: File[]) {
    if (converting.value) return;
    const additions = Array.isArray(value) ? value : [];
    if (!additions.length) return;
    try {
      validatePdfToImageFiles([...files.value, ...additions]);
      files.value.push(...additions);
      clearResults();
    } catch (error) {
      showError(error);
    }
  }

  function removeFile(index: number) {
    files.value.splice(index, 1);
    clearResults();
  }

  async function convert() {
    if (!files.value.length || converting.value) return;
    clearResults();
    converting.value = true;
    try {
      results.value = await convertPdfsToImages(
        files.value,
        { format: format.value, scale: scale.value, quality: quality.value },
        (completed, total) => (progress.value = { completed, total }),
      );
      message.success(t('toolbox.local.imagesConverted', { count: results.value.length }));
    } catch (error) {
      showError(error);
    } finally {
      converting.value = false;
    }
  }

  function downloadOne(result: PdfImageResult) {
    downloadToolboxBlob(result.blob, result.fileName);
  }

  async function downloadAll() {
    if (!results.value.length || bundling.value) return;
    bundling.value = true;
    try {
      if (results.value.length === 1) downloadOne(results.value[0]!);
      else downloadToolboxBlob(await bundlePdfImageResults(results.value), 'lightnote-pdf-images.zip');
    } catch {
      message.error(t('toolbox.local.localFailed'));
    } finally {
      bundling.value = false;
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
    addFiles(Array.from(event.dataTransfer?.files || []));
  }

  watch([format, scale, quality], clearResults);
  onBeforeUnmount(clearResults);
</script>

<style scoped lang="less">
  .pdf-image-tool {
    display: grid;
    gap: 16px;
  }
  .pdf-image-tool__drop-zone {
    min-height: 300px;
    padding: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 10px;
    border: 1px dashed var(--surface-border-color);
    border-radius: 18px;
    text-align: center;
    background: var(--workspace-panel-bg-color);
  }
  .pdf-image-tool__drop-zone.is-dragging {
    border: 2px solid var(--primary-color);
    background: var(--card-background);
  }
  .pdf-image-tool__drop-zone > span {
    width: 68px;
    height: 68px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    color: #3975d5;
    background: var(--card-background);
  }
  .pdf-image-tool__drop-zone h2 {
    margin: 4px 0 0;
    font-size: 22px;
  }
  .pdf-image-tool__drop-zone p {
    margin: 0 0 10px;
    color: var(--desc-color);
  }
  .pdf-image-tool__settings {
    padding: 14px;
    display: grid;
    grid-template-columns: repeat(3, minmax(150px, 1fr)) auto auto;
    gap: 10px;
    align-items: end;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .pdf-image-tool__settings > div {
    min-width: 0;
    display: grid;
    gap: 6px;
  }
  .pdf-image-tool__settings label {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 650;
  }
  .pdf-image-tool__files,
  .pdf-image-tool__results {
    display: grid;
    gap: 9px;
  }
  .pdf-image-tool__files {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  }
  .pdf-image-tool__files article {
    min-width: 0;
    padding: 10px 11px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }
  .pdf-image-tool__files article > span {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    color: #c24b68;
    background: var(--workspace-panel-bg-color);
  }
  .pdf-image-tool__files article > div,
  .pdf-image-tool__results article > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .pdf-image-tool__files strong,
  .pdf-image-tool__results strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pdf-image-tool__files small,
  .pdf-image-tool__results small,
  .pdf-image-tool__result-head span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .pdf-image-tool__result-head {
    padding: 13px 15px;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid #07835f;
    border-radius: 14px;
    background: var(--workspace-panel-bg-color);
  }
  .pdf-image-tool__result-head > div {
    min-width: 0;
    margin-right: auto;
    display: grid;
    gap: 3px;
  }
  .pdf-image-tool__results {
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
  .pdf-image-tool__results article {
    min-width: 0;
    padding: 10px;
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--card-background);
  }
  .pdf-image-tool__results img {
    width: 72px;
    height: 82px;
    grid-row: span 2;
    display: block;
    object-fit: contain;
    border-radius: 8px;
    background: var(--workspace-panel-bg-color);
  }
  .pdf-image-tool__results .b-button {
    justify-self: end;
  }
  @media (max-width: 1050px) {
    .pdf-image-tool__settings {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 767px) {
    .pdf-image-tool__drop-zone {
      min-height: 250px;
      padding: 28px 18px;
    }
    .pdf-image-tool__settings {
      grid-template-columns: 1fr;
    }
    .pdf-image-tool__result-head {
      align-items: stretch;
      flex-direction: column;
    }
    .pdf-image-tool__result-head > div {
      margin-right: 0;
    }
    .pdf-image-tool__results,
    .pdf-image-tool__files {
      grid-template-columns: 1fr;
    }
  }
  html.light-note-mobile-rendering .pdf-image-tool__drop-zone,
  html.light-note-mobile-rendering .pdf-image-tool__result-head {
    background: var(--card-background);
    box-shadow: none;
  }
</style>

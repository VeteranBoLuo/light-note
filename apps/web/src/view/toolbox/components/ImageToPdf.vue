<template>
  <section class="image-pdf-tool" :aria-label="t('toolbox.tool.image_to_pdf.name')">
    <div
      v-if="!entries.length"
      class="image-pdf-tool__drop-zone"
      :class="{ 'is-dragging': dragging }"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <span><SvgIcon :src="icon.toolbox.imageToPdf" size="36" /></span>
      <h2>{{ t('toolbox.tool.image_to_pdf.name') }}</h2>
      <p>{{ t('toolbox.local.imageToPdfDropHint') }}</p>
      <BUpload raw-file multiple accept="image/jpeg,image/png,image/webp" :max-total-size="null" @change="addFiles">
        <BButton type="primary"
          ><SvgIcon :src="icon.toolbox.upload" size="16" />{{ t('toolbox.local.chooseImages') }}</BButton
        >
      </BUpload>
    </div>

    <template v-else>
      <div class="image-pdf-tool__settings">
        <div>
          <label id="image-pdf-page-size">{{ t('toolbox.local.pageSize') }}</label>
          <BSelect
            v-model:value="pageSize"
            :options="pageSizeOptions"
            :disabled="generating"
            aria-labelledby="image-pdf-page-size"
          />
        </div>
        <div>
          <label id="image-pdf-orientation">{{ t('toolbox.local.orientation') }}</label>
          <BSelect
            v-model:value="orientation"
            :options="orientationOptions"
            :disabled="generating || pageSize === 'fit'"
            aria-labelledby="image-pdf-orientation"
          />
        </div>
        <div>
          <label id="image-pdf-margin">{{ t('toolbox.local.margin') }}</label>
          <BSelect
            v-model:value="margin"
            :options="marginOptions"
            :disabled="generating"
            aria-labelledby="image-pdf-margin"
          />
        </div>
        <div>
          <label id="image-pdf-quality">{{ t('toolbox.local.quality') }}</label>
          <BSelect
            v-model:value="quality"
            :options="qualityOptions"
            :disabled="generating"
            aria-labelledby="image-pdf-quality"
          />
        </div>
        <BUpload
          raw-file
          multiple
          accept="image/jpeg,image/png,image/webp"
          :max-total-size="null"
          :disabled="generating"
          @change="addFiles"
        >
          <BButton :disabled="generating"
            ><SvgIcon :src="icon.toolbox.upload" size="15" />{{ t('toolbox.local.addMore') }}</BButton
          >
        </BUpload>
        <BButton type="primary" :loading="generating" @click="generate">
          <SvgIcon :src="icon.toolbox.pdf" size="15" />
          {{
            generating
              ? t('toolbox.local.generatingPdfProgress', { current: progress, total: entries.length })
              : t('toolbox.local.generatePdf')
          }}
        </BButton>
      </div>

      <BProgress v-if="generating" :percent="Math.round((progress / entries.length) * 100)" show-info />

      <div class="image-pdf-tool__summary" :class="{ 'is-ready': result }">
        <div>
          <strong>{{ t('toolbox.local.files', { count: entries.length }) }}</strong>
          <span>{{
            result ? t('toolbox.local.pdfReady', { count: result.pageCount }) : t('toolbox.local.imageOrderHint')
          }}</span>
        </div>
        <BButton v-if="result" type="primary" @click="downloadResult">
          <SvgIcon :src="icon.toolbox.download" size="15" />{{ t('toolbox.local.downloadPdf') }}
        </BButton>
      </div>

      <div class="image-pdf-tool__list">
        <article v-for="(entry, index) in entries" :key="entry.id">
          <span class="image-pdf-tool__order">{{ index + 1 }}</span>
          <img :src="entry.previewUrl" :alt="entry.file.name" />
          <div
            ><strong :title="entry.file.name">{{ entry.file.name }}</strong
            ><small>{{ formatToolboxBytes(entry.file.size) }}</small></div
          >
          <div class="image-pdf-tool__actions">
            <BTooltip :title="t('toolbox.local.moveBefore')">
              <BButton
                :disabled="generating || index === 0"
                :aria-label="t('toolbox.local.moveBefore')"
                @click="move(index, -1)"
              >
                <SvgIcon class="is-left" :src="icon.toolbox.arrow" size="15" />
              </BButton>
            </BTooltip>
            <BTooltip :title="t('toolbox.local.moveAfter')">
              <BButton
                :disabled="generating || index === entries.length - 1"
                :aria-label="t('toolbox.local.moveAfter')"
                @click="move(index, 1)"
              >
                <SvgIcon :src="icon.toolbox.arrow" size="15" />
              </BButton>
            </BTooltip>
            <BTooltip :title="t('toolbox.workbench.removeFile')">
              <BButton :disabled="generating" :aria-label="t('toolbox.workbench.removeFile')" @click="remove(index)">
                <SvgIcon :src="icon.toolbox.delete" size="15" />
              </BButton>
            </BTooltip>
          </div>
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
    createPdfFromImages,
    ImageToPdfError,
    validateImageToPdfFiles,
    type ImagePdfOrientation,
    type ImagePdfPageSize,
    type ImageToPdfResult,
  } from '@/utils/imageToPdf';
  import { createLocalId, downloadToolboxBlob, formatToolboxBytes } from '@/utils/toolboxLocal';

  interface ImageEntry {
    id: string;
    file: File;
    previewUrl: string;
  }

  const { t } = useI18n();
  const entries = ref<ImageEntry[]>([]);
  const pageSize = ref<ImagePdfPageSize>('a4');
  const orientation = ref<ImagePdfOrientation>('auto');
  const margin = ref<0 | 24 | 48>(24);
  const quality = ref(0.9);
  const generating = ref(false);
  const progress = ref(0);
  const result = ref<ImageToPdfResult | null>(null);
  const dragging = ref(false);
  let dragDepth = 0;

  const pageSizeOptions = computed(() => [
    { value: 'a4', label: t('toolbox.local.pageSizeA4') },
    { value: 'fit', label: t('toolbox.local.pageSizeFit') },
  ]);
  const orientationOptions = computed(() => [
    { value: 'auto', label: t('toolbox.local.orientationAuto') },
    { value: 'portrait', label: t('toolbox.local.orientationPortrait') },
    { value: 'landscape', label: t('toolbox.local.orientationLandscape') },
  ]);
  const marginOptions = computed(() => [
    { value: 0, label: t('toolbox.local.marginNone') },
    { value: 24, label: t('toolbox.local.marginSmall') },
    { value: 48, label: t('toolbox.local.marginLarge') },
  ]);
  const qualityOptions = computed(() => [
    { value: 0.82, label: t('toolbox.local.qualityCompact') },
    { value: 0.9, label: t('toolbox.local.qualityBalanced') },
    { value: 0.96, label: t('toolbox.local.qualityHigh') },
  ]);

  function showError(error: unknown) {
    if (error instanceof ImageToPdfError) {
      if (error.code === 'TOO_MANY') return message.warning(t('toolbox.local.imageToPdfTooMany'));
      if (error.code === 'TOO_LARGE') return message.warning(t('common.maxTotalSize', { n: 100 }));
      if (error.code === 'INVALID_TYPE') return message.warning(t('toolbox.local.invalidType'));
    }
    message.error(t('toolbox.local.localFailed'));
  }

  function addFiles(value: File[]) {
    if (generating.value) return;
    const files = Array.isArray(value) ? value : [];
    if (!files.length) return;
    try {
      validateImageToPdfFiles([...entries.value.map((entry) => entry.file), ...files]);
      entries.value.push(
        ...files.map((file) => ({ id: createLocalId('image-pdf'), file, previewUrl: URL.createObjectURL(file) })),
      );
      result.value = null;
    } catch (error) {
      showError(error);
    }
  }

  function remove(index: number) {
    const [removed] = entries.value.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    result.value = null;
  }

  function move(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= entries.value.length) return;
    const [entry] = entries.value.splice(index, 1);
    if (entry) entries.value.splice(target, 0, entry);
    result.value = null;
  }

  async function generate() {
    if (!entries.value.length || generating.value) return;
    generating.value = true;
    progress.value = 0;
    result.value = null;
    try {
      result.value = await createPdfFromImages(
        entries.value.map((entry) => entry.file),
        { pageSize: pageSize.value, orientation: orientation.value, margin: margin.value, quality: quality.value },
        (completed) => (progress.value = completed),
      );
      message.success(t('toolbox.local.pdfGenerated'));
    } catch (error) {
      showError(error);
    } finally {
      generating.value = false;
    }
  }

  function downloadResult() {
    if (result.value) downloadToolboxBlob(result.value.blob, result.value.fileName);
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

  watch([pageSize, orientation, margin, quality], () => (result.value = null));
  onBeforeUnmount(() => entries.value.forEach((entry) => URL.revokeObjectURL(entry.previewUrl)));
</script>

<style scoped lang="less">
  .image-pdf-tool {
    display: grid;
    gap: 16px;
  }
  .image-pdf-tool__drop-zone {
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
    transition:
      border-color 0.2s,
      background 0.2s;
  }
  .image-pdf-tool__drop-zone.is-dragging {
    border: 2px solid var(--primary-color);
    background: var(--card-background);
  }
  .image-pdf-tool__drop-zone > span {
    width: 68px;
    height: 68px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    color: var(--primary-color);
    background: var(--card-background);
  }
  .image-pdf-tool__drop-zone h2 {
    margin: 4px 0 0;
    font-size: 22px;
  }
  .image-pdf-tool__drop-zone p {
    margin: 0 0 10px;
    color: var(--desc-color);
  }
  .image-pdf-tool__settings {
    padding: 14px;
    display: grid;
    grid-template-columns: repeat(4, minmax(130px, 1fr)) auto auto;
    gap: 10px;
    align-items: end;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .image-pdf-tool__settings > div {
    min-width: 0;
    display: grid;
    gap: 6px;
  }
  .image-pdf-tool__settings label {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 650;
  }
  .image-pdf-tool__summary {
    padding: 13px 15px;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color);
  }
  .image-pdf-tool__summary.is-ready {
    border-color: #07835f;
  }
  .image-pdf-tool__summary > div {
    min-width: 0;
    margin-right: auto;
    display: grid;
    gap: 3px;
  }
  .image-pdf-tool__summary span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .image-pdf-tool__list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 10px;
  }
  .image-pdf-tool__list article {
    min-width: 0;
    padding: 10px;
    display: grid;
    grid-template-columns: auto 58px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--card-background);
  }
  .image-pdf-tool__list img {
    width: 58px;
    height: 58px;
    display: block;
    object-fit: contain;
    border-radius: 9px;
    background: var(--workspace-panel-bg-color);
  }
  .image-pdf-tool__order {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 50%;
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 750;
  }
  .image-pdf-tool__list article > div {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .image-pdf-tool__list strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .image-pdf-tool__list small {
    color: var(--desc-color);
  }
  .image-pdf-tool__actions {
    grid-column: 2 / -1;
    display: flex !important;
    justify-content: flex-end;
  }
  .image-pdf-tool__actions .is-left {
    transform: rotate(180deg);
  }
  @media (max-width: 1100px) {
    .image-pdf-tool__settings {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 767px) {
    .image-pdf-tool__drop-zone {
      min-height: 250px;
      padding: 28px 18px;
    }
    .image-pdf-tool__settings {
      grid-template-columns: 1fr;
    }
    .image-pdf-tool__summary {
      align-items: stretch;
      flex-direction: column;
    }
    .image-pdf-tool__summary > div {
      margin-right: 0;
    }
    .image-pdf-tool__list {
      grid-template-columns: 1fr;
    }
  }
  html.light-note-mobile-rendering .image-pdf-tool__drop-zone,
  html.light-note-mobile-rendering .image-pdf-tool__summary {
    background: var(--card-background);
    box-shadow: none;
  }
</style>

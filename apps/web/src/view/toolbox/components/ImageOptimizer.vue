<template>
  <section class="image-tool" :aria-label="t('toolbox.tool.image_optimizer.name')">
    <div
      v-if="!entries.length"
      class="image-tool__drop-zone"
      :class="{ 'is-dragging': dragging }"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <span class="image-tool__drop-icon"><SvgIcon :src="icon.toolbox.image" size="34" /></span>
      <h2 id="image-optimizer-title">{{ t('toolbox.tool.image_optimizer.name') }}</h2>
      <p>{{ t('toolbox.local.dropHintImage') }}</p>
      <BUpload raw-file multiple accept="image/jpeg,image/png,image/webp" :max-total-size="null" @change="handleFiles">
        <BButton type="primary"
          ><SvgIcon :src="icon.toolbox.upload" size="16" />{{ t('toolbox.local.chooseImages') }}</BButton
        >
      </BUpload>
    </div>

    <template v-else>
      <div class="image-tool__settings">
        <div class="image-tool__setting">
          <label id="image-format-label">{{ t('toolbox.local.format') }}</label>
          <BSelect
            v-model:value="format"
            :options="formatOptions"
            :disabled="optimizing"
            aria-labelledby="image-format-label"
          />
        </div>
        <div class="image-tool__setting">
          <label id="image-quality-label">{{ t('toolbox.local.quality') }}</label>
          <BSelect
            v-model:value="quality"
            :options="qualityOptions"
            :disabled="optimizing || format === 'image/png'"
            aria-labelledby="image-quality-label"
          />
        </div>
        <BUpload
          raw-file
          multiple
          accept="image/jpeg,image/png,image/webp"
          :max-total-size="null"
          :disabled="optimizing"
          @change="handleFiles"
        >
          <BButton :disabled="optimizing"
            ><SvgIcon :src="icon.toolbox.upload" size="15" />{{ t('toolbox.local.addMore') }}</BButton
          >
        </BUpload>
        <BButton type="primary" :loading="optimizing" @click="runOptimize">
          {{
            optimizing
              ? t('toolbox.local.optimizing', { current: progress, total: entries.length })
              : t('toolbox.local.optimize')
          }}
        </BButton>
      </div>

      <p class="image-tool__format-hint">
        <SvgIcon :src="icon.message.info" size="15" aria-hidden="true" />
        {{ t('toolbox.local.imageFormatHint') }}
      </p>

      <BProgress v-if="optimizing" :percent="Math.round((progress / entries.length) * 100)" show-info />

      <div class="image-tool__summary">
        <div class="image-tool__summary-files">
          <strong>{{ t('toolbox.local.files', { count: entries.length }) }}</strong>
          <span v-if="results.length || failedCount">
            {{
              failedCount
                ? t('toolbox.local.resultSummary', { success: results.length, failed: failedCount })
                : t('toolbox.local.processedProgress', { current: results.length, total: entries.length })
            }}
          </span>
        </div>
        <div class="image-tool__summary-flow">
          <div class="image-tool__summary-metric is-before">
            <span>{{ comparisonBeforeLabel }}</span>
            <strong>{{ formatToolboxBytes(comparisonOriginalTotal) }}</strong>
          </div>
          <span class="image-tool__summary-arrow" aria-hidden="true">
            <SvgIcon :src="icon.toolbox.arrow" size="17" />
          </span>
          <div class="image-tool__summary-metric is-after">
            <span>{{ comparisonAfterLabel }}</span>
            <strong>{{ results.length ? formatToolboxBytes(outputTotal) : '—' }}</strong>
            <small
              v-if="results.length === entries.length"
              :class="{ 'is-saving': outputTotal < originalTotal, 'is-larger': outputTotal >= originalTotal }"
            >
              {{
                outputTotal < originalTotal
                  ? t('toolbox.local.saved', { percent: savedPercent })
                  : t('toolbox.local.larger')
              }}
            </small>
            <small v-else-if="failedCount">
              {{ t('toolbox.local.resultSummary', { success: results.length, failed: failedCount }) }}
            </small>
            <small v-else-if="results.length">
              {{ t('toolbox.local.processedProgress', { current: results.length, total: entries.length }) }}
            </small>
            <small v-else>{{ t('toolbox.local.waitingOptimize') }}</small>
          </div>
        </div>
        <BButton v-if="results.length" type="primary" :loading="bundling" :disabled="optimizing" @click="downloadAll">
          <SvgIcon :src="icon.toolbox.download" size="15" />{{ t('toolbox.local.downloadAll') }}
        </BButton>
      </div>

      <div class="image-result-list">
        <article v-for="entry in displayEntries" :key="entry.id" class="image-result-card">
          <header class="image-result-card__header">
            <div class="image-result-card__copy">
              <strong :title="entry.file.name">{{ entry.file.name }}</strong>
              <span v-if="entry.result" :class="entry.result.outputSize < entry.file.size ? 'is-saving' : 'is-larger'">
                {{ resultOutcome(entry.result) }}
              </span>
              <span v-else-if="entry.error" class="is-error">{{ t('toolbox.local.optimizeFailed') }}</span>
              <span v-else>{{ t('toolbox.local.waitingOptimize') }}</span>
            </div>
            <div class="image-result-card__actions">
              <BButton v-if="entry.result" size="small" :disabled="optimizing" @click="downloadOne(entry.id)">
                <SvgIcon :src="icon.toolbox.download" size="14" />{{ t('toolbox.local.downloadOne') }}
              </BButton>
              <BTooltip :title="t('toolbox.workbench.removeFile')">
                <BButton
                  :disabled="optimizing"
                  :aria-label="t('toolbox.workbench.removeFile')"
                  @click="removeEntry(entry.id)"
                >
                  <SvgIcon :src="icon.toolbox.delete" size="15" />
                </BButton>
              </BTooltip>
            </div>
          </header>

          <div
            class="image-result-card__comparison"
            :aria-label="t('toolbox.local.comparisonLabel', { name: entry.file.name })"
          >
            <div class="image-result-card__side is-before">
              <div class="image-result-card__side-head">
                <strong>{{ t('toolbox.local.before') }}</strong>
                <span>{{ formatToolboxBytes(entry.file.size) }}</span>
              </div>
              <div class="image-result-card__preview" :class="{ 'is-empty': entry.previewUnavailable }">
                <img
                  v-if="!entry.previewUnavailable"
                  :src="entry.previewUrl"
                  :alt="t('toolbox.local.beforePreviewAlt', { name: entry.file.name })"
                  @error="markPreviewUnavailable(entry.id)"
                />
                <span v-else>
                  <SvgIcon :src="icon.toolbox.image" size="20" aria-hidden="true" />
                  {{ t('toolbox.local.previewUnavailable') }}
                </span>
              </div>
              <small v-if="entry.result">{{ entry.result.originalWidth }}×{{ entry.result.originalHeight }}</small>
            </div>

            <div class="image-result-card__bridge" aria-hidden="true">
              <span><SvgIcon :src="icon.toolbox.arrow" size="17" /></span>
            </div>

            <div
              class="image-result-card__side is-after"
              :class="{
                'is-pending': !entry.result && !entry.error,
                'is-ready': !!entry.result,
                'is-error': entry.error,
              }"
            >
              <div class="image-result-card__side-head">
                <strong>{{ t('toolbox.local.after') }}</strong>
                <span>{{ entry.result ? formatToolboxBytes(entry.result.outputSize) : '—' }}</span>
              </div>
              <div class="image-result-card__preview" :class="{ 'is-empty': !entry.result }">
                <img
                  v-if="entry.result"
                  :src="entry.result.previewUrl"
                  :alt="t('toolbox.local.afterPreviewAlt', { name: entry.file.name })"
                />
                <span v-else>
                  <SvgIcon :src="icon.toolbox.image" size="20" aria-hidden="true" />
                  {{ entry.error ? t('toolbox.local.optimizeFailed') : t('toolbox.local.waitingOptimize') }}
                </span>
              </div>
              <small v-if="entry.result">{{ entry.result.width }}×{{ entry.result.height }}</small>
              <small v-else>{{
                entry.error ? t('toolbox.local.retryHint') : t('toolbox.local.waitingOptimize')
              }}</small>
            </div>
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
    bundleOptimizedImages,
    IMAGE_OPTIMIZER_MAX_BYTES,
    IMAGE_OPTIMIZER_MAX_FILES,
    ImageOptimizerError,
    optimizeImage,
    releaseOptimizedImages,
    validateImageFiles,
    type ImageOutputFormat,
    type OptimizedImage,
  } from '@/utils/imageOptimizer';
  import { createLocalId, downloadToolboxBlob, formatToolboxBytes } from '@/utils/toolboxLocal';

  interface ImageEntry {
    id: string;
    file: File;
    previewUrl: string;
    error: boolean;
    previewUnavailable: boolean;
  }
  interface EntryResult extends OptimizedImage {
    entryId: string;
  }

  const { t } = useI18n();
  const entries = ref<ImageEntry[]>([]);
  const results = ref<EntryResult[]>([]);
  const format = ref<ImageOutputFormat>('image/webp');
  const quality = ref(0.8);
  const optimizing = ref(false);
  const progress = ref(0);
  const bundling = ref(false);
  const dragging = ref(false);
  let optimizeVersion = 0;
  let dragDepth = 0;
  const formatOptions = [
    { value: 'image/webp', label: 'WebP' },
    { value: 'image/jpeg', label: 'JPG' },
    { value: 'image/png', label: 'PNG' },
  ];
  const qualityOptions = computed(() => [
    { value: 0.65, label: `65% · ${t('toolbox.local.qualitySmall')}` },
    { value: 0.8, label: `80% · ${t('toolbox.local.qualityBalanced')}` },
    { value: 0.9, label: `90% · ${t('toolbox.local.qualityHigh')}` },
  ]);
  const originalTotal = computed(() => entries.value.reduce((sum, entry) => sum + entry.file.size, 0));
  const comparisonOriginalTotal = computed(() =>
    results.value.length ? results.value.reduce((sum, result) => sum + result.originalSize, 0) : originalTotal.value,
  );
  const outputTotal = computed(() => results.value.reduce((sum, result) => sum + result.outputSize, 0));
  const failedCount = computed(() => entries.value.filter((entry) => entry.error).length);
  const comparisonBeforeLabel = computed(() =>
    failedCount.value
      ? t('toolbox.local.successBeforeTotal')
      : results.value.length < entries.value.length
        ? t('toolbox.local.processedBeforeTotal')
        : t('toolbox.local.beforeTotal'),
  );
  const comparisonAfterLabel = computed(() =>
    failedCount.value
      ? t('toolbox.local.successAfterTotal')
      : results.value.length < entries.value.length
        ? t('toolbox.local.processedAfterTotal')
        : t('toolbox.local.afterTotal'),
  );
  const savedPercent = computed(() =>
    Math.max(0, Math.round((1 - outputTotal.value / Math.max(1, comparisonOriginalTotal.value)) * 100)),
  );
  const resultMap = computed(() => new Map(results.value.map((result) => [result.entryId, result])));
  const displayEntries = computed(() =>
    entries.value.map((entry) => ({ ...entry, result: resultMap.value.get(entry.id) || null })),
  );

  function resultFor(entryId: string) {
    return resultMap.value.get(entryId);
  }

  function resultOutcome(result: EntryResult) {
    if (result.outputSize >= result.originalSize) return t('toolbox.local.larger');
    const percent = Math.max(0, Math.round((1 - result.outputSize / Math.max(1, result.originalSize)) * 100));
    return t('toolbox.local.saved', { percent });
  }

  function clearResults() {
    releaseOptimizedImages(results.value);
    results.value = [];
    entries.value.forEach((entry) => (entry.error = false));
    progress.value = 0;
  }

  function showError(error: unknown) {
    if (error instanceof ImageOptimizerError) {
      if (error.code === 'INVALID_TYPE') return message.warning(t('toolbox.local.invalidType'));
      if (error.code === 'TOO_MANY') return message.warning(t('toolbox.local.tooMany'));
      if (error.code === 'TOO_LARGE') return message.warning(t('common.maxTotalSize', { n: 80 }));
    }
    message.error(t('toolbox.local.localFailed'));
  }

  function handleFiles(value: File[]) {
    const files = Array.isArray(value) ? value : [];
    if (!files.length) return;
    try {
      validateImageFiles([...entries.value.map((entry) => entry.file), ...files]);
      clearResults();
      entries.value.push(
        ...files.map((file) => ({
          id: createLocalId('image'),
          file,
          previewUrl: URL.createObjectURL(file),
          error: false,
          previewUnavailable: false,
        })),
      );
    } catch (error) {
      showError(error);
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
    handleFiles(Array.from(event.dataTransfer?.files || []));
  }

  function removeEntry(id: string) {
    const index = entries.value.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const [entry] = entries.value.splice(index, 1);
    if (entry) URL.revokeObjectURL(entry.previewUrl);
    clearResults();
  }

  function markPreviewUnavailable(id: string) {
    const entry = entries.value.find((candidate) => candidate.id === id);
    if (entry) entry.previewUnavailable = true;
  }

  async function runOptimize() {
    if (optimizing.value) return;
    const version = ++optimizeVersion;
    const runEntries = [...entries.value];
    const runOptions = {
      format: format.value,
      quality: Number(quality.value),
      maxDimension: null,
    };
    clearResults();
    optimizing.value = true;
    let failures = 0;
    let oversizedFailures = 0;
    try {
      for (const entry of runEntries) {
        try {
          const result = await optimizeImage(entry.file, runOptions);
          if (version !== optimizeVersion) {
            URL.revokeObjectURL(result.previewUrl);
            return;
          }
          results.value.push({ ...result, entryId: entry.id });
        } catch (error) {
          if (version !== optimizeVersion) return;
          entry.error = true;
          failures += 1;
          if (error instanceof ImageOptimizerError && error.code === 'TOO_MANY_PIXELS') oversizedFailures += 1;
        } finally {
          if (version === optimizeVersion) progress.value += 1;
        }
      }
      if (oversizedFailures) {
        message.warning(t('toolbox.local.imageDimensionsTooLarge', { count: oversizedFailures }));
      }
      if (failures > oversizedFailures) {
        message.warning(t('toolbox.local.someImagesFailed', { count: failures - oversizedFailures }));
      }
    } finally {
      if (version === optimizeVersion) optimizing.value = false;
    }
  }

  function downloadOne(entryId: string) {
    const result = resultFor(entryId);
    if (result) downloadToolboxBlob(result.blob, result.fileName);
  }

  async function downloadAll() {
    if (!results.value.length) return;
    if (results.value.length === 1) {
      downloadToolboxBlob(results.value[0].blob, results.value[0].fileName);
      return;
    }
    bundling.value = true;
    try {
      const blob = await bundleOptimizedImages(results.value);
      downloadToolboxBlob(blob, 'lightnote-optimized-images.zip');
    } finally {
      bundling.value = false;
    }
  }

  watch([format, quality], clearResults);
  onBeforeUnmount(() => {
    optimizeVersion += 1;
    entries.value.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    releaseOptimizedImages(results.value);
  });
</script>

<style scoped lang="less">
  .image-tool {
    display: grid;
    gap: 18px;
  }
  .image-tool__drop-zone {
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
  .image-tool__drop-zone.is-dragging {
    transform: translateY(-2px);
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
  }
  .image-tool__drop-icon {
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
  .image-tool__drop-zone h2 {
    margin: 0;
    font-size: 21px;
  }
  .image-tool__drop-zone p {
    margin: 9px 0 20px;
    color: var(--desc-color);
    line-height: 1.65;
  }
  .image-tool__drop-zone :deep(.b_btn),
  .image-tool__settings :deep(.b_btn),
  .image-tool__summary :deep(.b_btn),
  .image-result-card :deep(.b_btn) {
    gap: 7px;
  }
  .image-tool__settings {
    padding: 14px;
    display: grid;
    grid-template-columns: minmax(140px, 0.8fr) minmax(180px, 1fr) auto auto;
    gap: 10px;
    align-items: end;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--card-background);
  }
  .image-tool__setting {
    min-width: 0;
    display: grid;
    gap: 6px;
  }
  .image-tool__setting label {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 600;
  }
  .image-tool__format-hint {
    margin: -5px 2px 0;
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }
  .image-tool__format-hint :deep(svg) {
    flex: none;
    color: var(--primary-color);
  }
  .image-tool__summary {
    min-height: 78px;
    padding: 11px 12px 11px 15px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 20px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .image-tool__summary-files {
    min-width: 108px;
    display: grid;
    gap: 3px;
  }
  .image-tool__summary strong {
    font-size: 15px;
  }
  .image-tool__summary span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .image-tool__summary-flow {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .image-tool__summary-metric {
    min-width: 118px;
    padding: 8px 11px;
    display: grid;
    gap: 2px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--surface-subtle-bg, var(--hover-background));
  }
  .image-tool__summary-metric > span {
    font-weight: 650;
  }
  .image-tool__summary-metric small {
    color: var(--desc-color);
    font-size: 11px;
  }
  .image-tool__summary-metric .is-saving,
  .image-result-card__copy .is-saving {
    color: var(--success-color, #07835f);
  }
  .image-tool__summary-metric .is-larger,
  .image-result-card__copy .is-larger {
    color: var(--warning-color, #ad6b0d);
  }
  .image-result-card__copy .is-error {
    color: var(--error-color, #d93b3b);
  }
  .image-tool__summary-arrow {
    width: 28px;
    height: 28px;
    display: grid;
    flex: 0 0 28px;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    color: var(--primary-color);
    background: var(--card-background);
  }
  .image-result-list {
    display: grid;
    gap: 12px;
  }
  .image-result-card {
    min-width: 0;
    padding: 12px;
    display: grid;
    gap: 11px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--card-background);
  }
  .image-result-card__header {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .image-result-card__comparison {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px minmax(0, 1fr);
    align-items: stretch;
    gap: 8px;
  }
  .image-result-card__side {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-subtle-bg, var(--hover-background));
  }
  .image-result-card__side.is-ready {
    border-color: var(--success-color, #07835f);
  }
  .image-result-card__side.is-error {
    border-color: var(--error-color, #d93b3b);
  }
  .image-result-card__side-head {
    min-width: 0;
    min-height: 32px;
    padding: 6px 9px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    box-sizing: border-box;
    background: var(--card-background);
  }
  .image-result-card__side-head strong {
    font-size: 12px;
  }
  .image-result-card__side-head span {
    color: var(--desc-color);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .image-result-card__preview {
    width: 100%;
    height: 118px;
    overflow: hidden;
    border-top: 1px solid var(--surface-divider-color);
    border-bottom: 1px solid var(--surface-divider-color);
    background: var(--card-background);
  }
  .image-result-card__preview img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .image-result-card__preview.is-empty {
    display: grid;
    place-items: center;
    color: var(--desc-color);
    background: var(--surface-subtle-bg, var(--hover-background));
  }
  .image-result-card__preview.is-empty > span {
    display: grid;
    place-items: center;
    gap: 6px;
    font-size: 11px;
  }
  .image-result-card__side > small {
    min-height: 27px;
    padding: 5px 9px;
    display: block;
    box-sizing: border-box;
    color: var(--desc-color);
    background: var(--card-background);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .image-result-card__bridge {
    display: grid;
    place-items: center;
  }
  .image-result-card__bridge span {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    color: var(--primary-color);
    background: var(--card-background);
  }
  .image-result-card__copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .image-result-card__copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .image-result-card__copy span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .image-result-card__actions {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .image-result-card__actions > :deep(.b_btn:last-child) {
    width: 32px;
    padding: 0;
    color: var(--desc-color);
    background: transparent;
  }
  @media (max-width: 980px) {
    .image-tool__settings {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 767px) {
    .image-tool {
      gap: 13px;
    }
    .image-tool__drop-zone {
      min-height: 280px;
      padding: 30px 18px;
      border-radius: 16px;
    }
    .image-tool__settings {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .image-tool__settings > :deep(.b-upload-trigger),
    .image-tool__settings > :deep(.b_btn) {
      width: 100%;
    }
    .image-tool__settings :deep(.b_btn) {
      width: 100%;
    }
    .image-tool__summary {
      grid-template-columns: 1fr;
      gap: 11px;
    }
    .image-tool__summary-files {
      min-width: 0;
      grid-template-columns: 1fr auto;
      align-items: center;
    }
    .image-tool__summary-flow {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 26px minmax(0, 1fr);
      gap: 6px;
    }
    .image-tool__summary-metric {
      min-width: 0;
      height: 100%;
      box-sizing: border-box;
    }
    .image-tool__summary > :deep(.b_btn) {
      width: 100%;
    }
    .image-result-card {
      padding: 10px;
    }
    .image-result-card__preview {
      height: 92px;
    }
    .image-result-card__comparison {
      grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr);
      gap: 5px;
    }
    .image-result-card__bridge span {
      width: 24px;
      height: 24px;
    }
    .image-result-card__side-head {
      min-height: 46px;
      align-items: flex-start;
      flex-direction: column;
      gap: 1px;
    }
    .image-result-card__actions {
      justify-content: flex-end;
    }
  }
  html.light-note-mobile-rendering .image-tool__drop-zone,
  html.light-note-mobile-rendering .image-tool__summary-metric,
  html.light-note-mobile-rendering .image-result-card__side,
  html.light-note-mobile-rendering .image-result-card__preview.is-empty {
    background: var(--card-background);
  }
</style>

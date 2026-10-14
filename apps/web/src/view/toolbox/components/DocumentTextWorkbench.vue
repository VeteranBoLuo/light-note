<template>
  <section class="document-text-workbench" :aria-label="toolName">
    <section v-if="files.length === 0" class="document-text-empty">
      <SvgIcon :src="toolIcon" size="36" />
      <h2>{{ emptyTitle }}</h2>
      <BUpload raw-file multiple :accept="accept" :max-total-size="null" :disabled="loading" @change="loadFiles">
        <BButton type="primary" size="large" :loading="loading"
          ><SvgIcon :src="icon.toolbox.upload" size="17" />{{ chooseLabel }}</BButton
        >
      </BUpload>
      <small>{{ limitHint }}</small>
      <small>{{ t('toolbox.documentText.localHint') }}</small>
    </section>
    <template v-else>
      <section class="document-text-sourcebar">
        <div class="document-text-sourcebar__copy">
          <strong>{{ t('toolbox.documentText.loaded', { count: files.length }) }}</strong>
          <small>{{ formatToolboxBytes(totalBytes) }}</small>
        </div>
        <div class="document-text-sourcebar__actions">
          <BUpload raw-file multiple :accept="accept" :max-total-size="null" @change="loadFiles">
            <BButton size="small"
              ><SvgIcon :src="icon.toolbox.upload" size="14" />{{ t('toolbox.dataset.replace') }}</BButton
            >
          </BUpload>
          <BButton size="small" @click="clearAll">{{ t('common.clear') }}</BButton>
        </div>
      </section>
      <div class="document-text-layout">
        <aside class="document-text-files">
          <header
            ><span>{{ t('toolbox.documentText.sourceFiles') }}</span
            ><strong>{{ files.length }}</strong></header
          >
          <BButton
            v-for="(file, index) in files"
            :key="index"
            class="document-text-file"
            :class="{ 'is-active': activeFile === index }"
            :aria-pressed="activeFile === index"
            @click="activeFile = index"
          >
            <SvgIcon :src="toolIcon" size="18" />
            <span class="document-text-file__copy"
              ><strong :title="file.name">{{ file.name }}</strong
              ><small>{{ formatToolboxBytes(file.size) }}</small></span
            >
            <BChip v-if="resultFor(index)" tone="success">{{ t('toolbox.documentText.ready') }}</BChip>
            <BChip v-else-if="running && progress.currentFile === index" tone="pending">{{ progressLabel }}</BChip>
            <BChip v-else-if="fileErrors[index]" tone="danger">{{ t('toolbox.documentText.failed') }}</BChip>
          </BButton>
        </aside>
        <section class="document-text-main">
          <header class="document-text-main__title">
            <h2 :title="activeFileName">{{ activeFileName }}</h2>
            <div v-if="activeResult" class="document-text-stats"
              ><span v-for="stat in activeStats" :key="stat.label"
                >{{ stat.label }} <strong>{{ stat.value }}</strong></span
              ></div
            >
          </header>
          <BTabs
            v-if="!isPdf && activeResult"
            v-model:active-tab="outputView"
            :options="[
              { key: 'preview', label: t('toolbox.documentText.preview') },
              { key: 'raw', label: 'Markdown' },
            ]"
            :aria-label="t('toolbox.local.resultView')"
          />
          <DocumentSummary
            v-if="isPdf && activeResult && files[activeFile]"
            :file="files[activeFile]!"
            :text="activeOutput"
            :has-text="Boolean((activeResult as PdfTextFileResult).pages.some((page) => page.text.trim()))"
            :warning="activeWarning"
          />
          <div v-if="running" class="document-text-progress" role="status">
            <div
              ><span>{{ progressLabel }}</span
              ><strong>{{ progressPercent }}%</strong></div
            ><BProgress :percent="progressPercent" />
          </div>
          <p v-if="!isPdf && failedCount" class="document-text-batch" role="status">{{
            t('toolbox.documentText.batchResult', { success: successfulDocxResults.length, failed: failedCount })
          }}</p>
          <div v-if="activeError" class="document-text-error" role="alert"
            ><SvgIcon :src="icon.message.info" size="18" /><span>{{ activeError }}</span></div
          >
          <template v-if="activeResult">
            <div v-if="activeWarning" class="document-text-warning"
              ><SvgIcon :src="icon.message.info" size="17" /><span>{{ activeWarning }}</span></div
            >
            <div v-if="!isPdf && outputView === 'preview'" class="document-text-preview">
              <CommunityMarkdown :body="activeTextOnly" />
              <div v-if="imagePreviews.length" class="document-text-images"
                ><figure v-for="image in imagePreviews" :key="image.path"
                  ><img :src="image.url" :alt="image.path" loading="lazy" /><figcaption>{{
                    image.path
                  }}</figcaption></figure
                ></div
              >
            </div>
            <BInput v-else v-model:value="activeOutput" type="textarea" :rows="dimension(22, 'layout')" readonly />
          </template>
          <div v-else-if="!activeError && !running" class="document-text-placeholder">
            <SvgIcon :src="toolIcon" size="32" /><strong>{{ t('toolbox.documentText.waitingTitle') }}</strong
            ><p>{{ waitingDescription }}</p>
          </div>
          <div v-if="!hasResults || failedCount || running" class="document-text-runbar">
            <span>{{ t('toolbox.documentText.localHint') }}</span>
            <BButton :type="hasResults ? undefined : 'primary'" :disabled="running" :loading="running" @click="run">{{
              running
                ? t('toolbox.documentText.processing')
                : failedCount
                  ? t('toolbox.documentText.retryFailed')
                  : runLabel
            }}</BButton>
          </div>
          <div v-if="hasResults" class="document-text-main__actions">
            <BButton :disabled="!activeTextOnly.trim()" @click="copyActive"
              ><SvgIcon :src="icon.toolbox.copy" size="15" />{{ t('toolbox.local.copyResult') }}</BButton
            >
            <BButton :disabled="!activeTextOnly.trim()" @click="saveAsNote">{{ t('toolbox.task.saveToNote') }}</BButton>
            <BButton :disabled="!activeTextOnly.trim()" @click="translateOutput">{{ t('translation.title') }}</BButton>
            <BButton type="primary" :disabled="running" @click="downloadResults"
              ><SvgIcon :src="icon.toolbox.download" size="15" />{{ downloadLabel }}</BButton
            >
          </div>
        </section>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
  import { stageTranslation } from '@/utils/translationHandoff';
  import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
  import DocumentSummary from './DocumentSummary.vue';
  import { useRouter } from 'vue-router';
  import { openSaveAsNote } from '@/composables/useSaveAsNote';
  import { createNoteFromContent } from '@/utils/aiNoteDraft';
  import { useI18n } from 'vue-i18n';
  import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import CommunityMarkdown from '@/components/community/CommunityMarkdown.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useUiDensity } from '@/composables/useUiDensity';
  import { TOOLBOX_PRESENTATION } from '@/config/toolbox';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import {
    convertDocxToMarkdown,
    extractPdfText,
    type DocxMarkdownResult,
    type PdfTextFileResult,
  } from '@/utils/toolboxDocumentText';
  import { downloadToolboxBlob, formatToolboxBytes, safeDownloadBaseName } from '@/utils/toolboxLocal';

  type DocumentTextToolId = Extract<ToolboxToolId, 'pdf_text_extractor' | 'docx_to_markdown'>;
  const props = defineProps<{ toolId: DocumentTextToolId }>();
  import { usePdfSession } from './pdfSession';
  const publishPdf = usePdfSession(
    async () => files.value,
    (incoming) => {
      if (isPdf.value) {
        clearAll();
        loadFiles(incoming);
      }
    },
  );
  const { t } = useI18n();
  const { dimension } = useUiDensity();
  const router = useRouter();
  const saveDraftKeys = new WeakMap<File, { content: string; key: string }>();
  function translateOutput() {
    if (!activeTextOnly.value.trim()) return;
    stageTranslation(activeTextOnly.value, activeFileName.value.replace(/\.[^.]+$/, ''));
    void router.push('/toolbox/translation');
  }
  async function saveAsNote() {
    const file = files.value[activeFile.value];
    if (!file || !activeTextOnly.value.trim()) return;
    if (saveDraftKeys.get(file)?.content !== activeTextOnly.value)
      saveDraftKeys.set(file, { content: activeTextOnly.value, key: crypto.randomUUID() });
    const draft = {
      title: activeFileName.value.replace(/\.[^.]+$/, ''),
      content: activeTextOnly.value,
      type: 'markdown' as const,
    };
    const key = `document-text:${saveDraftKeys.get(file)?.key}`;
    const result = await openSaveAsNote({
      sourceKey: key,
      ...draft,
      isCurrent: () => files.value[activeFile.value] === file && activeTextOnly.value === draft.content,
      save: (options) => createNoteFromContent(draft, key, options),
    });
    if (result?.openAfterSave) await router.push(`/noteLibrary/${encodeURIComponent(result.noteId)}`);
  }
  const outputView = ref('preview');
  const files = ref<File[]>([]);
  const pdfResults = ref<PdfTextFileResult[]>([]);
  const docxResults = ref<Array<DocxMarkdownResult | null>>([]);
  const fileErrors = ref<string[]>([]);
  const failedCount = computed(() => fileErrors.value.filter(Boolean).length);
  const successfulDocxResults = computed(() =>
    docxResults.value.filter((result): result is DocxMarkdownResult => result !== null),
  );
  const activeError = computed(() => error.value || fileErrors.value[activeFile.value] || '');
  let runVersion = 0;
  const activeFile = ref(0);
  const loading = ref(false);
  const running = ref(false);
  const error = ref('');
  const progress = reactive({ completed: 0, total: 0, currentFile: 0 });

  const isPdf = computed(() => props.toolId === 'pdf_text_extractor');
  const toolName = computed(() => t(`toolbox.tool.${props.toolId}.name`));
  const toolIcon = computed(() => TOOLBOX_PRESENTATION[props.toolId].icon);
  const emptyTitle = computed(() => t(`toolbox.documentText.emptyTitle.${props.toolId}`));
  const chooseLabel = computed(() => t(`toolbox.documentText.choose.${props.toolId}`));
  const runLabel = computed(() => t(`toolbox.documentText.run.${props.toolId}`));
  const accept = computed(() =>
    isPdf.value
      ? '.pdf,application/pdf'
      : '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  const maxFiles = computed(() => (isPdf.value ? 4 : 5));
  const maxBytes = computed(() => (isPdf.value ? 80 : 50) * 1024 * 1024);
  const limitHint = computed(() =>
    t('toolbox.documentText.limitHint', {
      type: isPdf.value ? 'PDF' : 'DOCX',
      count: maxFiles.value,
      size: isPdf.value ? 80 : 50,
    }),
  );
  const totalBytes = computed(() => files.value.reduce((sum, file) => sum + file.size, 0));
  const hasResults = computed(() => (isPdf.value ? pdfResults.value.length : successfulDocxResults.value.length) > 0);
  const activeResult = computed(
    () => (isPdf.value ? pdfResults.value[activeFile.value] : docxResults.value[activeFile.value]) || null,
  );
  const activeOutput = computed({
    get: () =>
      isPdf.value
        ? (activeResult.value as PdfTextFileResult | null)?.text || ''
        : (activeResult.value as DocxMarkdownResult | null)?.markdown || '',
    set: () => undefined,
  });
  const activeFileName = computed(() => files.value[activeFile.value]?.name || toolName.value);
  const waitingDescription = computed(() => t(`toolbox.documentText.waitingDescription.${props.toolId}`));
  const progressPercent = computed(() =>
    progress.total ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 0,
  );
  const progressLabel = computed(() =>
    t('toolbox.documentText.progress', { current: progress.completed, total: progress.total || files.value.length }),
  );
  const imagePreviews = ref<Array<{ path: string; url: string }>>([]);
  const activeTextOnly = computed(() =>
    activeOutput.value.replace(/!\[Image\]\(assets\/image-\d+\.(?:png|jpg|webp)\)/g, ''),
  );
  function releaseImagePreviews() {
    imagePreviews.value.forEach((image) => URL.revokeObjectURL(image.url));
    imagePreviews.value = [];
  }
  watch(activeResult, (result) => {
    releaseImagePreviews();
    if (!isPdf.value && result)
      imagePreviews.value = ((result as DocxMarkdownResult).images || []).map((image) => ({
        path: image.path,
        url: URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: image.mimeType })),
      }));
  });
  onBeforeUnmount(releaseImagePreviews);
  const downloadLabel = computed(() =>
    (isPdf.value ? pdfResults.value.length : successfulDocxResults.value.length) > 1 ||
    successfulDocxResults.value.some((result) => result.images?.length)
      ? t('toolbox.documentText.downloadZip')
      : t('toolbox.local.downloadResult'),
  );
  const activeStats = computed(() => {
    if (!activeResult.value) return [];
    if (isPdf.value) {
      const result = activeResult.value as PdfTextFileResult;
      const characters = result.pages.reduce((sum, page) => sum + page.characters, 0);
      const empty = result.pages.filter((page) => !page.text).length;
      return [
        { label: t('toolbox.documentText.pages'), value: result.pages.length },
        { label: t('toolbox.documentText.characters'), value: characters.toLocaleString() },
        { label: t('toolbox.documentText.emptyPages'), value: empty },
      ];
    }
    const stats = (activeResult.value as DocxMarkdownResult).stats;
    return [
      { label: t('toolbox.documentText.paragraphs'), value: stats.paragraphs },
      { label: t('toolbox.documentText.headings'), value: stats.headings },
      { label: t('toolbox.documentText.tables'), value: stats.tables },
      { label: t('toolbox.documentText.links'), value: stats.links },
    ];
  });
  const activeWarning = computed(() => {
    if (!activeResult.value) return '';
    if (isPdf.value) {
      const empty = (activeResult.value as PdfTextFileResult).pages.filter((page) => !page.text).length;
      return empty ? t('toolbox.documentText.pdfScanWarning', { count: empty }) : '';
    }
    const images = (activeResult.value as DocxMarkdownResult).stats.images;
    const result = activeResult.value as DocxMarkdownResult;
    return images
      ? t(result.skippedImages ? 'toolbox.documentText.docxImages' : 'toolbox.documentText.docxImagesReady', {
          count: result.images?.length || 0,
          skipped: result.skippedImages || 0,
        })
      : '';
  });

  function resultFor(index: number) {
    return isPdf.value ? pdfResults.value[index] : docxResults.value[index];
  }

  function resetResults() {
    runVersion++;
    running.value = false;
    pdfResults.value = [];
    docxResults.value = [];
    fileErrors.value = [];
    error.value = '';
    outputView.value = 'preview';
    progress.completed = 0;
    progress.total = 0;
    progress.currentFile = 0;
  }

  function loadFiles(value: File[]) {
    const selected = value || [];
    if (selected.length > maxFiles.value)
      return message.warning(t('toolbox.documentText.tooMany', { count: maxFiles.value }));
    if (!selected.length) return;
    const correct = selected.every((file) =>
      isPdf.value
        ? file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        : file.name.toLowerCase().endsWith('.docx'),
    );
    if (!correct) return message.warning(t('toolbox.documentText.invalidType'));
    if (selected.reduce((sum, file) => sum + file.size, 0) > maxBytes.value) {
      return message.warning(t('toolbox.documentText.tooLarge'));
    }
    files.value = selected;
    if (isPdf.value) publishPdf();
    activeFile.value = 0;
    resetResults();
  }

  function clearAll() {
    files.value = [];
    activeFile.value = 0;
    resetResults();
  }

  async function run() {
    if (!files.value.length || running.value) return;
    const snapshot = [...files.value];
    const retryIndexes = fileErrors.value.flatMap((value, index) => (value ? [index] : []));
    if (!retryIndexes.length) resetResults();
    const version = ++runVersion;
    running.value = true;
    progress.completed = 0;
    error.value = '';
    try {
      if (isPdf.value) {
        progress.total = snapshot.length;
        const results = await extractPdfText(snapshot, (completed, total) => {
          if (version !== runVersion) return;
          progress.completed = completed;
          progress.total = total;
        });
        if (version === runVersion) pdfResults.value = results;
      } else {
        const indexes = retryIndexes.length ? retryIndexes : snapshot.map((_file, index) => index);
        if (!retryIndexes.length) docxResults.value = snapshot.map(() => null);
        progress.total = indexes.length;
        for (const index of indexes) {
          if (version !== runVersion) return;
          progress.currentFile = index;
          fileErrors.value[index] = '';
          try {
            const result = await convertDocxToMarkdown(snapshot[index]!);
            if (version !== runVersion) return;
            docxResults.value[index] = result;
          } catch (cause) {
            if (version !== runVersion) return;
            fileErrors.value[index] = documentError(cause);
          }
          progress.completed++;
        }
      }
    } catch (cause) {
      if (version === runVersion) error.value = documentError(cause);
    } finally {
      if (version === runVersion) running.value = false;
    }
  }

  function documentError(cause: unknown) {
    const code = cause instanceof Error ? cause.message : '';
    return t(
      `toolbox.documentText.error.${['TOO_MANY_PAGES', 'TOO_LARGE', 'INVALID_DOCX'].includes(code) ? code : 'generic'}`,
    );
  }

  async function copyActive() {
    const copied = await copyTextToClipboard(activeTextOnly.value);
    message[copied ? 'success' : 'error'](t(copied ? 'toolbox.local.copySuccess' : 'toolbox.local.copyFailed'));
  }

  async function downloadResults() {
    const results: Array<{ name: string; content: string; images?: DocxMarkdownResult['images'] }> = isPdf.value
      ? pdfResults.value.map((result) => ({ name: `${safeDownloadBaseName(result.name)}.txt`, content: result.text }))
      : successfulDocxResults.value.map((result) => ({
          name: `${safeDownloadBaseName(result.name)}.md`,
          content: result.markdown,
          images: result.images,
        }));
    if (!results.length) return;
    if (results.length === 1 && !results[0]!.images?.length) {
      downloadToolboxBlob(new Blob([results[0]!.content], { type: 'text/plain;charset=utf-8' }), results[0]!.name);
      return;
    }
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const result of results) {
      let name = result.name;
      let suffix = 2;
      while (zip.file(name)) name = result.name.replace(/(\.[^.]+)$/, `-${suffix++}$1`);
      if (result.images?.length) {
        const directory = name.replace(/\.md$/, '');
        // Reserve the root name too so identically named documents never share an image folder.
        zip.file(name, result.content.replace(/\]\(assets\//g, `](${directory}/assets/`));
        for (const image of result.images) zip.file(`${directory}/${image.path}`, image.bytes);
      } else zip.file(name, result.content);
    }
    downloadToolboxBlob(await zip.generateAsync({ type: 'blob' }), `lightnote-${props.toolId}.zip`);
  }

  watch(
    () => props.toolId,
    () => clearAll(),
  );
  onBeforeUnmount(() => {
    runVersion++;
  });
</script>

<style scoped lang="less">
  .document-text-images {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(var(--ui-layout-120, 120px), 1fr));
    gap: var(--ui-space-12, 12px);
  }
  .document-text-images figure {
    margin: 0;
  }
  .document-text-images img {
    display: block;
    max-width: 100%;
    max-height: var(--ui-layout-240, 240px);
    object-fit: contain;
  }
  .document-text-images figcaption {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }

  @import (reference) '@/assets/css/workspace-surfaces.less';
  .document-text-workbench {
    display: grid;
    gap: 0;
    min-width: 0;
  }
  .document-text-empty {
    .workspace-content-surface();
    min-height: var(--ui-layout-300, 300px);
    padding: var(--ui-space-24, 24px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-16, 16px);
    border: 1px dashed var(--workspace-border);
    border-radius: 12px;
    text-align: center;
  }
  .document-text-empty > :deep(svg) {
    color: var(--workspace-purple-text);
  }
  .document-text-empty h2 {
    margin: 0;
    font-size: var(--ui-font-18, 18px);
  }
  .document-text-empty small {
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }
  .document-text-sourcebar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px);
    border: 1px solid var(--workspace-border);
    border-radius: 12px 12px 0 0;
  }
  .document-text-sourcebar__copy,
  .document-text-sourcebar__actions {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }
  .document-text-sourcebar small {
    color: var(--workspace-muted);
  }
  .document-text-layout {
    .workspace-content-surface();
    display: grid;
    grid-template-columns: var(--ui-layout-260, 260px) minmax(0, 1fr);
    border: 1px solid var(--workspace-border);
    border-top: 0;
    border-radius: 0 0 12px 12px;
  }
  .document-text-files {
    padding: var(--ui-space-12, 12px);
    border-right: 1px solid var(--workspace-divider);
    min-width: 0;
  }
  .document-text-files header {
    display: flex;
    justify-content: space-between;
    color: var(--workspace-muted);
    padding: var(--ui-space-8, 8px);
    font-size: var(--ui-font-12, 12px);
  }
  .document-text-file.b_btn {
    width: 100%;
    min-width: 0;
    height: auto;
    line-height: 1.5;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: var(--ui-space-8, 8px);
    align-items: center;
    padding: var(--ui-space-12, 12px) var(--ui-space-8, 8px);
    margin-top: var(--ui-space-4, 4px);
    text-align: left;
    border: 1px solid transparent;
    background: transparent;
  }
  .document-text-file.is-active {
    border-color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }
  .document-text-file > :deep(svg) {
    color: var(--workspace-purple-text);
  }
  .document-text-file__copy {
    display: grid;
    min-width: 0;
    gap: var(--ui-space-4, 4px);
  }
  .document-text-file__copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ui-font-12, 12px);
  }
  .document-text-file__copy small {
    color: var(--workspace-muted);
    font-size: var(--ui-font-11, 11px);
  }
  .document-text-main {
    min-width: 0;
    padding: var(--ui-space-20, 20px);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: var(--ui-space-16, 16px);
  }
  .document-text-main__title h2 {
    margin: 0;
    font-size: var(--ui-font-20, 20px);
    overflow-wrap: anywhere;
  }
  .document-text-stats {
    margin-top: var(--ui-space-8, 8px);
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }
  .document-text-main__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    align-items: center;
    justify-content: flex-end;
  }
  .document-text-preview {
    min-height: var(--ui-layout-360, 360px);
    padding: var(--ui-space-20, 20px);
    border: 1px solid var(--workspace-divider);
    border-radius: 8px;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .document-text-preview :deep(table) {
    display: block;
    overflow-x: auto;
    max-width: 100%;
  }
  .document-text-main :deep(textarea) {
    min-height: var(--ui-layout-360, 360px);
    font-family: ui-monospace, monospace;
    line-height: 1.65;
  }
  .document-text-progress {
    display: grid;
    gap: var(--ui-space-8, 8px);
  }
  .document-text-progress > div,
  .document-text-runbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--ui-space-12, 12px);
  }
  .document-text-runbar {
    flex-wrap: wrap;
  }
  .document-text-runbar > span {
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }
  .document-text-error,
  .document-text-warning,
  .document-text-batch {
    display: flex;
    gap: var(--ui-space-8, 8px);
    margin: 0;
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border: 1px solid var(--danger-color);
    color: var(--danger-color);
    border-radius: 8px;
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
  }
  .document-text-warning,
  .document-text-batch {
    color: var(--chip-pending-fg);
    border-color: var(--chip-pending-border);
    background: var(--chip-pending-bg);
  }
  .document-text-placeholder {
    min-height: var(--ui-layout-230, 230px);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    color: var(--workspace-muted);
    text-align: center;
  }
  .document-text-placeholder p {
    margin: 0;
    font-size: var(--ui-font-13, 13px);
  }
  @media (min-width: 1200px) {
    .document-text-main {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .document-text-main > * {
      grid-column: 1 / -1;
    }
    .document-text-main__title {
      grid-column: 1;
      grid-row: 1;
    }
    .document-text-main__actions {
      grid-column: 2;
      grid-row: 1;
      max-width: var(--ui-layout-460, 460px);
    }
  }
  @media (max-width: 767px) {
    .document-text-layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .document-text-files {
      border-right: 0;
      border-bottom: 1px solid var(--workspace-divider);
      padding: var(--ui-space-8, 8px);
    }
    .document-text-file.b_btn {
      padding: var(--ui-space-10, 10px) var(--ui-space-8, 8px);
    }
    .document-text-main {
      padding: var(--ui-space-12, 12px);
    }
    .document-text-main__actions {
      .workspace-content-surface();
      position: sticky;
      bottom: 0;
      z-index: 2;
      padding: var(--ui-space-10, 10px) 0 calc(var(--ui-space-10, 10px) + env(safe-area-inset-bottom, 0px));
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border-top: 1px solid var(--workspace-divider);
    }
    .document-text-main__actions .b_btn {
      min-height: var(--ui-control-44, 44px);
    }
    .document-text-preview {
      padding: var(--ui-space-12, 12px);
      min-height: var(--ui-layout-260, 260px);
    }
    .document-text-main__title h2 {
      font-size: var(--ui-font-18, 18px);
    }
    .document-text-runbar .b_btn {
      margin-left: auto;
    }
  }
</style>

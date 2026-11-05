<template>
  <section class="document-text-workbench" :aria-label="toolName">
    <section v-if="files.length === 0" class="document-text-empty">
      <SvgIcon :src="toolIcon" size="36" />
      <h2>{{ emptyTitle }}</h2>
      <BUpload raw-file multiple :accept="accept" :max-total-size="null" :disabled="loading" @change="loadFiles">
        <BButton type="primary" :loading="loading"
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
            <BButton><SvgIcon :src="icon.toolbox.upload" size="14" />{{ t('toolbox.documentText.replace') }}</BButton>
          </BUpload>
          <BButton @click="clearAll">{{ t('common.clear') }}</BButton>
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
            <BChip v-if="pdfResults[index]" tone="success">{{ t('toolbox.documentText.ready') }}</BChip>
            <BChip v-else-if="running && progress.currentFile === index" tone="pending">{{ progressLabel }}</BChip>
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
          <DocumentSummary
            v-if="activeResult && files[activeFile]"
            :file="files[activeFile]!"
            :text="activeOutput"
            :has-text="Boolean(activeResult.pages.some((page) => page.text.trim()))"
            :warning="activeWarning"
          />
          <div v-if="running" class="document-text-progress" role="status">
            <div
              ><span>{{ progressLabel }}</span
              ><strong>{{ progressPercent }}%</strong></div
            ><BProgress :percent="progressPercent" />
          </div>
          <div v-if="error" class="document-text-error" role="alert"
            ><SvgIcon :src="icon.message.error" size="18" /><span>{{ error }}</span></div
          >
          <template v-if="activeResult">
            <div v-if="activeWarning" class="document-text-warning"
              ><SvgIcon :src="icon.message.info" size="17" /><span>{{ activeWarning }}</span></div
            >
            <BInput :value="activeOutput" type="textarea" :rows="dimension(22, 'layout')" readonly />
          </template>
          <div v-else-if="!error && !running" class="document-text-placeholder">
            <SvgIcon :src="toolIcon" size="32" /><strong>{{ t('toolbox.documentText.waitingTitle') }}</strong
            ><p>{{ waitingDescription }}</p>
          </div>
          <div v-if="!hasResults || running" class="document-text-runbar">
            <span>{{ t('toolbox.documentText.localHint') }}</span>
            <BButton :type="hasResults ? undefined : 'primary'" :disabled="running" :loading="running" @click="run">{{
              running ? t('toolbox.documentText.processing') : runLabel
            }}</BButton>
          </div>
          <div v-if="hasResults" class="document-text-main__actions">
            <BButton :disabled="!activeOutput.trim()" @click="copyActive"
              ><SvgIcon :src="icon.toolbox.copy" size="15" />{{ t('toolbox.local.copyResult') }}</BButton
            >
            <BButton :disabled="!activeOutput.trim()" @click="saveAsNote">{{ t('toolbox.task.saveToNote') }}</BButton>
            <BButton :disabled="!activeOutput.trim()" @click="translateOutput">{{ t('translation.title') }}</BButton>
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
  import { extractPdfText, type PdfTextFileResult } from '@/utils/toolboxDocumentText';
  import {
    downloadToolboxBlob,
    formatToolboxBytes,
    reserveToolboxFileName,
    safeDownloadBaseName,
  } from '@/utils/toolboxLocal';

  const props = defineProps<{ toolId: Extract<ToolboxToolId, 'pdf_text_extractor'> }>();
  import { usePdfSession } from './pdfSession';
  const publishPdf = usePdfSession(
    async () => files.value,
    (incoming) => {
      clearAll();
      loadFiles(incoming);
    },
  );
  const { t } = useI18n();
  const { dimension } = useUiDensity();
  const router = useRouter();
  const saveDraftKeys = new WeakMap<File, { content: string; key: string }>();
  function translateOutput() {
    if (!activeOutput.value.trim()) return;
    stageTranslation(activeOutput.value, activeFileName.value.replace(/\.[^.]+$/, ''));
    void router.push('/toolbox/translation');
  }
  async function saveAsNote() {
    const file = files.value[activeFile.value];
    if (!file || !activeOutput.value.trim()) return;
    if (saveDraftKeys.get(file)?.content !== activeOutput.value)
      saveDraftKeys.set(file, { content: activeOutput.value, key: crypto.randomUUID() });
    const draft = {
      title: activeFileName.value.replace(/\.[^.]+$/, ''),
      content: activeOutput.value,
      type: 'markdown' as const,
    };
    const key = `document-text:${saveDraftKeys.get(file)?.key}`;
    const result = await openSaveAsNote({
      sourceKey: key,
      ...draft,
      isCurrent: () => files.value[activeFile.value] === file && activeOutput.value === draft.content,
      save: (options) => createNoteFromContent(draft, key, options),
    });
    if (result?.openAfterSave) await router.push(`/noteLibrary/${encodeURIComponent(result.noteId)}`);
  }
  const files = ref<File[]>([]);
  const pdfResults = ref<PdfTextFileResult[]>([]);
  let runVersion = 0;
  const activeFile = ref(0);
  const loading = ref(false);
  const running = ref(false);
  const error = ref('');
  const progress = reactive({ completed: 0, total: 0, currentFile: 0 });

  const toolName = computed(() => t(`toolbox.tool.${props.toolId}.name`));
  const toolIcon = computed(() => TOOLBOX_PRESENTATION[props.toolId].icon);
  const emptyTitle = computed(() => t(`toolbox.documentText.emptyTitle.${props.toolId}`));
  const chooseLabel = computed(() => t(`toolbox.documentText.choose.${props.toolId}`));
  const runLabel = computed(() => t(`toolbox.documentText.run.${props.toolId}`));
  const accept = '.pdf,application/pdf';
  const maxFiles = 4;
  const maxBytes = 80 * 1024 * 1024;
  const limitHint = computed(() => t('toolbox.documentText.limitHint', { type: 'PDF', count: maxFiles, size: 80 }));
  const totalBytes = computed(() => files.value.reduce((sum, file) => sum + file.size, 0));
  const hasResults = computed(() => pdfResults.value.length > 0);
  const activeResult = computed(() => pdfResults.value[activeFile.value] || null);
  const activeOutput = computed(() => activeResult.value?.text || '');
  const activeFileName = computed(() => files.value[activeFile.value]?.name || toolName.value);
  const waitingDescription = computed(() => t(`toolbox.documentText.waitingDescription.${props.toolId}`));
  const progressPercent = computed(() =>
    progress.total ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 0,
  );
  const progressLabel = computed(() =>
    t('toolbox.documentText.progress', { current: progress.completed, total: progress.total || files.value.length }),
  );
  const downloadLabel = computed(() =>
    pdfResults.value.length > 1 ? t('toolbox.documentText.downloadZip') : t('toolbox.local.downloadResult'),
  );
  const activeStats = computed(() => {
    const result = activeResult.value;
    if (!result) return [];
    const characters = result.pages.reduce((sum, page) => sum + page.characters, 0);
    const empty = result.pages.filter((page) => !page.text).length;
    return [
      { label: t('toolbox.documentText.pages'), value: result.pages.length },
      { label: t('toolbox.documentText.characters'), value: characters.toLocaleString() },
      { label: t('toolbox.documentText.emptyPages'), value: empty },
    ];
  });
  const activeWarning = computed(() => {
    const empty = activeResult.value?.pages.filter((page) => !page.text).length || 0;
    return empty ? t('toolbox.documentText.pdfScanWarning', { count: empty }) : '';
  });

  function resetResults() {
    runVersion++;
    running.value = false;
    pdfResults.value = [];
    error.value = '';
    progress.completed = 0;
    progress.total = 0;
    progress.currentFile = 0;
  }

  function loadFiles(value: File[]) {
    const selected = value || [];
    if (selected.length > maxFiles) return message.warning(t('toolbox.documentText.tooMany', { count: maxFiles }));
    if (!selected.length) return;
    const correct = selected.every(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
    );
    if (!correct) return message.warning(t('toolbox.documentText.invalidType'));
    if (selected.reduce((sum, file) => sum + file.size, 0) > maxBytes) {
      return message.warning(t('toolbox.documentText.tooLarge'));
    }
    files.value = selected;
    publishPdf();
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
    resetResults();
    const version = ++runVersion;
    running.value = true;
    progress.completed = 0;
    error.value = '';
    try {
      progress.total = snapshot.length;
      const results = await extractPdfText(snapshot, (completed, total) => {
        if (version !== runVersion) return;
        progress.completed = completed;
        progress.total = total;
      });
      if (version === runVersion) pdfResults.value = results;
    } catch (cause) {
      if (version === runVersion) error.value = documentError(cause);
    } finally {
      if (version === runVersion) running.value = false;
    }
  }

  function documentError(cause: unknown) {
    const code = cause instanceof Error ? cause.message : '';
    return t(
      `toolbox.documentText.error.${['TOO_MANY_PAGES', 'TOO_LARGE'].includes(code) ? code : 'generic'}`,
    );
  }

  async function copyActive() {
    const copied = await copyTextToClipboard(activeOutput.value);
    message[copied ? 'success' : 'error'](t(copied ? 'toolbox.local.copySuccess' : 'toolbox.local.copyFailed'));
  }

  async function downloadResults() {
    const results = pdfResults.value.map((result) => ({
      name: `${safeDownloadBaseName(result.name)}.txt`,
      content: result.text,
    }));
    if (!results.length) return;
    if (results.length === 1) {
      downloadToolboxBlob(new Blob([results[0]!.content], { type: 'text/plain;charset=utf-8' }), results[0]!.name);
      return;
    }
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const result of results) zip.file(reserveToolboxFileName(result.name, usedNames), result.content);
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
  .document-text-empty :deep(.b_btn),
  .document-text-sourcebar__actions :deep(.b_btn),
  .document-text-main__actions :deep(.b_btn) {
    gap: var(--ui-space-6, 6px);
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
  .document-text-warning {
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
  .document-text-warning {
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
      align-items: stretch;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border-top: 1px solid var(--workspace-divider);
    }
    .document-text-main__actions .b_btn {
      width: 100%;
      min-width: 0;
      height: auto;
      min-height: var(--ui-control-44, 44px);
      padding: var(--ui-space-8, 8px);
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 1.5;
    }
    .document-text-main__title h2 {
      font-size: var(--ui-font-18, 18px);
    }
    .document-text-runbar .b_btn {
      margin-left: auto;
    }
  }
</style>

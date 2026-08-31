<template>
  <section class="document-text-workbench" :aria-label="toolName">
    <section v-if="files.length === 0" class="document-text-empty">
      <span><SvgIcon :src="toolIcon" size="36" /></span>
      <div>
        <BChip tone="success">{{ t('toolbox.localFreeLabel') }}</BChip>
        <h2>{{ emptyTitle }}</h2>
        <p>{{ toolDescription }}</p>
      </div>
      <BUpload raw-file multiple :accept="accept" :max-total-size="null" :disabled="loading" @change="loadFiles">
        <BButton type="primary" size="large" :loading="loading">
          <SvgIcon :src="icon.toolbox.upload" size="17" />{{ chooseLabel }}
        </BButton>
      </BUpload>
      <small>{{ limitHint }}</small>
    </section>

    <template v-else>
      <section class="document-text-sourcebar">
        <div class="document-text-sourcebar__copy">
          <span><SvgIcon :src="toolIcon" size="22" /></span>
          <div
            ><strong>{{ t('toolbox.documentText.loaded', { count: files.length }) }}</strong
            ><small>{{ formatToolboxBytes(totalBytes) }}</small></div
          >
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
          <article
            v-for="(file, index) in files"
            :key="file.name"
            :class="{ 'is-active': activeFile === index }"
            @click="activeFile = index"
          >
            <span><SvgIcon :src="toolIcon" size="16" /></span>
            <div
              ><strong>{{ file.name }}</strong
              ><small>{{ formatToolboxBytes(file.size) }}</small></div
            >
            <BChip v-if="resultFor(index)" tone="success">{{ t('toolbox.documentText.ready') }}</BChip>
            <BChip v-else-if="running && progress.currentFile === index" tone="pending">{{ progressLabel }}</BChip>
          </article>
        </aside>

        <section class="document-text-main">
          <header class="document-text-main__head">
            <div>
              <span>{{ t('toolbox.documentText.outputEyebrow') }}</span>
              <h2>{{ activeFileName }}</h2>
              <p>{{ resultDescription }}</p>
            </div>
            <div v-if="hasResults">
              <BButton :disabled="!activeOutput" @click="copyActive"
                ><SvgIcon :src="icon.toolbox.copy" size="15" />{{ t('toolbox.local.copyResult') }}</BButton
              >
              <BButton @click="downloadResults"
                ><SvgIcon :src="icon.toolbox.download" size="15" />{{ downloadLabel }}</BButton
              >
            </div>
          </header>

          <div v-if="running" class="document-text-progress">
            <div
              ><span>{{ progressLabel }}</span
              ><strong>{{ progressPercent }}%</strong></div
            >
            <BProgress :percent="progressPercent" />
            <small>{{ t('toolbox.documentText.processingHint') }}</small>
          </div>

          <div v-if="error" class="document-text-error" role="alert"
            ><SvgIcon :src="icon.message.info" size="18" /><span>{{ error }}</span></div
          >

          <template v-if="activeResult">
            <div class="document-text-stats">
              <div v-for="stat in activeStats" :key="stat.label"
                ><span>{{ stat.label }}</span
                ><strong>{{ stat.value }}</strong></div
              >
            </div>
            <div v-if="activeWarning" class="document-text-warning"
              ><SvgIcon :src="icon.message.info" size="17" /><span>{{ activeWarning }}</span></div
            >
            <BInput v-model:value="activeOutput" type="textarea" :rows="22" readonly />
          </template>

          <div v-else class="document-text-placeholder">
            <span><SvgIcon :src="toolIcon" size="32" /></span>
            <strong>{{ t('toolbox.documentText.waitingTitle') }}</strong>
            <p>{{ waitingDescription }}</p>
          </div>

          <div class="document-text-runbar">
            <div
              ><SvgIcon :src="icon.toolbox.local" size="18" /><span>{{
                t('toolbox.documentText.localHint')
              }}</span></div
            >
            <BButton type="primary" :disabled="running" :loading="running" @click="run">
              {{ running ? t('toolbox.documentText.processing') : runLabel
              }}<SvgIcon v-if="!running" :src="icon.toolbox.arrow" size="15" />
            </BButton>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue';
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
  const { t } = useI18n();
  const files = ref<File[]>([]);
  const pdfResults = ref<PdfTextFileResult[]>([]);
  const docxResults = ref<DocxMarkdownResult[]>([]);
  const activeFile = ref(0);
  const loading = ref(false);
  const running = ref(false);
  const error = ref('');
  const progress = reactive({ completed: 0, total: 0, currentFile: 0 });

  const isPdf = computed(() => props.toolId === 'pdf_text_extractor');
  const toolName = computed(() => t(`toolbox.tool.${props.toolId}.name`));
  const toolDescription = computed(() => t(`toolbox.tool.${props.toolId}.description`));
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
  const hasResults = computed(() => (isPdf.value ? pdfResults.value.length : docxResults.value.length) > 0);
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
  const resultDescription = computed(() =>
    hasResults.value
      ? t(`toolbox.documentText.resultDescription.${props.toolId}`)
      : t(`toolbox.documentText.waitingDescription.${props.toolId}`),
  );
  const waitingDescription = computed(() => t(`toolbox.documentText.waitingDescription.${props.toolId}`));
  const progressPercent = computed(() =>
    progress.total ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 0,
  );
  const progressLabel = computed(() =>
    t('toolbox.documentText.progress', { current: progress.completed, total: progress.total || files.value.length }),
  );
  const downloadLabel = computed(() =>
    files.value.length > 1 ? t('toolbox.documentText.downloadZip') : t('toolbox.local.downloadResult'),
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
    return images ? t('toolbox.documentText.docxImageWarning', { count: images }) : '';
  });

  function resultFor(index: number) {
    return isPdf.value ? pdfResults.value[index] : docxResults.value[index];
  }

  function resetResults() {
    pdfResults.value = [];
    docxResults.value = [];
    error.value = '';
    progress.completed = 0;
    progress.total = 0;
    progress.currentFile = 0;
  }

  function loadFiles(value: File[]) {
    const selected = (value || []).slice(0, maxFiles.value);
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
    running.value = true;
    resetResults();
    try {
      if (isPdf.value) {
        progress.total = files.value.length;
        pdfResults.value = await extractPdfText(files.value, (completed, total) => {
          progress.completed = completed;
          progress.total = total;
        });
      } else {
        progress.total = files.value.length;
        const results: DocxMarkdownResult[] = [];
        for (let index = 0; index < files.value.length; index += 1) {
          progress.currentFile = index;
          results.push(await convertDocxToMarkdown(files.value[index]!));
          progress.completed = index + 1;
        }
        docxResults.value = results;
      }
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      error.value = t(
        `toolbox.documentText.error.${['TOO_MANY_PAGES', 'TOO_LARGE', 'INVALID_DOCX'].includes(code) ? code : 'generic'}`,
      );
    } finally {
      running.value = false;
    }
  }

  async function copyActive() {
    const copied = await copyTextToClipboard(activeOutput.value);
    message[copied ? 'success' : 'error'](t(copied ? 'toolbox.local.copySuccess' : 'toolbox.local.copyFailed'));
  }

  async function downloadResults() {
    const results = isPdf.value
      ? pdfResults.value.map((result) => ({ name: `${safeDownloadBaseName(result.name)}.txt`, content: result.text }))
      : docxResults.value.map((result) => ({
          name: `${safeDownloadBaseName(result.name)}.md`,
          content: result.markdown,
        }));
    if (!results.length) return;
    if (results.length === 1) {
      downloadToolboxBlob(new Blob([results[0]!.content], { type: 'text/plain;charset=utf-8' }), results[0]!.name);
      return;
    }
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const result of results) zip.file(result.name, result.content);
    downloadToolboxBlob(await zip.generateAsync({ type: 'blob' }), `lightnote-${props.toolId}.zip`);
  }

  watch(
    () => props.toolId,
    () => clearAll(),
  );
</script>

<style scoped lang="less">
  .document-text-workbench {
    display: grid;
    gap: 16px;
  }

  .document-text-empty {
    min-height: 390px;
    padding: 46px 22px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    border: 1px dashed rgba(97, 92, 237, 0.5);
    border-radius: 20px;
    text-align: center;
    background: radial-gradient(circle at 50% 8%, rgba(97, 92, 237, 0.12), transparent 42%), var(--card-background);
  }

  .document-text-empty > span {
    width: 76px;
    height: 76px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(97, 92, 237, 0.42);
    border-radius: 22px;
    color: var(--primary-color);
    background: var(--card-background);
    box-shadow: 0 18px 50px rgba(73, 67, 190, 0.14);
  }

  .document-text-empty > div {
    max-width: 570px;
    display: grid;
    justify-items: center;
    gap: 7px;
  }

  .document-text-empty h2,
  .document-text-empty p,
  .document-text-main h2,
  .document-text-main p {
    margin: 0;
  }

  .document-text-empty h2 {
    font-size: clamp(23px, 2.2vw, 31px);
  }

  .document-text-empty p,
  .document-text-empty > small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.65;
  }

  .document-text-sourcebar {
    padding: 11px 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }

  .document-text-sourcebar__copy,
  .document-text-sourcebar__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .document-text-sourcebar__copy > span {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .document-text-sourcebar__copy > div {
    display: grid;
    gap: 2px;
  }

  .document-text-sourcebar small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .document-text-layout {
    display: grid;
    grid-template-columns: minmax(230px, 0.26fr) minmax(0, 1fr);
    gap: 13px;
    align-items: start;
  }

  .document-text-files,
  .document-text-main {
    min-width: 0;
    padding: 15px;
    display: grid;
    gap: 11px;
    border: 1px solid var(--surface-border-color);
    border-radius: 17px;
    background: var(--card-background);
  }

  .document-text-files > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--desc-color);
    font-size: 11px;
  }

  .document-text-files article {
    min-width: 0;
    padding: 10px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    border: 1px solid transparent;
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
    cursor: pointer;
  }

  .document-text-files article.is-active {
    border-color: var(--primary-color);
  }

  .document-text-files article > span {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--primary-color);
    background: var(--card-background);
  }

  .document-text-files article > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .document-text-files article strong,
  .document-text-files article small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .document-text-files article strong {
    font-size: 11px;
  }

  .document-text-files article small {
    color: var(--desc-color);
    font-size: 9px;
  }

  .document-text-main__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .document-text-main__head > div:first-child {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .document-text-main__head > div:first-child > span {
    color: var(--primary-color);
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .document-text-main__head h2 {
    overflow: hidden;
    font-size: 19px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .document-text-main__head p {
    color: var(--desc-color);
    font-size: 11px;
  }

  .document-text-main__head > div:last-child {
    display: flex;
    gap: 7px;
  }

  .document-text-progress {
    padding: 12px;
    display: grid;
    gap: 8px;
    border: 1px solid rgba(97, 92, 237, 0.45);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }

  .document-text-progress > div {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
  }

  .document-text-progress small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .document-text-error,
  .document-text-warning {
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--danger-color, #dc3e4d);
    border-radius: 11px;
    color: var(--danger-color, #dc3e4d);
    font-size: 11px;
  }

  .document-text-warning {
    border-color: #a66a00;
    color: #a66a00;
  }

  .document-text-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .document-text-stats > div {
    min-height: 66px;
    padding: 10px;
    display: grid;
    align-content: center;
    gap: 3px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }

  .document-text-stats span {
    color: var(--desc-color);
    font-size: 10px;
  }

  .document-text-stats strong {
    font-size: 18px;
  }

  .document-text-main :deep(textarea) {
    min-height: 450px;
    resize: vertical;
    border-color: var(--surface-border-color);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    line-height: 1.65;
  }

  .document-text-placeholder {
    min-height: 430px;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 7px;
    color: var(--desc-color);
    text-align: center;
  }

  .document-text-placeholder > span {
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .document-text-placeholder p {
    max-width: 460px;
    font-size: 11px;
    line-height: 1.55;
  }

  .document-text-runbar {
    padding: 11px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }

  .document-text-runbar > div {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .document-text-runbar > div :deep(.svg-icon) {
    color: #07835f;
  }

  @media (max-width: 900px) {
    .document-text-layout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 767px) {
    .document-text-sourcebar,
    .document-text-sourcebar__actions,
    .document-text-main__head,
    .document-text-main__head > div:last-child,
    .document-text-runbar {
      align-items: stretch;
      flex-direction: column;
    }

    .document-text-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .document-text-main :deep(textarea) {
      min-height: 320px;
    }

    .document-text-placeholder {
      min-height: 300px;
    }
  }

  html.light-note-mobile-rendering .document-text-empty,
  html.light-note-mobile-rendering .document-text-sourcebar,
  html.light-note-mobile-rendering .document-text-files,
  html.light-note-mobile-rendering .document-text-main {
    box-shadow: none;
  }
</style>

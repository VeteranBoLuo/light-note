<template>
  <section class="table-tool" :class="`is-${step}`" :aria-label="t('toolbox.tool.table_converter.name')">
    <div class="table-tool__steps" role="tablist" :aria-label="t('toolbox.local.resultView')">
      <BChip
        tone="neutral"
        interactive
        :selected="step === 'input'"
        role="tab"
        :aria-selected="step === 'input'"
        @click="step = 'input'"
        >{{ t('toolbox.local.inputStep') }}</BChip
      >
      <BChip
        tone="neutral"
        interactive
        :selected="step === 'result'"
        :disabled="!output"
        role="tab"
        :aria-selected="step === 'result'"
        @click="step = 'result'"
        >{{ t('toolbox.local.resultStep') }}</BChip
      >
    </div>
    <div class="table-tool__toolbar">
      <div
        ><label id="table-input-format">{{ t('toolbox.local.inputFormat') }}</label
        ><BSelect
          v-model:value="inputFormat"
          :options="inputFormatOptions"
          :disabled="loading"
          aria-labelledby="table-input-format"
      /></div>
      <BButton class="table-tool__swap" :disabled="loading" :aria-label="t('toolbox.local.swapDirection')" @click="swap"
        ><SvgIcon :src="icon.toolbox.swap" size="18"
      /></BButton>
      <div
        ><label id="table-output-format">{{ t('toolbox.local.outputFormat') }}</label
        ><BSelect
          v-model:value="outputFormat"
          :options="outputFormatOptions"
          :disabled="loading"
          aria-labelledby="table-output-format"
      /></div>
    </div>
    <div v-if="output && stats" class="table-tool__complete" role="status"
      ><BChip tone="success">{{ t('toolbox.local.convertComplete') }}</BChip
      ><span>{{ t('toolbox.local.tableSize', stats) }}</span
      ><BButton type="text" @click="step = 'input'">{{ t('toolbox.local.editInput') }}</BButton
      ><BButton type="text" @click="continueInDataset">{{ t('toolbox.local.continueInDataset') }}</BButton></div
    >
    <div class="table-tool__editors">
      <section class="table-tool__input">
        <header
          ><strong>{{ inputFormatLabel }}</strong
          ><span>{{ source.length.toLocaleString() }}/1,000,000</span></header
        >
        <BInput
          v-model:value="source"
          type="textarea"
          :rows="dimension(16, 'layout')"
          :maxlength="1000000"
          :disabled="loading"
          :placeholder="t('toolbox.local.tableInputPlaceholder')"
        />
        <div class="table-tool__source-actions">
          <BUpload
            raw-file
            :multiple="false"
            accept=".csv,.tsv,.json,.md,.markdown"
            :max-total-size="null"
            :disabled="loading"
            @change="loadFile"
            ><BButton :loading="loading"
              ><SvgIcon :src="icon.toolbox.upload" size="15" />{{ t('toolbox.local.loadLocalFile') }}</BButton
            ></BUpload
          >
          <BButton :disabled="loading" @click="loadSample">{{ t('toolbox.local.loadSample') }}</BButton
          ><BButton :disabled="loading || !source" @click="clear">{{ t('common.clear') }}</BButton>
        </div>
        <BCheckbox
          v-if="['csv', 'tsv'].includes(resolvedInputFormat)"
          v-model:checked="firstRowHeader"
          :disabled="loading"
          >{{ t('toolbox.local.firstRowHeader') }}</BCheckbox
        >
      </section>
      <section class="table-tool__output">
        <header class="table-tool__result-header"
          ><strong>{{ outputFormatLabel }}</strong>
          <div v-if="output" class="table-tool__view-switch" role="tablist" :aria-label="t('toolbox.local.resultView')">
            <BChip
              v-for="option in resultViewOptions"
              :key="option.value"
              tone="neutral"
              interactive
              :selected="resultView === option.value"
              role="tab"
              :aria-selected="resultView === option.value"
              @click="resultView = option.value"
              >{{ option.label }}</BChip
            >
          </div>
        </header>
        <div
          v-if="output && resultView === 'preview'"
          class="table-tool__preview"
          role="region"
          :aria-label="t('toolbox.local.tablePreview')"
        >
          <div class="table-tool__preview-scroll"
            ><div class="table-tool__preview-table" :style="previewTableStyle"
              ><BTable :data="previewRows" :columns="previewColumns" row-key="__rowId" /></div
          ></div>
          <small>{{ previewNote }}</small>
        </div>
        <BInput
          v-else
          v-model:value="output"
          type="textarea"
          :rows="dimension(16, 'layout')"
          readonly
          :placeholder="t('toolbox.local.outputPlaceholder')"
        />
      </section>
    </div>
    <div v-if="error" class="table-tool__error" role="alert">{{ error }}</div>
    <div class="table-tool__actions">
      <span>{{ t('toolbox.documentText.localHint') }}</span>
      <template v-if="output && step === 'result'">
        <BButton @click="copyOutput"
          ><SvgIcon :src="icon.toolbox.copy" size="15" />{{ t('toolbox.local.copyResult') }}</BButton
        >
        <BButton type="primary" @click="downloadOutput"
          ><SvgIcon :src="icon.toolbox.download" size="15" />{{ t('toolbox.local.downloadResult') }}</BButton
        >
      </template>
      <BButton
        v-else
        type="primary"
        :disabled="loading || !source.trim() || resolvedInputFormat === outputFormat"
        @click="convert"
        >{{ t('toolbox.local.convertNow') }}</BButton
      >
    </div>
  </section>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { createToolboxDataset } from '@/utils/toolboxDataset';
  import { stageDataset } from '@/utils/datasetHandoff';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import type { Column } from '@/components/base/BasicComponents/BTable/config';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useUiDensity } from '@/composables/useUiDensity';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { convertTable, detectTableFormat, ToolboxTextError, type TableFormat } from '@/utils/toolboxTextTools';
  import { downloadToolboxBlob } from '@/utils/toolboxLocal';

  const { t } = useI18n();
  const router = useRouter();
  function continueInDataset() {
    if (!resultTable.value.length) return;
    const handoff = stageDataset(createToolboxDataset(resultTable.value, t('toolbox.local.convertedTable')));
    void router.push({ path: '/toolbox/data_workbench', query: { handoff } });
  }
  const { dimension } = useUiDensity();
  const inputFormat = ref<TableFormat | 'auto'>('auto');
  const step = ref('input');
  const firstRowHeader = ref(true);
  const loading = ref(false);
  let loadVersion = 0;
  const outputFormat = ref<TableFormat>('markdown');
  const source = ref('');
  const output = ref('');
  const resultTable = ref<string[][]>([]);
  const resultView = ref<'preview' | 'raw'>('preview');
  const stats = ref<{ rows: number; columns: number } | null>(null);
  const error = ref('');
  const formats: TableFormat[] = ['csv', 'tsv', 'json', 'markdown'];
  const resolvedInputFormat = computed(() =>
    inputFormat.value === 'auto' ? detectTableFormat(source.value) : inputFormat.value,
  );
  const labelFor = (format: TableFormat) => (format === 'markdown' ? 'Markdown' : format.toUpperCase());
  const inputFormatOptions = computed(() => [
    { value: 'auto', label: t('toolbox.local.autoFormat') },
    ...formats.map((value) => ({ value, label: labelFor(value) })),
  ]);
  const outputFormatOptions = computed(() => formats.map((value) => ({ value, label: labelFor(value) })));
  const inputFormatLabel = computed(() => labelFor(resolvedInputFormat.value));
  const outputFormatLabel = computed(() => labelFor(outputFormat.value));
  const resultViewOptions = computed(() => [
    { value: 'preview' as const, label: t('toolbox.local.tablePreview') },
    { value: 'raw' as const, label: t('toolbox.local.rawResult') },
  ]);
  const previewColumns = computed<Column[]>(() =>
    (resultTable.value[0] || []).slice(0, 20).map((header, index) => ({
      key: `column_${index}`,
      title: header.trim() || t('toolbox.local.unnamedColumn', { index: index + 1 }),
      width: `${dimension(112, 'layout')}px`,
    })),
  );
  const previewRows = computed(() =>
    resultTable.value.slice(1, 101).map((row, rowIndex) => ({
      __rowId: rowIndex,
      ...Object.fromEntries(previewColumns.value.map((column, columnIndex) => [column.key, row[columnIndex] ?? ''])),
    })),
  );
  const previewTableStyle = computed(() => ({
    minWidth: `${Math.max(dimension(112, 'layout'), previewColumns.value.length * dimension(122, 'layout'))}px`,
  }));
  const previewNote = computed(() =>
    stats.value
      ? t('toolbox.local.tablePreviewLimit', {
          rows: Math.min(stats.value.rows, 100),
          totalRows: stats.value.rows,
          columns: Math.min(stats.value.columns, 20),
          totalColumns: stats.value.columns,
        })
      : '',
  );

  function showError(cause: unknown) {
    if (cause instanceof ToolboxTextError) {
      if (cause.code === 'INPUT_TOO_LARGE') return (error.value = t('toolbox.local.tableTooLarge'));
      if (cause.code === 'INVALID_JSON') return (error.value = t('toolbox.local.invalidJsonTable'));
      if (cause.code === 'SAME_FORMAT') return (error.value = t('toolbox.local.sameTableFormat'));
    }
    error.value = t('toolbox.local.invalidTable');
  }

  function convert() {
    error.value = '';
    try {
      const converted = convertTable(source.value, resolvedInputFormat.value, outputFormat.value, firstRowHeader.value);
      output.value = converted.output;
      resultTable.value = converted.table;
      resultView.value = 'preview';
      step.value = 'result';
      stats.value = { rows: converted.rows, columns: converted.columns };
    } catch (cause) {
      output.value = '';
      resultTable.value = [];
      stats.value = null;
      showError(cause);
    }
  }

  function swap() {
    const previousInput = resolvedInputFormat.value;
    inputFormat.value = outputFormat.value;
    outputFormat.value = previousInput;
    if (output.value) source.value = output.value;
    output.value = '';
    resultTable.value = [];
    stats.value = null;
    error.value = '';
  }

  function loadSample() {
    const samples: Record<TableFormat, string> = {
      csv: '名称,类型,状态\n研究简报,笔记,完成\n需求清单,文件,待核验',
      tsv: '名称\t类型\t状态\n研究简报\t笔记\t完成\n需求清单\t文件\t待核验',
      json: '[\n  { "名称": "研究简报", "类型": "笔记", "状态": "完成" },\n  { "名称": "需求清单", "类型": "文件", "状态": "待核验" }\n]',
      markdown: '| 名称 | 类型 | 状态 |\n| --- | --- | --- |\n| 研究简报 | 笔记 | 完成 |\n| 需求清单 | 文件 | 待核验 |',
    };
    source.value = samples[resolvedInputFormat.value];
    output.value = '';
    resultTable.value = [];
    stats.value = null;
    error.value = '';
  }

  function clear() {
    loadVersion++;
    source.value = '';
    output.value = '';
    resultTable.value = [];
    stats.value = null;
    error.value = '';
  }

  function inferFormat(fileName: string): TableFormat | null {
    const extension = fileName.toLowerCase().split('.').pop();
    if (extension === 'csv') return 'csv';
    if (extension === 'tsv') return 'tsv';
    if (extension === 'json') return 'json';
    if (extension === 'md' || extension === 'markdown') return 'markdown';
    return null;
  }

  async function loadFile(value: File[]) {
    const file = value?.[0];
    if (!file || loading.value) return;
    if (file.size > 1024 * 1024) return message.warning(t('toolbox.local.tableTooLarge'));
    const inferred = inferFormat(file.name);
    if (!inferred) return message.warning(t('toolbox.local.unsupportedTableFile'));
    const version = ++loadVersion;
    loading.value = true;
    try {
      const text = await file.text();
      if (version !== loadVersion) return;
      inputFormat.value = inferred;
      if (outputFormat.value === inferred) outputFormat.value = inferred === 'markdown' ? 'csv' : 'markdown';
      source.value = text;
    } catch {
      if (version === loadVersion) error.value = t('toolbox.local.invalidTable');
    } finally {
      if (version === loadVersion) loading.value = false;
    }
  }

  async function copyOutput() {
    const copied = await copyTextToClipboard(output.value);
    message[copied ? 'success' : 'error'](t(copied ? 'toolbox.local.copySuccess' : 'toolbox.local.copyFailed'));
  }

  function downloadOutput() {
    const extension = outputFormat.value === 'markdown' ? 'md' : outputFormat.value;
    const type = outputFormat.value === 'json' ? 'application/json' : 'text/plain';
    downloadToolboxBlob(new Blob([output.value], { type: `${type};charset=utf-8` }), `lightnote-table.${extension}`);
  }

  onBeforeUnmount(() => loadVersion++);
  watch([source, inputFormat, outputFormat, firstRowHeader], () => {
    step.value = 'input';
    output.value = '';
    resultTable.value = [];
    resultView.value = 'preview';
    stats.value = null;
    error.value = '';
  });
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';
  .table-tool {
    display: grid;
    gap: var(--ui-space-16, 16px);
    min-width: 0;
  }
  .table-tool__steps {
    display: none;
  }
  .table-tool__toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: var(--ui-space-12, 12px);
    align-items: end;
    max-width: var(--ui-layout-600, 600px);
  }
  .table-tool__toolbar > div {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-6, 6px);
  }
  .table-tool__toolbar label {
    font-size: var(--ui-font-12, 12px);
    color: var(--workspace-muted);
  }
  .table-tool__complete {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }
  .table-tool__complete > .b_btn {
    margin-left: auto;
  }
  .table-tool__editors {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-20, 20px);
  }
  .table-tool__editors > section {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-12, 12px);
  }
  .table-tool__editors header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    min-height: var(--ui-layout-28, 28px);
  }
  .table-tool__editors header > span {
    font-size: var(--ui-font-11, 11px);
    color: var(--workspace-muted);
  }
  .table-tool__view-switch {
    display: flex;
    gap: var(--ui-space-4, 4px);
  }
  .table-tool__editors :deep(textarea) {
    min-height: var(--ui-layout-340, 340px);
    resize: vertical;
    font-family: ui-monospace, monospace;
    line-height: 1.6;
  }
  .table-tool__preview {
    .workspace-content-surface();
    min-height: var(--ui-layout-340, 340px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-12, 12px);
    border: 1px solid var(--workspace-border);
    border-radius: 8px;
    padding: var(--ui-space-12, 12px);
  }
  .table-tool__preview-scroll {
    min-width: 0;
    overflow: auto;
  }
  .table-tool__preview-table {
    width: 100%;
  }
  .table-tool__preview :deep(.table-container) {
    box-shadow: none;
  }
  .table-tool__preview > small {
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
    margin-top: auto;
  }
  .table-tool__source-actions,
  .table-tool__actions {
    display: flex;
    gap: var(--ui-space-8, 8px);
    align-items: center;
    flex-wrap: wrap;
  }
  .table-tool__actions {
    .workspace-content-surface();
    padding: var(--ui-space-12, 12px) 0;
    border-top: 1px solid var(--workspace-divider);
    justify-content: flex-end;
  }
  .table-tool__actions > span {
    margin-right: auto;
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }
  .table-tool__error {
    border: 1px solid var(--danger-color);
    color: var(--danger-color);
    padding: var(--ui-space-12, 12px);
    border-radius: 8px;
  }
  @media (max-width: 767px) {
    .table-tool {
      display: flex;
      flex-direction: column;
      min-height: calc(100vh - var(--ui-layout-150, 150px));
    }
    .table-tool__steps :deep(.b-chip--selected) {
      color: var(--primary-button-text-color, #fff);
      border-color: var(--primary-color);
      background: var(--primary-color);
    }
    .table-tool__actions {
      margin-top: auto;
    }

    .table-tool__steps {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--ui-space-8, 8px);
    }
    .table-tool__steps :deep(.b-chip) {
      border-radius: 8px;
      min-height: var(--ui-control-40, 40px);
    }
    .table-tool__editors {
      grid-template-columns: minmax(0, 1fr);
    }
    .is-result .table-tool__input,
    .is-result .table-tool__toolbar,
    .is-input .table-tool__output,
    .is-input .table-tool__complete {
      display: none;
    }
    .table-tool__actions {
      position: sticky;
      bottom: 0;
      z-index: 2;
      padding-bottom: calc(var(--ui-space-12, 12px) + env(safe-area-inset-bottom, 0px));
    }
    .table-tool__actions > span {
      width: 100%;
    }
    .table-tool__actions > .b_btn {
      flex: 1;
      min-height: var(--ui-control-44, 44px);
    }
    .table-tool__editors :deep(textarea),
    .table-tool__preview {
      min-height: var(--ui-layout-260, 260px);
    }
  }
</style>

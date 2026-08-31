<template>
  <section class="table-tool" :aria-label="t('toolbox.tool.table_converter.name')">
    <div class="table-tool__toolbar">
      <div>
        <label id="table-input-format">{{ t('toolbox.local.inputFormat') }}</label>
        <BSelect v-model:value="inputFormat" :options="inputFormatOptions" aria-labelledby="table-input-format" />
      </div>
      <BButton class="table-tool__swap" @click="swap"
        ><SvgIcon :src="icon.toolbox.swap" size="16" />{{ t('toolbox.local.swapDirection') }}</BButton
      >
      <div>
        <label id="table-output-format">{{ t('toolbox.local.outputFormat') }}</label>
        <BSelect v-model:value="outputFormat" :options="outputFormatOptions" aria-labelledby="table-output-format" />
      </div>
      <BUpload
        raw-file
        :multiple="false"
        accept=".csv,.tsv,.json,.md,.markdown,text/csv,text/tab-separated-values,application/json,text/markdown"
        :max-total-size="null"
        @change="loadFile"
      >
        <BButton><SvgIcon :src="icon.toolbox.upload" size="15" />{{ t('toolbox.local.loadLocalFile') }}</BButton>
      </BUpload>
      <BButton @click="loadSample">{{ t('toolbox.local.loadSample') }}</BButton>
      <BButton :disabled="!source && !output" @click="clear">{{ t('common.clear') }}</BButton>
    </div>

    <div class="table-tool__editors">
      <div>
        <header
          ><strong>{{ inputFormatLabel }}</strong
          ><span>{{ source.length.toLocaleString() }}/1,000,000</span></header
        >
        <BInput
          v-model:value="source"
          type="textarea"
          :rows="16"
          :maxlength="1000000"
          :placeholder="t('toolbox.local.tableInputPlaceholder')"
        />
      </div>
      <span class="table-tool__bridge" aria-hidden="true"><SvgIcon :src="icon.toolbox.arrow" size="18" /></span>
      <div>
        <header
          ><strong>{{ outputFormatLabel }}</strong
          ><span>{{ output.length.toLocaleString() }}</span></header
        >
        <BInput
          v-model:value="output"
          type="textarea"
          :rows="16"
          readonly
          :placeholder="t('toolbox.local.outputPlaceholder')"
        />
      </div>
    </div>

    <div v-if="error" class="table-tool__error" role="alert">{{ error }}</div>

    <div class="table-tool__actions">
      <div v-if="stats"
        ><BChip tone="neutral">{{ t('toolbox.local.tableSize', stats) }}</BChip
        ><span>{{ t('toolbox.local.firstRowHeader') }}</span></div
      >
      <span v-else>{{ t('toolbox.local.tableHint') }}</span>
      <BButton :disabled="!output" @click="copyOutput"
        ><SvgIcon :src="icon.toolbox.copy" size="15" />{{ t('toolbox.local.copyResult') }}</BButton
      >
      <BButton :disabled="!output" @click="downloadOutput"
        ><SvgIcon :src="icon.toolbox.download" size="15" />{{ t('toolbox.local.downloadResult') }}</BButton
      >
      <BButton type="primary" :disabled="!source.trim() || inputFormat === outputFormat" @click="convert">{{
        t('toolbox.local.convertNow')
      }}</BButton>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { convertTable, ToolboxTextError, type TableFormat } from '@/utils/toolboxTextTools';
  import { downloadToolboxBlob } from '@/utils/toolboxLocal';

  const { t } = useI18n();
  const inputFormat = ref<TableFormat>('csv');
  const outputFormat = ref<TableFormat>('markdown');
  const source = ref('');
  const output = ref('');
  const stats = ref<{ rows: number; columns: number } | null>(null);
  const error = ref('');
  const formats: TableFormat[] = ['csv', 'tsv', 'json', 'markdown'];
  const labelFor = (format: TableFormat) => (format === 'markdown' ? 'Markdown' : format.toUpperCase());
  const inputFormatOptions = computed(() => formats.map((value) => ({ value, label: labelFor(value) })));
  const outputFormatOptions = computed(() => formats.map((value) => ({ value, label: labelFor(value) })));
  const inputFormatLabel = computed(() => labelFor(inputFormat.value));
  const outputFormatLabel = computed(() => labelFor(outputFormat.value));

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
      const converted = convertTable(source.value, inputFormat.value, outputFormat.value);
      output.value = converted.output;
      stats.value = { rows: converted.rows, columns: converted.columns };
    } catch (cause) {
      output.value = '';
      stats.value = null;
      showError(cause);
    }
  }

  function swap() {
    const previousInput = inputFormat.value;
    inputFormat.value = outputFormat.value;
    outputFormat.value = previousInput;
    if (output.value) source.value = output.value;
    output.value = '';
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
    source.value = samples[inputFormat.value];
    output.value = '';
    stats.value = null;
    error.value = '';
  }

  function clear() {
    source.value = '';
    output.value = '';
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
    if (!file) return;
    if (file.size > 1024 * 1024) return message.warning(t('toolbox.local.tableTooLarge'));
    const inferred = inferFormat(file.name);
    if (!inferred) return message.warning(t('toolbox.local.unsupportedTableFile'));
    inputFormat.value = inferred;
    if (outputFormat.value === inferred) outputFormat.value = inferred === 'markdown' ? 'csv' : 'markdown';
    source.value = await file.text();
    output.value = '';
    stats.value = null;
    error.value = '';
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

  watch([source, inputFormat, outputFormat], () => {
    output.value = '';
    stats.value = null;
    error.value = '';
  });
</script>

<style scoped lang="less">
  .table-tool {
    display: grid;
    gap: 16px;
  }
  .table-tool__toolbar {
    padding: 13px;
    display: grid;
    grid-template-columns: minmax(150px, 1fr) auto minmax(150px, 1fr) auto auto auto;
    gap: 9px;
    align-items: end;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .table-tool__toolbar > div {
    min-width: 0;
    display: grid;
    gap: 6px;
  }
  .table-tool__toolbar label {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 650;
  }
  .table-tool__swap {
    align-self: end;
  }
  .table-tool__editors {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 12px;
    align-items: stretch;
  }
  .table-tool__editors > div {
    min-width: 0;
    padding: 12px;
    display: grid;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }
  .table-tool__editors header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .table-tool__editors header span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .table-tool__editors :deep(textarea) {
    min-height: 340px;
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    line-height: 1.55;
  }
  .table-tool__bridge {
    align-self: center;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    color: var(--primary-color);
    background: var(--card-background);
  }
  .table-tool__actions {
    padding: 11px 13px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--workspace-panel-bg-color);
  }
  .table-tool__actions > div,
  .table-tool__actions > span {
    margin-right: auto;
  }
  .table-tool__actions > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .table-tool__actions > div span,
  .table-tool__actions > span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .table-tool__error {
    padding: 11px 13px;
    border: 1px solid var(--danger-color, #dc3e4d);
    border-radius: 11px;
    color: var(--danger-color, #dc3e4d);
    background: var(--card-background);
  }
  @media (max-width: 1180px) {
    .table-tool__toolbar {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (max-width: 900px) {
    .table-tool__editors {
      grid-template-columns: 1fr;
    }
    .table-tool__bridge {
      justify-self: center;
      transform: rotate(90deg);
    }
  }
  @media (max-width: 767px) {
    .table-tool__toolbar {
      grid-template-columns: 1fr;
    }
    .table-tool__editors :deep(textarea) {
      min-height: 260px;
    }
    .table-tool__actions {
      align-items: stretch;
      flex-direction: column;
    }
    .table-tool__actions > div,
    .table-tool__actions > span {
      margin-right: 0;
    }
  }
  html.light-note-mobile-rendering .table-tool__actions {
    background: var(--card-background);
    box-shadow: none;
  }
</style>

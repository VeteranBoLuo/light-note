<template>
  <section class="knowledge-text-workbench" :aria-label="toolName">
    <header class="knowledge-text-head">
      <div class="knowledge-text-head__icon"><SvgIcon :src="presentationIcon" size="27" /></div>
      <div>
        <BChip tone="success">{{ t('toolbox.localFreeLabel') }}</BChip>
        <h2>{{ toolName }}</h2>
        <p>{{ toolDescription }}</p>
      </div>
      <div class="knowledge-text-head__facts">
        <span
          ><strong>{{ inputFact }}</strong
          ><small>{{ t('toolbox.knowledgeText.inputFact') }}</small></span
        >
        <span
          ><strong>{{ resultFact }}</strong
          ><small>{{ t('toolbox.knowledgeText.resultFact') }}</small></span
        >
      </div>
    </header>

    <template v-if="isFileTool">
      <section v-if="sourceFiles.length === 0" class="knowledge-file-empty">
        <span><SvgIcon :src="icon.toolbox.markdown" size="34" /></span>
        <div
          ><h3>{{ fileEmptyTitle }}</h3
          ><p>{{ fileEmptyDescription }}</p></div
        >
        <BUpload
          raw-file
          multiple
          directory
          accept=".md,.markdown,text/markdown,text/plain"
          :max-total-size="null"
          :disabled="loading"
          @change="loadMarkdownFiles"
        >
          <BButton type="primary" size="large" :loading="loading">
            <SvgIcon :src="icon.toolbox.upload" size="17" />{{ t('toolbox.knowledgeText.chooseMarkdownFolder') }}
          </BButton>
        </BUpload>
        <BUpload
          raw-file
          multiple
          accept=".md,.markdown,text/markdown,text/plain"
          :max-total-size="null"
          :disabled="loading"
          @change="loadMarkdownFiles"
        >
          <BButton :disabled="loading">{{ t('toolbox.knowledgeText.chooseMarkdownFiles') }}</BButton>
        </BUpload>
        <BButton :disabled="loading" @click="loadSample">{{ t('toolbox.local.loadSample') }}</BButton>
        <small>{{ fileLimitHint }}</small>
      </section>

      <template v-else>
        <section class="knowledge-file-bar">
          <div>
            <span><SvgIcon :src="icon.toolbox.markdown" size="20" /></span>
            <div
              ><strong>{{ t('toolbox.knowledgeText.markdownLoaded', { count: sourceFiles.length }) }}</strong
              ><small>{{ totalFileSizeLabel }}</small></div
            >
          </div>
          <div>
            <BUpload
              raw-file
              multiple
              directory
              accept=".md,.markdown"
              :max-total-size="null"
              @change="loadMarkdownFiles"
            >
              <BButton size="small"
                ><SvgIcon :src="icon.toolbox.upload" size="14" />{{ t('toolbox.dataset.replace') }}</BButton
              >
            </BUpload>
            <BButton size="small" @click="clearAll">{{ t('common.clear') }}</BButton>
          </div>
        </section>

        <div class="knowledge-file-studio">
          <aside class="knowledge-file-list">
            <header
              ><span>{{ t('toolbox.knowledgeText.files') }}</span
              ><strong>{{ sourceFiles.length }}</strong></header
            >
            <article v-for="file in sourceFiles.slice(0, 40)" :key="file.name">
              <SvgIcon :src="icon.toolbox.markdown" size="15" />
              <span>{{ file.name }}</span>
              <small>{{ formatToolboxBytes(file.file?.size || new Blob([file.content]).size) }}</small>
            </article>
            <small v-if="sourceFiles.length > 40">{{
              t('toolbox.knowledgeText.moreFiles', { count: sourceFiles.length - 40 })
            }}</small>
          </aside>

          <section class="knowledge-file-main">
            <div v-if="toolId === 'frontmatter_batch'" class="frontmatter-controls">
              <div class="knowledge-field">
                <label for="frontmatter-key">{{ t('toolbox.knowledgeText.propertyKey') }}</label>
                <BInput
                  id="frontmatter-key"
                  v-model:value="frontmatterKey"
                  :placeholder="t('toolbox.knowledgeText.propertyKeyPlaceholder')"
                />
              </div>
              <div class="knowledge-field">
                <label for="frontmatter-value">{{ t('toolbox.knowledgeText.propertyValue') }}</label>
                <BInput
                  id="frontmatter-value"
                  v-model:value="frontmatterValue"
                  :placeholder="t('toolbox.knowledgeText.propertyValuePlaceholder')"
                />
              </div>
              <div class="knowledge-field is-wide">
                <label for="frontmatter-remove">{{ t('toolbox.knowledgeText.removeProperties') }}</label>
                <BInput
                  id="frontmatter-remove"
                  v-model:value="frontmatterRemove"
                  :placeholder="t('toolbox.knowledgeText.removePropertiesPlaceholder')"
                />
              </div>
            </div>

            <div class="knowledge-runbar">
              <div
                ><strong>{{ fileRunTitle }}</strong
                ><small>{{ fileRunDescription }}</small></div
              >
              <BButton type="primary" :loading="running" :disabled="!canRun" @click="runFileTool">
                {{ running ? t('toolbox.knowledgeText.running') : fileRunLabel
                }}<SvgIcon v-if="!running" :src="icon.toolbox.arrow" size="15" />
              </BButton>
            </div>

            <div v-if="error" class="knowledge-text-error" role="alert"
              ><SvgIcon :src="icon.message.info" size="18" /><span>{{ error }}</span></div
            >

            <template v-if="markdownIssues">
              <div class="knowledge-result-summary" :class="{ 'is-success': markdownIssues.length === 0 }">
                <span
                  ><SvgIcon :src="markdownIssues.length ? icon.toolbox.audit : icon.toolbox.local" size="24"
                /></span>
                <div
                  ><strong>{{
                    markdownIssues.length
                      ? t('toolbox.knowledgeText.markdownIssues', { count: markdownIssues.length })
                      : t('toolbox.knowledgeText.markdownHealthy')
                  }}</strong
                  ><small>{{
                    markdownIssues.length
                      ? t('toolbox.knowledgeText.markdownIssuesHint')
                      : t('toolbox.knowledgeText.markdownHealthyHint')
                  }}</small></div
                >
                <BButton v-if="markdownIssues.length" @click="downloadMarkdownReport"
                  ><SvgIcon :src="icon.toolbox.download" size="15" />{{
                    t('toolbox.knowledgeText.downloadReport')
                  }}</BButton
                >
              </div>
              <BTable
                v-if="markdownIssues.length"
                :data="markdownIssueRows"
                :columns="markdownIssueColumns"
                row-key="id"
              >
                <template #bodyCell="{ record, column }">
                  <BChip v-if="column.key === 'severity'" :tone="record.severity === 'error' ? 'danger' : 'pending'">{{
                    severityLabel(record.severity)
                  }}</BChip>
                  <span v-else>{{ record[column.key] }}</span>
                </template>
              </BTable>
            </template>

            <template v-else-if="frontmatterResults.length">
              <div class="knowledge-result-summary is-success">
                <span><SvgIcon :src="icon.toolbox.local" size="24" /></span>
                <div
                  ><strong>{{
                    t('toolbox.knowledgeText.frontmatterReady', { count: frontmatterResults.length })
                  }}</strong
                  ><small>{{ t('toolbox.knowledgeText.frontmatterReadyHint') }}</small></div
                >
                <BButton @click="downloadFrontmatterZip"
                  ><SvgIcon :src="icon.toolbox.download" size="15" />{{
                    t('toolbox.knowledgeText.downloadMarkdownZip')
                  }}</BButton
                >
              </div>
              <div class="frontmatter-result-list">
                <article v-for="result in frontmatterResults.slice(0, 30)" :key="result.name"
                  ><strong>{{ result.name }}</strong
                  ><BChip tone="success">{{ t('toolbox.knowledgeText.updated') }}</BChip></article
                >
              </div>
            </template>

            <div v-else class="knowledge-file-placeholder">
              <SvgIcon :src="icon.toolbox.audit" size="30" />
              <strong>{{ t('toolbox.knowledgeText.waitingForRun') }}</strong>
              <span>{{ t('toolbox.knowledgeText.waitingForRunHint') }}</span>
            </div>
          </section>
        </div>
      </template>
    </template>

    <template v-else>
      <section class="knowledge-text-controls" :class="{ 'is-text-batch': toolId === 'text_batch' }">
        <template v-if="toolId === 'text_batch'">
          <div class="knowledge-checkbox-group is-batch-options">
            <BCheckbox v-model="batchOptions.trimLines">{{ t('toolbox.knowledgeText.trimLines') }}</BCheckbox>
            <BCheckbox v-model="batchOptions.normalizeWhitespace">{{
              t('toolbox.knowledgeText.normalizeWhitespace')
            }}</BCheckbox>
            <BCheckbox v-model="batchOptions.removeBlankLines">{{
              t('toolbox.knowledgeText.removeBlankLines')
            }}</BCheckbox>
            <BCheckbox v-model="batchOptions.deduplicate">{{ t('toolbox.knowledgeText.deduplicate') }}</BCheckbox>
          </div>
          <div class="knowledge-field">
            <label id="text-batch-sort">{{ t('toolbox.knowledgeText.sortLines') }}</label>
            <BSelect v-model:value="batchOptions.sort" :options="sortOptions" aria-labelledby="text-batch-sort" />
          </div>
          <div class="knowledge-field"
            ><label for="text-batch-find">{{ t('toolbox.knowledgeText.find') }}</label
            ><BInput id="text-batch-find" v-model:value="batchOptions.find"
          /></div>
          <div class="knowledge-field"
            ><label for="text-batch-replace">{{ t('toolbox.knowledgeText.replacement') }}</label
            ><BInput id="text-batch-replace" v-model:value="batchOptions.replacement"
          /></div>
          <div class="knowledge-field"
            ><label for="text-batch-prefix">{{ t('toolbox.knowledgeText.prefix') }}</label
            ><BInput id="text-batch-prefix" v-model:value="batchOptions.prefix"
          /></div>
          <div class="knowledge-field"
            ><label for="text-batch-suffix">{{ t('toolbox.knowledgeText.suffix') }}</label
            ><BInput id="text-batch-suffix" v-model:value="batchOptions.suffix"
          /></div>
        </template>

        <template v-else-if="toolId === 'regex_extractor'">
          <div class="knowledge-field is-grow"
            ><label for="regex-pattern">{{ t('toolbox.knowledgeText.regexPattern') }}</label
            ><BInput
              id="regex-pattern"
              v-model:value="regexPattern"
              :placeholder="t('toolbox.knowledgeText.regexPlaceholder')"
          /></div>
          <div class="knowledge-checkbox-group is-flags">
            <BCheckbox v-model="regexIgnoreCase">i · {{ t('toolbox.knowledgeText.ignoreCase') }}</BCheckbox>
            <BCheckbox v-model="regexMultiline">m · {{ t('toolbox.knowledgeText.multiline') }}</BCheckbox>
            <BCheckbox v-model="regexDotAll">s · {{ t('toolbox.knowledgeText.dotAll') }}</BCheckbox>
          </div>
          <div class="knowledge-field"
            ><label id="regex-template">{{ t('toolbox.knowledgeText.regexTemplate') }}</label
            ><BSelect
              v-model:value="regexTemplate"
              :options="regexTemplateOptions"
              aria-labelledby="regex-template"
              @change="applyRegexTemplate"
          /></div>
        </template>

        <template v-else-if="toolId === 'citation_converter'">
          <div class="knowledge-field"
            ><label id="citation-input-format">{{ t('toolbox.local.inputFormat') }}</label
            ><BSelect
              v-model:value="citationInputFormat"
              :options="citationInputOptions"
              aria-labelledby="citation-input-format"
          /></div>
          <div class="knowledge-field"
            ><label id="citation-output-format">{{ t('toolbox.local.outputFormat') }}</label
            ><BSelect
              v-model:value="citationOutputFormat"
              :options="citationOutputOptions"
              aria-labelledby="citation-output-format"
          /></div>
          <div class="knowledge-control-note"
            ><SvgIcon :src="icon.toolbox.local" size="17" /><span>{{
              t('toolbox.knowledgeText.citationLocalHint')
            }}</span></div
          >
        </template>

        <template v-else-if="toolId === 'structured_data_lab'">
          <div class="knowledge-field"
            ><label id="structured-operation">{{ t('toolbox.knowledgeText.dataOperation') }}</label
            ><BSelect
              v-model:value="structuredOperation"
              :options="structuredOperationOptions"
              aria-labelledby="structured-operation"
          /></div>
          <div v-if="structuredOperation === 'query'" class="knowledge-field is-grow"
            ><label for="structured-path">{{ t('toolbox.knowledgeText.jsonPath') }}</label
            ><BInput id="structured-path" v-model:value="structuredPath" placeholder="$.items[0].title"
          /></div>
          <div class="knowledge-control-note"
            ><SvgIcon :src="icon.toolbox.local" size="17" /><span>{{
              t('toolbox.knowledgeText.structuredHint')
            }}</span></div
          >
        </template>
      </section>

      <div class="knowledge-editor-grid">
        <section class="knowledge-editor-card">
          <header
            ><div
              ><span>01</span><strong>{{ t('toolbox.knowledgeText.input') }}</strong></div
            ><small>{{ source.length.toLocaleString() }}/{{ maxChars.toLocaleString() }}</small></header
          >
          <BInput
            v-model:value="source"
            type="textarea"
            :rows="18"
            :maxlength="maxChars"
            :placeholder="sourcePlaceholder"
          />
          <div class="knowledge-editor-card__footer">
            <BButton size="small" @click="loadSample">{{ t('toolbox.local.loadSample') }}</BButton>
            <BButton size="small" :disabled="!source" @click="clearAll">{{ t('common.clear') }}</BButton>
          </div>
        </section>

        <section class="knowledge-editor-card is-output">
          <header
            ><div
              ><span>02</span><strong>{{ t('toolbox.knowledgeText.output') }}</strong></div
            ><small>{{ output.length.toLocaleString() }}</small></header
          >
          <BInput
            v-model:value="output"
            type="textarea"
            :rows="18"
            readonly
            :placeholder="t('toolbox.local.outputPlaceholder')"
          />
          <div class="knowledge-editor-card__footer">
            <span v-if="resultSummary">{{ resultSummary }}</span>
            <span v-else>{{ t('toolbox.knowledgeText.outputHint') }}</span>
            <BButton size="small" :disabled="!output" @click="copyOutput"
              ><SvgIcon :src="icon.toolbox.copy" size="14" />{{ t('toolbox.local.copyResult') }}</BButton
            >
            <BButton size="small" :disabled="!output" @click="downloadOutput"
              ><SvgIcon :src="icon.toolbox.download" size="14" />{{ t('toolbox.local.downloadResult') }}</BButton
            >
          </div>
        </section>
      </div>

      <div v-if="error" class="knowledge-text-error" role="alert"
        ><SvgIcon :src="icon.message.info" size="18" /><span>{{ error }}</span></div
      >

      <BTable
        v-if="toolId === 'regex_extractor' && regexMatches.length"
        :data="regexRows"
        :columns="regexColumns"
        row-key="id"
      />

      <div class="knowledge-text-runbar">
        <div
          ><SvgIcon :src="icon.toolbox.local" size="18" /><span>{{
            t('toolbox.knowledgeText.localRunHint')
          }}</span></div
        >
        <BButton type="primary" :disabled="!canRun" :loading="running" @click="runTextTool">
          {{ running ? t('toolbox.knowledgeText.running') : runTextLabel
          }}<SvgIcon v-if="!running" :src="icon.toolbox.arrow" size="15" />
        </BButton>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
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
  import { TOOLBOX_PRESENTATION } from '@/config/toolbox';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { downloadToolboxBlob, formatToolboxBytes } from '@/utils/toolboxLocal';
  import {
    checkMarkdownKnowledgeBase,
    extractRegexMatches,
    formatCitations,
    parseCitations,
    processTextBatch,
    transformStructuredData,
    updateFrontmatterDocument,
    type CitationRecord,
    type MarkdownCheckIssue,
    type MarkdownSourceFile,
    type RegexMatchResult,
    type TextBatchOptions,
    ToolboxKnowledgeTextError,
  } from '@/utils/toolboxKnowledgeText';

  type KnowledgeTextToolId = Extract<
    ToolboxToolId,
    | 'text_batch'
    | 'regex_extractor'
    | 'markdown_checker'
    | 'frontmatter_batch'
    | 'citation_converter'
    | 'structured_data_lab'
  >;
  interface SourceFileEntry extends MarkdownSourceFile {
    file?: File;
  }

  const props = defineProps<{ toolId: KnowledgeTextToolId }>();
  const { t } = useI18n();
  const source = ref('');
  const output = ref('');
  const error = ref('');
  const running = ref(false);
  const loading = ref(false);
  const resultSummary = ref('');
  const sourceFiles = ref<SourceFileEntry[]>([]);
  const markdownIssues = ref<MarkdownCheckIssue[] | null>(null);
  const frontmatterResults = ref<Array<{ name: string; content: string }>>([]);
  const regexMatches = ref<RegexMatchResult[]>([]);
  const citationRecords = ref<CitationRecord[]>([]);
  const frontmatterKey = ref('status');
  const frontmatterValue = ref('ready');
  const frontmatterRemove = ref('');

  const batchOptions = reactive<TextBatchOptions>({
    trimLines: true,
    normalizeWhitespace: true,
    removeBlankLines: true,
    deduplicate: false,
    sort: 'none',
    find: '',
    replacement: '',
    prefix: '',
    suffix: '',
  });
  const regexPattern = ref('(?<key>\\w+)=(?<value>[^\\s]+)');
  const regexIgnoreCase = ref(false);
  const regexMultiline = ref(true);
  const regexDotAll = ref(false);
  const regexTemplate = ref('custom');
  const citationInputFormat = ref<'auto' | 'bibtex' | 'ris'>('auto');
  const citationOutputFormat = ref<'apa' | 'bibtex' | 'ris'>('apa');
  const structuredOperation = ref<'format' | 'minify' | 'sort_keys' | 'flatten' | 'query'>('format');
  const structuredPath = ref('$.items[0]');

  const isFileTool = computed(() => ['markdown_checker', 'frontmatter_batch'].includes(props.toolId));
  const toolName = computed(() => t(`toolbox.tool.${props.toolId}.name`));
  const toolDescription = computed(() => t(`toolbox.tool.${props.toolId}.description`));
  const presentationIcon = computed(() => TOOLBOX_PRESENTATION[props.toolId].icon);
  const maxChars = computed(() => (props.toolId === 'citation_converter' ? 500_000 : 1_000_000));
  const inputFact = computed(() =>
    isFileTool.value ? String(sourceFiles.value.length) : source.value ? source.value.length.toLocaleString() : '—',
  );
  const resultFact = computed(() => {
    if (markdownIssues.value) return String(markdownIssues.value.length);
    if (frontmatterResults.value.length) return String(frontmatterResults.value.length);
    if (regexMatches.value.length) return String(regexMatches.value.length);
    return output.value ? output.value.length.toLocaleString() : '—';
  });
  const sourcePlaceholder = computed(() => t(`toolbox.knowledgeText.placeholder.${props.toolId}`));
  const runTextLabel = computed(() => t(`toolbox.knowledgeText.run.${props.toolId}`));
  const fileEmptyTitle = computed(() => t(`toolbox.knowledgeText.fileEmptyTitle.${props.toolId}`));
  const fileEmptyDescription = computed(() => t(`toolbox.knowledgeText.fileEmptyDescription.${props.toolId}`));
  const fileLimitHint = computed(() =>
    t('toolbox.knowledgeText.fileLimit', { count: props.toolId === 'frontmatter_batch' ? 100 : 50 }),
  );
  const totalFileSizeLabel = computed(() =>
    formatToolboxBytes(
      sourceFiles.value.reduce((sum, entry) => sum + (entry.file?.size || new Blob([entry.content]).size), 0),
    ),
  );
  const fileRunTitle = computed(() => t(`toolbox.knowledgeText.fileRunTitle.${props.toolId}`));
  const fileRunDescription = computed(() => t(`toolbox.knowledgeText.fileRunDescription.${props.toolId}`));
  const fileRunLabel = computed(() => t(`toolbox.knowledgeText.run.${props.toolId}`));
  const canRun = computed(() => {
    if (running.value || loading.value) return false;
    if (isFileTool.value) {
      if (!sourceFiles.value.length) return false;
      if (props.toolId === 'frontmatter_batch')
        return Boolean(frontmatterKey.value.trim() || frontmatterRemove.value.trim());
      return true;
    }
    if (!source.value.trim()) return false;
    if (props.toolId === 'regex_extractor') return Boolean(regexPattern.value);
    return true;
  });

  const sortOptions = computed(() => [
    { value: 'none', label: t('toolbox.knowledgeText.sortNone') },
    { value: 'asc', label: t('toolbox.knowledgeText.sortAsc') },
    { value: 'desc', label: t('toolbox.knowledgeText.sortDesc') },
  ]);
  const regexTemplates: Record<string, string> = {
    custom: regexPattern.value,
    email: '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}',
    url: 'https?://[^\\s<>"\\]]+',
    date: '\\b\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}\\b',
    keyValue: '(?<key>\\w+)=(?<value>[^\\s]+)',
  };
  const regexTemplateOptions = computed(() =>
    Object.keys(regexTemplates).map((value) => ({
      value,
      label: t(`toolbox.knowledgeText.regexTemplateType.${value}`),
    })),
  );
  const citationInputOptions = computed(() =>
    ['auto', 'bibtex', 'ris'].map((value) => ({ value, label: t(`toolbox.knowledgeText.citationFormat.${value}`) })),
  );
  const citationOutputOptions = computed(() =>
    ['apa', 'bibtex', 'ris'].map((value) => ({ value, label: t(`toolbox.knowledgeText.citationFormat.${value}`) })),
  );
  const structuredOperationOptions = computed(() =>
    ['format', 'minify', 'sort_keys', 'flatten', 'query'].map((value) => ({
      value,
      label: t(`toolbox.knowledgeText.structuredOperation.${value}`),
    })),
  );
  const regexRows = computed(() =>
    regexMatches.value.slice(0, 200).map((match, index) => ({
      id: index + 1,
      match: match.value,
      line: match.line,
      column: match.column,
      groups: [...match.groups, ...Object.values(match.namedGroups)].filter(Boolean).join(' · ') || '—',
    })),
  );
  const regexColumns: Column[] = [
    { key: 'line', title: t('toolbox.knowledgeText.line'), width: '80px' },
    { key: 'column', title: t('toolbox.knowledgeText.column'), width: '80px' },
    { key: 'match', title: t('toolbox.knowledgeText.match'), width: 'minmax(160px, 1fr)' },
    { key: 'groups', title: t('toolbox.knowledgeText.captureGroups'), width: 'minmax(160px, 1fr)' },
  ];
  const markdownIssueRows = computed(() =>
    (markdownIssues.value || []).slice(0, 300).map((issue, index) => ({
      id: index + 1,
      file: issue.file,
      line: issue.line,
      severity: issue.severity,
      issue: t(`toolbox.knowledgeText.markdownIssue.${issue.code}`),
      detail: issue.detail || '—',
    })),
  );
  const markdownIssueColumns: Column[] = [
    { key: 'file', title: t('toolbox.knowledgeText.file'), width: 'minmax(150px, 1fr)' },
    { key: 'line', title: t('toolbox.knowledgeText.line'), width: '68px' },
    { key: 'severity', title: t('toolbox.knowledgeText.severity'), width: '90px' },
    { key: 'issue', title: t('toolbox.knowledgeText.issue'), width: 'minmax(130px, 0.8fr)' },
    { key: 'detail', title: t('toolbox.knowledgeText.detail'), width: 'minmax(130px, 1fr)' },
  ];

  function resetResult() {
    output.value = '';
    error.value = '';
    resultSummary.value = '';
    regexMatches.value = [];
    citationRecords.value = [];
    markdownIssues.value = null;
    frontmatterResults.value = [];
  }

  async function loadMarkdownFiles(value: File[]) {
    const limit = props.toolId === 'frontmatter_batch' ? 100 : 50;
    const files = (value || []).filter((file) => /\.(?:md|markdown)$/iu.test(file.name)).slice(0, limit);
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (!files.length) return message.warning(t('toolbox.knowledgeText.noMarkdownFiles'));
    if (total > 40 * 1024 * 1024) return message.warning(t('toolbox.knowledgeText.markdownTooLarge'));
    loading.value = true;
    resetResult();
    try {
      sourceFiles.value = await Promise.all(
        files.map(async (file) => ({ name: file.webkitRelativePath || file.name, content: await file.text(), file })),
      );
    } finally {
      loading.value = false;
    }
  }

  function loadSample() {
    resetResult();
    if (props.toolId === 'text_batch') source.value = '  苹果  \n香蕉\n苹果\n\n  橙子';
    else if (props.toolId === 'regex_extractor')
      source.value = 'user=alice@example.com status=active\nuser=bob@example.com status=pending';
    else if (props.toolId === 'citation_converter')
      source.value =
        '@article{lightnote,\n  title={Building a Reusable Knowledge Workflow},\n  author={Ada Lovelace and Alan Turing},\n  year={2026},\n  journal={Knowledge Systems},\n  doi={10.1000/lightnote}\n}';
    else if (props.toolId === 'structured_data_lab')
      source.value =
        '{\n  "project": "Light Note",\n  "items": [\n    { "title": "Research brief", "points": 20 },\n    { "title": "Data audit", "points": 0 }\n  ]\n}';
    else {
      sourceFiles.value = [
        { name: 'index.md', content: '# 首页\n\n## 主题\n\n[有效链接](notes/topic.md)\n[失效链接](missing.md)' },
        { name: 'notes/topic.md', content: '---\ntags: demo\n---\n# 主题\n\n### 跳级标题\n\n[[不存在的笔记]]' },
      ];
    }
  }

  function clearAll() {
    source.value = '';
    sourceFiles.value = [];
    resetResult();
  }

  function applyRegexTemplate(value: string) {
    const selected = String(value || regexTemplate.value);
    if (selected !== 'custom' && regexTemplates[selected]) regexPattern.value = regexTemplates[selected]!;
  }

  function regexFlags() {
    return `gu${regexIgnoreCase.value ? 'i' : ''}${regexMultiline.value ? 'm' : ''}${regexDotAll.value ? 's' : ''}`;
  }

  async function runTextTool() {
    if (!canRun.value) return;
    running.value = true;
    resetResult();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      if (props.toolId === 'text_batch') {
        const result = processTextBatch(source.value, batchOptions);
        output.value = result.output;
        resultSummary.value = t('toolbox.knowledgeText.batchSummary', {
          before: result.beforeLines,
          after: result.afterLines,
          changed: result.changedLines,
        });
      } else if (props.toolId === 'regex_extractor') {
        regexMatches.value = extractRegexMatches(source.value, regexPattern.value, regexFlags());
        output.value = regexMatches.value.map((match) => match.value).join('\n');
        resultSummary.value = t('toolbox.knowledgeText.regexSummary', { count: regexMatches.value.length });
      } else if (props.toolId === 'citation_converter') {
        citationRecords.value = parseCitations(source.value, citationInputFormat.value);
        output.value = formatCitations(citationRecords.value, citationOutputFormat.value);
        resultSummary.value = t('toolbox.knowledgeText.citationSummary', { count: citationRecords.value.length });
      } else if (props.toolId === 'structured_data_lab') {
        output.value = transformStructuredData(source.value, structuredOperation.value, structuredPath.value);
        resultSummary.value = t('toolbox.knowledgeText.structuredSummary', { count: output.value.length });
      }
    } catch (cause) {
      if (cause instanceof ToolboxKnowledgeTextError) error.value = t(`toolbox.knowledgeText.error.${cause.code}`);
      else error.value = t('toolbox.knowledgeText.error.generic');
    } finally {
      running.value = false;
    }
  }

  async function runFileTool() {
    if (!canRun.value) return;
    running.value = true;
    resetResult();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      if (props.toolId === 'markdown_checker') markdownIssues.value = checkMarkdownKnowledgeBase(sourceFiles.value);
      else {
        const updates = frontmatterKey.value.trim() ? { [frontmatterKey.value.trim()]: frontmatterValue.value } : {};
        const removeKeys = frontmatterRemove.value
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        frontmatterResults.value = sourceFiles.value.map((file) => ({
          name: file.name,
          content: updateFrontmatterDocument(file.content, updates, removeKeys),
        }));
      }
    } catch (cause) {
      error.value =
        cause instanceof ToolboxKnowledgeTextError
          ? t(`toolbox.knowledgeText.error.${cause.code}`)
          : t('toolbox.knowledgeText.error.generic');
    } finally {
      running.value = false;
    }
  }

  function severityLabel(severity: 'error' | 'warning') {
    return t(`toolbox.knowledgeText.severityType.${severity}`);
  }

  async function copyOutput() {
    const copied = await copyTextToClipboard(output.value);
    message[copied ? 'success' : 'error'](t(copied ? 'toolbox.local.copySuccess' : 'toolbox.local.copyFailed'));
  }

  function downloadOutput() {
    const extension =
      props.toolId === 'structured_data_lab'
        ? 'json'
        : props.toolId === 'citation_converter'
          ? citationOutputFormat.value === 'bibtex'
            ? 'bib'
            : citationOutputFormat.value
          : 'txt';
    downloadToolboxBlob(
      new Blob([output.value], { type: 'text/plain;charset=utf-8' }),
      `lightnote-${props.toolId}.${extension}`,
    );
  }

  function downloadMarkdownReport() {
    downloadToolboxBlob(
      new Blob([JSON.stringify(markdownIssues.value, null, 2)], { type: 'application/json;charset=utf-8' }),
      'lightnote-markdown-report.json',
    );
  }

  async function downloadFrontmatterZip() {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const result of frontmatterResults.value) zip.file(result.name, result.content);
    downloadToolboxBlob(await zip.generateAsync({ type: 'blob' }), 'lightnote-frontmatter-updated.zip');
  }

  watch(
    () => props.toolId,
    () => clearAll(),
  );
  watch(source, resetResult);
</script>

<style scoped lang="less">
  .knowledge-text-workbench {
    display: grid;
    gap: 16px;
  }

  .knowledge-text-head {
    padding: 16px 18px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 17px;
    background: radial-gradient(circle at 86% 0%, rgba(97, 92, 237, 0.1), transparent 34%), var(--card-background);
  }

  .knowledge-text-head__icon {
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(97, 92, 237, 0.38);
    border-radius: 16px;
    color: var(--primary-color);
    background: var(--card-background);
  }

  .knowledge-text-head > div:nth-child(2) {
    min-width: 0;
    display: grid;
    justify-items: start;
    gap: 5px;
  }

  .knowledge-text-head h2,
  .knowledge-text-head p,
  .knowledge-file-empty h3,
  .knowledge-file-empty p {
    margin: 0;
  }

  .knowledge-text-head h2 {
    font-size: 21px;
  }

  .knowledge-text-head p {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }

  .knowledge-text-head__facts {
    display: flex;
    gap: 8px;
  }

  .knowledge-text-head__facts > span {
    min-width: 88px;
    padding: 9px 11px;
    display: grid;
    gap: 2px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--card-background);
  }

  .knowledge-text-head__facts strong {
    font-size: 16px;
  }

  .knowledge-text-head__facts small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .knowledge-text-controls {
    padding: 12px;
    display: flex;
    align-items: end;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }

  .knowledge-text-controls.is-text-batch {
    display: grid;
    grid-template-columns: repeat(5, minmax(112px, 1fr));
    align-items: end;
  }

  .knowledge-field {
    min-width: 130px;
    display: grid;
    gap: 6px;
  }

  .knowledge-field.is-grow,
  .knowledge-field.is-wide {
    min-width: 220px;
    flex: 1;
  }

  .knowledge-field label {
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 650;
  }

  .knowledge-checkbox-group {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .knowledge-checkbox-group :deep(.b-checkbox) {
    min-height: 34px;
    padding: 5px 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
  }

  .knowledge-checkbox-group.is-batch-options {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, minmax(132px, 1fr));
    gap: 8px;
  }

  .knowledge-checkbox-group.is-batch-options :deep(.b-checkbox) {
    min-width: 0;
    padding: 7px 10px;
    justify-content: flex-start;
    white-space: nowrap;
    background: var(--workspace-panel-bg-color);
    transition:
      border-color 0.16s ease,
      background 0.16s ease;
  }

  .knowledge-checkbox-group.is-batch-options :deep(.b-checkbox__label) {
    white-space: nowrap;
  }

  .knowledge-checkbox-group.is-batch-options :deep(.b-checkbox.is-checked) {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
  }

  .knowledge-checkbox-group.is-batch-options :deep(.b-checkbox:focus-visible) {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .knowledge-checkbox-group.is-flags {
    flex-wrap: wrap;
  }

  .knowledge-control-note {
    max-width: 380px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 11px;
    line-height: 1.45;
  }

  .knowledge-control-note :deep(.svg-icon) {
    flex: 0 0 auto;
    color: #07835f;
  }

  .knowledge-editor-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .knowledge-editor-card {
    min-width: 0;
    padding: 13px;
    display: grid;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--card-background);
  }

  .knowledge-editor-card.is-output {
    border-color: rgba(97, 92, 237, 0.38);
  }

  .knowledge-editor-card > header,
  .knowledge-editor-card__footer,
  .knowledge-text-runbar,
  .knowledge-runbar,
  .knowledge-file-bar,
  .knowledge-file-bar > div {
    display: flex;
    align-items: center;
  }

  .knowledge-editor-card > header,
  .knowledge-file-bar,
  .knowledge-runbar,
  .knowledge-text-runbar {
    justify-content: space-between;
    gap: 10px;
  }

  .knowledge-editor-card > header > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .knowledge-editor-card > header > div > span {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    color: #fff;
    background: var(--primary-color);
    font-size: 10px;
    font-weight: 750;
  }

  .knowledge-editor-card > header small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .knowledge-editor-card :deep(textarea) {
    min-height: 360px;
    resize: vertical;
    border-color: var(--surface-border-color);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    line-height: 1.65;
  }

  .knowledge-editor-card__footer {
    min-height: 32px;
    justify-content: flex-end;
    gap: 7px;
  }

  .knowledge-editor-card__footer > span {
    margin-right: auto;
    color: var(--desc-color);
    font-size: 10px;
  }

  .knowledge-text-runbar,
  .knowledge-runbar {
    padding: 11px 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--workspace-panel-bg-color);
  }

  .knowledge-text-runbar > div,
  .knowledge-runbar > div {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .knowledge-text-runbar :deep(.svg-icon) {
    color: #07835f;
  }

  .knowledge-runbar > div {
    display: grid;
    gap: 2px;
  }

  .knowledge-runbar strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .knowledge-text-error {
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 1px solid var(--danger-color, #dc3e4d);
    border-radius: 11px;
    color: var(--danger-color, #dc3e4d);
    font-size: 12px;
  }

  .knowledge-file-empty {
    min-height: 350px;
    padding: 38px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 13px;
    border: 1px dashed rgba(97, 92, 237, 0.5);
    border-radius: 19px;
    text-align: center;
    background: radial-gradient(circle at 50% 10%, rgba(97, 92, 237, 0.11), transparent 42%), var(--card-background);
  }

  .knowledge-file-empty > span {
    width: 70px;
    height: 70px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(97, 92, 237, 0.4);
    border-radius: 20px;
    color: var(--primary-color);
    background: var(--card-background);
  }

  .knowledge-file-empty > div {
    max-width: 560px;
    display: grid;
    gap: 6px;
  }

  .knowledge-file-empty p,
  .knowledge-file-empty > small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }

  .knowledge-file-bar {
    padding: 11px 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }

  .knowledge-file-bar > div {
    gap: 8px;
  }

  .knowledge-file-bar > div:first-child > span {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .knowledge-file-bar > div:first-child > div {
    display: grid;
    gap: 2px;
  }

  .knowledge-file-bar small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .knowledge-file-studio {
    display: grid;
    grid-template-columns: minmax(220px, 0.28fr) minmax(0, 1fr);
    gap: 13px;
    align-items: start;
  }

  .knowledge-file-list,
  .knowledge-file-main {
    min-width: 0;
    padding: 14px;
    display: grid;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
  }

  .knowledge-file-list > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--desc-color);
    font-size: 11px;
  }

  .knowledge-file-list article {
    min-width: 0;
    padding: 8px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    border-radius: 9px;
    background: var(--workspace-panel-bg-color);
  }

  .knowledge-file-list article :deep(.svg-icon) {
    color: var(--primary-color);
  }

  .knowledge-file-list article > span {
    overflow: hidden;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .knowledge-file-list article small,
  .knowledge-file-list > small {
    color: var(--desc-color);
    font-size: 9px;
  }

  .frontmatter-controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }

  .frontmatter-controls .is-wide {
    grid-column: 1 / -1;
  }

  .knowledge-file-placeholder {
    min-height: 250px;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 7px;
    color: var(--desc-color);
    text-align: center;
  }

  .knowledge-file-placeholder :deep(.svg-icon) {
    color: var(--primary-color);
  }

  .knowledge-file-placeholder span {
    max-width: 420px;
    font-size: 11px;
  }

  .knowledge-result-summary {
    padding: 13px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    border: 1px solid rgba(166, 106, 0, 0.5);
    border-radius: 13px;
    background: var(--workspace-panel-bg-color);
  }

  .knowledge-result-summary.is-success {
    border-color: #07835f;
  }

  .knowledge-result-summary > span {
    color: #a66a00;
  }

  .knowledge-result-summary.is-success > span {
    color: #07835f;
  }

  .knowledge-result-summary > div {
    display: grid;
    gap: 3px;
  }

  .knowledge-result-summary small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .frontmatter-result-list {
    display: grid;
    gap: 6px;
  }

  .frontmatter-result-list article {
    padding: 8px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--surface-border-color);
  }

  .frontmatter-result-list strong {
    overflow: hidden;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 1180px) {
    .knowledge-text-controls {
      flex-wrap: wrap;
    }

    .knowledge-text-controls.is-text-batch {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .knowledge-file-studio {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 767px) {
    .knowledge-text-head {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .knowledge-text-head__facts {
      grid-column: 1 / -1;
    }

    .knowledge-text-head__facts > span {
      flex: 1;
    }

    .knowledge-text-controls,
    .knowledge-editor-grid,
    .frontmatter-controls {
      grid-template-columns: 1fr;
    }

    .knowledge-text-controls,
    .knowledge-checkbox-group,
    .knowledge-text-runbar,
    .knowledge-runbar,
    .knowledge-file-bar,
    .knowledge-file-bar > div {
      align-items: stretch;
      flex-direction: column;
    }

    .knowledge-field,
    .knowledge-field.is-grow,
    .knowledge-field.is-wide {
      width: 100%;
      min-width: 0;
    }

    .knowledge-checkbox-group.is-batch-options {
      grid-template-columns: 1fr;
    }

    .knowledge-editor-card :deep(textarea) {
      min-height: 280px;
    }

    .knowledge-result-summary {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .knowledge-result-summary > :deep(.b_btn) {
      grid-column: 1 / -1;
      width: 100%;
    }
  }

  html.light-note-mobile-rendering .knowledge-text-head,
  html.light-note-mobile-rendering .knowledge-file-empty,
  html.light-note-mobile-rendering .knowledge-file-bar,
  html.light-note-mobile-rendering .knowledge-file-list,
  html.light-note-mobile-rendering .knowledge-file-main,
  html.light-note-mobile-rendering .knowledge-editor-card {
    box-shadow: none;
  }

  :global(html.light-note-mobile-rendering .knowledge-checkbox-group.is-batch-options .b-checkbox.is-checked) {
    border: 2px solid var(--primary-color);
    background: var(--card-background);
  }
</style>

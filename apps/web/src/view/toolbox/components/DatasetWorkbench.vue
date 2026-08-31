<template>
  <section class="dataset-workbench" :aria-label="toolName">
    <aside class="dataset-operation-rail" :aria-label="t('toolbox.dataset.modeNavigation')">
      <header>
        <span>{{ t('toolbox.dataset.modeEyebrow') }}</span>
        <strong>{{ t('toolbox.dataset.modeTitle') }}</strong>
        <small>{{ t('toolbox.dataset.modeDescription') }}</small>
      </header>
      <div class="dataset-operation-rail__items">
        <BButton
          v-for="mode in modeItems"
          :key="mode.id"
          class="dataset-operation"
          :class="{ 'is-selected': activeToolId === mode.id }"
          :aria-pressed="activeToolId === mode.id"
          @click="selectMode(mode.id)"
        >
          <span><SvgIcon :src="mode.icon" size="18" /></span>
          <span
            ><strong>{{ mode.label }}</strong
            ><small>{{ mode.description }}</small></span
          >
        </BButton>
      </div>
    </aside>

    <div class="dataset-mode-select">
      <label id="dataset-mode-select-label">{{ t('toolbox.dataset.modeTitle') }}</label>
      <BSelect v-model:value="selectedMode" :options="modeSelectOptions" aria-labelledby="dataset-mode-select-label" />
    </div>

    <div class="dataset-workbench__surface">
      <div
        v-if="isQualityTool"
        class="dataset-stagebar is-quality"
        role="list"
        :aria-label="t('toolbox.dataset.workflow')"
      >
        <div
          class="dataset-stage"
          :class="{ 'is-active': datasets.length === 0, 'is-complete': datasets.length > 0 }"
          role="listitem"
        >
          <span>01</span>
          <div
            ><strong>{{ t('toolbox.dataset.stageLoad') }}</strong
            ><small>{{ stageLoadDescription }}</small></div
          >
        </div>
        <div
          class="dataset-stage"
          :class="{ 'is-active': datasets.length > 0, 'is-complete': Boolean(qualityReport) }"
          role="listitem"
        >
          <span>02</span>
          <div
            ><strong>{{ t('toolbox.dataset.qualityStageResult') }}</strong
            ><small>{{ t('toolbox.dataset.qualityStageResultHint') }}</small></div
          >
        </div>
      </div>

      <div v-else class="dataset-stagebar" role="list" :aria-label="t('toolbox.dataset.workflow')">
        <div class="dataset-stage is-complete" role="listitem">
          <span>01</span>
          <div
            ><strong>{{ t('toolbox.dataset.stageLoad') }}</strong
            ><small>{{ stageLoadDescription }}</small></div
          >
        </div>
        <div
          class="dataset-stage"
          :class="{ 'is-active': datasets.length > 0, 'is-complete': hasOutcome }"
          role="listitem"
        >
          <span>02</span>
          <div
            ><strong>{{ t('toolbox.dataset.stageConfigure') }}</strong
            ><small>{{ t('toolbox.dataset.stageConfigureHint') }}</small></div
          >
        </div>
        <div class="dataset-stage" :class="{ 'is-active': hasOutcome }" role="listitem">
          <span>03</span>
          <div
            ><strong>{{ t('toolbox.dataset.stageExport') }}</strong
            ><small>{{ t('toolbox.dataset.stageExportHint') }}</small></div
          >
        </div>
      </div>

      <section v-if="datasets.length === 0" class="dataset-empty">
        <span class="dataset-empty__icon"><SvgIcon :src="icon.toolbox.table" size="34" /></span>
        <div>
          <BChip tone="success">{{ t('toolbox.localBadge') }}</BChip>
          <h2>{{ emptyTitle }}</h2>
          <p>{{ emptyDescription }}</p>
        </div>
        <BUpload
          raw-file
          :multiple="maxFiles > 1"
          :accept="datasetAccept"
          :max-total-size="null"
          :disabled="loading"
          block
          @change="loadFiles"
        >
          <BButton type="primary" size="large" :loading="loading">
            <SvgIcon :src="icon.toolbox.upload" size="17" />{{ chooseFileLabel }}
          </BButton>
        </BUpload>
        <BButton :disabled="loading" @click="loadSample">{{ t('toolbox.local.loadSample') }}</BButton>
        <small>{{ t('toolbox.dataset.fileHint', { count: maxFiles }) }}</small>
      </section>

      <template v-else>
        <section class="dataset-sourcebar">
          <div class="dataset-sourcebar__files">
            <article v-for="(dataset, index) in visibleDatasets" :key="`${dataset.name}-${index}`">
              <span><SvgIcon :src="icon.toolbox.table" size="18" /></span>
              <div>
                <strong>{{ dataset.name }}</strong>
                <small>{{
                  t('toolbox.dataset.shape', { rows: dataset.rows.length, columns: dataset.headers.length })
                }}</small>
              </div>
              <BChip :tone="index === 0 ? 'success' : 'neutral'">{{ sourceLabel(index) }}</BChip>
            </article>
          </div>
          <div class="dataset-sourcebar__actions">
            <BUpload
              raw-file
              :multiple="maxFiles > 1"
              :accept="datasetAccept"
              :max-total-size="null"
              :disabled="loading"
              @change="loadFiles"
            >
              <BButton size="small" :disabled="loading"
                ><SvgIcon :src="icon.toolbox.upload" size="14" />{{ t('toolbox.dataset.replace') }}</BButton
              >
            </BUpload>
            <BButton size="small" :disabled="loading" @click="clearAll">{{ t('common.clear') }}</BButton>
          </div>
        </section>

        <div class="dataset-studio" :class="{ 'is-quality': isQualityTool }">
          <aside v-if="!isQualityTool" class="dataset-control-card">
            <div class="dataset-control-card__head">
              <span>{{ t('toolbox.dataset.controlEyebrow') }}</span>
              <h2>{{ controlTitle }}</h2>
              <p>{{ controlDescription }}</p>
            </div>

            <template v-if="activeToolId === 'data_quality_report'">
              <div class="dataset-control-note">
                <SvgIcon :src="icon.toolbox.audit" size="18" />
                <span>{{ t('toolbox.dataset.qualityControlHint') }}</span>
              </div>
            </template>

            <div v-else-if="activeToolId === 'data_cleaner'" class="dataset-checkboxes">
              <BCheckbox v-model="cleanOptions.trimCells">{{ t('toolbox.dataset.cleanTrim') }}</BCheckbox>
              <BCheckbox v-model="cleanOptions.normalizeWhitespace">{{
                t('toolbox.dataset.cleanWhitespace')
              }}</BCheckbox>
              <BCheckbox v-model="cleanOptions.removeEmptyRows">{{ t('toolbox.dataset.cleanEmpty') }}</BCheckbox>
              <BCheckbox v-model="cleanOptions.removeDuplicateRows">{{
                t('toolbox.dataset.cleanDuplicate')
              }}</BCheckbox>
              <BCheckbox v-model="cleanOptions.normalizeHeaders">{{ t('toolbox.dataset.cleanHeaders') }}</BCheckbox>
            </div>

            <template v-else-if="activeToolId === 'data_validator'">
              <div class="dataset-field">
                <label id="dataset-rule-column">{{ t('toolbox.dataset.ruleColumn') }}</label>
                <BSelect v-model:value="ruleColumn" :options="headerOptions" aria-labelledby="dataset-rule-column" />
              </div>
              <div class="dataset-field">
                <label id="dataset-rule-type">{{ t('toolbox.dataset.ruleType') }}</label>
                <BSelect
                  v-model:value="ruleType"
                  :options="validationTypeOptions"
                  aria-labelledby="dataset-rule-type"
                />
              </div>
              <div class="dataset-checkboxes is-inline">
                <BCheckbox v-model="ruleRequired">{{ t('toolbox.dataset.ruleRequired') }}</BCheckbox>
                <BCheckbox v-model="ruleUnique">{{ t('toolbox.dataset.ruleUnique') }}</BCheckbox>
              </div>
              <div class="dataset-field">
                <label for="dataset-rule-pattern">{{ t('toolbox.dataset.rulePattern') }}</label>
                <BInput
                  id="dataset-rule-pattern"
                  v-model:value="rulePattern"
                  :placeholder="t('toolbox.dataset.rulePatternPlaceholder')"
                />
              </div>
              <BButton :disabled="!ruleColumn" @click="addValidationRule">{{ t('toolbox.dataset.addRule') }}</BButton>
              <div v-if="validationRules.length" class="dataset-rule-list">
                <article v-for="(rule, index) in validationRules" :key="`${rule.column}-${index}`">
                  <div
                    ><strong>{{ rule.column }}</strong
                    ><small>{{ validationRuleSummary(rule) }}</small></div
                  >
                  <BButton
                    size="small"
                    :aria-label="t('toolbox.dataset.removeRule')"
                    @click="validationRules.splice(index, 1)"
                  >
                    <SvgIcon :src="icon.toolbox.delete" size="14" />
                  </BButton>
                </article>
              </div>
            </template>

            <template v-else-if="activeToolId === 'pivot_analysis'">
              <div class="dataset-field">
                <label id="dataset-pivot-group">{{ t('toolbox.dataset.groupColumn') }}</label>
                <BSelect v-model:value="groupColumn" :options="headerOptions" aria-labelledby="dataset-pivot-group" />
              </div>
              <div class="dataset-field">
                <label id="dataset-pivot-aggregate">{{ t('toolbox.dataset.aggregate') }}</label>
                <BSelect
                  v-model:value="aggregate"
                  :options="aggregateOptions"
                  aria-labelledby="dataset-pivot-aggregate"
                />
              </div>
              <div v-if="aggregate !== 'count'" class="dataset-field">
                <label id="dataset-pivot-value">{{ t('toolbox.dataset.valueColumn') }}</label>
                <BSelect
                  v-model:value="valueColumn"
                  :options="numericHeaderOptions"
                  aria-labelledby="dataset-pivot-value"
                />
              </div>
            </template>

            <template v-else-if="activeToolId === 'table_diff'">
              <div class="dataset-field">
                <label id="dataset-diff-key">{{ t('toolbox.dataset.keyColumn') }}</label>
                <BSelect v-model:value="keyColumn" :options="commonHeaderOptions" aria-labelledby="dataset-diff-key" />
              </div>
              <div class="dataset-control-note">
                <SvgIcon :src="icon.toolbox.comparison" size="18" />
                <span>{{ t('toolbox.dataset.diffHint') }}</span>
              </div>
            </template>

            <template v-else-if="activeToolId === 'table_merge_split'">
              <div class="dataset-field">
                <label id="dataset-merge-mode">{{ t('toolbox.dataset.mergeMode') }}</label>
                <BSelect v-model:value="mergeMode" :options="mergeModeOptions" aria-labelledby="dataset-merge-mode" />
              </div>
              <div v-if="mergeMode === 'split'" class="dataset-field">
                <label id="dataset-split-column">{{ t('toolbox.dataset.splitColumn') }}</label>
                <BSelect v-model:value="splitColumn" :options="headerOptions" aria-labelledby="dataset-split-column" />
              </div>
              <div v-else-if="mergeMode !== 'append'" class="dataset-field">
                <label id="dataset-merge-key">{{ t('toolbox.dataset.keyColumn') }}</label>
                <BSelect v-model:value="keyColumn" :options="commonHeaderOptions" aria-labelledby="dataset-merge-key" />
              </div>
              <div class="dataset-control-note">
                <SvgIcon :src="icon.toolbox.swap" size="18" />
                <span>{{
                  mergeMode === 'split' ? t('toolbox.dataset.splitHint') : t('toolbox.dataset.mergeHint')
                }}</span>
              </div>
            </template>

            <template v-else-if="activeToolId === 'data_anonymizer'">
              <div class="dataset-field">
                <label id="dataset-mask-columns">{{ t('toolbox.dataset.sensitiveColumns') }}</label>
                <BSelect
                  v-model:value="anonymizeColumns"
                  mode="multiple"
                  show-search
                  :max-tag-count="2"
                  :options="headerOptions"
                  aria-labelledby="dataset-mask-columns"
                />
              </div>
              <div class="dataset-field">
                <label id="dataset-mask-mode">{{ t('toolbox.dataset.anonymizeMode') }}</label>
                <BSelect
                  v-model:value="anonymizeMode"
                  :options="anonymizeModeOptions"
                  aria-labelledby="dataset-mask-mode"
                />
              </div>
              <div class="dataset-control-note is-security">
                <SvgIcon :src="icon.toolbox.local" size="18" />
                <span>{{ t('toolbox.dataset.anonymizeHint') }}</span>
              </div>
            </template>

            <template v-else-if="activeToolId === 'data_chart'">
              <div class="dataset-field">
                <label id="dataset-chart-category">{{ t('toolbox.dataset.categoryColumn') }}</label>
                <BSelect
                  v-model:value="chartCategory"
                  :options="headerOptions"
                  aria-labelledby="dataset-chart-category"
                />
              </div>
              <div class="dataset-field">
                <label id="dataset-chart-value">{{ t('toolbox.dataset.valueColumn') }}</label>
                <BSelect
                  v-model:value="chartValue"
                  :options="numericHeaderOptions"
                  aria-labelledby="dataset-chart-value"
                />
              </div>
              <div class="dataset-field">
                <label id="dataset-chart-type">{{ t('toolbox.dataset.chartType') }}</label>
                <BSelect v-model:value="chartType" :options="chartTypeOptions" aria-labelledby="dataset-chart-type" />
              </div>
            </template>

            <div class="dataset-control-card__action">
              <BButton type="primary" block :disabled="!canRun" :loading="running" @click="runTool">
                {{ running ? t('toolbox.dataset.running') : runLabel }}
                <SvgIcon v-if="!running" :src="icon.toolbox.arrow" size="15" />
              </BButton>
              <small>{{ t('toolbox.dataset.noUploadReminder') }}</small>
            </div>
          </aside>

          <section class="dataset-canvas">
            <header class="dataset-canvas__head">
              <div>
                <span>{{ hasOutcome ? t('toolbox.dataset.resultEyebrow') : t('toolbox.dataset.previewEyebrow') }}</span>
                <h2>{{ canvasTitle }}</h2>
                <p>{{ canvasDescription }}</p>
              </div>
              <div v-if="hasOutcome" class="dataset-canvas__actions">
                <BSelect
                  v-if="canExportDataset"
                  v-model:value="exportFormat"
                  :options="exportFormatOptions"
                  :aria-label="t('toolbox.local.outputFormat')"
                />
                <BButton @click="exportOutcome"
                  ><SvgIcon :src="icon.toolbox.download" size="15" />{{ exportLabel }}</BButton
                >
              </div>
            </header>

            <div v-if="error" class="dataset-error" role="alert">
              <SvgIcon :src="icon.message.info" size="18" />
              <div
                ><strong>{{ t('toolbox.dataset.errorTitle') }}</strong
                ><span>{{ error }}</span></div
              >
              <BButton v-if="isQualityTool" size="small" :loading="running" @click="runTool">{{
                t('common.retry')
              }}</BButton>
            </div>

            <div v-if="isQualityTool && running" class="dataset-quality-loading">
              <BLoading inline loading :title="t('toolbox.dataset.qualityRunningTitle')" />
              <p>{{ t('toolbox.dataset.qualityRunningHint') }}</p>
            </div>

            <template v-else-if="qualityReport">
              <div class="dataset-quality-summary">
                <div class="dataset-quality-score" :class="qualityScoreTone">
                  <span>{{ t('toolbox.dataset.qualityScore') }}</span>
                  <strong>{{ qualityReport.score }}</strong>
                  <small>/ 100</small>
                </div>
                <div
                  ><span>{{ t('toolbox.dataset.completeCells') }}</span
                  ><strong>{{ qualityReport.completeCells.toLocaleString() }}</strong></div
                >
                <div
                  ><span>{{ t('toolbox.dataset.duplicateRows') }}</span
                  ><strong>{{ qualityReport.duplicateRows }}</strong></div
                >
                <div
                  ><span>{{ t('toolbox.dataset.qualityIssues') }}</span
                  ><strong>{{ qualityReport.issues.length }}</strong></div
                >
              </div>
              <div class="dataset-profile-list">
                <article v-for="column in qualityReport.columnsProfile" :key="column.name">
                  <div class="dataset-profile-list__name"
                    ><strong>{{ column.name }}</strong
                    ><BChip :tone="column.type === 'mixed' ? 'danger' : 'neutral'">{{
                      typeLabel(column.type)
                    }}</BChip></div
                  >
                  <span>{{ t('toolbox.dataset.missingCount', { count: column.missing }) }}</span>
                  <span>{{ t('toolbox.dataset.uniqueCount', { count: column.unique }) }}</span>
                  <div class="dataset-profile-list__bar"
                    ><i :style="{ width: `${Math.round((1 - column.missingRate) * 100)}%` }"></i
                  ></div>
                </article>
              </div>
            </template>

            <template v-else-if="diffResult">
              <div class="dataset-diff-summary">
                <div class="is-added"
                  ><span>{{ t('toolbox.dataset.addedRows') }}</span
                  ><strong>{{ diffResult.added.length }}</strong></div
                >
                <div class="is-changed"
                  ><span>{{ t('toolbox.dataset.changedRows') }}</span
                  ><strong>{{ diffResult.changed.length }}</strong></div
                >
                <div class="is-removed"
                  ><span>{{ t('toolbox.dataset.removedRows') }}</span
                  ><strong>{{ diffResult.removed.length }}</strong></div
                >
              </div>
              <div v-if="diffResult.changed.length" class="dataset-change-list">
                <article v-for="change in diffResult.changed.slice(0, 12)" :key="change.key">
                  <strong>{{ change.key }}</strong>
                  <span>{{ change.columns.join(' · ') }}</span>
                  <BChip tone="pending">{{
                    t('toolbox.dataset.changedColumnCount', { count: change.columns.length })
                  }}</BChip>
                </article>
              </div>
            </template>

            <template v-else-if="validationIssues">
              <div class="dataset-validation-summary" :class="{ 'is-valid': validationIssues.length === 0 }">
                <span
                  ><SvgIcon :src="validationIssues.length ? icon.message.info : icon.toolbox.local" size="22"
                /></span>
                <div>
                  <strong>{{
                    validationIssues.length
                      ? t('toolbox.dataset.validationFailed', { count: validationIssues.length })
                      : t('toolbox.dataset.validationPassed')
                  }}</strong>
                  <small>{{
                    validationIssues.length
                      ? t('toolbox.dataset.validationFailedHint')
                      : t('toolbox.dataset.validationPassedHint')
                  }}</small>
                </div>
              </div>
              <div v-if="validationIssues.length" class="dataset-issue-list">
                <article
                  v-for="(issue, index) in validationIssues.slice(0, 30)"
                  :key="`${issue.row}-${issue.column}-${index}`"
                >
                  <span>{{ issue.row }}</span
                  ><strong>{{ issue.column }}</strong
                  ><small>{{ validationIssueLabel(issue.code) }}</small
                  ><code>{{ issue.value || '∅' }}</code>
                </article>
              </div>
            </template>

            <template v-else-if="splitResults.size">
              <div class="dataset-split-summary">
                <span><SvgIcon :src="icon.toolbox.table" size="23" /></span>
                <div
                  ><strong>{{ t('toolbox.dataset.splitReady', { count: splitResults.size }) }}</strong
                  ><small>{{ t('toolbox.dataset.splitReadyHint') }}</small></div
                >
              </div>
              <div class="dataset-split-list">
                <article v-for="[name, dataset] in [...splitResults.entries()].slice(0, 30)" :key="name">
                  <strong>{{ name }}</strong
                  ><span>{{ t('toolbox.dataset.rowCount', { count: dataset.rows.length }) }}</span>
                </article>
              </div>
            </template>

            <template v-else-if="chartReady">
              <div class="dataset-chart" :class="`is-${chartType}`">
                <header
                  ><strong>{{ chartValue }}</strong
                  ><span>{{ t('toolbox.dataset.chartRows', { count: chartData.length }) }}</span></header
                >
                <div
                  class="dataset-chart__plot"
                  role="img"
                  :aria-label="t('toolbox.dataset.chartAria', { category: chartCategory, value: chartValue })"
                >
                  <article v-for="point in chartData" :key="point.label" :title="`${point.label}: ${point.value}`">
                    <span v-if="chartType === 'horizontal'" class="dataset-chart__label">{{ point.label }}</span>
                    <i :style="chartBarStyle(point.value)"></i>
                    <b>{{ point.value }}</b>
                    <span v-if="chartType === 'vertical'" class="dataset-chart__label">{{ point.label }}</span>
                  </article>
                </div>
              </div>
            </template>

            <template v-else>
              <div v-if="resultDataset && resultDataset !== primaryDataset" class="dataset-result-banner">
                <span><SvgIcon :src="icon.toolbox.local" size="20" /></span>
                <div
                  ><strong>{{ resultBannerTitle }}</strong
                  ><small>{{ resultBannerDescription }}</small></div
                >
              </div>
              <BTable :data="previewRows" :columns="previewColumns" row-key="__rowId" />
              <small class="dataset-preview-note">{{ previewNote }}</small>
            </template>
          </section>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import type { Column } from '@/components/base/BasicComponents/BTable/config';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { downloadToolboxBlob } from '@/utils/toolboxLocal';
  import {
    anonymizeToolboxDataset,
    cleanToolboxDataset,
    diffToolboxDatasets,
    mergeToolboxDatasets,
    pivotToolboxDataset,
    profileToolboxDataset,
    readToolboxDatasetFile,
    serializeToolboxDataset,
    splitToolboxDataset,
    TOOLBOX_DATASET_MAX_TOTAL_BYTES,
    toolboxDatasetPreviewRows,
    validateToolboxDataset,
    type DatasetAggregate,
    type DatasetAnonymizeMode,
    type DatasetCleanOptions,
    type DatasetDiffResult,
    type DatasetMergeMode,
    type DatasetQualityReport,
    type DatasetValidationIssue,
    type DatasetValidationRule,
    type DatasetValidationType,
    type DatasetValueType,
    type ToolboxDataset,
  } from '@/utils/toolboxDataset';
  import type { TableFormat } from '@/utils/toolboxTextTools';

  type DatasetModeId = Extract<
    ToolboxToolId,
    | 'data_quality_report'
    | 'data_cleaner'
    | 'data_validator'
    | 'pivot_analysis'
    | 'table_diff'
    | 'table_merge_split'
    | 'data_anonymizer'
    | 'data_chart'
  >;

  type DatasetWorkbenchToolId = DatasetModeId | 'data_workbench';

  const props = defineProps<{ toolId: DatasetWorkbenchToolId }>();
  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const datasetModeIds = [
    'data_quality_report',
    'data_cleaner',
    'data_validator',
    'pivot_analysis',
    'table_diff',
    'table_merge_split',
    'data_anonymizer',
    'data_chart',
  ] as const satisfies readonly DatasetModeId[];
  const datasetModeIdSet = new Set<string>(datasetModeIds);

  function resolveMode(toolId: DatasetWorkbenchToolId): DatasetModeId {
    if (toolId !== 'data_workbench') return toolId;
    const queryMode = Array.isArray(route.query.mode) ? route.query.mode[0] : route.query.mode;
    return typeof queryMode === 'string' && datasetModeIdSet.has(queryMode)
      ? (queryMode as DatasetModeId)
      : 'data_quality_report';
  }

  const activeToolId = ref<DatasetModeId>(resolveMode(props.toolId));
  const datasetAccept =
    '.csv,.tsv,.json,.xlsx,text/csv,text/tab-separated-values,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const datasets = ref<ToolboxDataset[]>([]);
  const datasetSizes = ref<number[]>([]);
  const loading = ref(false);
  const running = ref(false);
  const error = ref('');
  const resultDataset = ref<ToolboxDataset | null>(null);
  const qualityReport = ref<DatasetQualityReport | null>(null);
  const validationIssues = ref<DatasetValidationIssue[] | null>(null);
  const diffResult = ref<DatasetDiffResult | null>(null);
  const splitResults = ref(new Map<string, ToolboxDataset>());
  const chartReady = ref(false);
  const exportFormat = ref<TableFormat>('csv');

  const cleanOptions = reactive<DatasetCleanOptions>({
    trimCells: true,
    normalizeWhitespace: true,
    removeEmptyRows: true,
    removeDuplicateRows: true,
    normalizeHeaders: false,
  });
  const validationRules = ref<DatasetValidationRule[]>([]);
  const ruleColumn = ref('');
  const ruleType = ref<DatasetValidationType>('any');
  const ruleRequired = ref(false);
  const ruleUnique = ref(false);
  const rulePattern = ref('');
  const groupColumn = ref('');
  const valueColumn = ref('');
  const aggregate = ref<DatasetAggregate>('count');
  const keyColumn = ref('');
  const mergeMode = ref<DatasetMergeMode | 'split'>('append');
  const splitColumn = ref('');
  const anonymizeColumns = ref<string[]>([]);
  const anonymizeMode = ref<DatasetAnonymizeMode>('mask');
  const chartCategory = ref('');
  const chartValue = ref('');
  const chartType = ref<'vertical' | 'horizontal'>('vertical');

  const modeItems = computed(() =>
    datasetModeIds.map((id) => ({
      id,
      label: t(`toolbox.tool.${id}.name`),
      description: t(`toolbox.tool.${id}.description`),
      icon:
        id === 'data_quality_report' || id === 'data_validator'
          ? icon.toolbox.audit
          : id === 'table_diff'
            ? icon.toolbox.comparison
            : id === 'table_merge_split'
              ? icon.toolbox.swap
              : id === 'data_anonymizer'
                ? icon.toolbox.local
                : id === 'data_chart'
                  ? icon.toolbox.mermaid
                  : icon.toolbox.table,
    })),
  );
  const modeSelectOptions = computed(() => modeItems.value.map(({ id, label }) => ({ value: id, label })));
  const selectedMode = computed<DatasetModeId>({
    get: () => activeToolId.value,
    set: (value) => selectMode(value),
  });
  const toolName = computed(() => t('toolbox.tool.data_workbench.name'));
  const isQualityTool = computed(() => activeToolId.value === 'data_quality_report');
  const primaryDataset = computed(() => datasets.value[0] || null);
  const maxFiles = computed(() => (['table_diff', 'table_merge_split'].includes(activeToolId.value) ? 2 : 1));
  const visibleDatasets = computed(() =>
    maxFiles.value === 1 ? datasets.value.slice(0, 1) : datasets.value.slice(0, maxFiles.value),
  );
  const hasOutcome = computed(() =>
    Boolean(
      qualityReport.value ||
      validationIssues.value ||
      diffResult.value ||
      resultDataset.value ||
      splitResults.value.size ||
      chartReady.value,
    ),
  );
  const canExportDataset = computed(() => Boolean(resultDataset.value) && !chartReady.value);
  const exportLabel = computed(() =>
    chartReady.value
      ? t('toolbox.dataset.exportPng')
      : splitResults.value.size
        ? t('toolbox.dataset.exportZip')
        : t('toolbox.dataset.exportResult'),
  );
  const exportFormatOptions = computed(() => [
    { value: 'csv', label: 'CSV' },
    { value: 'json', label: 'JSON' },
    { value: 'tsv', label: 'TSV' },
  ]);
  const headerOptions = computed(() => (primaryDataset.value?.headers || []).map((value) => ({ value, label: value })));
  const commonHeaders = computed(() => {
    if (datasets.value.length < 2) return primaryDataset.value?.headers || [];
    return datasets.value[0]!.headers.filter((header) => datasets.value[1]!.headers.includes(header));
  });
  const commonHeaderOptions = computed(() => commonHeaders.value.map((value) => ({ value, label: value })));
  const primaryProfile = computed(() => (primaryDataset.value ? profileToolboxDataset(primaryDataset.value) : null));
  const numericHeaders = computed(
    () =>
      primaryProfile.value?.columnsProfile.filter((column) => column.type === 'number').map((column) => column.name) ||
      [],
  );
  const numericHeaderOptions = computed(() => numericHeaders.value.map((value) => ({ value, label: value })));
  const validationTypeOptions = computed(() =>
    (['any', 'text', 'number', 'date', 'email', 'url'] as DatasetValidationType[]).map((value) => ({
      value,
      label: t(`toolbox.dataset.validationType.${value}`),
    })),
  );
  const aggregateOptions = computed(() =>
    (['count', 'sum', 'average', 'min', 'max'] as DatasetAggregate[]).map((value) => ({
      value,
      label: t(`toolbox.dataset.aggregateType.${value}`),
    })),
  );
  const mergeModeOptions = computed(() =>
    (['append', 'left', 'inner', 'full', 'split'] as const).map((value) => ({
      value,
      label: t(`toolbox.dataset.mergeType.${value}`),
    })),
  );
  const anonymizeModeOptions = computed(() => [
    { value: 'mask', label: t('toolbox.dataset.anonymizeType.mask') },
    { value: 'pseudonym', label: t('toolbox.dataset.anonymizeType.pseudonym') },
  ]);
  const chartTypeOptions = computed(() => [
    { value: 'vertical', label: t('toolbox.dataset.chartTypeVertical') },
    { value: 'horizontal', label: t('toolbox.dataset.chartTypeHorizontal') },
  ]);
  const previewDataset = computed(() => resultDataset.value || primaryDataset.value);
  const previewRows = computed(() => (previewDataset.value ? toolboxDatasetPreviewRows(previewDataset.value, 50) : []));
  const previewColumns = computed<Column[]>(() =>
    (previewDataset.value?.headers || [])
      .slice(0, 8)
      .map((header) => ({ key: header, title: header, width: 'minmax(120px, 1fr)' })),
  );
  const previewNote = computed(() =>
    previewDataset.value
      ? t('toolbox.dataset.previewLimit', {
          rows: Math.min(previewDataset.value.rows.length, 50),
          total: previewDataset.value.rows.length,
          columns: Math.min(previewDataset.value.headers.length, 8),
        })
      : '',
  );
  const chartData = computed(() => {
    if (!chartReady.value || !primaryDataset.value) return [];
    const categoryIndex = primaryDataset.value.headers.indexOf(chartCategory.value);
    const valueIndex = primaryDataset.value.headers.indexOf(chartValue.value);
    return primaryDataset.value.rows
      .map((row) => ({ label: row[categoryIndex] || '—', value: Number(row[valueIndex]) }))
      .filter((point) => Number.isFinite(point.value))
      .slice(0, 20);
  });
  const chartMax = computed(() => Math.max(1, ...chartData.value.map((point) => Math.abs(point.value))));

  const copyByTool: Record<DatasetModeId, { emptyTitle: string; controlTitle: string; run: string }> = {
    data_quality_report: { emptyTitle: 'qualityEmptyTitle', controlTitle: 'qualityControlTitle', run: 'qualityRun' },
    data_cleaner: { emptyTitle: 'cleanEmptyTitle', controlTitle: 'cleanControlTitle', run: 'cleanRun' },
    data_validator: { emptyTitle: 'validateEmptyTitle', controlTitle: 'validateControlTitle', run: 'validateRun' },
    pivot_analysis: { emptyTitle: 'pivotEmptyTitle', controlTitle: 'pivotControlTitle', run: 'pivotRun' },
    table_diff: { emptyTitle: 'diffEmptyTitle', controlTitle: 'diffControlTitle', run: 'diffRun' },
    table_merge_split: { emptyTitle: 'mergeEmptyTitle', controlTitle: 'mergeControlTitle', run: 'mergeRun' },
    data_anonymizer: { emptyTitle: 'anonymizeEmptyTitle', controlTitle: 'anonymizeControlTitle', run: 'anonymizeRun' },
    data_chart: { emptyTitle: 'chartEmptyTitle', controlTitle: 'chartControlTitle', run: 'chartRun' },
  };
  const copyKey = computed(() => copyByTool[activeToolId.value]);
  const emptyTitle = computed(() => t(`toolbox.dataset.${copyKey.value.emptyTitle}`));
  const emptyDescription = computed(() => t(`toolbox.tool.${activeToolId.value}.description`));
  const chooseFileLabel = computed(() =>
    maxFiles.value === 2 ? t('toolbox.dataset.chooseTwoFiles') : t('toolbox.dataset.chooseFile'),
  );
  const controlTitle = computed(() => t(`toolbox.dataset.${copyKey.value.controlTitle}`));
  const controlDescription = computed(() => t(`toolbox.dataset.${copyKey.value.controlTitle}Hint`));
  const runLabel = computed(() => t(`toolbox.dataset.${copyKey.value.run}`));
  const stageLoadDescription = computed(() =>
    datasets.value.length
      ? t('toolbox.dataset.stageLoaded', { count: visibleDatasets.value.length })
      : t('toolbox.dataset.stageLoadHint'),
  );
  const canvasTitle = computed(() =>
    isQualityTool.value && running.value
      ? t('toolbox.dataset.qualityRunningTitle')
      : hasOutcome.value
        ? t('toolbox.dataset.resultTitle')
        : t('toolbox.dataset.previewTitle'),
  );
  const canvasDescription = computed(() =>
    isQualityTool.value && running.value
      ? t('toolbox.dataset.qualityRunningHint')
      : hasOutcome.value
        ? t('toolbox.dataset.resultDescription')
        : t('toolbox.dataset.previewDescription'),
  );
  const resultBannerTitle = computed(() => t(`toolbox.dataset.${activeToolId.value}Ready`));
  const resultBannerDescription = computed(() =>
    resultDataset.value
      ? t('toolbox.dataset.resultShape', {
          rows: resultDataset.value.rows.length,
          columns: resultDataset.value.headers.length,
        })
      : '',
  );
  const qualityScoreTone = computed(() =>
    qualityReport.value && qualityReport.value.score >= 85
      ? 'is-good'
      : qualityReport.value && qualityReport.value.score >= 60
        ? 'is-medium'
        : 'is-risk',
  );
  const canRun = computed(() => {
    if (!primaryDataset.value || running.value) return false;
    if (activeToolId.value === 'data_validator') return validationRules.value.length > 0;
    if (activeToolId.value === 'pivot_analysis')
      return Boolean(groupColumn.value && (aggregate.value === 'count' || valueColumn.value));
    if (activeToolId.value === 'table_diff') return datasets.value.length === 2 && Boolean(keyColumn.value);
    if (activeToolId.value === 'table_merge_split') {
      if (mergeMode.value === 'split') return Boolean(splitColumn.value);
      if (datasets.value.length < 2) return false;
      return mergeMode.value === 'append' || Boolean(keyColumn.value);
    }
    if (activeToolId.value === 'data_anonymizer') return anonymizeColumns.value.length > 0;
    if (activeToolId.value === 'data_chart') return Boolean(chartCategory.value && chartValue.value);
    return true;
  });

  function sourceLabel(index: number) {
    if (maxFiles.value === 1) return t('toolbox.dataset.source');
    return index === 0 ? t('toolbox.dataset.beforeSource') : t('toolbox.dataset.afterSource');
  }

  function selectMode(mode: DatasetModeId) {
    if (activeToolId.value === mode) return;
    activeToolId.value = mode;
    const query = { ...route.query };
    if (mode === 'data_quality_report') delete query.mode;
    else query.mode = mode;
    void router.replace({ path: '/toolbox/data_workbench', query });
  }

  function resetOutcome() {
    error.value = '';
    resultDataset.value = null;
    qualityReport.value = null;
    validationIssues.value = null;
    diffResult.value = null;
    splitResults.value = new Map();
    chartReady.value = false;
  }

  function initializeControls() {
    const headers = primaryDataset.value?.headers || [];
    const common = commonHeaders.value;
    const numeric = numericHeaders.value;
    ruleColumn.value = headers[0] || '';
    groupColumn.value = headers[0] || '';
    valueColumn.value = numeric[0] || '';
    keyColumn.value = common[0] || headers[0] || '';
    splitColumn.value = headers[0] || '';
    chartCategory.value = headers[0] || '';
    chartValue.value = numeric[0] || '';
    anonymizeColumns.value = [];
  }

  async function loadFiles(value: File[]) {
    const files = Array.isArray(value) ? value.slice(0, maxFiles.value) : [];
    if (!files.length) return;
    const appendSecond = maxFiles.value === 2 && datasets.value.length > 0 && files.length === 1;
    const nextSizes = appendSecond ? [datasetSizes.value[0] || 0, files[0]!.size] : files.map((file) => file.size);
    if (nextSizes.reduce((sum, size) => sum + size, 0) > TOOLBOX_DATASET_MAX_TOTAL_BYTES) {
      message.warning(t('toolbox.dataset.totalTooLarge', { size: 30 }));
      return;
    }
    if (activeToolId.value === 'table_diff' && !appendSecond && files.length !== 2) {
      message.warning(t('toolbox.dataset.needTwoFiles'));
      return;
    }
    const previousDatasets = datasets.value;
    const previousDatasetSizes = datasetSizes.value;
    loading.value = true;
    resetOutcome();
    try {
      const loaded = await Promise.all(files.map(readToolboxDatasetFile));
      datasets.value = appendSecond ? [datasets.value[0]!, loaded[0]!] : loaded;
      datasetSizes.value = nextSizes;
      initializeControls();
      if (isQualityTool.value) await runTool();
    } catch (cause) {
      datasets.value = previousDatasets;
      datasetSizes.value = previousDatasetSizes;
      error.value =
        cause instanceof Error && cause.message.startsWith('toolbox.')
          ? t(cause.message)
          : t('toolbox.dataset.loadFailed');
      message.error(error.value);
    } finally {
      loading.value = false;
    }
  }

  async function loadSample() {
    const first: ToolboxDataset = {
      name: 'sales-before.csv',
      headers: ['订单号', '地区', '负责人', '金额', '邮箱'],
      rows: [
        ['A-001', '华东', '小林 ', '1280', 'lin@example.com'],
        ['A-002', '华南', '阿青', '760', 'qing@example.com'],
        ['A-003', '华东', '小林', '1280', 'lin@example.com'],
        ['A-003', '华东', '小林', '1280', 'lin@example.com'],
        ['A-004', '', '陈宇', '', 'invalid-email'],
      ],
    };
    const second: ToolboxDataset = {
      name: 'sales-after.csv',
      headers: ['订单号', '地区', '负责人', '金额', '邮箱'],
      rows: [
        ['A-001', '华东', '小林', '1380', 'lin@example.com'],
        ['A-002', '华南', '阿青', '760', 'qing@example.com'],
        ['A-004', '华北', '陈宇', '930', 'chen@example.com'],
        ['A-005', '西南', '夏可', '610', 'xia@example.com'],
      ],
    };
    datasets.value = maxFiles.value === 2 ? [first, second] : [first];
    datasetSizes.value = datasets.value.map(() => 0);
    resetOutcome();
    initializeControls();
    if (isQualityTool.value) await runTool();
  }

  function clearAll() {
    datasets.value = [];
    datasetSizes.value = [];
    validationRules.value = [];
    resetOutcome();
  }

  function addValidationRule() {
    if (!ruleColumn.value) return;
    validationRules.value.push({
      column: ruleColumn.value,
      type: ruleType.value,
      required: ruleRequired.value,
      unique: ruleUnique.value,
      pattern: rulePattern.value.trim() || undefined,
    });
    rulePattern.value = '';
  }

  function validationRuleSummary(rule: DatasetValidationRule) {
    const parts = [t(`toolbox.dataset.validationType.${rule.type || 'any'}`)];
    if (rule.required) parts.push(t('toolbox.dataset.ruleRequired'));
    if (rule.unique) parts.push(t('toolbox.dataset.ruleUnique'));
    if (rule.pattern) parts.push(t('toolbox.dataset.ruleHasPattern'));
    return parts.join(' · ');
  }

  function validationIssueLabel(code: DatasetValidationIssue['code']) {
    return t(`toolbox.dataset.validationIssue.${code}`);
  }

  function typeLabel(type: DatasetValueType) {
    return t(`toolbox.dataset.valueType.${type}`);
  }

  async function runTool() {
    if (!primaryDataset.value || !canRun.value) return;
    running.value = true;
    resetOutcome();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      if (activeToolId.value === 'data_quality_report')
        qualityReport.value = profileToolboxDataset(primaryDataset.value);
      else if (activeToolId.value === 'data_cleaner')
        resultDataset.value = cleanToolboxDataset(primaryDataset.value, cleanOptions).dataset;
      else if (activeToolId.value === 'data_validator')
        validationIssues.value = validateToolboxDataset(primaryDataset.value, validationRules.value);
      else if (activeToolId.value === 'pivot_analysis') {
        resultDataset.value = pivotToolboxDataset(
          primaryDataset.value,
          groupColumn.value,
          aggregate.value === 'count' ? null : valueColumn.value,
          aggregate.value,
        );
      } else if (activeToolId.value === 'table_diff' && datasets.value[1]) {
        diffResult.value = diffToolboxDatasets(primaryDataset.value, datasets.value[1], keyColumn.value);
      } else if (activeToolId.value === 'table_merge_split') {
        if (mergeMode.value === 'split')
          splitResults.value = splitToolboxDataset(primaryDataset.value, splitColumn.value);
        else if (datasets.value[1])
          resultDataset.value = mergeToolboxDatasets(
            primaryDataset.value,
            datasets.value[1],
            mergeMode.value,
            keyColumn.value,
          );
      } else if (activeToolId.value === 'data_anonymizer') {
        resultDataset.value = anonymizeToolboxDataset(
          primaryDataset.value,
          anonymizeColumns.value,
          anonymizeMode.value,
        );
      } else if (activeToolId.value === 'data_chart') chartReady.value = true;
    } catch (cause) {
      error.value = cause instanceof SyntaxError ? t('toolbox.dataset.invalidPattern') : t('toolbox.dataset.runFailed');
    } finally {
      running.value = false;
    }
  }

  function safeFileBase(value: string) {
    return (
      value
        .replace(/\.[^.]+$/u, '')
        .replace(/[\\/:*?"<>|]+/gu, '-')
        .slice(0, 80) || 'lightnote-data'
    );
  }

  async function exportOutcome() {
    if (chartReady.value) return exportChartPng();
    if (splitResults.value.size) {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const [name, dataset] of splitResults.value)
        zip.file(`${safeFileBase(name)}.csv`, serializeToolboxDataset(dataset, 'csv'));
      downloadToolboxBlob(
        await zip.generateAsync({ type: 'blob' }),
        `${safeFileBase(primaryDataset.value?.name || '')}-split.zip`,
      );
      return;
    }
    if (qualityReport.value || validationIssues.value || diffResult.value) {
      const payload = qualityReport.value || validationIssues.value || diffResult.value;
      downloadToolboxBlob(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
        `${safeFileBase(primaryDataset.value?.name || '')}-report.json`,
      );
      return;
    }
    if (!resultDataset.value) return;
    const extension = exportFormat.value === 'markdown' ? 'md' : exportFormat.value;
    downloadToolboxBlob(
      new Blob([serializeToolboxDataset(resultDataset.value, exportFormat.value)], {
        type: 'text/plain;charset=utf-8',
      }),
      `${safeFileBase(resultDataset.value.name)}.${extension}`,
    );
  }

  function chartBarStyle(value: number) {
    const percent = Math.max(2, Math.round((Math.abs(value) / chartMax.value) * 100));
    return chartType.value === 'horizontal' ? { width: `${percent}%` } : { height: `${percent}%` };
  }

  function exportChartPng() {
    if (!chartData.value.length) return;
    const width = 1400;
    const height = 820;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#171824';
    context.font = '600 34px system-ui, sans-serif';
    context.fillText(`${chartCategory.value} × ${chartValue.value}`, 70, 70);
    const items = chartData.value.slice(0, 16);
    const plotTop = 130;
    const plotHeight = 560;
    const gap = 18;
    const barWidth = Math.max(20, (width - 140 - gap * (items.length - 1)) / items.length);
    items.forEach((point, index) => {
      const barHeight = (Math.abs(point.value) / chartMax.value) * plotHeight;
      const x = 70 + index * (barWidth + gap);
      const y = plotTop + plotHeight - barHeight;
      const gradient = context.createLinearGradient(0, y, 0, plotTop + plotHeight);
      gradient.addColorStop(0, '#7772f3');
      gradient.addColorStop(1, '#4e46d9');
      context.fillStyle = gradient;
      context.fillRect(x, y, barWidth, barHeight);
      context.fillStyle = '#4b4d5d';
      context.font = '500 18px system-ui, sans-serif';
      context.save();
      context.translate(x + barWidth / 2, plotTop + plotHeight + 26);
      context.rotate(-Math.PI / 5);
      context.fillText(point.label.slice(0, 12), 0, 0);
      context.restore();
      context.fillStyle = '#171824';
      context.font = '600 17px system-ui, sans-serif';
      context.fillText(String(point.value), x, Math.max(115, y - 10));
    });
    canvas.toBlob((blob) => {
      if (blob) downloadToolboxBlob(blob, `${safeFileBase(primaryDataset.value?.name || '')}-chart.png`);
    }, 'image/png');
  }

  watch(activeToolId, async () => {
    resetOutcome();
    initializeControls();
    if (isQualityTool.value && primaryDataset.value) await runTool();
  });

  watch(
    () => [props.toolId, route.query.mode] as const,
    () => {
      const mode = resolveMode(props.toolId);
      if (mode !== activeToolId.value) activeToolId.value = mode;
    },
  );
</script>

<style scoped lang="less">
  .dataset-workbench {
    display: grid;
    grid-template-columns: minmax(190px, 220px) minmax(0, 1fr);
    align-items: start;
    gap: 18px;
  }

  .dataset-workbench__surface {
    min-width: 0;
    display: grid;
    gap: 16px;
  }

  .dataset-operation-rail {
    position: sticky;
    top: 16px;
    min-width: 0;
    padding: 14px;
    display: grid;
    gap: 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--card-background);
  }

  .dataset-operation-rail > header {
    display: grid;
    gap: 4px;
  }

  .dataset-operation-rail > header > span {
    color: var(--primary-color);
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0.08em;
  }

  .dataset-operation-rail > header > strong {
    color: var(--text-color);
    font-size: 15px;
  }

  .dataset-operation-rail > header > small {
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.5;
  }

  .dataset-operation-rail__items {
    display: grid;
    gap: 6px;
  }

  .dataset-operation {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 62px;
    padding: 7px 8px;
    overflow: hidden;
    box-sizing: border-box;
    justify-content: flex-start;
    border: 1px solid transparent;
    border-radius: 12px;
    color: var(--desc-color);
    text-align: left;
    background: transparent;
  }

  .dataset-operation > span:first-child {
    width: 32px;
    height: 32px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 9px;
    color: currentColor;
    background: var(--workspace-panel-bg-color);
  }

  .dataset-operation > span:last-child {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .dataset-operation strong,
  .dataset-operation small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dataset-operation strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .dataset-operation small {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: 9px;
    line-height: 1.35;
    white-space: normal;
  }

  .dataset-operation.is-selected {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--primary-light-color, rgba(97, 92, 237, 0.08));
  }

  .dataset-operation.is-selected strong {
    color: var(--primary-color);
  }

  .dataset-operation.is-selected > span:first-child {
    color: #fff;
    background: var(--primary-color);
  }

  .dataset-mode-select {
    display: none;
  }

  .dataset-stagebar {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .dataset-stagebar.is-quality {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dataset-stage {
    min-width: 0;
    min-height: 66px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    gap: 11px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    color: var(--desc-color);
    background: var(--card-background);
    transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      background-color 0.18s ease;
  }

  .dataset-stage > span {
    width: 30px;
    height: 30px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 750;
  }

  .dataset-stage > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .dataset-stage strong,
  .dataset-stage small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dataset-stage strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .dataset-stage small {
    font-size: 11px;
  }

  .dataset-stage.is-active,
  .dataset-stage.is-complete {
    border-color: rgba(97, 92, 237, 0.55);
  }

  .dataset-stage.is-active > span {
    border-color: var(--primary-color);
    color: #fff;
    background: var(--primary-color);
  }

  .dataset-stage.is-complete > span {
    border-color: var(--success-color);
    color: var(--success-color);
    background: var(--card-background);
  }

  .dataset-empty {
    min-height: 350px;
    padding: 44px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    box-sizing: border-box;
    border: 1px dashed rgba(97, 92, 237, 0.48);
    border-radius: 20px;
    text-align: center;
    background: radial-gradient(circle at 50% 10%, rgba(97, 92, 237, 0.12), transparent 40%), var(--card-background);
  }

  .dataset-empty__icon {
    width: 72px;
    height: 72px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(97, 92, 237, 0.4);
    border-radius: 20px;
    color: var(--primary-color);
    background: var(--card-background);
    box-shadow: 0 18px 50px rgba(73, 67, 190, 0.14);
  }

  .dataset-empty > div {
    max-width: 560px;
    display: grid;
    justify-items: center;
    gap: 8px;
  }

  .dataset-empty h2,
  .dataset-empty p {
    margin: 0;
  }

  .dataset-empty h2 {
    font-size: clamp(22px, 2.2vw, 30px);
  }

  .dataset-empty p,
  .dataset-empty > small {
    color: var(--desc-color);
    line-height: 1.65;
  }

  .dataset-sourcebar {
    padding: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
  }

  .dataset-sourcebar__files,
  .dataset-sourcebar__actions {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .dataset-sourcebar__files {
    min-width: 0;
    flex: 1;
  }

  .dataset-sourcebar__files article {
    min-width: 0;
    max-width: 360px;
    padding: 8px 10px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }

  .dataset-sourcebar__files article > span:first-child {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--card-background);
  }

  .dataset-sourcebar__files article > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .dataset-sourcebar__files strong,
  .dataset-sourcebar__files small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dataset-sourcebar__files small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .dataset-studio {
    display: grid;
    grid-template-columns: minmax(260px, 0.34fr) minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }
  .dataset-studio.is-quality {
    grid-template-columns: minmax(0, 1fr);
  }

  .dataset-control-card,
  .dataset-canvas {
    min-width: 0;
    padding: 18px;
    display: grid;
    gap: 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--card-background);
  }

  .dataset-control-card {
    position: sticky;
    top: 16px;
  }

  .dataset-control-card__head,
  .dataset-canvas__head > div:first-child {
    display: grid;
    gap: 5px;
  }

  .dataset-control-card__head > span,
  .dataset-canvas__head > div:first-child > span {
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .dataset-control-card h2,
  .dataset-control-card p,
  .dataset-canvas h2,
  .dataset-canvas p {
    margin: 0;
  }

  .dataset-control-card h2,
  .dataset-canvas h2 {
    font-size: 19px;
  }

  .dataset-control-card p,
  .dataset-canvas p {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }

  .dataset-field {
    display: grid;
    gap: 7px;
  }

  .dataset-field label {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 650;
  }

  .dataset-checkboxes {
    display: grid;
    gap: 4px;
  }

  .dataset-checkboxes.is-inline {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dataset-checkboxes :deep(.b-checkbox) {
    min-height: 38px;
    padding: 7px 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
  }

  .dataset-control-note,
  .dataset-result-banner,
  .dataset-split-summary,
  .dataset-validation-summary {
    padding: 11px 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 12px;
    line-height: 1.55;
  }

  .dataset-control-note :deep(.svg-icon),
  .dataset-result-banner :deep(.svg-icon),
  .dataset-split-summary :deep(.svg-icon),
  .dataset-validation-summary :deep(.svg-icon) {
    flex: 0 0 auto;
    color: var(--primary-color);
  }

  .dataset-control-note.is-security :deep(.svg-icon),
  .dataset-validation-summary.is-valid :deep(.svg-icon) {
    color: var(--success-color);
  }

  .dataset-rule-list {
    display: grid;
    gap: 7px;
  }

  .dataset-rule-list article {
    padding: 8px 9px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
  }

  .dataset-rule-list article > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .dataset-rule-list small {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dataset-control-card__action {
    padding-top: 14px;
    display: grid;
    gap: 8px;
    border-top: 1px solid var(--surface-border-color);
  }

  .dataset-control-card__action small {
    color: var(--desc-color);
    font-size: 10px;
    text-align: center;
  }

  .dataset-canvas__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .dataset-canvas__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .dataset-canvas__actions :deep(.b-select) {
    min-width: 90px;
  }

  .dataset-error {
    padding: 11px 13px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    border: 1px solid var(--danger-color, #dc3e4d);
    border-radius: 12px;
    color: var(--danger-color, #dc3e4d);
  }
  .dataset-error > .b_btn {
    margin-left: auto;
  }

  .dataset-quality-loading {
    min-height: 220px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 9px;
    color: var(--desc-color);
    text-align: center;
  }
  .dataset-quality-loading p {
    max-width: 440px;
    font-size: 11px;
  }

  .dataset-error > div,
  .dataset-result-banner > div,
  .dataset-split-summary > div,
  .dataset-validation-summary > div {
    display: grid;
    gap: 2px;
  }

  .dataset-error span,
  .dataset-result-banner small,
  .dataset-split-summary small,
  .dataset-validation-summary small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .dataset-preview-note {
    color: var(--desc-color);
    font-size: 11px;
    text-align: right;
  }

  .dataset-quality-summary,
  .dataset-diff-summary {
    display: grid;
    grid-template-columns: 1.2fr repeat(3, minmax(0, 1fr));
    gap: 9px;
  }

  .dataset-quality-summary > div,
  .dataset-diff-summary > div {
    min-height: 86px;
    padding: 12px;
    display: grid;
    align-content: center;
    gap: 4px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--workspace-panel-bg-color);
  }

  .dataset-quality-summary span,
  .dataset-diff-summary span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .dataset-quality-summary strong,
  .dataset-diff-summary strong {
    font-size: 24px;
  }

  .dataset-quality-score {
    grid-template-columns: 1fr auto auto;
    align-items: end;
  }

  .dataset-quality-score span {
    grid-column: 1 / -1;
  }

  .dataset-quality-score.is-good strong {
    color: var(--success-color);
  }

  .dataset-quality-score.is-medium strong {
    color: var(--warning-color);
  }

  .dataset-quality-score.is-risk strong {
    color: var(--danger-color, #dc3e4d);
  }

  .dataset-profile-list,
  .dataset-change-list,
  .dataset-issue-list,
  .dataset-split-list {
    display: grid;
    gap: 7px;
  }

  .dataset-profile-list article {
    padding: 9px 11px;
    display: grid;
    grid-template-columns: minmax(150px, 1.3fr) minmax(90px, 0.5fr) minmax(90px, 0.5fr) minmax(100px, 1fr);
    align-items: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
  }

  .dataset-profile-list__name {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .dataset-profile-list__name strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dataset-profile-list article > span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .dataset-profile-list__bar {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--workspace-panel-bg-color);
  }

  .dataset-profile-list__bar i {
    height: 100%;
    display: block;
    border-radius: inherit;
    background: #615ced;
  }

  .dataset-diff-summary > div {
    border-left-width: 3px;
  }

  .dataset-diff-summary .is-added {
    border-left-color: var(--success-color);
  }

  .dataset-diff-summary .is-changed {
    border-left-color: var(--warning-color);
  }

  .dataset-diff-summary .is-removed {
    border-left-color: var(--danger-color, #dc3e4d);
  }

  .dataset-change-list article,
  .dataset-split-list article {
    padding: 9px 11px;
    display: grid;
    grid-template-columns: minmax(120px, 0.7fr) minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid var(--surface-border-color);
  }

  .dataset-change-list article > span,
  .dataset-split-list article > span {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dataset-validation-summary.is-valid {
    border-color: var(--success-color);
  }

  .dataset-issue-list article {
    padding: 8px 10px;
    display: grid;
    grid-template-columns: 36px minmax(100px, 0.55fr) minmax(110px, 0.5fr) minmax(0, 1fr);
    align-items: center;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
  }

  .dataset-issue-list article > span {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--danger-color, #dc3e4d);
    background: var(--workspace-panel-bg-color);
    font-size: 11px;
    font-weight: 700;
  }

  .dataset-issue-list small {
    color: var(--desc-color);
  }

  .dataset-issue-list code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dataset-chart {
    min-height: 430px;
    padding: 18px;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 18px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: linear-gradient(rgba(97, 92, 237, 0.035) 1px, transparent 1px), var(--card-background);
    background-size: 100% 48px;
  }

  .dataset-chart > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dataset-chart > header span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .dataset-chart__plot {
    min-width: 0;
  }

  .dataset-chart.is-vertical .dataset-chart__plot {
    height: 340px;
    display: flex;
    align-items: end;
    gap: 10px;
  }

  .dataset-chart.is-vertical article {
    min-width: 0;
    height: 100%;
    display: grid;
    flex: 1;
    grid-template-rows: 1fr auto auto;
    align-items: end;
    justify-items: center;
    gap: 5px;
  }

  .dataset-chart.is-vertical article i {
    width: min(42px, 75%);
    min-height: 3px;
    display: block;
    border-radius: 7px 7px 2px 2px;
    background: linear-gradient(180deg, #8b87f6, #5149d8);
    box-shadow: 0 8px 20px rgba(81, 73, 216, 0.18);
  }

  .dataset-chart.is-horizontal .dataset-chart__plot {
    display: grid;
    gap: 8px;
  }

  .dataset-chart.is-horizontal article {
    display: grid;
    grid-template-columns: minmax(90px, 0.3fr) minmax(0, 1fr) 70px;
    align-items: center;
    gap: 10px;
  }

  .dataset-chart.is-horizontal article i {
    height: 18px;
    display: block;
    border-radius: 3px 8px 8px 3px;
    background: linear-gradient(90deg, #5149d8, #8b87f6);
  }

  .dataset-chart__label {
    overflow: hidden;
    max-width: 100%;
    color: var(--desc-color);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dataset-chart article b {
    font-size: 10px;
  }

  @media (hover: hover) and (pointer: fine) {
    .dataset-operation:hover {
      border-color: var(--surface-border-color);
      color: var(--primary-color);
      background: var(--workspace-panel-bg-color);
    }

    .dataset-operation.is-selected:hover {
      border-color: var(--primary-color);
      background: var(--primary-light-color, rgba(97, 92, 237, 0.08));
    }

    .dataset-stage:hover {
      transform: translateY(-1px);
      border-color: rgba(97, 92, 237, 0.5);
    }
  }

  @media (max-width: 1100px) {
    .dataset-workbench {
      grid-template-columns: 180px minmax(0, 1fr);
    }

    .dataset-studio {
      grid-template-columns: 1fr;
    }

    .dataset-control-card {
      position: static;
    }
  }

  @media (max-width: 767px) {
    .dataset-workbench {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }

    .dataset-operation-rail {
      display: none;
    }

    .dataset-mode-select {
      padding: 12px;
      display: grid;
      gap: 7px;
      border: 1px solid var(--surface-border-color);
      border-radius: 14px;
      background: var(--card-background);
    }

    .dataset-mode-select label {
      color: var(--desc-color);
      font-size: 11px;
      font-weight: 650;
    }

    .dataset-stagebar {
      grid-template-columns: 1fr;
    }
    .dataset-stagebar.is-quality {
      grid-template-columns: 1fr;
    }

    .dataset-stage {
      min-height: 56px;
    }

    .dataset-empty {
      min-height: 300px;
      padding: 32px 16px;
    }

    .dataset-sourcebar,
    .dataset-sourcebar__files,
    .dataset-sourcebar__actions,
    .dataset-canvas__head,
    .dataset-canvas__actions {
      align-items: stretch;
      flex-direction: column;
    }

    .dataset-sourcebar__files article {
      max-width: none;
    }
    .dataset-error > .b_btn {
      margin-left: 0;
    }

    .dataset-control-card,
    .dataset-canvas {
      padding: 14px;
      border-radius: 15px;
    }

    .dataset-quality-summary,
    .dataset-diff-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dataset-profile-list article {
      grid-template-columns: 1fr 1fr;
    }

    .dataset-profile-list__bar {
      grid-column: 1 / -1;
    }

    .dataset-change-list article,
    .dataset-issue-list article {
      grid-template-columns: 36px minmax(0, 1fr);
    }

    .dataset-change-list article > span,
    .dataset-change-list article > :deep(.b-chip),
    .dataset-issue-list article code {
      grid-column: 2;
    }

    .dataset-chart.is-vertical .dataset-chart__plot {
      gap: 4px;
    }
  }

  html.light-note-mobile-rendering .dataset-stage,
  html.light-note-mobile-rendering .dataset-operation-rail,
  html.light-note-mobile-rendering .dataset-mode-select,
  html.light-note-mobile-rendering .dataset-empty,
  html.light-note-mobile-rendering .dataset-sourcebar,
  html.light-note-mobile-rendering .dataset-control-card,
  html.light-note-mobile-rendering .dataset-canvas {
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .dataset-stage {
      transition: none;
    }
  }
</style>

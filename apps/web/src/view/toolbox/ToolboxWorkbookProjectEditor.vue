<template>
  <main class="workbook-project-editor">
    <BLoading
      v-if="loading"
      class="workbook-project-editor__center"
      inline
      loading
      :title="t('toolboxProject.workbook.editor.loading')"
    />
    <section v-else-if="loadError" class="workbook-project-editor__center is-error" role="alert">
      <SvgIcon :src="icon.toolbox.task" size="28" />
      <strong>{{ t('toolboxProject.workbook.editor.loadFailed') }}</strong>
      <span>{{ t('toolboxProject.workbook.editor.loadFailedHint') }}</span>
      <div class="workbook-project-editor__error-actions">
        <BButton @click="goBack">
          {{ t('toolboxProject.workbook.back') }}
        </BButton>
        <BButton type="primary" @click="loadProject">{{ t('common.retry') }}</BButton>
      </div>
    </section>

    <template v-else-if="project && draftWorkbook">
      <header class="workbook-editor-toolbar">
        <BButton class="workbook-editor-toolbar__back" :aria-label="t('toolboxProject.workbook.back')" @click="goBack">
          <SvgIcon :src="icon.toolbox.back" size="18" />
        </BButton>
        <label class="workbook-visually-hidden" for="workbook-project-title">{{
          t('toolboxProject.workbook.editor.titleLabel')
        }}</label>
        <BInput
          id="workbook-project-title"
          v-model:value="draftTitle"
          class="workbook-editor-toolbar__title"
          :maxlength="200"
          :placeholder="t('toolboxProject.workbook.untitled')"
        />
        <BChip :tone="saveTone" class="workbook-editor-toolbar__state">{{ saveLabel }}</BChip>
        <div class="workbook-editor-toolbar__actions">
          <BButton size="small" @click="exportCsv">
            <SvgIcon :src="icon.toolbox.download" size="15" />{{ t('toolboxProject.workbook.editor.exportCsv') }}
          </BButton>
          <BButton size="small" :loading="exportingXlsx" @click="exportXlsx">
            <SvgIcon :src="icon.toolbox.download" size="15" />{{ t('toolboxProject.workbook.editor.exportXlsx') }}
          </BButton>
          <BButton v-if="saveState === 'conflict'" size="small" @click="confirmReloadLatest">
            {{ t('toolboxProject.workbook.editor.reloadLatest') }}
          </BButton>
          <BButton v-else-if="saveState === 'failed'" size="small" @click="saveNow">
            {{ t('common.retry') }}
          </BButton>
          <BButton v-if="isMobileLayout" size="small" @click="versionsOpen = true">
            <SvgIcon :src="icon.noteDetail.history" size="15" />{{ t('toolboxProject.versions.title') }}
          </BButton>
          <BButton
            type="primary"
            size="small"
            :loading="saveState === 'saving'"
            :disabled="saveState === 'conflict'"
            @click="saveNow"
          >
            <SvgIcon :src="icon.noteDetail.saveLine" size="15" />{{ t('toolboxProject.workbook.editor.save') }}
          </BButton>
        </div>
      </header>

      <div class="workbook-editor-notices">
        <div v-if="saveState === 'conflict'" class="workbook-conflict" role="alert">
          <div>
            <strong>{{ t('toolboxProject.workbook.editor.conflictTitle') }}</strong>
            <span>{{
              t(
                localDraftProtected
                  ? 'toolboxProject.workbook.editor.conflictDescription'
                  : 'toolboxProject.workbook.editor.conflictDescriptionUnprotected',
              )
            }}</span>
          </div>
          <div class="workbook-conflict__actions">
            <BButton size="small" :loading="exportingXlsx" @click="exportXlsx">
              {{ t('toolboxProject.workbook.editor.exportDraft') }}
            </BButton>
            <BButton type="primary" size="small" @click="confirmReloadLatest">
              {{ t('toolboxProject.workbook.editor.reloadLatest') }}
            </BButton>
          </div>
        </div>
        <div v-if="!localDraftProtected" class="workbook-draft-warning" role="alert">
          <div>
            <strong>{{ t('toolboxProject.workbook.editor.draftUnprotectedTitle') }}</strong>
            <span>{{ t('toolboxProject.workbook.editor.draftUnprotectedDescription') }}</span>
          </div>
          <div class="workbook-conflict__actions">
            <BButton size="small" @click="exportCsv">{{ t('toolboxProject.workbook.editor.exportCsv') }}</BButton>
            <BButton size="small" :loading="exportingXlsx" @click="exportXlsx">
              {{ t('toolboxProject.workbook.editor.exportXlsx') }}
            </BButton>
          </div>
        </div>
      </div>

      <div class="workbook-editor-layout">
        <section class="workbook-editor-canvas" :aria-label="t('toolboxProject.workbook.editor.gridLabel')">
          <nav class="workbook-ribbon" :aria-label="t('toolboxProject.workbook.editor.ribbonLabel')">
            <div class="workbook-ribbon__group">
              <span>{{ t('toolboxProject.workbook.editor.format') }}</span>
              <BButton
                size="small"
                :class="{ 'is-active': activeCellStyle.bold }"
                :aria-pressed="Boolean(activeCellStyle.bold)"
                :aria-label="t('toolboxProject.workbook.editor.bold')"
                @click="toggleSelectionStyle('bold')"
              >
                <SvgIcon :src="icon.noteDetail.toolbar.bold" size="16" />
              </BButton>
              <BButton
                size="small"
                :class="{ 'is-active': activeCellStyle.italic }"
                :aria-pressed="Boolean(activeCellStyle.italic)"
                :aria-label="t('toolboxProject.workbook.editor.italic')"
                @click="toggleSelectionStyle('italic')"
              >
                <SvgIcon :src="icon.noteDetail.toolbar.italic" size="16" />
              </BButton>
              <BButton
                size="small"
                :class="{ 'is-active': activeCellStyle.underline }"
                :aria-pressed="Boolean(activeCellStyle.underline)"
                :aria-label="t('toolboxProject.workbook.editor.underline')"
                @click="toggleSelectionStyle('underline')"
              >
                <SvgIcon :src="icon.noteDetail.toolbar.underline" size="16" />
              </BButton>
              <BSelect
                class="workbook-ribbon__select"
                :value="activeCellStyle.numberFormat || 'general'"
                :options="numberFormatOptions"
                :aria-label="t('toolboxProject.workbook.editor.numberFormat')"
                @change="applySelectionStyle({ numberFormat: $event })"
              />
              <BSelect
                class="workbook-ribbon__select is-compact"
                :value="activeCellStyle.align || 'left'"
                :options="alignmentOptions"
                :aria-label="t('toolboxProject.workbook.editor.alignment')"
                @change="applySelectionStyle({ align: $event })"
              />
              <BSelect
                class="workbook-ribbon__select is-compact"
                :value="activeCellStyle.fillColor || ''"
                :options="cellFillOptions"
                :aria-label="t('toolboxProject.workbook.editor.fillColor')"
                @change="applySelectionStyle({ fillColor: $event || undefined })"
              />
            </div>
            <div class="workbook-ribbon__group">
              <span>{{ t('toolboxProject.workbook.editor.structure') }}</span>
              <BButton size="small" @click="insertSelectedRow">
                <SvgIcon :src="icon.noteDetail.table_insert_top" size="15" />
                {{ t('toolboxProject.workbook.editor.insertRow') }}
              </BButton>
              <BButton size="small" @click="insertSelectedColumn">
                <SvgIcon :src="icon.noteDetail.table_insert_left" size="15" />
                {{ t('toolboxProject.workbook.editor.insertColumn') }}
              </BButton>
              <BButton size="small" class="is-danger" @click="confirmDeleteSelectedRow">
                {{ t('toolboxProject.workbook.editor.deleteRow') }}
              </BButton>
              <BButton size="small" class="is-danger" @click="confirmDeleteSelectedColumn">
                {{ t('toolboxProject.workbook.editor.deleteColumn') }}
              </BButton>
            </div>
            <div class="workbook-ribbon__group">
              <span>{{ t('toolboxProject.workbook.editor.data') }}</span>
              <BButton
                size="small"
                :disabled="selectedRange.startRow === selectedRange.endRow"
                @click="sortSelection('ascending')"
              >
                {{ t('toolboxProject.workbook.editor.sortAscending') }}
              </BButton>
              <BButton
                size="small"
                :disabled="selectedRange.startRow === selectedRange.endRow"
                @click="sortSelection('descending')"
              >
                {{ t('toolboxProject.workbook.editor.sortDescending') }}
              </BButton>
              <BButton
                size="small"
                :class="{ 'is-active': Boolean(activeSheet?.view?.freezeRows) }"
                @click="toggleFreezeRows"
              >
                {{
                  activeSheet?.view?.freezeRows
                    ? t('toolboxProject.workbook.editor.unfreezeRows')
                    : t('toolboxProject.workbook.editor.freezeRows')
                }}
              </BButton>
              <BButton
                size="small"
                :class="{ 'is-active': Boolean(activeSheet?.view?.freezeColumns) }"
                @click="toggleFreezeColumns"
              >
                {{
                  activeSheet?.view?.freezeColumns
                    ? t('toolboxProject.workbook.editor.unfreezeColumns')
                    : t('toolboxProject.workbook.editor.freezeColumns')
                }}
              </BButton>
              <BButton size="small" @click="clearSelection">
                {{ t('toolboxProject.workbook.editor.clearSelection') }}
              </BButton>
            </div>
          </nav>
          <div class="workbook-formula-bar">
            <label class="workbook-visually-hidden" for="workbook-cell-address">{{
              t('toolboxProject.workbook.editor.address')
            }}</label>
            <BInput
              id="workbook-cell-address"
              v-model:value="addressDraft"
              class="workbook-formula-bar__address"
              :aria-label="t('toolboxProject.workbook.editor.address')"
              submit-on-enter
              @enter="jumpToAddress"
              @blur="normalizeAddressDraft"
            />
            <span class="workbook-formula-bar__fx" aria-hidden="true">fx</span>
            <label class="workbook-visually-hidden" for="workbook-formula-input">{{
              t('toolboxProject.workbook.editor.formulaLabel')
            }}</label>
            <BInput
              id="workbook-formula-input"
              ref="formulaInput"
              v-model:value="formulaDraft"
              class="workbook-formula-bar__input"
              :placeholder="t('toolboxProject.workbook.editor.formulaPlaceholder')"
              @input="applyFormulaDraft"
              @enter="focusSelectedCell"
            />
          </div>

          <div class="workbook-grid-window" :aria-label="t('toolboxProject.workbook.editor.windowNavigation')">
            <span>{{ gridWindowLabel }} · {{ selectedRangeLabel }}</span>
            <div>
              <BButton size="small" :disabled="rowWindowStart === 1" @click="moveRowWindow(-1)">
                {{ t('toolboxProject.workbook.editor.previousRows') }}
              </BButton>
              <BButton size="small" :disabled="rowWindowStart >= LAST_ROW_WINDOW_START" @click="moveRowWindow(1)">
                {{ t('toolboxProject.workbook.editor.nextRows') }}
              </BButton>
              <BButton size="small" :disabled="columnWindowStart === 1" @click="moveColumnWindow(-1)">
                {{ t('toolboxProject.workbook.editor.previousColumns') }}
              </BButton>
              <BButton
                size="small"
                :disabled="columnWindowStart >= LAST_COLUMN_WINDOW_START"
                @click="moveColumnWindow(1)"
              >
                {{ t('toolboxProject.workbook.editor.nextColumns') }}
              </BButton>
            </div>
          </div>

          <div class="workbook-grid-scroll">
            <div
              class="workbook-grid"
              role="grid"
              :aria-label="t('toolboxProject.workbook.editor.gridLabel')"
              :aria-rowcount="totalRows + 1"
              :aria-colcount="totalColumns + 1"
            >
              <div class="workbook-grid__header-row" role="row" aria-rowindex="1">
                <div class="workbook-grid__corner" role="columnheader" aria-colindex="1" aria-label=""></div>
                <div
                  v-for="column in visibleColumns"
                  :key="`header-${column}`"
                  class="workbook-grid__column-header"
                  role="columnheader"
                  :aria-colindex="column + 1"
                >
                  {{ workbookColumnLabel(column) }}
                </div>
              </div>
              <div
                v-for="row in visibleRows"
                :key="`row-${row}`"
                class="workbook-grid__row"
                role="row"
                :aria-rowindex="row + 1"
              >
                <div class="workbook-grid__row-header" role="rowheader" aria-colindex="1">{{ row }}</div>
                <div
                  v-for="column in visibleColumns"
                  :key="workbookCellAddress(row, column)"
                  class="workbook-grid__cell"
                  :class="{
                    'is-selected': selectedCell === workbookCellAddress(row, column),
                    'is-in-range': cellIsInSelectedRange(row, column),
                    'is-frozen-row': cellIsFrozenRow(row),
                    'is-frozen-column': cellIsFrozenColumn(column),
                    'has-value': Boolean(activeSheet?.cells[workbookCellAddress(row, column)]),
                    'has-formula': Boolean(activeSheet?.cells[workbookCellAddress(row, column)]?.formula),
                  }"
                  :style="workbookGridCellStyle(row, column)"
                  role="gridcell"
                  :aria-colindex="column + 1"
                  :tabindex="selectedCell === workbookCellAddress(row, column) ? 0 : -1"
                  :aria-selected="cellIsInSelectedRange(row, column)"
                  :aria-label="cellAriaLabel(row, column)"
                  @pointerdown="beginRangeSelection($event, row, column)"
                  @pointerenter="extendRangeSelection(row, column)"
                  @dblclick="editCell(row, column)"
                  @keydown="handleCellKeydown($event, row, column)"
                >
                  {{ workbookCellDisplay(activeSheet?.cells[workbookCellAddress(row, column)]) }}
                </div>
              </div>
            </div>
          </div>

          <footer class="workbook-sheet-bar">
            <div
              class="workbook-sheet-bar__tabs"
              role="tablist"
              :aria-label="t('toolboxProject.workbook.editor.sheets')"
            >
              <BButton
                v-for="sheet in draftWorkbook.sheets"
                :key="sheet.id"
                size="small"
                class="workbook-sheet-tab"
                :class="{ 'is-active': sheet.id === activeSheet?.id }"
                role="tab"
                :aria-selected="sheet.id === activeSheet?.id"
                @click="selectSheet(sheet.id)"
              >
                {{ sheet.name }}
              </BButton>
              <BButton size="small" class="workbook-sheet-bar__add" @click="addSheet">
                {{ t('toolboxProject.workbook.editor.addSheet') }}
              </BButton>
            </div>
            <div class="workbook-sheet-bar__manage">
              <BInput
                v-model:value="sheetNameDraft"
                :maxlength="100"
                :placeholder="t('toolboxProject.workbook.editor.sheetNamePlaceholder')"
                submit-on-enter
                @enter="commitSheetName"
                @blur="commitSheetName"
              />
              <BButton
                size="small"
                type="danger"
                :disabled="draftWorkbook.sheets.length <= 1"
                @click="confirmDeleteSheet"
              >
                <SvgIcon :src="icon.toolbox.delete" size="14" />{{ t('toolboxProject.workbook.editor.deleteSheet') }}
              </BButton>
            </div>
          </footer>
        </section>

        <aside v-if="!isMobileLayout" class="workbook-editor-versions">
          <header>
            <SvgIcon :src="icon.noteDetail.history" size="18" />
            <strong>{{ t('toolboxProject.versions.title') }}</strong>
          </header>
          <ToolboxProjectVersions
            :items="revisions"
            :loading="versionsLoading"
            :has-more="Boolean(versionsCursor)"
            :loading-more="versionsLoadingMore"
            :error="versionsError"
            :naming="namingVersion"
            :current-revision="project.currentRevision"
            :restoring-revision="restoringRevision"
            @retry="loadVersions()"
            @load-more="loadMoreVersions"
            @name="createNamedVersion"
            @restore="confirmRestore"
          />
        </aside>
      </div>

      <BDrawer
        v-if="isMobileLayout"
        :open="versionsOpen"
        :title="t('toolboxProject.versions.title')"
        width="100%"
        mobile-full-screen
        mobile-centered-header
        body-padding="16px"
        @close="versionsOpen = false"
      >
        <ToolboxProjectVersions
          :items="revisions"
          :loading="versionsLoading"
          :has-more="Boolean(versionsCursor)"
          :loading-more="versionsLoadingMore"
          :error="versionsError"
          :naming="namingVersion"
          :current-revision="project.currentRevision"
          :restoring-revision="restoringRevision"
          @retry="loadVersions()"
          @load-more="loadMoreVersions"
          @name="createNamedVersion"
          @restore="confirmRestore"
        />
      </BDrawer>
    </template>
  </main>
</template>

<script setup lang="ts">
  import {
    PRODUCTION_WORKBOOK_MAX_COLUMNS,
    PRODUCTION_WORKBOOK_MAX_ROWS,
    type ProductionWorkbookCellStyleV1,
  } from '@lightnote/shared/production-project-protocol';
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue';
  import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { useUserStore } from '@/store';
  import icon from '@/config/icon';
  import { downloadToolboxBlob } from '@/utils/toolboxLocal';
  import {
    ProductionWorkbookExportError,
    exportProductionWorkbookCsv,
    exportProductionWorkbookXlsx,
  } from '@/utils/productionProjectWorkbookExport';
  import {
    cloneProductionWorkbook,
    applyWorkbookCellStyle,
    clearWorkbookRange,
    createWorkbookSheet,
    deleteWorkbookColumns,
    deleteWorkbookRows,
    insertWorkbookColumns,
    insertWorkbookRows,
    parseWorkbookFormulaBarValue,
    workbookCellAddress,
    workbookCellDisplay,
    workbookColumnLabel,
    workbookFormulaBarValue,
    parseWorkbookCellAddress,
    recalculateWorkbookSheet,
    sortWorkbookRange,
    workbookSelectionRange,
    workbookUsedRange,
  } from '@/utils/productionWorkbookEditor';
  import {
    readProductionProjectDraft,
    removeProductionProjectDraft,
    replaceProductionProjectWithLatest,
    shouldOfferProductionProjectDraftRecovery,
    writeProductionProjectDraft,
    type ProductionProjectLocalDraft,
  } from '@/utils/productionProjectDraftRecovery';
  import ToolboxProjectVersions from './components/ToolboxProjectVersions.vue';
  import {
    createToolboxProjectClientRequestId,
    fetchToolboxProject,
    fetchToolboxProjectRevisionsPage,
    isToolboxProjectConflict,
    normalizeToolboxWorkbookContent,
    openToolboxProject,
    restoreToolboxProjectRevision,
    saveToolboxProjectRevision,
    updateToolboxProject,
    type ToolboxProjectDetail,
    type ToolboxProjectRevisionSummary,
    type ToolboxProjectSummary,
    type ToolboxWorkbookContent,
  } from '@/api/toolboxProjects';

  type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict';
  type BInputExposed = { focus: () => void; select: () => void };
  const VISIBLE_ROW_COUNT = 80;
  const VISIBLE_COLUMN_COUNT = 26;
  const LAST_ROW_WINDOW_START =
    Math.floor((PRODUCTION_WORKBOOK_MAX_ROWS - 1) / VISIBLE_ROW_COUNT) * VISIBLE_ROW_COUNT + 1;
  const LAST_COLUMN_WINDOW_START =
    Math.floor((PRODUCTION_WORKBOOK_MAX_COLUMNS - 1) / VISIBLE_COLUMN_COUNT) * VISIBLE_COLUMN_COUNT + 1;
  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const isMobileLayout = useMobileLayout();
  const loading = ref(true);
  const loadError = ref(false);
  const project = ref<ToolboxProjectSummary | null>(null);
  const draftTitle = ref('');
  const draftWorkbook = ref<ToolboxWorkbookContent | null>(null);
  const savedTitle = ref('');
  const savedWorkbookJson = ref('');
  const hydrated = ref(false);
  const saveState = ref<SaveState>('idle');
  const selectedCell = ref('A1');
  const selectionAnchor = ref('A1');
  const selectionEnd = ref('A1');
  const selectionDragging = ref(false);
  const addressDraft = ref('A1');
  const formulaDraft = ref('');
  const formulaInput = ref<BInputExposed | null>(null);
  const sheetNameDraft = ref('');
  const revisions = ref<ToolboxProjectRevisionSummary[]>([]);
  const versionsLoading = ref(false);
  const versionsLoadingMore = ref(false);
  const versionsCursor = ref<string | null>(null);
  const versionsError = ref(false);
  const versionsOpen = ref(false);
  const namingVersion = ref(false);
  const restoringRevision = ref<number | null>(null);
  const exportingXlsx = ref(false);
  const draftRecoveryPending = ref(false);
  const reloadLatestPending = ref(false);
  const localDraftProtected = ref(true);
  const localDraftBaseVersion = ref<number | null>(null);
  const rowWindowStart = ref(1);
  const columnWindowStart = ref(1);
  let autosaveTimer: number | null = null;
  let activeSave: Promise<boolean> | null = null;

  const projectId = computed(() => String(route.params.projectId || ''));
  const draftOwnerId = computed(() => String(user.id || '').trim());
  const activeSheet = computed(() => {
    const workbook = draftWorkbook.value;
    if (!workbook?.sheets.length) return null;
    return workbook.sheets.find((sheet) => sheet.id === workbook.activeSheetId) || workbook.sheets[0];
  });
  const usedRange = computed(() => workbookUsedRange(activeSheet.value || undefined));
  const selectedPosition = computed(() => parseWorkbookCellAddress(selectedCell.value) || { row: 1, column: 1 });
  const selectedRange = computed(() => workbookSelectionRange(selectionAnchor.value, selectionEnd.value));
  const selectedRangeLabel = computed(() => {
    if (selectionAnchor.value === selectionEnd.value) return selectionAnchor.value;
    return `${workbookCellAddress(selectedRange.value.startRow, selectedRange.value.startColumn)}:${workbookCellAddress(
      selectedRange.value.endRow,
      selectedRange.value.endColumn,
    )}`;
  });
  const activeCellStyle = computed<ProductionWorkbookCellStyleV1>(
    () => activeSheet.value?.cells[selectedCell.value]?.style || {},
  );
  const totalRows = computed(() =>
    Math.min(
      PRODUCTION_WORKBOOK_MAX_ROWS,
      Math.max(
        VISIBLE_ROW_COUNT,
        rowWindowStart.value + VISIBLE_ROW_COUNT - 1,
        usedRange.value.maxRow + 20,
        selectedPosition.value.row + 20,
      ),
    ),
  );
  const totalColumns = computed(() =>
    Math.min(
      PRODUCTION_WORKBOOK_MAX_COLUMNS,
      Math.max(
        VISIBLE_COLUMN_COUNT,
        columnWindowStart.value + VISIBLE_COLUMN_COUNT - 1,
        usedRange.value.maxColumn + 5,
        selectedPosition.value.column + 5,
      ),
    ),
  );
  const visibleRows = computed(() =>
    Array.from(
      { length: Math.min(VISIBLE_ROW_COUNT, totalRows.value - rowWindowStart.value + 1) },
      (_, index) => rowWindowStart.value + index,
    ),
  );
  const visibleColumns = computed(() =>
    Array.from(
      { length: Math.min(VISIBLE_COLUMN_COUNT, totalColumns.value - columnWindowStart.value + 1) },
      (_, index) => columnWindowStart.value + index,
    ),
  );
  const gridWindowLabel = computed(() => {
    const lastRow = visibleRows.value.at(-1) || rowWindowStart.value;
    const firstColumn = workbookColumnLabel(columnWindowStart.value);
    const lastColumn = workbookColumnLabel(visibleColumns.value.at(-1) || columnWindowStart.value);
    return t('toolboxProject.workbook.editor.windowRange', {
      start: `${firstColumn}${rowWindowStart.value}`,
      end: `${lastColumn}${lastRow}`,
      used: usedRange.value.maxRow ? `${workbookColumnLabel(usedRange.value.maxColumn)}${usedRange.value.maxRow}` : '—',
    });
  });
  const currentWorkbookJson = computed(() => (draftWorkbook.value ? JSON.stringify(draftWorkbook.value) : ''));
  const dirty = computed(
    () => draftTitle.value !== savedTitle.value || currentWorkbookJson.value !== savedWorkbookJson.value,
  );
  const hasUnsavedDraft = computed(() => dirty.value || saveState.value === 'failed' || saveState.value === 'conflict');
  const saveTone = computed(() => {
    if (saveState.value === 'failed' || saveState.value === 'conflict') return 'danger' as const;
    if (saveState.value === 'saved') return 'success' as const;
    if (saveState.value === 'saving' || saveState.value === 'dirty') return 'pending' as const;
    return 'neutral' as const;
  });
  const saveLabel = computed(() => t(`toolboxProject.workbook.editor.state.${saveState.value}`));
  const numberFormatOptions = computed(() =>
    ['general', 'number', 'currency', 'percent', 'date'].map((value) => ({
      value,
      label: t(`toolboxProject.workbook.editor.numberFormats.${value}`),
    })),
  );
  const alignmentOptions = computed(() =>
    ['left', 'center', 'right'].map((value) => ({
      value,
      label: t(`toolboxProject.workbook.editor.alignments.${value}`),
    })),
  );
  const cellFillOptions = computed(() => [
    { value: '', label: t('toolboxProject.workbook.editor.noFill') },
    { value: '#fff4cc', label: t('toolboxProject.workbook.editor.fillYellow') },
    { value: '#e8f3ff', label: t('toolboxProject.workbook.editor.fillBlue') },
    { value: '#e7f7f1', label: t('toolboxProject.workbook.editor.fillGreen') },
    { value: '#f0efff', label: t('toolboxProject.workbook.editor.fillPurple') },
    { value: '#fff0f1', label: t('toolboxProject.workbook.editor.fillRed') },
  ]);

  function workbookValue(detail: ToolboxProjectDetail) {
    const content = cloneProductionWorkbook(normalizeToolboxWorkbookContent(detail.revision.content));
    if (!content.sheets.length) {
      const sheet = createWorkbookSheet('sheet-1', t('toolboxProject.workbook.sheetDefault', { number: 1 }));
      content.sheets.push(sheet);
      content.activeSheetId = sheet.id;
    }
    return content;
  }

  function clearAutosave() {
    if (autosaveTimer === null) return;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  function scheduleAutosave() {
    clearAutosave();
    if (!hydrated.value || draftRecoveryPending.value || !dirty.value || saveState.value === 'conflict') return;
    saveState.value = 'dirty';
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      void persistRevision('autosave');
    }, 1500);
  }

  function updateFormulaDraft() {
    formulaDraft.value = workbookFormulaBarValue(activeSheet.value?.cells[selectedCell.value]);
  }

  function applyProject(detail: ToolboxProjectDetail, replaceDraft: boolean) {
    project.value = detail.project;
    const content = workbookValue(detail);
    if (replaceDraft) {
      draftTitle.value = detail.project.title || t('toolboxProject.workbook.untitled');
      draftWorkbook.value = cloneProductionWorkbook(content);
      selectCell(1, 1);
      rowWindowStart.value = 1;
      columnWindowStart.value = 1;
    }
    savedTitle.value = detail.project.title || t('toolboxProject.workbook.untitled');
    savedWorkbookJson.value = JSON.stringify(content);
    sheetNameDraft.value = activeSheet.value?.name || '';
    updateFormulaDraft();
  }

  function readLocalDraft() {
    return readProductionProjectDraft<ToolboxWorkbookContent>(
      window.localStorage,
      draftOwnerId.value,
      'workbook',
      projectId.value,
    );
  }

  function persistLocalDraft() {
    if (!hydrated.value || draftRecoveryPending.value || !project.value || !draftWorkbook.value) {
      return localDraftProtected.value;
    }
    localDraftProtected.value = writeProductionProjectDraft(window.localStorage, draftOwnerId.value, {
      projectType: 'workbook',
      projectId: projectId.value,
      title: draftTitle.value,
      content: normalizeToolboxWorkbookContent(draftWorkbook.value),
      baseVersion: localDraftBaseVersion.value ?? project.value.version,
      serverUpdatedAt: project.value.updatedAt,
      updatedAt: Date.now(),
    });
    return localDraftProtected.value;
  }

  function clearLocalDraft() {
    removeProductionProjectDraft(window.localStorage, draftOwnerId.value, 'workbook', projectId.value);
    localDraftProtected.value = true;
    localDraftBaseVersion.value = null;
  }

  function offerLocalDraftRecovery(localDraft: ProductionProjectLocalDraft<ToolboxWorkbookContent>) {
    draftRecoveryPending.value = true;
    Alert.alert({
      title: t('toolboxProject.editor.recoveryTitle'),
      content: t('toolboxProject.editor.recoveryDescription'),
      okText: t('toolboxProject.editor.recoverDraft'),
      cancelText: t('toolboxProject.editor.ignoreDraft'),
      onOk: () => {
        localDraftBaseVersion.value = localDraft.baseVersion;
        saveState.value = localDraft.baseVersion === project.value?.version ? 'dirty' : 'conflict';
        draftTitle.value = localDraft.title;
        draftWorkbook.value = cloneProductionWorkbook(localDraft.content);
        selectCell(1, 1);
        rowWindowStart.value = 1;
        columnWindowStart.value = 1;
        sheetNameDraft.value = activeSheet.value?.name || '';
        updateFormulaDraft();
        draftRecoveryPending.value = false;
        persistLocalDraft();
        if (saveState.value !== 'conflict') scheduleAutosave();
      },
      onCancel: () => {
        clearLocalDraft();
        draftRecoveryPending.value = false;
      },
    });
  }

  async function loadProject() {
    clearAutosave();
    loading.value = true;
    loadError.value = false;
    hydrated.value = false;
    try {
      const discardLocalDraft = reloadLatestPending.value;
      const detail = discardLocalDraft
        ? await replaceProductionProjectWithLatest(
            () => fetchToolboxProject(projectId.value),
            (latest) => applyProject(latest, true),
            clearLocalDraft,
          )
        : await fetchToolboxProject(projectId.value);
      if (!discardLocalDraft) applyProject(detail, true);
      saveState.value = 'saved';
      hydrated.value = true;
      if (discardLocalDraft) {
        reloadLatestPending.value = false;
      } else {
        const localDraft = readLocalDraft();
        if (
          shouldOfferProductionProjectDraftRecovery(localDraft, {
            projectType: 'workbook',
            title: draftTitle.value,
            content: draftWorkbook.value!,
            version: detail.project.version,
            updatedAt: detail.project.updatedAt,
          })
        ) {
          offerLocalDraftRecovery(localDraft!);
        } else if (localDraft) {
          clearLocalDraft();
        }
      }
      void openToolboxProject(projectId.value).catch(() => undefined);
      void loadVersions();
    } catch {
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function persistRevision(changeKind: 'autosave' | 'named', label?: string): Promise<boolean> {
    clearAutosave();
    if (!project.value || !draftWorkbook.value) return false;
    if (activeSave) {
      await activeSave;
      if (saveState.value === 'conflict') return false;
    }
    if (!project.value || !draftWorkbook.value) return false;
    const titleSnapshot = draftTitle.value.trim() || t('toolboxProject.workbook.untitled');
    const contentSnapshot = normalizeToolboxWorkbookContent(cloneProductionWorkbook(draftWorkbook.value));
    const contentSnapshotJson = JSON.stringify(contentSnapshot);
    const titleChanged = titleSnapshot !== savedTitle.value;
    const contentChanged = contentSnapshotJson !== savedWorkbookJson.value;
    let baseProject = project.value;
    saveState.value = 'saving';

    const request = (async () => {
      if (titleChanged) {
        baseProject = await updateToolboxProject(projectId.value, {
          expectedVersion: baseProject.version,
          title: titleSnapshot,
        });
        project.value = baseProject;
        savedTitle.value = titleSnapshot;
      }
      if (!contentChanged && changeKind !== 'named') return null;
      return saveToolboxProjectRevision(projectId.value, {
        clientRequestId: createToolboxProjectClientRequestId(
          changeKind === 'named' ? 'workbook-version' : 'workbook-save',
        ),
        expectedVersion: baseProject.version,
        expectedRevision: baseProject.currentRevision,
        changeKind,
        label,
        content: contentSnapshot,
      });
    })();

    activeSave = request
      .then((detail) => {
        if (detail) {
          project.value = detail.project;
          savedWorkbookJson.value = contentSnapshotJson;
          void loadVersions();
        }
        savedTitle.value = titleSnapshot;
        if (draftTitle.value === titleSnapshot && currentWorkbookJson.value === contentSnapshotJson) clearLocalDraft();
        else {
          localDraftBaseVersion.value = null;
          persistLocalDraft();
        }
        saveState.value = dirty.value ? 'dirty' : 'saved';
        return true;
      })
      .catch((error: unknown) => {
        localDraftBaseVersion.value = baseProject.version;
        saveState.value = isToolboxProjectConflict(error) ? 'conflict' : 'failed';
        persistLocalDraft();
        return false;
      })
      .finally(() => {
        activeSave = null;
      });
    const succeeded = await activeSave;
    if (succeeded && dirty.value) scheduleAutosave();
    return succeeded;
  }

  async function saveNow() {
    await persistRevision('autosave');
  }

  function confirmReloadLatest() {
    Alert.alert({
      title: t('toolboxProject.workbook.editor.reloadTitle'),
      content: t('toolboxProject.workbook.editor.reloadDescription'),
      okText: t('toolboxProject.workbook.editor.reloadLatest'),
      cancelText: t('common.cancel'),
      onOk: () => {
        reloadLatestPending.value = true;
        void loadProject();
      },
    });
  }

  async function loadVersions({ append = false }: { append?: boolean } = {}) {
    if (append) {
      if (!versionsCursor.value || versionsLoadingMore.value) return;
      versionsLoadingMore.value = true;
    } else {
      versionsLoading.value = true;
      versionsError.value = false;
    }
    try {
      const page = await fetchToolboxProjectRevisionsPage(projectId.value, {
        limit: 30,
        cursor: append ? versionsCursor.value : null,
      });
      if (append) {
        const merged = new Map(revisions.value.map((revision) => [revision.id, revision]));
        page.items.forEach((revision) => merged.set(revision.id, revision));
        revisions.value = [...merged.values()];
      } else {
        revisions.value = page.items;
      }
      versionsCursor.value = page.nextCursor;
    } catch {
      if (append) message.error(t('toolboxProject.versions.loadMoreFailed'));
      else versionsError.value = true;
    } finally {
      if (append) versionsLoadingMore.value = false;
      else versionsLoading.value = false;
    }
  }

  function loadMoreVersions() {
    void loadVersions({ append: true });
  }

  async function createNamedVersion(label: string) {
    namingVersion.value = true;
    const succeeded = await persistRevision('named', label);
    if (succeeded) await loadVersions();
    namingVersion.value = false;
  }

  function confirmRestore(revision: ToolboxProjectRevisionSummary) {
    const createCheckpoint = hasUnsavedDraft.value;
    Alert.alert({
      title: t('toolboxProject.versions.restoreTitle'),
      content: createCheckpoint
        ? t('toolboxProject.workbook.editor.restoreDirtyDescription', { number: revision.revision })
        : t('toolboxProject.versions.restoreDescription', { number: revision.revision }),
      okText: t('toolboxProject.versions.restore'),
      cancelText: t('common.cancel'),
      onOk: () => void restoreRevision(revision, createCheckpoint),
    });
  }

  async function restoreRevision(revision: ToolboxProjectRevisionSummary, createCheckpoint = false) {
    if (!project.value) return;
    restoringRevision.value = revision.revision;
    clearAutosave();
    try {
      if (createCheckpoint) {
        const checkpointSaved = await persistRevision('named', t('toolboxProject.editor.restoreCheckpointLabel'));
        if (!checkpointSaved) {
          message.error(t('toolboxProject.editor.restoreCheckpointFailed'));
          return;
        }
      }
      const detail = await restoreToolboxProjectRevision(projectId.value, revision.revision, {
        clientRequestId: createToolboxProjectClientRequestId('workbook-restore'),
        expectedVersion: project.value.version,
        expectedRevision: project.value.currentRevision,
        sourceRevisionId: revision.id,
      });
      clearLocalDraft();
      applyProject(detail, true);
      saveState.value = 'saved';
      await loadVersions();
      versionsOpen.value = false;
    } catch (error) {
      saveState.value = isToolboxProjectConflict(error) ? 'conflict' : 'failed';
      persistLocalDraft();
    } finally {
      restoringRevision.value = null;
    }
  }

  function markWorkbookDirty() {
    if (!hydrated.value) return;
    saveState.value = 'dirty';
    persistLocalDraft();
    scheduleAutosave();
  }

  function selectCell(row: number, column: number, extendRange = false) {
    selectedCell.value = workbookCellAddress(row, column);
    if (extendRange) selectionEnd.value = selectedCell.value;
    else {
      selectionAnchor.value = selectedCell.value;
      selectionEnd.value = selectedCell.value;
    }
    addressDraft.value = selectedCell.value;
    updateFormulaDraft();
  }

  function beginRangeSelection(event: PointerEvent, row: number, column: number) {
    if (event.button !== 0) return;
    selectCell(row, column, event.shiftKey);
    selectionDragging.value = true;
    window.addEventListener('pointerup', finishRangeSelection, { once: true });
    void nextTick(focusSelectedCell);
  }

  function extendRangeSelection(row: number, column: number) {
    if (!selectionDragging.value) return;
    selectCell(row, column, true);
  }

  function finishRangeSelection() {
    selectionDragging.value = false;
    window.removeEventListener('pointerup', finishRangeSelection);
  }

  function cellIsInSelectedRange(row: number, column: number) {
    const range = selectedRange.value;
    return row >= range.startRow && row <= range.endRow && column >= range.startColumn && column <= range.endColumn;
  }

  function cellIsFrozenRow(row: number) {
    return rowWindowStart.value === 1 && row <= (activeSheet.value?.view?.freezeRows || 0);
  }

  function cellIsFrozenColumn(column: number) {
    return columnWindowStart.value === 1 && column <= (activeSheet.value?.view?.freezeColumns || 0);
  }

  function workbookGridCellStyle(row: number, column: number): CSSProperties {
    const cell = activeSheet.value?.cells[workbookCellAddress(row, column)];
    const style = cell?.style || {};
    const frozenRow = cellIsFrozenRow(row);
    const frozenColumn = cellIsFrozenColumn(column);
    return {
      fontWeight: style.bold ? 700 : undefined,
      fontStyle: style.italic ? 'italic' : undefined,
      textDecoration: style.underline ? 'underline' : undefined,
      color: style.textColor || undefined,
      background: style.fillColor || undefined,
      textAlign: style.align || undefined,
      whiteSpace: style.wrapText ? 'normal' : undefined,
      position: frozenRow || frozenColumn ? 'sticky' : undefined,
      top: frozenRow ? `calc(31px + ${(row - 1) * 31}px)` : undefined,
      left: frozenColumn
        ? `${(isMobileLayout.value ? 43 : 49) + (column - 1) * (isMobileLayout.value ? 107 : 121)}px`
        : undefined,
      zIndex: frozenRow && frozenColumn ? 4 : frozenRow || frozenColumn ? 2 : undefined,
    };
  }

  function applySelectionStyle(patch: Partial<ProductionWorkbookCellStyleV1>) {
    const sheet = activeSheet.value;
    if (!sheet) return;
    applyWorkbookCellStyle(sheet, selectedRange.value, patch);
    markWorkbookDirty();
  }

  function toggleSelectionStyle(field: 'bold' | 'italic' | 'underline') {
    applySelectionStyle({ [field]: !activeCellStyle.value[field] });
  }

  function insertSelectedRow() {
    const sheet = activeSheet.value;
    if (!sheet) return;
    if (!insertWorkbookRows(sheet, selectedRange.value.startRow)) {
      message.error(t('toolboxProject.workbook.editor.structureFailed'));
      return;
    }
    selectCell(selectedRange.value.startRow, selectedRange.value.startColumn);
    markWorkbookDirty();
  }

  function insertSelectedColumn() {
    const sheet = activeSheet.value;
    if (!sheet) return;
    if (!insertWorkbookColumns(sheet, selectedRange.value.startColumn)) {
      message.error(t('toolboxProject.workbook.editor.structureFailed'));
      return;
    }
    selectCell(selectedRange.value.startRow, selectedRange.value.startColumn);
    markWorkbookDirty();
  }

  function confirmDeleteSelectedRow() {
    if (!activeSheet.value) return;
    Alert.alert({
      title: t('toolboxProject.workbook.editor.deleteRowTitle'),
      content: t('toolboxProject.workbook.editor.deleteRowDescription', { row: selectedRange.value.startRow }),
      okText: t('toolboxProject.workbook.editor.deleteRow'),
      cancelText: t('common.cancel'),
      onOk: deleteSelectedRow,
    });
  }

  function deleteSelectedRow() {
    const sheet = activeSheet.value;
    if (!sheet || !deleteWorkbookRows(sheet, selectedRange.value.startRow)) return;
    selectCell(Math.min(selectedRange.value.startRow, PRODUCTION_WORKBOOK_MAX_ROWS), selectedRange.value.startColumn);
    markWorkbookDirty();
  }

  function confirmDeleteSelectedColumn() {
    if (!activeSheet.value) return;
    Alert.alert({
      title: t('toolboxProject.workbook.editor.deleteColumnTitle'),
      content: t('toolboxProject.workbook.editor.deleteColumnDescription', {
        column: workbookColumnLabel(selectedRange.value.startColumn),
      }),
      okText: t('toolboxProject.workbook.editor.deleteColumn'),
      cancelText: t('common.cancel'),
      onOk: deleteSelectedColumn,
    });
  }

  function deleteSelectedColumn() {
    const sheet = activeSheet.value;
    if (!sheet || !deleteWorkbookColumns(sheet, selectedRange.value.startColumn)) return;
    selectCell(
      selectedRange.value.startRow,
      Math.min(selectedRange.value.startColumn, PRODUCTION_WORKBOOK_MAX_COLUMNS),
    );
    markWorkbookDirty();
  }

  function sortSelection(direction: 'ascending' | 'descending') {
    const sheet = activeSheet.value;
    if (!sheet || !sortWorkbookRange(sheet, selectedRange.value, selectedPosition.value.column, direction)) return;
    updateFormulaDraft();
    markWorkbookDirty();
  }

  function clearSelection() {
    const sheet = activeSheet.value;
    if (!sheet) return;
    clearWorkbookRange(sheet, selectedRange.value);
    updateFormulaDraft();
    markWorkbookDirty();
  }

  function ensureActiveSheetView() {
    const sheet = activeSheet.value;
    if (!sheet) return null;
    if (!sheet.view) sheet.view = { freezeRows: 0, freezeColumns: 0 };
    return sheet.view;
  }

  function toggleFreezeRows() {
    const view = ensureActiveSheetView();
    if (!view) return;
    view.freezeRows = view.freezeRows ? 0 : Math.max(1, selectedRange.value.startRow - 1);
    markWorkbookDirty();
  }

  function toggleFreezeColumns() {
    const view = ensureActiveSheetView();
    if (!view) return;
    view.freezeColumns = view.freezeColumns ? 0 : Math.max(1, selectedRange.value.startColumn - 1);
    markWorkbookDirty();
  }

  function ensureCellWindow(row: number, column: number) {
    rowWindowStart.value = Math.floor((Math.max(1, row) - 1) / VISIBLE_ROW_COUNT) * VISIBLE_ROW_COUNT + 1;
    columnWindowStart.value = Math.floor((Math.max(1, column) - 1) / VISIBLE_COLUMN_COUNT) * VISIBLE_COLUMN_COUNT + 1;
  }

  function jumpToAddress() {
    const parsed = parseWorkbookCellAddress(addressDraft.value);
    if (!parsed) {
      addressDraft.value = selectedCell.value;
      return;
    }
    ensureCellWindow(parsed.row, parsed.column);
    selectCell(parsed.row, parsed.column);
    void nextTick(focusSelectedCell);
  }

  function normalizeAddressDraft() {
    if (!parseWorkbookCellAddress(addressDraft.value)) addressDraft.value = selectedCell.value;
  }

  function moveRowWindow(direction: -1 | 1) {
    const nextStart = Math.max(
      1,
      Math.min(LAST_ROW_WINDOW_START, rowWindowStart.value + direction * VISIBLE_ROW_COUNT),
    );
    rowWindowStart.value = nextStart;
    selectCell(nextStart, columnWindowStart.value);
  }

  function moveColumnWindow(direction: -1 | 1) {
    const nextStart = Math.max(
      1,
      Math.min(LAST_COLUMN_WINDOW_START, columnWindowStart.value + direction * VISIBLE_COLUMN_COUNT),
    );
    columnWindowStart.value = nextStart;
    selectCell(rowWindowStart.value, nextStart);
  }

  function editCell(row: number, column: number) {
    selectCell(row, column);
    void nextTick(() => {
      formulaInput.value?.focus();
      formulaInput.value?.select();
    });
  }

  function applyFormulaDraft(value: string | number) {
    const sheet = activeSheet.value;
    if (!sheet) return;
    const parsed = parseWorkbookFormulaBarValue(String(value ?? ''), sheet.cells[selectedCell.value]);
    if (parsed) sheet.cells[selectedCell.value] = parsed;
    else delete sheet.cells[selectedCell.value];
    recalculateWorkbookSheet(sheet, [selectedCell.value]);
    markWorkbookDirty();
  }

  function cellAriaLabel(row: number, column: number) {
    const address = workbookCellAddress(row, column);
    const value = workbookCellDisplay(activeSheet.value?.cells[address]);
    return value ? `${address}: ${value}` : address;
  }

  function focusSelectedCell() {
    const selected = document.querySelector<HTMLElement>('.workbook-grid__cell.is-selected');
    selected?.focus();
  }

  function handleCellKeydown(event: KeyboardEvent, row: number, column: number) {
    const next = { row, column };
    if ((event.metaKey || event.ctrlKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      const field = event.key.toLowerCase() === 'b' ? 'bold' : event.key.toLowerCase() === 'i' ? 'italic' : 'underline';
      toggleSelectionStyle(field);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clearSelection();
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      editCell(row, column);
      return;
    }
    if (event.key === 'ArrowUp') next.row = Math.max(1, row - 1);
    else if (event.key === 'ArrowDown') next.row = Math.min(PRODUCTION_WORKBOOK_MAX_ROWS, row + 1);
    else if (event.key === 'ArrowLeft') next.column = Math.max(1, column - 1);
    else if (event.key === 'ArrowRight') next.column = Math.min(PRODUCTION_WORKBOOK_MAX_COLUMNS, column + 1);
    else return;
    event.preventDefault();
    if (
      next.row < rowWindowStart.value ||
      next.row >= rowWindowStart.value + VISIBLE_ROW_COUNT ||
      next.column < columnWindowStart.value ||
      next.column >= columnWindowStart.value + VISIBLE_COLUMN_COUNT
    ) {
      ensureCellWindow(next.row, next.column);
    }
    selectCell(next.row, next.column, event.shiftKey);
    void nextTick(focusSelectedCell);
  }

  function uniqueSheetId() {
    return `sheet-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  }

  function addSheet() {
    if (!draftWorkbook.value || draftWorkbook.value.sheets.length >= 100) return;
    const number = draftWorkbook.value.sheets.length + 1;
    const sheet = createWorkbookSheet(uniqueSheetId(), t('toolboxProject.workbook.sheetDefault', { number }));
    draftWorkbook.value.sheets.push(sheet);
    draftWorkbook.value.activeSheetId = sheet.id;
    selectCell(1, 1);
    rowWindowStart.value = 1;
    columnWindowStart.value = 1;
    sheetNameDraft.value = sheet.name;
    formulaDraft.value = '';
    markWorkbookDirty();
  }

  function selectSheet(sheetId: string) {
    if (!draftWorkbook.value || draftWorkbook.value.activeSheetId === sheetId) return;
    draftWorkbook.value.activeSheetId = sheetId;
    selectCell(1, 1);
    rowWindowStart.value = 1;
    columnWindowStart.value = 1;
    sheetNameDraft.value = activeSheet.value?.name || '';
    updateFormulaDraft();
    markWorkbookDirty();
  }

  function commitSheetName() {
    const sheet = activeSheet.value;
    if (!sheet) return;
    const name = sheetNameDraft.value.trim();
    if (!name) {
      sheetNameDraft.value = sheet.name;
      return;
    }
    if (name === sheet.name) return;
    sheet.name = name;
    sheetNameDraft.value = name;
    markWorkbookDirty();
  }

  function confirmDeleteSheet() {
    if (!draftWorkbook.value || draftWorkbook.value.sheets.length <= 1 || !activeSheet.value) return;
    Alert.alert({
      title: t('toolboxProject.workbook.editor.deleteSheetTitle'),
      content: t('toolboxProject.workbook.editor.deleteSheetDescription', { name: activeSheet.value.name }),
      okText: t('toolboxProject.workbook.editor.deleteSheet'),
      cancelText: t('common.cancel'),
      onOk: deleteActiveSheet,
    });
  }

  function deleteActiveSheet() {
    if (!draftWorkbook.value || draftWorkbook.value.sheets.length <= 1 || !activeSheet.value) return;
    const index = draftWorkbook.value.sheets.findIndex((sheet) => sheet.id === activeSheet.value?.id);
    draftWorkbook.value.sheets.splice(index, 1);
    const nextSheet = draftWorkbook.value.sheets[Math.min(index, draftWorkbook.value.sheets.length - 1)];
    draftWorkbook.value.activeSheetId = nextSheet.id;
    selectCell(1, 1);
    rowWindowStart.value = 1;
    columnWindowStart.value = 1;
    sheetNameDraft.value = nextSheet.name;
    updateFormulaDraft();
    markWorkbookDirty();
  }

  function exportCsv() {
    if (!draftWorkbook.value) return;
    try {
      const file = exportProductionWorkbookCsv(draftWorkbook.value, draftTitle.value);
      downloadToolboxBlob(file.blob, file.fileName);
      message.success(t('toolboxProject.workbook.editor.exportSuccess'));
    } catch (error) {
      message.error(
        error instanceof ProductionWorkbookExportError && error.code === 'WORKBOOK_CSV_RANGE_TOO_LARGE'
          ? t('toolboxProject.workbook.editor.csvRangeTooLarge')
          : t('toolboxProject.workbook.editor.exportFailed'),
      );
    }
  }

  async function exportXlsx() {
    if (!draftWorkbook.value || exportingXlsx.value) return;
    exportingXlsx.value = true;
    try {
      const file = await exportProductionWorkbookXlsx(draftWorkbook.value, draftTitle.value);
      downloadToolboxBlob(file.blob, file.fileName);
      message.success(t('toolboxProject.workbook.editor.exportSuccess'));
    } catch {
      message.error(t('toolboxProject.workbook.editor.exportFailed'));
    } finally {
      exportingXlsx.value = false;
    }
  }

  async function goBack() {
    const historyBack = router.options.history.state.back;
    if (typeof historyBack === 'string' && router.resolve(historyBack).name === 'toolboxWorkbookProjects') {
      router.back();
      return;
    }
    await router.replace({ name: 'toolboxWorkbookProjects' });
  }

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!dirty.value && saveState.value !== 'failed' && saveState.value !== 'conflict') return;
    persistLocalDraft();
    event.preventDefault();
    event.returnValue = '';
  }

  function confirmUnsafeLeave() {
    return new Promise<boolean>((resolve) => {
      Alert.alert({
        title: t('toolboxProject.editor.leaveTitle'),
        content: localDraftProtected.value
          ? t('toolboxProject.editor.leaveDescription')
          : t('toolboxProject.workbook.editor.leaveUnprotectedDescription'),
        okText: t('toolboxProject.editor.leaveAnyway'),
        cancelText: t('toolboxProject.editor.keepEditing'),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }

  watch(
    draftTitle,
    () => {
      persistLocalDraft();
      scheduleAutosave();
    },
    { flush: 'sync' },
  );
  watch(
    () => activeSheet.value?.id,
    () => {
      sheetNameDraft.value = activeSheet.value?.name || '';
      updateFormulaDraft();
    },
  );
  onMounted(() => {
    window.addEventListener('beforeunload', onBeforeUnload);
    void loadProject();
  });
  onBeforeUnmount(() => {
    clearAutosave();
    finishRangeSelection();
    window.removeEventListener('beforeunload', onBeforeUnload);
  });
  onBeforeRouteLeave(async () => {
    clearAutosave();
    persistLocalDraft();
    if (saveState.value === 'conflict' || saveState.value === 'failed') return confirmUnsafeLeave();
    if (dirty.value) {
      const saved = await persistRevision('autosave');
      if (!saved) return confirmUnsafeLeave();
    }
    return true;
  });
</script>

<style scoped lang="less">
  .workbook-project-editor {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
    color: var(--text-color);
    background: var(--background-color);
  }

  .workbook-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    white-space: nowrap;
    border: 0;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
  }

  .workbook-project-editor__center {
    grid-row: 1 / -1;
    align-self: center;
    justify-self: center;
    min-height: 240px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--desc-color);
    text-align: center;
  }

  .workbook-project-editor__center strong {
    color: var(--text-color);
    font-size: 18px;
  }

  .workbook-project-editor__center.is-error > svg {
    color: var(--error-color, #d9363e);
  }

  .workbook-project-editor__error-actions,
  .workbook-editor-toolbar__actions,
  .workbook-conflict__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .workbook-editor-toolbar {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(180px, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--surface-panel-bg, var(--background-color));
  }

  .workbook-editor-toolbar__back {
    width: 34px;
    padding: 0;
  }

  .workbook-editor-toolbar__title {
    min-width: 0;
    max-width: 520px;
  }

  .workbook-editor-toolbar__title :deep(.input-container),
  .workbook-editor-toolbar__title :deep(.b-input) {
    width: 100%;
  }

  .workbook-editor-toolbar__actions {
    justify-content: flex-end;
  }

  .workbook-editor-toolbar__actions :deep(.b_btn) {
    gap: 5px;
  }

  .workbook-conflict {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 9px 18px;
    color: var(--error-color, #c92a32);
    background: var(--chip-danger-bg, #fff1f2);
    border-bottom: 1px solid var(--chip-danger-border, #ffc2c7);
  }

  .workbook-editor-notices:empty {
    min-height: 0;
  }

  .workbook-draft-warning {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 9px 18px;
    color: #9a5b00;
    background: var(--chip-warning-bg, #fff8e6);
    border-bottom: 1px solid var(--chip-warning-border, #ffd591);
  }

  .workbook-draft-warning > div:first-child {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .workbook-draft-warning span {
    color: var(--desc-color);
    font-size: 12px;
  }

  .workbook-conflict > div:first-child {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .workbook-conflict span {
    color: var(--desc-color);
    font-size: 12px;
  }

  .workbook-editor-layout {
    width: min(1680px, 100%);
    min-width: 0;
    min-height: 0;
    margin: 0 auto;
    padding: 12px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 330px);
    gap: 12px;
    overflow: hidden;
  }

  .workbook-editor-canvas,
  .workbook-editor-versions {
    min-width: 0;
    min-height: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--surface-panel-bg, var(--background-color));
  }

  .workbook-editor-canvas {
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .workbook-ribbon {
    min-width: 0;
    display: flex;
    align-items: stretch;
    gap: 12px;
    padding: 7px 8px;
    overflow-x: auto;
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--surface-panel-bg, var(--background-color));
    overscroll-behavior-inline: contain;
  }

  .workbook-ribbon__group {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 5px;
    padding-right: 12px;
    border-right: 1px solid var(--surface-border-color);
  }

  .workbook-ribbon__group:last-child {
    padding-right: 0;
    border-right: 0;
  }

  .workbook-ribbon__group > span {
    margin-right: 2px;
    color: var(--desc-color);
    font-size: 10px;
    font-weight: 650;
  }

  .workbook-ribbon :deep(.b_btn) {
    gap: 4px;
  }

  .workbook-ribbon :deep(.b_btn.is-active) {
    color: #087b55;
    border-color: #16a071 !important;
    background: var(--success-soft-bg, #edf9f4) !important;
  }

  .workbook-ribbon .is-danger {
    color: var(--error-color, #d9363e);
  }

  .workbook-ribbon__select {
    width: 120px;
  }

  .workbook-ribbon__select.is-compact {
    width: 94px;
  }

  .workbook-formula-bar {
    display: grid;
    grid-template-columns: 82px auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--surface-muted-bg, var(--active-background-color));
  }

  .workbook-formula-bar__address :deep(.b-input) {
    text-align: center;
    font-weight: 650;
    background: var(--surface-panel-bg, var(--background-color));
  }

  .workbook-formula-bar__fx {
    color: #0c8c61;
    font-family: Georgia, serif;
    font-size: 15px;
    font-style: italic;
    font-weight: 700;
  }

  .workbook-formula-bar__input :deep(.b-input) {
    background: var(--surface-panel-bg, var(--background-color));
    border: 1px solid var(--surface-border-color) !important;
  }

  .workbook-formula-bar__input :deep(.b-input:focus-visible) {
    border-color: #16a071 !important;
    outline: 2px solid color-mix(in srgb, #16a071 22%, transparent);
  }

  .workbook-grid-window {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 5px 8px;
    border-bottom: 1px solid var(--surface-border-color);
    color: var(--desc-color);
    background: var(--surface-panel-bg, var(--background-color));
    font-size: 11px;
  }

  .workbook-grid-window > div {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .workbook-grid-scroll {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .workbook-grid {
    width: max-content;
    min-width: 100%;
    display: grid;
    grid-template-columns: 48px repeat(26, 120px);
    grid-auto-rows: 30px;
    background: var(--surface-border-color);
    gap: 1px;
  }

  .workbook-grid__header-row,
  .workbook-grid__row {
    display: contents;
  }

  .workbook-grid__corner,
  .workbook-grid__column-header,
  .workbook-grid__row-header,
  .workbook-grid__cell {
    min-width: 0;
    box-sizing: border-box;
    background: var(--surface-panel-bg, var(--background-color));
  }

  .workbook-grid__corner,
  .workbook-grid__column-header {
    position: sticky;
    top: 0;
    z-index: 3;
  }

  .workbook-grid__corner {
    left: 0;
    z-index: 5;
    background: var(--surface-muted-bg, var(--active-background-color));
  }

  .workbook-grid__column-header,
  .workbook-grid__row-header {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--desc-color);
    background: var(--surface-muted-bg, var(--active-background-color));
    font-size: 11px;
    font-weight: 650;
    user-select: none;
  }

  .workbook-grid__row-header {
    position: sticky;
    left: 0;
    z-index: 2;
  }

  .workbook-grid__cell {
    position: relative;
    padding: 5px 7px;
    overflow: hidden;
    color: var(--text-color);
    font-size: 12px;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: cell;
  }

  .workbook-grid__cell.has-formula::after {
    content: '';
    position: absolute;
    top: 2px;
    right: 2px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #16a071;
  }

  .workbook-grid__cell.is-selected {
    z-index: 1;
    color: var(--text-color);
    background: var(--surface-selected-bg, #effaf6);
    outline: 2px solid #16a071;
    outline-offset: -2px;
  }

  .workbook-grid__cell.is-in-range:not(.is-selected) {
    background: var(--surface-selected-bg, #effaf6);
    box-shadow: inset 0 0 0 1px rgba(22, 160, 113, 0.34);
  }

  .workbook-grid__cell.is-frozen-row,
  .workbook-grid__cell.is-frozen-column {
    box-shadow: inset 0 -2px 0 #16a071;
  }

  .workbook-grid__cell.is-frozen-column {
    box-shadow: inset -2px 0 0 #16a071;
  }

  .workbook-grid__cell.is-frozen-row.is-frozen-column {
    box-shadow: inset -2px -2px 0 #16a071;
  }

  .workbook-grid__cell:focus-visible:not(.is-selected) {
    outline: 2px solid var(--primary-color);
    outline-offset: -2px;
  }

  .workbook-sheet-bar {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(250px, 360px);
    gap: 12px;
    padding: 8px;
    border-top: 1px solid var(--surface-border-color);
    background: var(--surface-muted-bg, var(--active-background-color));
  }

  .workbook-sheet-bar__tabs {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
  }

  .workbook-sheet-tab {
    flex: 0 0 auto;
    border: 1px solid transparent !important;
  }

  .workbook-sheet-tab.is-active {
    color: #087b55;
    background: var(--success-soft-bg, #edf9f4);
    border-color: #16a071 !important;
    font-weight: 650;
  }

  .workbook-sheet-bar__add {
    flex: 0 0 auto;
    color: #087b55;
  }

  .workbook-sheet-bar__manage {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .workbook-sheet-bar__manage :deep(.b-input) {
    background: var(--surface-panel-bg, var(--background-color));
  }

  .workbook-sheet-bar__manage :deep(.b_btn) {
    gap: 5px;
  }

  .workbook-editor-versions {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    padding: 14px;
    overflow: hidden;
  }

  .workbook-editor-versions > header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 12px;
  }

  @media (max-width: 980px) {
    .workbook-editor-layout {
      grid-template-columns: minmax(0, 1fr) minmax(250px, 290px);
    }
    .workbook-sheet-bar {
      grid-template-columns: minmax(0, 1fr) 280px;
    }
  }

  @media (max-width: 767px) {
    .workbook-project-editor :deep(.b_btn.small_btn) {
      height: 44px;
      min-height: 44px;
      line-height: 44px;
    }
    .workbook-editor-toolbar {
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 7px;
      padding: 8px;
    }
    .workbook-editor-toolbar__state {
      justify-self: end;
    }
    .workbook-editor-toolbar__actions {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .workbook-editor-toolbar__actions :deep(.b_btn) {
      width: 100%;
      min-width: 0;
      padding-inline: 7px;
    }
    .workbook-conflict {
      align-items: stretch;
      flex-direction: column;
      gap: 8px;
      padding: 9px 10px;
    }
    .workbook-draft-warning {
      align-items: stretch;
      flex-direction: column;
      gap: 8px;
      padding: 9px 10px;
    }
    .workbook-conflict > div:first-child,
    .workbook-draft-warning > div:first-child {
      align-items: flex-start;
      flex-direction: column;
      gap: 3px;
    }
    .workbook-conflict__actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .workbook-conflict__actions :deep(.b_btn) {
      width: 100%;
    }
    .workbook-editor-layout {
      display: block;
      padding: 6px;
    }
    .workbook-editor-canvas {
      height: 100%;
      border-radius: 11px;
    }
    .workbook-formula-bar {
      grid-template-columns: 64px auto minmax(0, 1fr);
      gap: 5px;
      padding: 6px;
    }
    .workbook-ribbon {
      position: relative;
      padding: 6px;
    }
    .workbook-ribbon__group > span {
      position: sticky;
      left: 0;
      padding: 4px 6px;
      border-radius: 6px;
      background: var(--surface-panel-bg, var(--background-color));
    }
    .workbook-grid-window {
      align-items: stretch;
      flex-direction: column;
      gap: 5px;
    }
    .workbook-grid-window > div {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .workbook-grid-window :deep(.b_btn) {
      width: 100%;
      min-width: 0;
      padding-inline: 4px;
    }
    .workbook-grid {
      grid-template-columns: 42px repeat(26, 106px);
    }
    .workbook-sheet-bar {
      grid-template-columns: 1fr;
      gap: 7px;
      padding: 6px;
    }
    .workbook-sheet-bar__manage {
      grid-template-columns: minmax(0, 1fr) auto;
    }
  }

  :global(html.light-note-mobile-rendering .workbook-grid__cell.is-selected) {
    color: var(--text-color);
    background: var(--surface-selected-bg, #effaf6);
    outline: 2px solid #16a071;
  }

  :global(html.light-note-mobile-rendering .workbook-sheet-tab.is-active) {
    color: #087b55;
    border-color: #16a071 !important;
  }
</style>

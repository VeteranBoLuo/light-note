<template>
  <section class="comparison-result">
    <header class="comparison-toolbar">
      <BTabs
        v-model:active-tab="filter"
        variant="segment"
        :options="[
          { key: 'all', label: t('comparisonTable.all') },
          { key: 'review', label: t('comparisonTable.review'), badge: reviewCount },
        ]"
      />
      <div
        ><BButton size="small" :loading="exporting" @click="download('csv')">{{ t('comparisonTable.csv') }}</BButton
        ><BButton size="small" :loading="exporting" @click="download('xlsx')">{{
          t('comparisonTable.xlsx')
        }}</BButton></div
      >
    </header>
    <p class="comparison-hint">{{ t('comparisonTable.hint') }}</p>
    <p v-if="!rows.length">{{ t('comparisonTable.empty') }}</p>
    <template v-else-if="bookmark.isMobile || bookmark.isTablet">
      <article v-for="row in rows" :key="row.sourceId" class="comparison-mobile-row">
        <h3>{{ row.title }}</h3>
        <div v-for="(cell, index) in row.cells" :key="index" class="comparison-mobile-cell">
          <span>{{ table.columns[index].label }}</span>
          <BButton
            type="text"
            :class="{ 'needs-review': comparisonCellNeedsReview(cell) }"
            @click="inspect(row.sourceId, index)"
            >{{ cellValue(cell)
            }}<small v-if="cell.edited || cell.reviewed || (cell.value && cell.status !== 'found')">{{
              statusText(cell)
            }}</small></BButton
          >
        </div>
      </article>
    </template>
    <div v-else class="comparison-grid" v-auto-scrollbar>
      <BTable :data="rows" :columns="headers" row-key="sourceId">
        <template #bodyCell="{ record, column }">
          <strong v-if="column.key === 'title'">{{ record.title }}</strong>
          <BButton
            v-else
            type="text"
            class="comparison-cell"
            :class="{ 'needs-review': comparisonCellNeedsReview(record.cells[Number(column.key)]) }"
            @click="inspect(record.sourceId, Number(column.key))"
          >
            {{
              cellValue(record.cells[Number(column.key)])
            }}
            <small
              v-if="
                record.cells[Number(column.key)].edited ||
                record.cells[Number(column.key)].reviewed ||
                (record.cells[Number(column.key)].value && record.cells[Number(column.key)].status !== 'found')
              "
              >{{ statusText(record.cells[Number(column.key)]) }}</small
            >
          </BButton>
        </template>
      </BTable>
    </div>
    <p v-if="['saved', 'saving'].includes(artifact.save.status)" class="comparison-hint">{{
      t('comparisonTable.savedHint')
    }}</p>
    <BModal
      :visible="Boolean(selected)"
      :title="selected ? `${table.columns[selected.columnIndex].label} · ${selectedRow?.title}` : ''"
      width="min(var(--ui-layout-640, 640px), 94vw)"
      :close-disabled="saving"
      @close="close"
    >
      <div v-if="selectedCell" class="comparison-inspector">
        <label for="comparison-value">{{ t('comparisonTable.current') }}</label>
        <BInput
          id="comparison-value"
          v-model:value="draft"
          type="textarea"
          :rows="3"
          :maxlength="COMPARISON_CELL_MAX_CHARS"
          :disabled="saving || !editable"
        />
        <template v-if="selectedCell.edited"
          ><h4>{{ t('comparisonTable.original') }}</h4
          ><p>{{ selectedCell.originalValue || '—' }}</p></template
        >
        <h4>{{ t('comparisonTable.evidence') }}</h4>
        <blockquote v-for="(quote, index) in selectedCell.quotes" :key="index">{{ quote }}</blockquote>
        <p v-if="!selectedCell.quotes.length">{{ t('comparisonTable.noEvidence') }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
      </div>
      <template #footer
        ><div class="comparison-footer"
          ><BButton :disabled="saving" @click="close">{{ t('comparisonTable.close') }}</BButton
          ><BButton v-if="editable" type="primary" :loading="saving" @click="save">{{
            t('comparisonTable.save')
          }}</BButton></div
        ></template
      >
    </BModal>
  </section>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    comparisonCellNeedsReview,
    comparisonTableMarkdown,
    COMPARISON_CELL_MAX_CHARS,
    type ComparisonTable,
    type ComparisonCell,
  } from '@lightnote/shared/comparison-table';
  import { bookmarkStore, useUserStore } from '@/store';
  import { reviewToolboxComparison, type ToolboxArtifact } from '@/api/toolbox';
  import { comparisonExportRows, comparisonCsv } from '@/utils/comparisonTable';
  import { downloadToolboxBlob, safeDownloadBaseName } from '@/utils/toolboxLocal';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  const props = defineProps<{ artifact: ToolboxArtifact }>();
  const emit = defineEmits<{ updated: [ToolboxArtifact]; busy: [boolean] }>();
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const table = computed(() => props.artifact.meta.comparisonTable as ComparisonTable);
  const editable = computed(
    () => !user.adminContext && user.role !== 'visitor' && !['saved', 'saving'].includes(props.artifact.save.status),
  );
  const filter = ref('all');
  const selected = ref<{ sourceId: string; columnIndex: number; version: number } | null>(null);
  const selectedRow = computed(() => table.value.rows.find((row) => row.sourceId === selected.value?.sourceId));
  const selectedCell = computed(() => (selected.value ? selectedRow.value?.cells[selected.value.columnIndex] : null));
  const draft = ref('');
  const error = ref('');
  const saving = ref(false);
  const exporting = ref(false);
  let generation = 0;
  watch([() => props.artifact.id, () => user.id, () => user.adminContext], () => {
    generation++;
    selected.value = null;
    saving.value = false;
    emit('busy', false);
  });
  onBeforeUnmount(() => {
    generation++;
  });
  const rows = computed(() =>
    table.value.rows.filter((row) => filter.value === 'all' || row.cells.some(comparisonCellNeedsReview)),
  );
  const reviewCount = computed(() =>
    table.value.rows.reduce((sum, row) => sum + row.cells.filter(comparisonCellNeedsReview).length, 0),
  );
  const headers = computed(() => [
    { key: 'title', title: t('comparisonTable.source'), width: 'var(--ui-layout-200, 200px)', ellipsis: false },
    ...table.value.columns.map((col, i) => ({
      key: String(i),
      title: col.label,
      width: 'var(--ui-layout-180, 180px)',
      ellipsis: false,
    })),
  ]);
  function cellValue(cell: ComparisonCell) {
    return cell.value || (cell.edited ? '—' : t(`comparisonTable.${cell.status}`));
  }
  function statusText(cell: ComparisonCell) {
    return t(`comparisonTable.${cell.edited ? 'edited' : cell.reviewed ? 'reviewed' : cell.status}`);
  }
  function inspect(sourceId: string, columnIndex: number) {
    selected.value = { sourceId, columnIndex, version: props.artifact.version };
    draft.value = selectedCell.value?.value || '';
    error.value = '';
  }
  function close() {
    if (saving.value) return;
    if (editable.value && draft.value !== selectedCell.value?.value) {
      Alert.alert({
        title: t('comparisonTable.discard'),
        content: t('comparisonTable.discardHint'),
        okText: t('comparisonTable.confirmDiscard'),
        cancelText: t('comparisonTable.keep'),
        onOk: () => {
          selected.value = null;
        },
      });
    } else selected.value = null;
  }
  async function save() {
    if (!editable.value || !selected.value || saving.value) return;
    const artifact = props.artifact;
    const target = { ...selected.value };
    const value = draft.value.trim();
    const version = generation;
    saving.value = true;
    emit('busy', true);
    error.value = '';
    try {
      const receipt = await reviewToolboxComparison(artifact.id, { ...target, version: target.version, value });
      if (version !== generation) return;
      const updated: ToolboxArtifact = JSON.parse(JSON.stringify(artifact));
      const updatedTable = updated.meta.comparisonTable as ComparisonTable;
      const cell = updatedTable.rows.find((row) => row.sourceId === target.sourceId)!.cells[target.columnIndex];
      cell.originalValue ??= cell.value;
      cell.value = value;
      cell.edited = value !== cell.originalValue;
      cell.reviewed = true;
      updated.version = receipt.version;
      updated.content = comparisonTableMarkdown(updatedTable);
      emit('updated', updated);
      selected.value = null;
    } catch (cause: any) {
      if (version === generation)
        error.value = t(
          cause.code === 'TOOLBOX_COMPARISON_CONFLICT' ? 'comparisonTable.stale' : 'comparisonTable.failed',
        );
    } finally {
      if (version === generation) {
        saving.value = false;
        emit('busy', false);
      }
    }
  }
  async function download(format: 'csv' | 'xlsx') {
    if (exporting.value) return;
    exporting.value = true;
    const artifact = props.artifact;
    const exportGeneration = generation;
    const snapshot: ComparisonTable = JSON.parse(JSON.stringify(table.value));
    try {
      const rows = comparisonExportRows(snapshot, (key) => t(`comparisonTable.${key}`));
      let blob: Blob;
      if (format === 'csv') blob = new Blob([comparisonCsv(rows)], { type: 'text/csv;charset=utf-8' });
      else {
        const ExcelJS = (await import('exceljs')).default;
        const book = new ExcelJS.Workbook();
        book.addWorksheet(t('comparisonTable.table')).addRows(rows);
        const evidence = book.addWorksheet(t('comparisonTable.evidence'));
        evidence.addRow([
          t('comparisonTable.source'),
          t('comparisonTable.columns'),
          t('comparisonTable.current'),
          t('comparisonTable.original'),
          t('comparisonTable.exportStatus'),
          t('comparisonTable.evidence'),
        ]);
        for (const row of snapshot.rows)
          row.cells.forEach((cell, i) =>
            evidence.addRow([
              row.title,
              snapshot.columns[i].label,
              cell.value,
              cell.originalValue ?? cell.value,
              statusText(cell),
              cell.quotes.join('\n'),
            ]),
          );
        blob = new Blob([(await book.xlsx.writeBuffer()) as ArrayBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
      }
      if (exportGeneration !== generation) return;
      downloadToolboxBlob(blob, `${safeDownloadBaseName(artifact.title)}.${format}`);
    } catch {
      if (exportGeneration === generation) message.error(t('comparisonTable.exportFailed'));
    } finally {
      exporting.value = false;
    }
  }
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .comparison-footer {
    display: flex;
    justify-content: flex-end;
    gap: .ui-space(8px) [];
    padding: .ui-space(16px) [];
    border-top: 1px solid var(--surface-border-color);
  }
  .comparison-result {
    min-width: 0;
    padding: .ui-space(20px) [];
  }
  .comparison-toolbar,
  .comparison-toolbar > div {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .ui-space(8px) [];
  }
  .comparison-toolbar {
    justify-content: space-between;
  }
  .comparison-hint {
    color: var(--desc-color);
    font-size: .ui-font(13px) [];
    margin: .ui-space(12px) [] 0;
  }
  .comparison-grid {
    overflow-x: auto;
  }
  .comparison-grid :deep(.table-container) {
    width: max-content;
    min-width: 100%;
  }
  .comparison-grid :deep(.table-cell) {
    flex-shrink: 0;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .comparison-cell {
    width: 100%;
  }
  .comparison-cell,
  .comparison-mobile-cell :deep(.b_btn) {
    flex-direction: column;
    align-items: flex-start;
    gap: .ui-space(4px) [];
  }
  .comparison-cell,
  .comparison-mobile-cell :deep(.b_btn) {
    white-space: normal;
    height: auto;
    text-align: left;
  }
  .comparison-result :deep(.needs-review) {
    color: var(--warning-color);
  }
  .comparison-cell small,
  .comparison-mobile-cell small {
    display: block;
    font-size: .ui-font(12px) [];
  }
  .comparison-mobile-row {
    padding: .ui-space(16px) [] 0;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .comparison-mobile-row h3 {
    margin: 0 0 .ui-space(12px) [];
    font-size: .ui-font(15px) [];
    overflow-wrap: anywhere;
  }
  .comparison-mobile-cell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: .ui-space(12px) [];
    align-items: start;
    padding: .ui-space(8px) [] 0;
    overflow-wrap: anywhere;
  }
  .comparison-inspector {
    display: grid;
    gap: .ui-space(12px) [];
  }
  .comparison-inspector h4,
  .comparison-inspector p {
    margin: 0;
  }
  .comparison-inspector blockquote {
    margin: 0;
    padding: .ui-space(12px) [];
    border-left: 2px solid var(--primary-color);
    background: var(--hover-background);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>

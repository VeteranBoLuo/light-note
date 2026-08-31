import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function source(path: string) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
}

describe('电子表格工作室组件契约', () => {
  const editor = source('./ToolboxWorkbookProjectEditor.vue');
  const list = source('./ToolboxWorkbookProjects.vue');
  const routes = source('../../router/modules/toolbox.ts');
  const api = source('../../api/toolboxProjects.ts');

  it('使用独立 Workbook Project API，并严格分离标题 PATCH 与正文 revision', () => {
    expect(editor).toContain("from '@/api/toolboxProjects'");
    expect(editor).toContain('updateToolboxProject');
    expect(editor).toContain('saveToolboxProjectRevision');
    expect(editor).toContain('expectedVersion');
    expect(editor).toContain('expectedRevision');
    expect(api).toContain('createEmptyToolboxWorkbookContent');
    expect(api).toContain("normalizeProductionProjectContent(value, 'workbook')");
    expect(editor).not.toMatch(/api\/note|noteLibraryStore|useNoteTree/u);
  });

  it('提供真正的稀疏表格交互、显式公式和可访问超出首屏的已用区域', () => {
    expect(editor).toContain('role="grid"');
    expect(editor).toContain('role="row"');
    expect(editor).toContain('role="gridcell"');
    expect(editor).toContain('parseWorkbookFormulaBarValue');
    expect(editor).toContain('workbookUsedRange');
    expect(editor).toContain('parseWorkbookCellAddress');
    expect(editor).toContain('moveRowWindow');
    expect(editor).toContain('moveColumnWindow');
    expect(editor).toContain('handleCellKeydown');
    expect(editor).toContain('rowWindowStart.value + VISIBLE_ROW_COUNT - 1');
    expect(editor).toContain('columnWindowStart.value + VISIBLE_COLUMN_COUNT - 1');
    expect(editor).toContain(':aria-rowcount="totalRows + 1"');
    expect(editor).toContain(':aria-colcount="totalColumns + 1"');
    expect(editor).toContain('? 0 : -1');
    expect(editor).toContain('PRODUCTION_WORKBOOK_MAX_ROWS');
    expect(editor).toContain('PRODUCTION_WORKBOOK_MAX_COLUMNS');
    expect(editor).toContain('recalculateWorkbookSheet(sheet, [selectedCell.value])');
    expect(editor).not.toContain('recalculateProductionWorkbook');
  });

  it('支持工作表新增、删除、重命名和切换，并复用版本抽屉', () => {
    expect(editor).toContain('addSheet');
    expect(editor).toContain('confirmDeleteSheet');
    expect(editor).toContain('commitSheetName');
    expect(editor).toContain('selectSheet');
    expect(editor).toContain('<ToolboxProjectVersions');
    expect(editor).toContain('<BDrawer');
  });

  it('1.5 秒自动保存，本地草稿即时保留，冲突要求导出后再加载', () => {
    expect(editor).toContain('window.setTimeout');
    expect(editor).toContain('1500');
    expect(editor).toContain('writeProductionProjectDraft');
    expect(editor).toContain('shouldOfferProductionProjectDraftRecovery');
    expect(editor).toContain("{ flush: 'sync' }");
    expect(editor).toContain("window.addEventListener('beforeunload'");
    expect(editor).toContain('confirmUnsafeLeave');
    expect(editor).toContain('localDraftProtected.value = writeProductionProjectDraft');
    expect(editor).toContain('baseVersion: localDraftBaseVersion.value ?? project.value.version');
    expect(editor).toContain('draftRecoveryPending.value || !dirty.value');
    expect(editor).toContain('draftUnprotectedTitle');
    expect(editor).toContain('exportDraft');
    expect(editor).toContain('confirmReloadLatest');
    expect(editor).toContain('replaceProductionProjectWithLatest');
    expect(editor).toContain('reloadLatestPending.value = true');
    expect(editor).toContain('v-else-if="loadError"');
    expect(editor).toContain('@click="loadProject">{{ t(\'common.retry\') }}');
    const persistBlock = editor.slice(
      editor.indexOf('async function persistRevision'),
      editor.indexOf('async function saveNow'),
    );
    expect(persistBlock).toContain("saveState.value = isToolboxProjectConflict(error) ? 'conflict' : 'failed'");
    expect(persistBlock).toContain('persistLocalDraft();');
    const reloadLatestBlock = editor.slice(
      editor.indexOf('function confirmReloadLatest'),
      editor.indexOf('async function loadVersions'),
    );
    expect(reloadLatestBlock).not.toContain('clearLocalDraft()');
    expect(editor).toMatch(/clearLocalDraft\(\);\s*applyProject\(detail, true\)/u);
  });

  it('恢复历史版本前为所有未保存状态建立命名检查点，失败时中止并保留草稿', () => {
    expect(editor).toContain("dirty.value || saveState.value === 'failed' || saveState.value === 'conflict'");
    const restoreBlock = editor.slice(
      editor.indexOf('async function restoreRevision'),
      editor.indexOf('function markWorkbookDirty'),
    );
    const checkpointIndex = restoreBlock.indexOf("persistRevision('named'");
    const restoreIndex = restoreBlock.indexOf('restoreToolboxProjectRevision');
    expect(checkpointIndex).toBeGreaterThan(-1);
    expect(checkpointIndex).toBeLessThan(restoreIndex);
    expect(restoreBlock).toContain('if (!checkpointSaved)');
    expect(restoreBlock).toMatch(/if \(!checkpointSaved\) \{[\s\S]*?restoreCheckpointFailed[\s\S]*?return;/u);
    expect(restoreBlock.indexOf('clearLocalDraft();')).toBeGreaterThan(restoreIndex);
    expect(restoreBlock).toContain('persistLocalDraft();');
  });

  it('导出标准 XLSX 与当前工作表 CSV', () => {
    expect(editor).toContain('exportProductionWorkbookXlsx');
    expect(editor).toContain('exportProductionWorkbookCsv');
    expect(editor).toContain('downloadToolboxBlob');
    expect(editor).toContain('WORKBOOK_CSV_RANGE_TOO_LARGE');
    expect(editor).toContain('csvRangeTooLarge');
  });

  it('项目列表覆盖 loading、empty、error，并提供恢复工具箱滚动位置的返回入口', () => {
    expect(list).toContain('v-if="loading"');
    expect(list).toContain('v-else-if="loadError"');
    expect(list).toContain('projects.length === 0');
    expect(list).toContain('fetchToolboxProjectsPage');
    expect(list).toContain('loadMoreProjects');
    expect(editor).toContain('fetchToolboxProjectRevisionsPage');
    expect(editor).toContain('@load-more="loadMoreVersions"');
    expect(list).toContain('returnFromToolboxPage');
    expect(list).toContain('saveToolboxScrollSnapshot');
    expect(list).toContain('restoreToolboxScrollSnapshot');
    expect(list).toContain('icon.toolbox.workbookStudio');
  });

  it('项目列表提供空白、模板与本地数据导入三种生产入口', () => {
    expect(list).toContain('<BUpload');
    expect(list).toContain('productionProjectStartersFor');
    expect(list).toContain('productionProjectStarterCopy');
    expect(list).toContain('metadata: { templateId: starter.id }');
    expect(list).toContain('importProductionWorkbookFile');
    expect(list).toContain("changeKind: 'import'");
  });

  it('所有输入和按钮使用 B 组件，工作簿路由位于 toolId catchall 之前', () => {
    for (const component of [editor, list]) {
      expect(component).not.toMatch(/<(input|textarea|select|button)\b/u);
    }
    expect(editor).toContain('.workbook-project-editor :deep(.b_btn.small_btn)');
    expect(editor).toContain('min-height: 44px');
    const projectRoute = routes.indexOf("path: '/toolbox/project/workbooks'");
    const catchAllRoute = routes.indexOf("path: '/toolbox/:toolId'");
    expect(projectRoute).toBeGreaterThan(-1);
    expect(projectRoute).toBeLessThan(catchAllRoute);
  });
});

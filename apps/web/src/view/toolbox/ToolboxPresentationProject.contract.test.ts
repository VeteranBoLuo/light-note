import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function source(path: string) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
}

describe('演示文稿工作室组件契约', () => {
  const editor = source('./ToolboxPresentationProjectEditor.vue');
  const list = source('./ToolboxPresentationProjects.vue');
  const routes = source('../../router/modules/toolbox.ts');

  it('使用独立 Production Project API，并保持标题 PATCH 与正文 revision 分离', () => {
    expect(editor).toContain("from '@/api/toolboxProjects'");
    expect(editor).toContain('updateToolboxProject');
    expect(editor).toContain('saveToolboxProjectRevision');
    expect(editor).toContain('expectedVersion');
    expect(editor).toContain('expectedRevision');
    expect(editor).not.toMatch(/api\/note|noteLibraryStore|useNoteTree/u);
  });

  it('提供 1.5 秒快照自动保存、失败与持久化冲突草稿', () => {
    expect(editor).toContain('window.setTimeout');
    expect(editor).toContain('1500');
    expect(editor).toContain('contentSnapshot = clonePresentationContent');
    expect(editor).toContain("'failed' | 'conflict'");
    expect(editor).toContain('writeProductionProjectDraft');
    expect(editor).toContain('localDraftProtected');
    expect(editor).toContain('const protectedSuccessfully = writeProductionProjectDraft');
    expect(editor).toContain('shouldOfferProductionProjectDraftRecovery');
    expect(editor).toContain('copyLocalDraft');
    expect(editor).toContain('confirmReloadLatest');
    expect(editor).toContain('leaveUnprotectedDescription');
    const recoveryBlock = editor.slice(
      editor.indexOf('function offerLocalDraftRecovery'),
      editor.indexOf('function scheduleAutosave'),
    );
    expect(recoveryBlock).toContain("localDraft.baseVersion === project.value?.version ? 'dirty' : 'conflict'");
    expect(recoveryBlock).toContain("if (saveState.value !== 'conflict') scheduleAutosave();");
    expect(recoveryBlock.indexOf('saveState.value = localDraft.baseVersion')).toBeLessThan(
      recoveryBlock.indexOf('draftTitle.value = localDraft.title'),
    );
    expect(editor).toContain('baseVersion: localDraftBaseVersion.value ?? project.value.version');
    expect(editor).toContain('draftRecoveryPending.value || !dirty.value');
    const persistBlock = editor.slice(
      editor.indexOf('async function persistRevision'),
      editor.indexOf('async function saveNow'),
    );
    expect(persistBlock).toContain("saveState.value = isToolboxProjectConflict(error) ? 'conflict' : 'failed'");
    expect(persistBlock).toContain('persistLocalDraft();');
  });

  it('覆盖项目列表状态、三类标准导出和共享版本抽屉', () => {
    expect(list).toContain('v-if="loading"');
    expect(list).toContain('v-else-if="loadError"');
    expect(list).toContain('projects.length === 0');
    expect(list).toContain('fetchToolboxProjectsPage');
    expect(list).toContain('loadMoreProjects');
    expect(editor).toContain('fetchToolboxProjectRevisionsPage');
    expect(editor).toContain('@load-more="loadMoreVersions"');
    expect(editor).toContain('exportProductionPresentationPptx');
    expect(editor).toContain('exportProductionPresentationPdf');
    expect(editor).toContain('exportProductionPresentationPngZip');
    expect(editor).toContain('<ToolboxProjectVersions');
    expect(editor).toContain('<BDrawer');
  });

  it('编辑器具备幻灯片栏、画布与备注区，所有表单和按钮使用 B 组件', () => {
    expect(editor).toContain('presentation-slides');
    expect(editor).toContain('presentation-stage');
    expect(editor).toContain('presentation-notes');
    expect(editor).toContain('movePresentationSlide');
    expect(editor).toContain('deleteSlide');
    for (const component of [editor, list]) {
      expect(component).not.toMatch(/<(input|textarea|select|button)\b/u);
    }
    expect(editor).toContain('<BInput');
    expect(editor).toContain('<BSelect');
    expect(editor).toContain('<BButton');
    expect(editor).toContain('.presentation-editor :deep(.b_btn.small_btn)');
    expect(editor).toContain('min-height: 44px');
  });

  it('文本元素遵循画布原位编辑，并与同一 presentation 元素状态实时同步', () => {
    expect(editor).toContain('editingTextElementId');
    expect(editor).toContain('contenteditable="plaintext-only"');
    expect(editor).toContain('@input="handleCanvasTextInput($event, element)"');
    expect(editor).toContain('beginTextEditing(element.id, { selectAll: true })');
    expect(editor).toContain('handleElementPointerDown');
    expect(editor).toContain('pointerHitsElementFrame');
    expect(editor).toContain("event.key === 'Escape'");
    expect(editor).toContain("(event.metaKey || event.ctrlKey) && event.key === 'Enter'");
    expect(editor).toContain('.presentation-element__text-editor');
    expect(editor).not.toContain('v-model:value="canvasText');
  });

  it('演示路由位于 toolId catchall 之前', () => {
    const projectRoute = routes.indexOf("path: '/toolbox/project/presentations'");
    const catchAllRoute = routes.indexOf("path: '/toolbox/:toolId'");
    expect(projectRoute).toBeGreaterThan(-1);
    expect(projectRoute).toBeLessThan(catchAllRoute);
  });

  it('列表提供返回工具箱入口并复用首页滚动快照返回策略', () => {
    expect(list).toContain('returnFromToolboxPage');
    expect(list).toContain('backToToolbox');
    expect(list).toContain('toolboxProject.presentation.list.backToolbox');
  });

  it('列表接入空白、模板与提纲导入，并保留严格的创建语义', () => {
    expect(list).toContain("productionProjectStartersFor('presentation')");
    expect(list).toContain('productionProjectStarterCopy');
    expect(list).toContain('templateId: starter.id');
    expect(list).toContain('importProductionPresentationOutline');
    expect(list).toContain('createProductionPresentationFromOutline');
    expect(list).toContain('isProductionPresentationOutlineSlideLimitError');
    expect(list).toContain('importSlideLimit');
    expect(list).toContain("changeKind: 'import'");
    expect(list).toContain('.md,.markdown,.txt,.outline,.ppt-outline');
    expect(list).not.toContain('.pptx,');
    expect(list).toContain('<BUpload');
    expect(list).toContain('<BInput');
    expect(list).toContain('<BModal');
  });

  it('从已有文档显式创建独立演示并保留来源项目与修订', () => {
    expect(list).toContain("projectType: 'document'");
    expect(list).toContain('loadMoreSourceDocuments');
    expect(list).toContain('fetchToolboxProject(documentItem.id)');
    expect(list).toContain('sourceProjectId: source.project.id');
    expect(list).toContain('sourceRevisionId: source.revision.id');
    expect(list).not.toMatch(/updateToolboxProject\(documentItem/u);
  });

  it('版本恢复先应用服务器结果再清除旧本地草稿', () => {
    const restoreBody = editor.slice(editor.indexOf('async function restoreRevision'));
    const checkpointIndex = restoreBody.indexOf("persistRevision(\n          'named'");
    const restoreIndex = restoreBody.indexOf('restoreToolboxProjectRevision');
    expect(checkpointIndex).toBeGreaterThan(-1);
    expect(checkpointIndex).toBeLessThan(restoreIndex);
    expect(restoreBody).toContain('if (!checkpointSaved)');
    expect(restoreBody).toContain('restoreCheckpointFailed');
    expect(restoreBody.indexOf('applyProject(detail, true)')).toBeGreaterThan(-1);
    expect(restoreBody.indexOf('clearLocalDraft()')).toBeGreaterThan(restoreBody.indexOf('applyProject(detail, true)'));
  });

  it('所有演示导出都走共享溢出校验，并把不可承载状态明确提示给用户', () => {
    expect(editor).toContain('isProductionPresentationExportOverflowError');
    expect(editor).toContain('exportOverflow');
    expect(editor).toContain('exportBlankContent');
    expect(editor).toContain("issue.field === 'blank'");
    expect(editor).toContain('BMessage.error');
  });

  it('显式载入最新版仅在 fetch 与 apply 成功后清草稿，失败时重新保护当前稿', () => {
    const reloadBlock = editor.slice(
      editor.indexOf('async function reloadLatest'),
      editor.indexOf('async function loadVersions'),
    );
    const fetchIndex = reloadBlock.indexOf('fetchToolboxProject');
    const applyIndex = reloadBlock.indexOf('applyProject(detail, true)');
    const clearIndex = reloadBlock.indexOf('clearLocalDraft');
    expect(fetchIndex).toBeGreaterThan(-1);
    expect(applyIndex).toBeGreaterThan(fetchIndex);
    expect(clearIndex).toBeGreaterThan(applyIndex);
    expect(reloadBlock).toContain('replaceProductionProjectWithLatest');
    expect(reloadBlock).toContain('persistLocalDraft();');
    expect(reloadBlock).toContain('reloadFailed');
  });
});

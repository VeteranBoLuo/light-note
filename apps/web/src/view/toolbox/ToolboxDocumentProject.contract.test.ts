import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function source(path: string) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
}

describe('旧版文档项目兼容契约', () => {
  const editor = source('./ToolboxDocumentProjectEditor.vue');
  const list = source('./ToolboxDocumentProjects.vue');
  const outline = source('./components/ToolboxDocumentOutline.vue');
  const versions = source('./components/ToolboxProjectVersions.vue');
  const routes = source('../../router/modules/toolbox.ts');

  it('是独立 Project UI，不复用 NoteDetail 或笔记 API', () => {
    expect(editor).toContain('MarkdownCodeMirror');
    expect(editor).toContain("from '@/api/toolboxProjects'");
    expect(editor).not.toContain('NoteDetail');
    expect(editor).not.toMatch(/api\/note|noteLibraryStore|useNoteTree/u);
  });

  it('提供 1.5 秒自动保存、显式保存、失败与冲突状态', () => {
    expect(editor).toContain('window.setTimeout');
    expect(editor).toContain('1500');
    expect(editor).toContain("'failed' | 'conflict'");
    expect(editor).toContain('isToolboxProjectConflict');
    expect(editor).toContain('@click="saveNow"');
    expect(editor).toContain('updateToolboxProject');
    expect(editor).toContain('expectedVersion');
    const persistBlock = editor.slice(
      editor.indexOf('async function persistRevision'),
      editor.indexOf('async function saveNow'),
    );
    const patchIndex = persistBlock.indexOf('updateToolboxProject');
    const revisionIndex = persistBlock.indexOf('saveToolboxProjectRevision');
    const failureIndex = persistBlock.indexOf('.catch((error: unknown)');
    expect(revisionIndex).toBeGreaterThan(patchIndex);
    expect(failureIndex).toBeGreaterThan(revisionIndex);
    expect(persistBlock.slice(failureIndex)).toContain('persistLocalDraft();');
  });

  it('项目列表覆盖 loading、empty、error，版本面板覆盖命名与恢复', () => {
    expect(list).toContain('v-if="loading"');
    expect(list).toContain('v-else-if="loadError"');
    expect(list).toContain('projects.length === 0');
    expect(list).toContain('fetchToolboxProjectsPage');
    expect(list).toContain('loadMoreProjects');
    expect(editor).toContain('fetchToolboxProjectRevisionsPage');
    expect(editor).toContain('@load-more="loadMoreVersions"');
    expect(versions).toContain("emit('loadMore')");
    expect(versions).toContain("emit('name', name)");
    expect(versions).toContain("emit('restore', revision)");
    expect(list).toContain('icon.toolbox.documentStudio');
    expect(list).not.toContain('icon.toolbox.materialNote');
    expect(list).toContain('returnFromToolboxPage');
    expect(list).toContain('restoreToolboxScrollSnapshot');
    expect(list).toContain('saveToolboxScrollSnapshot');
  });

  it('只保留旧项目访问，不再提供与笔记库冲突的新建和导入入口', () => {
    expect(list).not.toContain('<ToolboxDocumentStarters');
    expect(list).not.toContain("productionProjectStartersFor('document')");
    expect(list).not.toContain('createToolboxProject');
    expect(list).not.toContain('importProductionDocumentFile');
    expect(list).toContain("router.push({ name: 'noteLibrary' })");
    expect(list).toContain("from '@/components/base/BasicComponents/BMessage/BMessage'");
    expect(routes).toContain("redirect: { name: 'toolboxPresentationProjects' }");
  });

  it('桌面提供常驻可点击 H1-H3 大纲，移动端改用单层全屏抽屉', () => {
    expect(editor).toContain('buildProductionDocumentOutline');
    expect(editor).toContain('markdownEditorRef.value?.scrollToPosition');
    expect(editor).toContain('class="project-editor-outline"');
    expect(editor).toContain(':contained-scroll="false"');
    expect(outline).toContain("emit('select', item)");
    expect(outline).toContain('is-contained-scroll');
  });

  it('真实导出 Markdown、HTML、DOCX 与 PDF，并使用 BPopover 紧凑菜单', () => {
    expect(editor).toContain('<BPopover');
    expect(editor).toContain('exportProductionDocumentMarkdown');
    expect(editor).toContain('exportProductionDocumentHtml');
    expect(editor).toContain('exportProductionDocumentDocx');
    expect(editor).toContain('exportProductionDocumentPdf');
    expect(editor).toContain("['markdown', 'html', 'docx', 'pdf']");
  });

  it('立即保留账号与项目隔离的本地草稿，冲突离开和刷新前不会静默丢稿', () => {
    expect(editor).toContain('writeProductionProjectDraft');
    expect(editor).toContain("{ flush: 'sync' }");
    expect(editor).toContain("window.addEventListener('beforeunload'");
    expect(editor).toContain('confirmUnsafeLeave');
    expect(editor).toContain('shouldOfferProductionProjectDraftRecovery');
    expect(editor).toContain('persistLocalDraft();');
    expect(editor).toContain('localDraftProtected');
    expect(editor).toContain('leaveUnprotectedDescription');
    expect(editor).toContain('draftUnprotectedTitle');
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
    const restoreBlock = editor.slice(
      editor.indexOf('async function restoreRevision'),
      editor.indexOf('async function exportDocument'),
    );
    const checkpointIndex = restoreBlock.indexOf("persistRevision('named'");
    const restoreIndex = restoreBlock.indexOf('restoreToolboxProjectRevision');
    expect(checkpointIndex).toBeGreaterThan(-1);
    expect(checkpointIndex).toBeLessThan(restoreIndex);
    expect(restoreBlock).toContain('if (!checkpointSaved)');
    expect(restoreBlock).toContain('restoreCheckpointFailed');
    expect(restoreBlock).toContain('applyProject(detail, true);');
    expect(restoreBlock).toContain("saveState.value = 'saved';");
    expect(restoreBlock).toContain('clearLocalDraft();');
  });

  it('用户输入和按钮使用 B 组件，移动端版本记录使用抽屉且没有页面级纵向滚动', () => {
    for (const component of [editor, list, outline, versions]) {
      expect(component).not.toMatch(/<(input|textarea|select)\b/u);
    }
    expect(editor).toContain('<BDrawer');
    expect(editor).toContain('mobile-full-screen');
    expect(editor).toContain('overflow: hidden');
    expect(editor).toContain('.document-project-editor :deep(.b_btn.small_btn)');
    expect(editor).toContain('min-height: 44px');
    expect(versions).toContain('.project-versions :deep(.b_btn.small_btn)');
    expect(versions).toContain('min-height: 44px');
  });

  it('项目路由位于 toolId catchall 之前', () => {
    const projectRoute = routes.indexOf("path: '/toolbox/project/documents'");
    const catchAllRoute = routes.indexOf("path: '/toolbox/:toolId'");
    expect(projectRoute).toBeGreaterThan(-1);
    expect(projectRoute).toBeLessThan(catchAllRoute);
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

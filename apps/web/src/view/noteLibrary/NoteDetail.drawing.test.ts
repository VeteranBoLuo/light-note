import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteDetail.vue'), 'utf8');
const drawingSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/drawing/DrawingNoteEditor.vue'),
  'utf8',
);
const drawingStyleSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/drawing/DrawingStylePanel.vue'),
  'utf8',
);
const versionHistorySource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/detail/NoteVersionHistory.vue'),
  'utf8',
);
const noteHeaderSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/detail/NoteHeader.vue'),
  'utf8',
);
const librarySource = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteLibrary.vue'), 'utf8');
const conflictSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/detail/NoteConflictModal.vue'),
  'utf8',
);

describe('手绘笔记详情边界', () => {
  it('画布保持独立异步组件，普通详情不静态导入', () => {
    expect(source).not.toMatch(/^\s*import\s+DrawingNoteEditor\b/mu);
    expect(source).toContain("() => import('@/components/noteLibrary/drawing/DrawingNoteEditor.vue')");
    expect(source).toContain('v-if="isDrawingNote"');
  });

  it('手绘只走专用 revision 保存接口并使用低频自动保存窗口', () => {
    expect(source).toContain("apiBasePost('/api/note/updateDrawingNote'");
    expect(source).toContain('revision: note.revision');
    expect(source).toContain('const DRAWING_SAVE_DEBOUNCE_DELAY = 3_000');
    expect(source).toContain('isDrawingNote.value ? DRAWING_SAVE_DEBOUNCE_DELAY : TEXT_SAVE_DEBOUNCE_DELAY');
  });

  it('手绘详情不挂载 AI 与正文目录', () => {
    expect(source).toContain(':has-ai="!bookmark.isMobile && !isDrawingNote"');
    expect(source).toContain('<template v-if="!isDrawingNote" #ai>');
    expect(source).toContain(':has-catalog="!isDrawingNote && nStore.headings.length > 0"');
  });

  it('新建页复用笔记库侧栏偏好，且仅在桌面展开时加载目录', () => {
    const navigationStart = source.indexOf('const canShowPrivateNavigation = computed(');
    const navigationEnd = source.indexOf('const canShowDetailSidebar', navigationStart);
    const navigationSource = source.slice(navigationStart, navigationEnd);
    const loadStart = source.indexOf('const shouldLoadDetailTree = computed(');
    const loadEnd = source.indexOf('const initialDetailWorkspaceLayout', loadStart);
    const loadSource = source.slice(loadStart, loadEnd);

    expect(navigationSource).toContain("nodeType.value === 'add'");
    expect(navigationSource).toContain("nodeType.value === 'edit'");
    expect(source).toContain(':sidebar-open="sidebarPreferredOpen"');
    expect(loadSource).toContain('sidebarPreferredOpen.value');
    expect(loadSource).toContain('!bookmark.isMobile');
  });

  it('桌面端空白编辑器选项保持一致的紧凑卡片结构', () => {
    const sectionStart = librarySource.indexOf("key: 'type'");
    const sectionEnd = librarySource.indexOf("key: 'builtin'", sectionStart);
    const editorTypeSection = librarySource.slice(sectionStart, sectionEnd);

    expect(editorTypeSection).toContain("key: 'drawing'");
    expect(editorTypeSection).not.toContain('icon:');
  });

  it('笔画、拖动与局部擦除逐帧只更新临时对象，不直接改写响应式 scene', () => {
    const start = drawingSource.indexOf('function handlePointerMove(event: PointerEvent)');
    const end = drawingSource.indexOf('function releasePointer', start);
    const pointerMoveSource = drawingSource.slice(start, end);
    const eraseStart = drawingSource.indexOf('function eraseAt(');
    const eraseEnd = drawingSource.indexOf('function handlePointerDown', eraseStart);
    const eraseSource = drawingSource.slice(eraseStart, eraseEnd);

    expect(drawingSource).toContain('frameId = requestAnimationFrame');
    expect(pointerMoveSource).toContain('activeStroke');
    expect(pointerMoveSource).toContain('dragStart.dx = point.x - dragStart.x');
    expect(pointerMoveSource).toContain('marqueeSelection.current = point');
    expect(pointerMoveSource).not.toContain('scene.value =');
    expect(eraseSource).toContain('eraseDrawingElementsAt(source, point, eraserSize.value / 2, createElementId, {');
    expect(eraseSource).toContain('eraserPreviewElements = result.elements');
    expect(eraseSource).not.toContain('scene.value =');
    expect(pointerMoveSource).toContain('for (const sample of samples) eraseAt(canvasPoint(sample))');
  });

  it('颜色与尺寸合并为样式入口，移动端固定历史操作，导出仍进入页面更多菜单', () => {
    const toolbarEnd = drawingSource.indexOf('<div ref="workspaceRef"');
    const toolbarSource = drawingSource.slice(0, toolbarEnd);

    expect(toolbarSource).not.toContain('drawing-color-button');
    expect(toolbarSource).not.toContain('drawing-size-trigger');
    expect(toolbarSource).toContain('class="drawing-style-trigger"');
    expect(toolbarSource).toContain('<DrawingStylePanel');
    expect(toolbarSource).toContain('class="drawing-toolbar-scroll"');
    expect(toolbarSource).toContain('class="drawing-toolbar-history"');
    expect(toolbarSource).toContain('v-model:open="helpPopoverOpen"');
    expect(drawingSource).toContain('class="drawing-tool-button drawing-help-button"');
    expect(drawingSource).toContain('<kbd>P</kbd>');
    expect(drawingSource).toContain('<kbd>V</kbd>');
    expect(drawingSource).toContain('<kbd>⌫ / Delete</kbd>');
    expect(drawingSource).toContain('background: var(--surface-panel-bg, #f4f5f7)');
    expect(drawingSource).toContain('font-variant-numeric: tabular-nums');
    expect(drawingSource).toContain('flex: 0 0 24px');
    expect(drawingStyleSource).toContain('drawing-style-colors--common');
    expect(drawingStyleSource).toContain('drawing-style-colors--palette');
    expect(drawingStyleSource).toContain('drawing-style-colors--recent');
    expect(drawingStyleSource).toContain('type="color"');
    expect(drawingStyleSource).toContain('type="range"');
    expect(toolbarSource).not.toContain("t('note.drawingExportPng')");
    expect(toolbarSource).not.toContain("t('note.drawingExportJson')");
    expect(noteHeaderSource).toContain("props.noteType === 'drawing' || !bookmark.isDesktop");
    expect(noteHeaderSource).toContain("emit('exportDrawing', 'png')");
    expect(noteHeaderSource).toContain("emit('exportDrawing', 'json')");
    expect(source).toContain('@export-drawing="exportDrawingNote"');
    expect(drawingSource).toContain('.drawing-toolbar-zoom,');
    expect(drawingSource).toContain('.drawing-clear-desktop');
  });

  it('基础形状是正式 scene 元素，并覆盖创建、选择缩放与历史摘要', () => {
    expect(drawingSource).toContain("type DrawingTool = 'pen' | 'eraser' | 'text' | 'shape' | 'select' | 'hand'");
    expect(drawingSource).toContain("kind: 'shape'");
    expect(drawingSource).toContain('constrainDrawingShapeEnd');
    expect(drawingSource).toContain('hitShapeResizeHandle(point)');
    expect(drawingSource).toContain('resizedShapePreview()');
    expect(drawingSource).toContain('paintDrawingShape(context, element)');
    expect(versionHistorySource).toContain("element?.kind === 'shape'");
  });

  it('编辑区宽屏默认 100%，窄屏按可用宽度适配且不产生原生滚动条', () => {
    const zoomStart = drawingSource.indexOf('function fitEditablePage()');
    const zoomEnd = drawingSource.indexOf('function scheduleDraw()', zoomStart);
    const zoomSource = drawingSource.slice(zoomStart, zoomEnd);

    expect(drawingSource).toContain('const ZOOM_LEVELS = [0.3, 0.35, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5]');
    expect(zoomSource).toContain('size.width / DRAWING_PAGE.width');
    expect(zoomSource).not.toContain('size.height / DRAWING_PAGE.height');
    expect(zoomSource).toContain('editableZoom.value = Math.min(1, size.width / DRAWING_PAGE.width)');
    expect(drawingSource).toContain('cameraX.value = (size.width - DRAWING_PAGE.width * zoom.value) / 2');
    expect(drawingSource).toContain('overflow: hidden');
    expect(drawingSource).toContain('height: 100%');
  });

  it('Canvas 像素尺寸变化后在同一帧重绘，连续滚轮缩放不暴露空白帧', () => {
    const resizeStart = drawingSource.indexOf('function resizeCanvas()');
    const resizeEnd = drawingSource.indexOf('function fitReadonlyPage()', resizeStart);
    const resizeSource = drawingSource.slice(resizeStart, resizeEnd);

    expect(resizeSource).toContain('const backingStoreChanged =');
    expect(resizeSource).toContain('if (backingStoreChanged) draw();');
    expect(resizeSource.indexOf('canvas.height = nextHeight')).toBeLessThan(resizeSource.indexOf('draw();'));
    expect(resizeSource).toContain('else scheduleDraw();');
  });

  it('选择工具再次点击已选中文本时进入编辑，并原位替换而非追加副本', () => {
    const pointerStart = drawingSource.indexOf('function handlePointerDown(event: PointerEvent)');
    const pointerEnd = drawingSource.indexOf('function handlePointerMove', pointerStart);
    const pointerSource = drawingSource.slice(pointerStart, pointerEnd);
    const pointerMoveEnd = drawingSource.indexOf('function releasePointer', pointerEnd);
    const pointerMoveSource = drawingSource.slice(pointerEnd, pointerMoveEnd);
    const pointerUpStart = drawingSource.indexOf('function handlePointerUp(event: PointerEvent)');
    const pointerUpEnd = drawingSource.indexOf('function handlePointerCancel', pointerUpStart);
    const pointerUpSource = drawingSource.slice(pointerUpStart, pointerUpEnd);
    const commitStart = drawingSource.indexOf('function commitTextDraft()');
    const commitEnd = drawingSource.indexOf('function applyHistory', commitStart);
    const commitSource = drawingSource.slice(commitStart, commitEnd);

    expect(pointerSource).toContain("hit?.kind === 'text' && wasSelected && selectedIds.value.length === 1");
    expect(pointerSource).toContain('editSelectedTextOnRelease = shouldEditSelectedText');
    expect(pointerMoveSource).toContain(
      'Math.hypot(dragStart.dx, dragStart.dy) * zoom.value >= TEXT_DRAG_THRESHOLD_PX',
    );
    expect(pointerMoveSource).toContain('editSelectedTextOnRelease = false');
    expect(pointerUpSource).toContain(
      "editSelectedTextOnRelease && dragStart.elements.length === 1 && dragStart.elements[0].kind === 'text'",
    );
    expect(pointerUpSource).toContain('textDraft.value = cloneDrawingElement(dragStart.elements[0])');
    expect(drawingSource).toContain('textDraft.value?.id !== element.id');
    expect(drawingSource).toContain(':rows="textDraftRows"');
    expect(drawingSource).toContain('top: `${textEditorTop(textDraft) * zoom}px`');
    expect(drawingSource).toContain('y: textEditorTop(element)');
    expect(drawingSource).toContain('border: 0 !important');
    expect(drawingSource).toContain('outline: 2px solid #615ced');
    expect(commitSource).toContain('existingText');
    expect(commitSource).toContain('scene.value.elements.map');
    expect(commitSource).toContain(': [...scene.value.elements, committedDraft]');
  });

  it('选择工具支持框选、多选移动、全选与复制剪切粘贴，清屏可撤销', () => {
    const pointerStart = drawingSource.indexOf('function handlePointerDown(event: PointerEvent)');
    const pointerEnd = drawingSource.indexOf('function handlePointerMove', pointerStart);
    const pointerSource = drawingSource.slice(pointerStart, pointerEnd);
    const keyStart = drawingSource.indexOf('function handleKeydown(event: KeyboardEvent)');
    const keyEnd = drawingSource.indexOf('async function deliverExport', keyStart);
    const keySource = drawingSource.slice(keyStart, keyEnd);
    const toolbarEnd = drawingSource.indexOf('<div ref="workspaceRef"');
    const toolbarSource = drawingSource.slice(0, toolbarEnd);

    expect(pointerSource).toContain('marqueeSelection = { start: point, current: point, baseIds }');
    expect(pointerSource).toContain('event.shiftKey || event.metaKey || event.ctrlKey');
    expect(drawingSource).toContain('drawingRectsIntersect(rect, elementBounds(context, element))');
    expect(drawingSource).toContain('translateDrawingElement(element, dx, dy)');
    expect(keySource).toContain("commandKey && key === 'a'");
    expect(keySource).toContain("commandKey && key === 'c'");
    expect(keySource).toContain("commandKey && key === 'x'");
    expect(keySource).toContain("commandKey && key === 'v'");
    expect(keySource).toContain("commandKey && key === 'y'");
    expect(keySource).toContain('setSelectedIds(scene.value.elements.map((element) => element.id))');
    expect(drawingSource).toContain('writeDrawingClipboard(elements)');
    expect(drawingSource).toContain('readDrawingClipboard(createElementId)');
    expect(toolbarSource).toContain("t('note.drawingClear')");
    expect(toolbarSource).toContain('@click="confirmClearDrawing"');
    expect(toolbarSource).toContain('icon.noteDetail.imageToolbar.delete');
    expect(toolbarSource).not.toContain('icon.noteDetail.toolbar.imageToolbar');
    expect(drawingSource).toContain('beginMutation();\n    scene.value = { ...scene.value, elements: [] }');
    expect(drawingSource).toContain('void nextTick(() => rootRef.value?.focus({ preventScroll: true }))');
  });

  it('未松开指针时撤销优先取消当前手势，不回退上一条已提交历史', () => {
    const cancelStart = drawingSource.indexOf('function cancelActiveGesture()');
    const cancelEnd = drawingSource.indexOf('function handlePointerUp', cancelStart);
    const cancelSource = drawingSource.slice(cancelStart, cancelEnd);
    const undoStart = drawingSource.indexOf('function undo()');
    const undoEnd = drawingSource.indexOf('function redo()', undoStart);
    const undoSource = drawingSource.slice(undoStart, undoEnd);
    const redoEnd = drawingSource.indexOf('function copySelectedElements()', undoEnd);
    const redoSource = drawingSource.slice(undoEnd, redoEnd);

    expect(cancelSource).toContain('activeStroke = null');
    expect(cancelSource).toContain("mutationSnapshot = ''");
    expect(cancelSource).toContain('activePointerId = null');
    expect(undoSource).toContain('if (cancelActiveGesture()) return');
    expect(undoSource.indexOf('cancelActiveGesture()')).toBeLessThan(undoSource.indexOf('undoStack.value.pop()'));
    expect(redoSource).toContain('if (hasActiveGesture()) return');
  });

  it('只读预览按容器真实内容宽度连续缩放并保持画纸居中', () => {
    const fitStart = drawingSource.indexOf('function fitReadonlyPage()');
    const fitEnd = drawingSource.indexOf('function canvasPoint', fitStart);
    const fitSource = drawingSource.slice(fitStart, fitEnd);
    const mountStart = drawingSource.indexOf('onMounted(() =>');
    const mountEnd = drawingSource.indexOf('defineExpose', mountStart);
    const mountSource = drawingSource.slice(mountStart, mountEnd);

    expect(drawingSource).toContain(
      'const zoom = computed(() => (props.readonly ? readonlyFitZoom.value : editableZoom.value))',
    );
    expect(fitSource).toContain('getComputedStyle(workspace)');
    expect(fitSource).toContain('workspace.clientWidth - horizontalPadding');
    expect(fitSource).toContain('contentWidth - horizontalBorder');
    expect(mountSource).toContain('workspaceResizeObserver = new ResizeObserver(fitReadonlyPage)');
    expect(mountSource).toContain('workspaceResizeObserver?.disconnect()');
  });

  it('绘画冲突对比展示两份真实画布，橡皮擦默认为 18px 且只显示尺寸圆环', () => {
    expect(conflictSource).toContain("() => import('@/components/noteLibrary/drawing/DrawingNoteEditor.vue')");
    expect(conflictSource.match(/<DrawingNoteEditor/g)).toHaveLength(2);
    expect(conflictSource).toContain(':content="cloudVersion.content"');
    expect(conflictSource).toContain(':content="localVersion.content"');
    expect(drawingSource).toContain('const DEFAULT_ERASER_SIZE = 18');
    expect(drawingSource).toContain('const eraserSize = ref(DEFAULT_ERASER_SIZE)');
    expect(drawingSource).toMatch(/\.drawing-canvas\.is-tool-eraser\s*\{\s*cursor:\s*none;/u);
    expect(drawingSource).toContain('context.arc(eraserCursorPoint.x, eraserCursorPoint.y, eraserSize.value / 2');
  });

  it('右上角保存按钮独立创建历史版本，子页支持三种笔记类型', () => {
    expect(noteHeaderSource).toContain("$t('noteDetail.saveVersion')");
    expect(noteHeaderSource).toContain("$emit('saveVersion')");
    expect(source).toContain('@save-version="saveManualVersion"');
    expect(source).toContain("apiBasePost('/api/note/createNoteVersion'");
    expect(source).toContain('void saveManualVersion()');
    expect(source).toContain('blank-only');
    expect(source).toContain("function createChildPageWithType(type: 'html' | 'markdown' | 'drawing')");
    expect(source).toContain('query: { type, parent: childCreateParentId.value');
  });

  it('历史版本仅在手绘预览分支按需加载只读画布', () => {
    expect(versionHistorySource).toContain(
      "loader: () => import('@/components/noteLibrary/drawing/DrawingNoteEditor.vue')",
    );
    expect(versionHistorySource).toContain(
      "v-if=\"activeId && previewMode === 'preview' && activeVersion?.type === 'drawing' && activeVersion.content\"",
    );
    expect(versionHistorySource).toContain(':content="activeVersion.content"');
    expect(versionHistorySource).toContain('readonly');
    expect(versionHistorySource).toContain('v-else-if="activeId && previewMode === \'preview\'"');
    expect(versionHistorySource).toContain("apiBasePost('/api/note/getNoteVersionDetail'");
    expect(versionHistorySource).toContain('drawingSceneVersion: DRAWING_SCENE_VERSION');
    expect(versionHistorySource).toContain('if (activeId.value !== v.id) return');
    expect(versionHistorySource).toContain("v.content = String(detailRes.data.content || '')");
    expect(versionHistorySource).toContain('v-else-if="activeId && isDrawingComparison"');
    expect(versionHistorySource.match(/class="version-drawing-diff__canvas"/g)).toHaveLength(2);
    expect(versionHistorySource).toContain('compareDrawingVersions(');
    expect(versionHistorySource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(versionHistorySource).toContain('.mobile .version-drawing-diff__grid');
  });
});

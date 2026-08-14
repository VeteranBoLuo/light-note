import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteDetail.vue'), 'utf8');
const drawingSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/drawing/DrawingNoteEditor.vue'),
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
    expect(pointerMoveSource).toContain('dragPreview = moved');
    expect(pointerMoveSource).not.toContain('scene.value =');
    expect(eraseSource).toContain('eraseDrawingElementsAt(source, point, eraserSize.value / 2, createElementId, {');
    expect(eraseSource).toContain('eraserPreviewElements = result.elements');
    expect(eraseSource).not.toContain('scene.value =');
    expect(pointerMoveSource).toContain('for (const sample of samples) eraseAt(canvasPoint(sample))');
  });

  it('颜色与尺寸各自只保留一个工具栏入口，导出统一进入页面更多菜单', () => {
    const toolbarEnd = drawingSource.indexOf('<div ref="workspaceRef"');
    const toolbarSource = drawingSource.slice(0, toolbarEnd);

    expect(toolbarSource.match(/class="drawing-color-button"/gu)).toHaveLength(1);
    expect(toolbarSource).toContain('v-model:value="activeColor"');
    expect(toolbarSource).toContain('type="color"');
    expect(toolbarSource).toContain('v-model:open="colorPopoverOpen"');
    expect(toolbarSource).toContain('v-model:open="sizePopoverOpen"');
    expect(toolbarSource).toContain('v-if="showSizeControl"');
    expect(toolbarSource.match(/drawing-size-trigger/gu)).toHaveLength(1);
    expect(toolbarSource).toContain('v-for="size in activeSizeOptions"');
    expect(toolbarSource).toContain('class="drawing-size-range"');
    expect(toolbarSource).toContain(':min="activeSizeRange.min"');
    expect(toolbarSource).not.toContain("t('note.drawingExportPng')");
    expect(toolbarSource).not.toContain("t('note.drawingExportJson')");
    expect(noteHeaderSource).toContain("props.noteType === 'drawing' || !bookmark.isDesktop");
    expect(noteHeaderSource).toContain("emit('exportDrawing', 'png')");
    expect(noteHeaderSource).toContain("emit('exportDrawing', 'json')");
    expect(source).toContain('@export-drawing="exportDrawingNote"');
    expect(drawingSource).toContain('if (open) sizePopoverOpen.value = false');
    expect(drawingSource).toContain('if (open) colorPopoverOpen.value = false');
    expect(drawingSource).toContain('width: 44px');
    expect(drawingSource).toContain('height: 44px');
  });

  it('移动端初始缩放同时利用可用宽高且不拉伸画纸', () => {
    const zoomStart = drawingSource.indexOf('function resolveInitialZoomIndex()');
    const zoomEnd = drawingSource.indexOf('function fitReadonlyPage()', zoomStart);
    const zoomSource = drawingSource.slice(zoomStart, zoomEnd);

    expect(drawingSource).toContain('const ZOOM_LEVELS = [0.3, 0.35, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5]');
    expect(zoomSource).toContain('workspace.clientWidth - horizontalPadding');
    expect(zoomSource).toContain('workspace.clientHeight - verticalPadding');
    expect(zoomSource).toContain('widthFit * 1.4');
    expect(drawingSource).toContain(
      'workspace.scrollLeft = Math.max(0, (workspace.scrollWidth - workspace.clientWidth) / 2)',
    );
    expect(drawingSource).toContain('height: 100%');
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

    expect(pointerSource).toContain("hit?.kind === 'text' && hit.id === selectedId.value");
    expect(pointerSource).toContain('editSelectedTextOnRelease = shouldEditSelectedText');
    expect(pointerMoveSource).toContain('Math.hypot(dx, dy) * zoom.value >= TEXT_DRAG_THRESHOLD_PX');
    expect(pointerMoveSource).toContain('editSelectedTextOnRelease = false');
    expect(pointerUpSource).toContain("editSelectedTextOnRelease && dragStart.element.kind === 'text'");
    expect(pointerUpSource).toContain('textDraft.value = { ...dragStart.element }');
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

  it('只读预览按容器真实内容宽度连续缩放并保持画纸居中', () => {
    const fitStart = drawingSource.indexOf('function fitReadonlyPage()');
    const fitEnd = drawingSource.indexOf('function canvasPoint', fitStart);
    const fitSource = drawingSource.slice(fitStart, fitEnd);
    const mountStart = drawingSource.indexOf('onMounted(() =>');
    const mountEnd = drawingSource.indexOf('defineExpose', mountStart);
    const mountSource = drawingSource.slice(mountStart, mountEnd);

    expect(drawingSource).toContain(
      'const zoom = computed(() => (props.readonly ? readonlyFitZoom.value : ZOOM_LEVELS[zoomIndex.value]))',
    );
    expect(fitSource).toContain('getComputedStyle(workspace)');
    expect(fitSource).toContain('workspace.clientWidth - horizontalPadding');
    expect(fitSource).toContain('contentWidth - horizontalBorder');
    expect(mountSource).toContain('workspaceResizeObserver = new ResizeObserver(fitReadonlyPage)');
    expect(mountSource).toContain('workspaceResizeObserver?.disconnect()');
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

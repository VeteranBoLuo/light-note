import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteDetail.vue'), 'utf8');
const drawingSource = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/drawing/DrawingNoteEditor.vue'),
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

  it('笔画、拖动与擦除逐帧只更新临时对象，不直接改写响应式 scene', () => {
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
    expect(eraseSource).toContain('erasedElementIds.add(hit.id)');
    expect(eraseSource).not.toContain('scene.value =');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/noteLibrary/drawing/DrawingNoteThumbnail.vue'),
  'utf8',
);
const cardSource = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/library/NoteCard.vue'), 'utf8');

describe('DrawingNoteThumbnail', () => {
  it('卡片仅为手绘类型异步加载轻量缩略图，不复用完整编辑器', () => {
    expect(cardSource).toMatch(/<DrawingNoteThumbnail[\s\S]*v-if="isDrawingNote"/u);
    expect(cardSource).toContain("() => import('@/components/noteLibrary/drawing/DrawingNoteThumbnail.vue')");
    expect(cardSource).not.toContain("() => import('@/components/noteLibrary/drawing/DrawingNoteEditor.vue')");
  });

  it('只在卡片接近可视区后批量读取轻量预览并绘制固定尺寸画布', () => {
    expect(source).toContain("{ rootMargin: '160px' }");
    expect(source).toContain('visibilityObserver?.disconnect()');
    expect(source).toContain('loadDrawingPreview(props.noteId, props.revision)');
    expect(source).toContain('canvas.width = 480');
    expect(source).toContain('canvas.height = 270');
    expect(source).not.toContain('ResizeObserver');
  });
});

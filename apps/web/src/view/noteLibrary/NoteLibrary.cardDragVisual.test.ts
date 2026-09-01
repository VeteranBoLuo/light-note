import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteLibrary.vue'), 'utf8');

describe('笔记卡片拖拽视觉状态', () => {
  it('仅在活动拖拽态关闭外层方形绘制隔离，静止卡片仍保留长列表虚拟化', () => {
    expect(source).toContain('.note-library-body > * {');
    expect(source).toContain('content-visibility: auto;');
    expect(source).toContain(':deep(.note-sort-item.note-card-drag-chosen)');
    expect(source).toContain(':deep(.note-sort-item.note-card-drag-ghost)');
    expect(source).toContain(':deep(.note-sort-item.note-card-dragging)');
    expect(source).toContain(':deep(.note-sort-item.sortable-fallback)');
    expect(source).toContain(':global(.note-sort-item.sortable-fallback)');

    const activeIsolationOverride = source.match(
      /:deep\(\.note-sort-item\.note-card-drag-chosen\)[\s\S]*?\{([\s\S]*?)\n\s*\}/u,
    )?.[1];
    expect(activeIsolationOverride).toContain('content-visibility: visible;');
    expect(activeIsolationOverride).toContain('contain-intrinsic-size: none;');
  });

  it('按下、占位和拖动反馈都绘制在圆角卡片上，而不是外层矩形容器', () => {
    expect(source).toContain(':deep(.note-card-drag-chosen > .note-card)');
    expect(source).toContain(':deep(.note-card-drag-ghost > .note-card)');
    expect(source).toContain(':deep(.note-card-dragging > .note-card)');
    expect(source).toContain(':global(.note-card-dragging > .note-card)');
    expect(source).not.toMatch(/:deep\(\.note-card-drag-(?:chosen|ghost|dragging)\)\s*\{/u);
    expect(source).not.toMatch(/:global\(\.note-card-dragging\)\s*\{/u);
  });
});

import { describe, expect, it } from 'vitest';
import { preloadNoteEditorRuntime } from './editorRuntimeLoader';

describe('手绘编辑器运行时隔离', () => {
  it('drawing 类型不回退加载 TinyMCE，也不注入其公共资源预加载标签', async () => {
    await expect(preloadNoteEditorRuntime('drawing')).resolves.toBeNull();
    expect(document.head.querySelector('link[data-note-editor-asset]')).toBeNull();
  });
});

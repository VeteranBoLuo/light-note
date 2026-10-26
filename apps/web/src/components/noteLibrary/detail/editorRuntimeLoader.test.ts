import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTinyMceRuntime, preloadNoteEditorRuntime } from './editorRuntimeLoader';

vi.mock('./TinyMceEditorRuntime.vue', () => ({ default: {} }));

afterEach(() => {
  document.head.querySelectorAll('link[data-note-editor-asset]').forEach((link) => link.remove());
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.lang = '';
});

describe('富文本公共资源预热', () => {
  it.each(['day', 'night'])('预取 %s 主题下实际使用的两份样式，并合并重复调用', async (theme) => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = 'zh-CN';
    await loadTinyMceRuntime();
    await preloadNoteEditorRuntime('html');
    const skin = theme === 'night' ? 'oxide-dark' : 'oxide';
    const links = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[data-note-editor-asset]'));
    expect(links.map((link) => [link.getAttribute('href'), link.as])).toEqual([
      [`/tinymce/skins/ui/${skin}/skin.css`, 'style'],
      [`/tinymce/skins/ui/${skin}/content.inline.css`, 'style'],
      ['/tinymce/langs/zh_CN.js', 'script'],
    ]);
    expect(links.every((link) => link.rel === 'preload')).toBe(true);
  });

  it('英文环境不请求中文语言包', async () => {
    document.documentElement.lang = 'en-US';
    await loadTinyMceRuntime();
    expect(document.head.querySelectorAll('link[data-note-editor-asset]')).toHaveLength(2);
  });
});

describe('手绘编辑器运行时隔离', () => {
  it('drawing 类型不回退加载 TinyMCE，也不注入其公共资源预加载标签', async () => {
    await expect(preloadNoteEditorRuntime('drawing')).resolves.toBeNull();
    expect(document.head.querySelector('link[data-note-editor-asset]')).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheTinyMceHtmlContent } from './tinyMceContentCache';

function createEditor() {
  const body = document.createElement('div');
  body.innerHTML = '<p>第一段</p><p><input type="checkbox" class="note-todo-checkbox"> 待办</p>';
  document.body.appendChild(body);
  const handlers = new Map<string, Array<() => void>>();
  const serialize = vi.fn((args?: Record<string, unknown>) =>
    args?.format === 'text' ? body.textContent || '' : body.innerHTML,
  );
  const editor = {
    getBody: () => body,
    getContent: serialize as (args?: Record<string, unknown>) => string,
    on(events: string, callback: () => void) {
      events.split(/\s+/).forEach((name) => handlers.set(name, [...(handlers.get(name) || []), callback]));
    },
    fire: (name: string) => handlers.get(name)?.forEach((callback) => callback()),
  };
  return { body, editor, serialize };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('TinyMCE 正文读取缓存', () => {
  it('正文没有变化时多次默认 HTML 读取只序列化一次', () => {
    const { editor, serialize } = createEditor();
    cacheTinyMceHtmlContent(editor);
    const first = editor.getContent();
    expect(editor.getContent({ format: 'html' })).toBe(first);
    expect(editor.getContent({})).toBe(first);
    // tinymce-vue 未配置 outputFormat 时传入 { format: undefined }，等同默认 HTML。
    expect(editor.getContent({ format: undefined })).toBe(first);
    expect(serialize).toHaveBeenCalledTimes(1);
  });

  it('文字、节点或属性任一变化后立即重新序列化', () => {
    const { body, editor, serialize } = createEditor();
    cacheTinyMceHtmlContent(editor);
    editor.getContent();
    (body.firstElementChild!.firstChild as Text).data = '改过的第一段';
    expect(editor.getContent()).toContain('改过的第一段');
    body.appendChild(document.createElement('h2')).textContent = '新标题';
    expect(editor.getContent()).toContain('新标题');
    // 待办勾选由编辑器写回 checked 属性，属性变化同样会让缓存失效。
    body.querySelector('input')!.setAttribute('checked', 'checked');
    expect(editor.getContent()).toContain('checked="checked"');
    expect(serialize).toHaveBeenCalledTimes(4);
  });

  it('纯文本、选区等带参数的读取始终直达编辑器', () => {
    const { editor, serialize } = createEditor();
    cacheTinyMceHtmlContent(editor);
    editor.getContent({ format: 'text' });
    editor.getContent({ format: 'text' });
    editor.getContent({ format: 'html', selection: true });
    expect(serialize).toHaveBeenCalledTimes(3);
  });

  it('设置内容、执行命令和撤销重做后即使 DOM 未变也重新读取', () => {
    const { editor, serialize } = createEditor();
    cacheTinyMceHtmlContent(editor);
    for (const event of ['BeforeSetContent', 'SetContent', 'ExecCommand', 'undo', 'redo']) {
      editor.getContent();
      editor.fire(event);
      editor.getContent();
    }
    expect(serialize).toHaveBeenCalledTimes(6);
  });

  it('释放后恢复原始读取方法，不再缓存', () => {
    const { editor, serialize } = createEditor();
    const release = cacheTinyMceHtmlContent(editor);
    editor.getContent();
    release();
    expect(editor.getContent).toBe(serialize);
    editor.getContent();
    editor.getContent();
    expect(serialize).toHaveBeenCalledTimes(3);
  });

  it('编辑器还没有正文节点时不做任何包装', () => {
    const { editor, serialize } = createEditor();
    editor.getBody = () => null as unknown as HTMLDivElement;
    cacheTinyMceHtmlContent(editor);
    expect(editor.getContent).toBe(serialize);
  });
});

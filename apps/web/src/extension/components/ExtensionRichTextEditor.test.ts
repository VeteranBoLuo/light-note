// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExtensionRichTextEditor from './ExtensionRichTextEditor.vue';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  document.body.innerHTML = '';
});

function mountEditor(initialValue = '') {
  const host = document.createElement('div');
  const model = ref(initialValue);
  const updates: string[] = [];
  document.body.append(host);
  const app = createApp({
    setup() {
      return () => h(ExtensionRichTextEditor, {
        modelValue: model.value,
        ariaLabel: '富文本正文',
        'onUpdate:modelValue': (value: string) => {
          updates.push(value);
          model.value = value;
        },
      });
    },
  });
  app.mount(host);
  cleanups.push(() => app.unmount());
  return {
    editor: host.querySelector<HTMLElement>('[contenteditable="true"]')!,
    model,
    updates,
  };
}

function transferEvent(type: 'paste' | 'drop', values: { html?: string; text?: string }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const transfer = {
    getData(format: string) {
      if (format === 'text/html') return values.html || '';
      if (format === 'text/plain') return values.text || '';
      return '';
    },
  };
  Object.defineProperty(event, type === 'paste' ? 'clipboardData' : 'dataTransfer', { value: transfer });
  return event;
}

describe('浏览器插件轻量富文本编辑器', () => {
  it('清洗初始值、用户输入和外部草稿恢复，不让危险 HTML 留在编辑面', async () => {
    const { editor, model, updates } = mountEditor(
      '<p onclick="steal()"><strong>正文</strong></p><script>steal()</script>',
    );

    expect(editor.innerHTML).toContain('<strong>正文</strong>');
    expect(editor.innerHTML).not.toContain('onclick');
    expect(editor.innerHTML).not.toContain('<script');

    editor.innerHTML = '<p style="color:red">新正文</p><img src="x" onerror="steal()">';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    const emittedInput = updates.at(-1) || '';
    expect(emittedInput).toContain('<p>新正文</p>');
    expect(emittedInput).toContain('<img src="x">');
    expect(emittedInput).not.toContain('style=');
    expect(emittedInput).not.toContain('onerror');

    model.value = '<p>恢复草稿</p><iframe src="https://evil.example"></iframe>';
    await nextTick();
    expect(editor.innerHTML).toContain('<p>恢复草稿</p>');
    expect(editor.innerHTML).not.toContain('iframe');
  });

  it('富文本与纯文本粘贴/拖入都先清洗并同步 v-model', async () => {
    const { editor, updates } = mountEditor();

    editor.dispatchEvent(transferEvent('paste', {
      html: '<strong>粗体</strong><img src="x" onerror="steal()"><style>body{display:none}</style>',
    }));
    await nextTick();
    expect(editor.innerHTML).toContain('<strong>粗体</strong>');
    expect(editor.innerHTML).toContain('<img src="x">');
    expect(editor.innerHTML).not.toContain('onerror');
    expect(editor.innerHTML).not.toContain('<style');

    editor.dispatchEvent(transferEvent('drop', { text: '第一行\n第二行' }));
    await nextTick();
    expect(updates.at(-1) || '').toContain('第一行<br>第二行');
  });

  it('无工具栏时保留加粗、斜体和下划线键盘快捷键', () => {
    const { editor } = mountEditor('正文');
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });

    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true, cancelable: true }));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, bubbles: true, cancelable: true }));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', ctrlKey: true, bubbles: true, cancelable: true }));

    expect(execCommand.mock.calls.map(([command]) => command)).toEqual(['bold', 'italic', 'underline']);
  });
});

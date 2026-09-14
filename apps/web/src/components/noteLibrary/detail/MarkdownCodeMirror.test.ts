// @vitest-environment jsdom
import i18n from '@/i18n';
import { createApp, h, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarkdownCodeMirror, { type MarkdownCodeMirrorExpose } from './MarkdownCodeMirror.vue';
import { insertMarkdownLink, wrapSelection } from '@/utils/markdownEditing';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const mounted: Array<() => void> = [];
let rangeClientRectsDescriptor: PropertyDescriptor | undefined;

async function mountEditor(
  initial: string,
  readonly = false,
  mobile = false,
  onKeydown?: (event: KeyboardEvent) => void,
) {
  const host = document.createElement('div');
  host.style.height = '400px';
  document.body.appendChild(host);
  const model = ref(initial);
  const readonlyModel = ref(readonly);
  const editor = ref<MarkdownCodeMirrorExpose | null>(null);
  const commands = ref<string[]>([]);
  const app = createApp({
    setup() {
      return () =>
        h(MarkdownCodeMirror, {
          ref: editor,
          modelValue: model.value,
          readonly: readonlyModel.value,
          mobile,
          onKeydown,
          'onUpdate:modelValue': (value: string) => (model.value = value),
          onCommand: (command: string) => {
            commands.value.push(command);
            const instance = editor.value;
            if (!instance) return;
            const value = instance.getValue();
            const selection = instance.getSelection();
            const input = { value, selectionStart: selection.from, selectionEnd: selection.to };
            if (command === 'bold') instance.applyEdit(wrapSelection(input, '**'));
            if (command === 'link') instance.applyEdit(insertMarkdownLink(input, '链接'));
          },
        });
    },
  });
  app.use(i18n);
  app.mount(host);
  await nextTick();
  await nextTick();
  mounted.push(() => {
    app.unmount();
    host.remove();
  });
  return { host, model, editor, commands, readonlyModel };
}

function dispatchModShortcut(host: HTMLElement, key: string, options: { shiftKey?: boolean; altKey?: boolean } = {}) {
  const content = host.querySelector<HTMLElement>('.cm-content');
  const isMac = /Mac|iPhone|iPad/u.test(navigator.platform);
  content?.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      code: /^\d$/u.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`,
      bubbles: true,
      cancelable: true,
      metaKey: isMac,
      ctrlKey: !isMac,
      ...options,
    }),
  );
}

describe('MarkdownCodeMirror', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh-CN';
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(callback, 0));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
    rangeClientRectsDescriptor = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [],
    });
  });

  afterEach(() => {
    mounted.splice(0).forEach((unmount) => unmount());
    if (rangeClientRectsDescriptor) {
      Object.defineProperty(Range.prototype, 'getClientRects', rangeClientRectsDescriptor);
    } else {
      Reflect.deleteProperty(Range.prototype, 'getClientRects');
    }
    vi.unstubAllGlobals();
  });

  it('保持原始 GFM/任务/Mermaid 源码，不做隐藏格式转换', async () => {
    const source = '# 标题\n\n- [x] 完成\n\n```mermaid\nflowchart TD\nA-->B\n```';
    const { editor } = await mountEditor(source);
    expect(editor.value?.getValue()).toBe(source);
  });

  it('工具栏编辑作为一个 transaction 进入撤销/重做历史', async () => {
    const { editor, model } = await mountEditor('正文');
    const result = wrapSelection({ value: '正文', selectionStart: 0, selectionEnd: 2 }, '**');
    editor.value?.applyEdit(result);
    await nextTick();
    expect(model.value).toBe('**正文**');
    expect(editor.value?.canUndo()).toBe(true);
    expect(editor.value?.undo()).toBe(true);
    await nextTick();
    expect(model.value).toBe('正文');
    expect(editor.value?.redo()).toBe(true);
    await nextTick();
    expect(model.value).toBe('**正文**');
  });

  it('语言选择只修改当前围栏，保留代码和光标并支持独立撤销/重做', async () => {
    const source = '```js\nconst value = 42;\n```';
    const { editor, model, host } = await mountEditor(source);
    editor.value?.setSelection(source.indexOf('value'));
    await nextTick();
    const trigger = host.querySelector<HTMLElement>('[role="combobox"]');
    expect(trigger?.getAttribute('aria-label')).toBe('代码语言');
    trigger?.click();
    await nextTick();
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find((item) =>
      item.textContent?.includes('Python'),
    );
    expect(option).toBeTruthy();
    option?.click();
    await nextTick();
    expect(model.value).toBe(source.replace('```js', '```python'));
    expect(editor.value?.getSelection().from).toBe(model.value.indexOf('value'));
    editor.value?.undo();
    await nextTick();
    expect(model.value).toBe(source);
    editor.value?.redo();
    await nextTick();
    expect(model.value).toContain('```python');
    editor.value?.replaceAll('ordinary prose', false);
    await nextTick();
    expect(host.querySelector('[role="combobox"]')).toBeNull();
  });

  it('所有代码块入口常显，修改第二块不依赖光标且前文编辑后仍定位正确', async () => {
    const source = '正文\n\n```js\nconst value = 42;\n```\n\n```python\ndef second(): pass\n```';
    const { host, editor, model } = await mountEditor(source);
    editor.value?.setSelection(0);
    await nextTick();
    expect(host.querySelectorAll('[role="combobox"]')).toHaveLength(2);
    editor.value?.replaceRange(0, 0, '新增正文\n', 0);
    await nextTick();
    const select = host.querySelectorAll<HTMLElement>('[role="combobox"]')[1];
    select.click();
    await nextTick();
    const sql = Array.from(
      document.getElementById(select.getAttribute('aria-controls')!)!.querySelectorAll<HTMLElement>('[role="option"]'),
    ).find((item) => item.textContent?.trim() === 'SQL');
    sql?.click();
    await nextTick();
    expect(model.value).toBe('新增正文\n' + source.replace('```python', '```sql'));
    expect(editor.value?.getSelection()).toEqual({ from: 0, to: 0 });
    editor.value?.undo();
    await nextTick();
    expect(model.value).toBe('新增正文\n' + source);
    editor.value?.setSelection(model.value.indexOf('second'));
    await nextTick();
    expect(host.querySelectorAll('[role="combobox"]')).toHaveLength(2);
  });

  it('切换只读状态后语言控件同步恢复，重新打开时读取保存的围栏语言', async () => {
    const source = '```python\ndef example(): pass\n```';
    const { host, editor, readonlyModel } = await mountEditor(source, true);
    editor.value?.setSelection(18);
    await nextTick();
    expect(host.querySelector('[role="combobox"]')).toBeNull();
    readonlyModel.value = false;
    await nextTick();
    expect(host.querySelector('[role="combobox"]')?.textContent).toContain('Python');
    readonlyModel.value = true;
    await nextTick();
    expect(host.querySelector('[role="combobox"]')).toBeNull();
  });

  it('只读模式拒绝工具栏写入', async () => {
    const { editor, model } = await mountEditor('不可修改', true);
    editor.value?.replaceRange(0, 0, '# ');
    await nextTick();
    expect(model.value).toBe('不可修改');
  });

  it('支持常用 Markdown 键盘命令，并进入同一撤销历史', async () => {
    const { host, editor, model, commands } = await mountEditor('正文');
    editor.value?.setSelection(0, 2);

    dispatchModShortcut(host, 'b');
    await nextTick();
    expect(model.value).toBe('**正文**');

    expect(editor.value?.undo()).toBe(true);
    await nextTick();
    expect(model.value).toBe('正文');

    editor.value?.setSelection(0, 2);
    dispatchModShortcut(host, 'k');
    await nextTick();
    expect(model.value).toContain('[正文](');

    dispatchModShortcut(host, '1');
    await nextTick();
    expect(commands.value).toContain('heading1');
  });

  it('让外部资源选择器优先处理导航键，未拦截时仍执行编辑器默认键位', async () => {
    let pickerOpen = true;
    const handledKeys: string[] = [];
    const { host, editor, model } = await mountEditor('@资源', false, false, (event) => {
      handledKeys.push(event.key);
      if (pickerOpen && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) event.preventDefault();
    });
    const content = host.querySelector<HTMLElement>('.cm-content');
    editor.value?.setSelection(3);

    content?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true }),
    );
    expect(handledKeys).toContain('ArrowDown');
    expect(editor.value?.getSelection()).toEqual({ from: 3, to: 3 });

    content?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
    );
    await nextTick();
    expect(model.value).toBe('@资源');

    pickerOpen = false;
    content?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
    );
    await nextTick();
    expect(model.value).toBe('@资源\n');
  });

  it('Mod+F 交给统一顶部搜索栏，并由外置 API 完成查找与替换', async () => {
    const { host, model, editor, commands } = await mountEditor('查找正文，继续查找正文');

    dispatchModShortcut(host, 'f');
    await nextTick();

    expect(commands.value).toContain('findReplace');
    expect(host.querySelector('.cm-search')).toBeNull();

    const request = { query: '查找', replacement: '搜索', matchCase: false, wholeWord: false };
    expect(editor.value?.runSearch(request, 'next')).toBe(2);
    expect(editor.value?.getSelectedText()).toBe('查找');
    expect(editor.value?.replaceSearchMatch(request)).toBe(1);
    await nextTick();
    expect(model.value).toBe('搜索正文，继续查找正文');
    editor.value?.clearSearch();
  });

  it('编辑区滚动条只在滚动期间进入可见状态', async () => {
    const { host } = await mountEditor(Array.from({ length: 80 }, (_, index) => `第 ${index + 1} 行`).join('\n'));
    const scroller = host.querySelector<HTMLElement>('.cm-scroller');
    expect(scroller?.classList.contains('auto-scrollbar')).toBe(true);
    expect(scroller?.classList.contains('is-scrolling')).toBe(false);
    scroller?.dispatchEvent(new Event('scroll'));
    expect(scroller?.classList.contains('is-scrolling')).toBe(true);
  });

  it('不挂载行号或折叠轨道，正文直接从编辑区内边距开始', async () => {
    const { host } = await mountEditor('# 一级标题\n\n正文第一行\n正文第二行\n\n# 下一个标题');
    expect(host.querySelector('.cm-lineNumbers')).toBeNull();
    expect(host.querySelector('.cm-foldGutter')).toBeNull();
    expect(host.querySelector('.cm-gutters')).toBeNull();
    expect(host.querySelector('.ln-cm-fold-marker')).toBeNull();
  });

  it('聚焦时只显示光标，不给当前逻辑行添加整块背景', async () => {
    const { host, editor } = await mountEditor('第一行\n第二行');
    editor.value?.setSelection(2);
    editor.value?.focus({ preventScroll: true });
    await nextTick();

    expect(document.activeElement).toBe(host.querySelector('.cm-content'));
    expect(host.querySelector('.cm-activeLine')).toBeNull();
  });

  it('桌面端和移动端都按编辑区宽度软换行且不改写 Markdown 源码', async () => {
    const longLine = '一段很长的 Markdown 正文 '.repeat(30);
    const desktop = await mountEditor(longLine);
    const mobile = await mountEditor(longLine, false, true);

    expect(desktop.host.querySelector('.cm-content')?.classList.contains('cm-lineWrapping')).toBe(true);
    expect(mobile.host.querySelector('.cm-content')?.classList.contains('cm-lineWrapping')).toBe(true);
    expect(desktop.editor.value?.getValue()).toBe(longLine);
    expect(mobile.editor.value?.getValue()).toBe(longLine);
  });
});

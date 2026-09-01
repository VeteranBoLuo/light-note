import { createApp, defineComponent, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGlobalSearch } from '@/api/search';
import zhCN from '@/i18n/locales/zh-CN';
import TodoResourceMentionInput from './TodoResourceMentionInput.vue';

vi.mock('@/api/search', () => ({
  fetchGlobalSearch: vi.fn(),
}));

vi.mock('@/utils/textareaCaret', () => ({
  getTextareaCaretRect: vi.fn(() => ({ left: 160, top: 90, height: 20 })),
  toAnchorOffset: vi.fn(() => ({ left: 80, top: 24, lineHeight: 20 })),
}));

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe('TodoResourceMentionInput', () => {
  const mounted: Array<{ app: ReturnType<typeof createApp>; host: HTMLElement }> = [];
  const searchMock = vi.mocked(fetchGlobalSearch);
  let backgroundKeydownListener: ((event: KeyboardEvent) => void) | null = null;

  beforeEach(() => {
    document.querySelectorAll('.b-popover-panel').forEach((panel) => panel.remove());
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    searchMock.mockResolvedValue({
      items: [{ type: 'bookmark', id: 'bookmark-1', title: 'codex 雷达' }],
    } as Awaited<ReturnType<typeof fetchGlobalSearch>>);
  });

  afterEach(() => {
    mounted.splice(0).forEach(({ app, host }) => {
      app.unmount();
      host.remove();
    });
    document.querySelectorAll('.b-popover-panel').forEach((panel) => panel.remove());
    if (backgroundKeydownListener) document.removeEventListener('keydown', backgroundKeydownListener);
    backgroundKeydownListener = null;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function mountMentionInput() {
    const host = document.createElement('div');
    document.body.append(host);
    const model = ref('说明 ');
    const selected = vi.fn();
    const App = defineComponent({
      components: { TodoResourceMentionInput },
      setup: () => ({ model, selected }),
      template: `
        <TodoResourceMentionInput
          v-model:value="model"
          placeholder="补充说明"
          @select="selected"
        />
      `,
    });
    const app = createApp(App);
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.component('OriginalIcon', { template: '<span />' });
    app.mount(host);
    mounted.push({ app, host });
    return { host, model, selected };
  }

  async function waitUntil(assertion: () => boolean, label: string, timeoutMs = 2000) {
    const startedAt = Date.now();
    while (!assertion()) {
      if (Date.now() - startedAt >= timeoutMs) throw new Error(`等待超时：${label}`);
      await new Promise((resolve) => window.setTimeout(resolve, 20));
      await nextTick();
    }
  }

  async function typeMention(textarea: HTMLTextAreaElement, text: string) {
    textarea.value = text;
    textarea.setSelectionRange(text.length, text.length);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await waitUntil(
      () => Boolean(document.body.querySelector('.todo-resource-mention-popover .resource-picker-panel__item')),
      '资源浮层完成搜索并可交互',
    );
  }

  it('直接输入 @关键词时在光标锚点打开无搜索框的紧凑浮层', async () => {
    const { host } = mountMentionInput();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea');
    expect(textarea).not.toBeNull();

    await typeMention(textarea!, '说明 @codex');

    const anchor = host.querySelector<HTMLElement>('.todo-resource-mention-input__anchor');
    const panel = document.body.querySelector<HTMLElement>('.todo-resource-mention-popover');
    expect(anchor?.style.left).toBe('80px');
    expect(anchor?.style.top).toBe('24px');
    expect(panel?.querySelector('.resource-picker-panel')?.classList.contains('is-inline')).toBe(true);
    expect(panel?.querySelector('input')).toBeNull();
    expect(searchMock).toHaveBeenLastCalledWith('codex', 12, true, {
      sort: 'relevance',
      types: ['bookmark', 'note', 'file'],
    });
  });

  it('选择候选后消费 @关键词、发出结构化资源并把焦点留在说明框', async () => {
    const { host, model, selected } = mountMentionInput();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!;
    await typeMention(textarea, '说明 @codex');

    document.body
      .querySelector<HTMLButtonElement>('.todo-resource-mention-popover .resource-picker-panel__item')
      ?.click();
    await nextTick();

    expect(model.value).toBe('说明 ');
    expect(selected).toHaveBeenCalledWith({ type: 'bookmark', id: 'bookmark-1', title: 'codex 雷达' });
    expect(document.activeElement).toBe(textarea);
  });

  it('第一次 Escape 只关闭资源浮层，第二次新的 Escape 才抵达背景层', async () => {
    const { host } = mountMentionInput();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!;
    await typeMention(textarea, '说明 @codex');
    const backgroundEscape = vi.fn();
    backgroundKeydownListener = backgroundEscape;
    document.addEventListener('keydown', backgroundKeydownListener);

    const firstEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    expect(textarea.dispatchEvent(firstEscape)).toBe(false);
    expect(backgroundEscape).not.toHaveBeenCalled();

    await waitUntil(
      () => document.body.querySelector('.todo-resource-mention-popover') === null,
      'Escape 关闭资源浮层',
    );

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(backgroundEscape).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', backgroundKeydownListener);
    backgroundKeydownListener = null;
  });

  it('焦点离开说明框或父表单重置内容时关闭旧查询', async () => {
    const { host, model } = mountMentionInput();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!;
    await typeMention(textarea, '说明 @codex');

    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
    await waitUntil(
      () => document.body.querySelector('.todo-resource-mention-popover') === null,
      '焦点离开后关闭资源浮层',
    );

    textarea.focus();
    await typeMention(textarea, '新的说明 @codex');
    model.value = '已切换到另一条待办';
    await waitUntil(
      () => document.body.querySelector('.todo-resource-mention-popover') === null,
      '父表单重置后关闭旧资源浮层',
    );
    outside.remove();
  });
});

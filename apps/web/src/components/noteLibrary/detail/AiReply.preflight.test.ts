import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import AiReply from './AiReply.vue';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), applied: vi.fn() }));
vi.mock('@/api/aiSkillApi', () => ({
  createAiSkillRequest: (input: unknown) => input,
  executeAiSkillStream: mocks.execute,
}));
vi.mock('@/api/aiTelemetry', () => ({ recordAiSkillApplied: mocks.applied }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/components/base/TypewriterOutput.vue', () => ({
  default: { props: ['content'], template: '<div>{{ content }}</div>' },
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible'],
    emits: ['update:visible'],
    template:
      '<div v-if="visible" role="dialog"><slot name="title" /><slot /><slot name="footer" :close="() => $emit(\'update:visible\', false)" /></div>',
  },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.clearAllMocks();
  mocks.execute.mockReset();
  vi.restoreAllMocks();
});

function mount(content: string, type = 'html') {
  const note = reactive({ id: 'note-preflight-fixture', title: '标题', content, type });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(AiReply) });
  app.provide('note', note);
  app.use(createPinia()).use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      missingWarn: false,
      fallbackWarn: false,
      messages: { 'zh-CN': { ai: { reply: { emptySourceHint: '请先输入要处理的正文，再使用 AI。' } } } },
    }),
  );
  app.directive('click-log', {});
  app.directive('auto-scrollbar', {});
  app.directive('mermaid', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, note, click: () => host.querySelector<HTMLButtonElement>('.action-btn')!.click() };
}

const complete = {
  requestId: 'preflight-request',
  result: { kind: 'grounded_markdown', content: '<p>已有的 AI 建议</p>' },
};

describe('笔记 AI 空内容前置提示', () => {
  it.each([
    ['', 'html'],
    [' \n\t', 'markdown'],
    ['<p><br></p><div>&nbsp;</div>', 'html'],
    ['<!-- empty -->', 'html'],
  ])('空内容 %j (%s) 不请求 AI、不进入加载，并保留用户要求', async (content, type) => {
    const view = mount(content, type);
    const input = view.host.querySelector<HTMLTextAreaElement>('.ai-input textarea')!;
    input.value = '请保留原有结构';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    view.click();
    await vi.waitFor(() => expect(view.host.textContent).toContain('请先输入要处理的正文'));
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.applied).not.toHaveBeenCalled();
    expect(input.value).toBe('请保留原有结构');
    expect(view.host.querySelector('.generation-state')).toBeNull();
    expect(view.host.querySelector('.generation-feedback button')).toBeNull();
  });

  it.each([
    ['<p>有效正文</p>', 'html'],
    ['<pre><code>&lt;div&gt;代码&lt;/div&gt;</code></pre>', 'html'],
    ['<table><tr><td>项目</td><td>金额</td></tr></table>', 'html'],
    ['<img src="https://example.com/fixture.png" alt="图片" />', 'html'],
    ['```html\n<div>代码</div>\n```', 'markdown'],
  ])('正常文字、代码和表格继续按原始格式处理：%s', async (content, type) => {
    mocks.execute.mockResolvedValueOnce(complete);
    const view = mount(content, type);
    view.click();
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    expect(mocks.execute.mock.calls[0][0].input.text).toBe(content);
    expect(view.host.textContent).not.toContain('请先输入要处理的正文');
    await nextTick();
  });

  it('空正文校验不会清空已有结果，补充正文后提示消失并可再次生成', async () => {
    mocks.execute.mockResolvedValue(complete);
    const view = mount('<p>原正文</p>');
    view.click();
    await vi.waitFor(() => expect(view.host.textContent).toContain('已有的 AI 建议'));
    view.note.content = '<p><br></p>';
    await nextTick();
    view.click();
    await vi.waitFor(() => expect(view.host.textContent).toContain('请先输入要处理的正文'));
    expect(view.host.textContent).toContain('已有的 AI 建议');
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    view.note.content = '<p>补充的正文</p>';
    await nextTick();
    expect(view.host.textContent).not.toContain('请先输入要处理的正文');
    view.click();
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
  });

  it('原笔记清空后仍能以已有 AI 结果追问，不受原文空值影响', async () => {
    mocks.execute.mockResolvedValue(complete);
    const view = mount('<p>原正文</p>');
    view.click();
    await vi.waitFor(() => expect(view.host.textContent).toContain('已有的 AI 建议'));
    view.note.content = '';
    await nextTick();
    view.host.querySelector<HTMLButtonElement>('.output-actions button[title="ai.reply.expand"]')!.click();
    await nextTick();
    const input = view.host.querySelector<HTMLInputElement>('.ai-preview-followup input')!;
    input.value = '再简洁一点';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    view.host.querySelector<HTMLButtonElement>('.ai-preview-followup button')!.click();
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
    expect(mocks.execute.mock.calls[1][0].input.text).toContain('已有的 AI 建议');
  });
});

describe('笔记 AI 流式失败恢复', () => {
  it.each(['', '已经收到的部分正文'])('失败时保留已接收正文 %j，不把内部标记当成结果', async (partial) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.execute.mockImplementationOnce(async (_request, handlers) => {
      if (partial) handlers.onDelta(partial);
      throw new Error('fixture stream failed');
    });
    const view = mount('<p>有效正文</p>');
    view.click();
    await vi.waitFor(() =>
      expect(view.host.querySelector('.generation-feedback')?.textContent).toContain('fixture stream failed'),
    );
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(view.host.textContent).not.toMatch(/【标题】|【正文】/);
    if (partial) expect(view.host.querySelector('.output-body')?.textContent).toContain(partial);
    else expect(view.host.querySelector('.output-actions')).toBeNull();
    expect(view.host.querySelector('.generation-status')).toBeNull();
  });
});

describe('笔记 AI 侧栏与预览操作', () => {
  it('补充要求默认折叠，折叠后草稿仍用于快捷处理和自定义处理', async () => {
    mocks.execute.mockResolvedValue(complete);
    const view = mount('<p>原正文</p>');
    const toggle = view.host.querySelector<HTMLButtonElement>('button[aria-controls]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    await nextTick();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const input = view.host.querySelector<HTMLTextAreaElement>('.ai-input textarea')!;
    input.value = '请保留原有结构';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    toggle.click();
    await nextTick();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    view.click();
    await vi.waitFor(() =>
      expect(view.host.querySelector('.output-footer button')?.hasAttribute('disabled')).toBe(false),
    );
    expect(mocks.execute.mock.calls[0][0].input.instruction).toContain('请保留原有结构');
    toggle.click();
    await nextTick();
    expect(input.value).toBe('请保留原有结构');
    view.host.querySelector<HTMLButtonElement>('.custom-process-btn')!.click();
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2));
    expect(mocks.execute.mock.calls[1][0].input.operation).toBe('rewrite');
    expect(mocks.execute.mock.calls[1][0].input.instruction).toContain('请保留原有结构');
  });

  it('仅标题结果展示并应用标题，不出现替换正文操作', async () => {
    mocks.execute.mockResolvedValue({ ...complete, result: { kind: 'grounded_markdown', content: '更清楚的新标题' } });
    const view = mount('<p>保留原正文</p>');
    view.host.querySelectorAll<HTMLButtonElement>('.action-btn')[1].click();
    await vi.waitFor(() =>
      expect(view.host.querySelector('.output-footer button')?.hasAttribute('disabled')).toBe(false),
    );
    const apply = view.host.querySelector<HTMLButtonElement>('.output-footer button')!;
    expect(view.host.querySelectorAll('.output-footer button')).toHaveLength(1);
    expect(apply.textContent).toBe('ai.reply.replaceTitle');
    apply.click();
    await nextTick();
    expect(view.note.title).toBe('更清楚的新标题');
    expect(view.note.content).toBe('<p>保留原正文</p>');
    expect(mocks.applied).toHaveBeenCalledTimes(1);
    view.host.querySelector<HTMLButtonElement>('.output-actions button[title="ai.reply.expand"]')!.click();
    await nextTick();
    const actions = view.host.querySelector('.ai-preview-actions')!;
    expect(actions.textContent).toContain('ai.reply.replaceTitle');
    expect(actions.textContent).not.toContain('ai.reply.replaceContent');
    expect(view.host.querySelector('.ai-preview-col--origin')?.textContent).toContain('更清楚的新标题');
  });

  it('生成中禁用重复处理，放大预览可以停止，结束后恢复追问入口', async () => {
    mocks.execute.mockImplementationOnce(
      (_request, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = mount('<p>有效正文</p>');
    view.click();
    await nextTick();
    expect(
      Array.from(view.host.querySelectorAll<HTMLButtonElement>('.action-btn')).every((button) => button.disabled),
    ).toBe(true);
    expect(view.host.querySelector<HTMLButtonElement>('.custom-process-btn')?.disabled).toBe(true);
    expect(view.host.querySelector<HTMLButtonElement>('.output-footer button')?.disabled).toBe(true);
    view.host.querySelector<HTMLButtonElement>('.output-actions button[title="ai.reply.expand"]')!.click();
    await nextTick();
    const stop = view.host.querySelector<HTMLButtonElement>('.ai-preview-followup button')!;
    expect(stop.textContent).toContain('ai.reply.stop');
    stop.click();
    await vi.waitFor(() =>
      expect(view.host.querySelector('.ai-preview-followup button')?.textContent).toContain('ai.reply.followupSend'),
    );
    expect(view.host.querySelector('.ai-preview-body .generation-feedback')?.textContent).toContain(
      'ai.reply.generationStopped',
    );
    expect(
      Array.from(view.host.querySelectorAll<HTMLButtonElement>('.action-btn')).every((button) => !button.disabled),
    ).toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('结果正文通过页脚替换，关闭预览保留结果', async () => {
    mocks.execute.mockResolvedValue(complete);
    const view = mount('<p>原正文</p>');
    view.click();
    await vi.waitFor(() =>
      expect(view.host.querySelector('.output-footer button')?.hasAttribute('disabled')).toBe(false),
    );
    view.host.querySelector<HTMLButtonElement>('.output-actions button[title="ai.reply.expand"]')!.click();
    await nextTick();
    view.host.querySelector<HTMLButtonElement>('.ai-preview-actions button')!.click();
    await nextTick();
    expect(view.host.querySelector('[role="dialog"]')).toBeNull();
    expect(view.host.querySelector('.output-body')?.textContent).toContain('已有的 AI 建议');
    view.host.querySelector<HTMLButtonElement>('.output-footer button')!.click();
    await nextTick();
    expect(view.note.content).toBe('<p>已有的 AI 建议</p>');
    expect(mocks.applied).toHaveBeenCalledTimes(1);
  });
});

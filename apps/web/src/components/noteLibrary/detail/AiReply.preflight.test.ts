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
  default: { props: ['visible'], template: '<div v-if="visible"><slot /></div>' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.clearAllMocks();
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

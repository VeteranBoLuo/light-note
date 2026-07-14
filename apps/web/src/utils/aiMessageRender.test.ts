// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderAssistantMarkdown } from './aiMessageRender';

describe('AI 消息安全渲染', () => {
  it('保留 Markdown 结构并移除事件处理器', () => {
    const html = renderAssistantMarkdown('# 标题\n\n- 列表\n\n<img src="x" onerror="alert(1)">');
    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<li>列表</li>');
    expect(html).not.toContain('onerror');
  });

  it('禁止 javascript 链接协议', () => {
    const html = renderAssistantMarkdown('[危险链接](javascript:alert(1))');
    expect(html).not.toMatch(/href=["']javascript:/i);
  });

  it('代码块仍能正常渲染', () => {
    const html = renderAssistantMarkdown('```js\nconst n = 1\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
  });
});

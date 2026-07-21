// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { closeStreamingMarkdown, renderAssistantMarkdown, renderStreamingMarkdown } from './aiMessageRender';

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

  it('代码块用 highlight.js 上色，且 hljs 的 token span 不被 DOMPurify 净化掉', () => {
    const html = renderAssistantMarkdown('```js\nconst n = 1\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('language-js');
    // const 被识别为 JS 关键字 → 生成 hljs 高亮 span，且需通过 span 白名单保留下来
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('<span');
  });

  it('只将证据协议中存在的引用编号转为可访问链接', () => {
    const html = renderAssistantMarkdown('已核验 [1]，未知 [2]。', ['1']);
    expect(html).toContain('class="ai-inline-citation"');
    expect(html).toContain('data-citation-key="1"');
    expect(html).toContain('href="#ai-evidence-1"');
    expect(html).toContain('未知 [2]');
  });

  it('不会改写代码块、行内代码和已有链接中的引用编号', () => {
    const html = renderAssistantMarkdown('`[E1]`\n\n```txt\n[E1]\n```\n\n[原链接 [E1]](https://example.com)', ['E1']);
    expect(html.match(/ai-inline-citation/g) || []).toHaveLength(0);
    expect(html).toContain('[E1]');
  });
});

describe('closeStreamingMarkdown（流式未闭合语法补全）', () => {
  it('空内容与已完整的内容原样返回', () => {
    expect(closeStreamingMarkdown('')).toBe('');
    expect(closeStreamingMarkdown('普通一段文字，没有任何标记')).toBe('普通一段文字，没有任何标记');
  });

  it('未闭合的围栏代码块补上闭合（含语言标注、只开了围栏两种情形）', () => {
    expect(closeStreamingMarkdown('```js\nconst a = 1')).toBe('```js\nconst a = 1\n```');
    expect(closeStreamingMarkdown('前言\n```')).toBe('前言\n```\n```');
  });

  it('已配对的围栏代码块不改动', () => {
    const complete = '```ts\nconst a = 1;\n```';
    expect(closeStreamingMarkdown(complete)).toBe(complete);
  });

  it('~~~ 围栏与 4+ 反引号围栏按对应标记补全', () => {
    expect(closeStreamingMarkdown('~~~\ncode')).toBe('~~~\ncode\n~~~');
    expect(closeStreamingMarkdown('````\ncode')).toBe('````\ncode\n````');
  });

  it('正文区未闭合的行内代码补一个反引号；已配对则不动', () => {
    expect(closeStreamingMarkdown('调用 `foo(')).toBe('调用 `foo(`');
    expect(closeStreamingMarkdown('调用 `foo()` 之后')).toBe('调用 `foo()` 之后');
  });

  it('围栏未闭合时优先补围栏，不被围栏内的反引号干扰行内判断', () => {
    expect(closeStreamingMarkdown('```\nconst s = `tpl')).toBe('```\nconst s = `tpl\n```');
  });
});

describe('renderStreamingMarkdown（流式轻量渲染）', () => {
  it('把常见 Markdown 渲染成 HTML', () => {
    expect(renderStreamingMarkdown('## 小标题')).toContain('<h2');
    expect(renderStreamingMarkdown('**加粗**')).toContain('<strong>');
    expect(renderStreamingMarkdown('- 一\n- 二')).toContain('<li>');
  });

  it('未闭合的围栏代码块也能正确渲染成代码块，不把后文吞成代码、不残留原始符号', () => {
    const html = renderStreamingMarkdown('```js\nconst a = 1');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
    expect(html).not.toContain('```');
  });

  it('流式阶段不做引用装饰：[1] 保持普通文本，不生成引用链接', () => {
    const html = renderStreamingMarkdown('见来源 [1] 的说明');
    expect(html).not.toContain('ai-inline-citation');
  });
});

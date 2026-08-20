// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  closeStreamingMarkdown,
  renderAssistantMarkdown,
  renderStreamingMarkdown,
  repairAiBareUrlBoundaries,
} from './aiMessageRender';

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

  it('只将证据协议中存在的引用编号转为可聚焦的角标(不可点、无 href)', () => {
    const html = renderAssistantMarkdown('已核验 [1]，未知 [2]。', ['1']);
    expect(html).toContain('class="ai-inline-citation"');
    expect(html).toContain('data-citation-key="1"');
    // 角标已是不可点的 span:必须可键盘聚焦(tabindex),且不再是带 href 的跳转链接
    expect(html).toContain('tabindex="0"');
    expect(html).not.toContain('href="#ai-evidence-1"');
    expect(html).toContain('未知 [2]');
  });

  it('不会改写代码块、行内代码和已有链接中的引用编号', () => {
    const html = renderAssistantMarkdown('`[E1]`\n\n```txt\n[E1]\n```\n\n[原链接 [E1]](https://example.com)', ['E1']);
    expect(html.match(/ai-inline-citation/g) || []).toHaveLength(0);
    expect(html).toContain('[E1]');
  });

  it('中文括号中的裸 URL 不会吞掉后续标题与引用编号', () => {
    const html = renderAssistantMarkdown(
      '你收藏的这个地址是百度首页（https://baidu.com），标题为“百度一下，你就知道”[1]。',
      ['1'],
    );
    const root = document.createElement('div');
    root.innerHTML = html;
    const link = root.querySelector('a');
    expect(link?.textContent).toBe('https://baidu.com');
    expect(link?.getAttribute('href')).toBe('https://baidu.com');
    expect(link?.nextSibling?.textContent).toContain('），标题为“百度一下，你就知道”');
    expect(root.querySelector('.ai-inline-citation')?.textContent).toBe('[1]');
  });

  it('保留 URL 内部成对括号和中文路径，只截断真正的句子标点', () => {
    const html = renderAssistantMarkdown('参见 https://example.com/wiki/中文_(说明)，然后继续。');
    const root = document.createElement('div');
    root.innerHTML = html;
    expect(root.querySelector('a')?.textContent).toBe('https://example.com/wiki/中文_(说明)');
    expect(root.textContent).toContain('，然后继续。');
  });

  it('不改写显式 Markdown 链接的自定义文字', () => {
    const html = renderAssistantMarkdown('[https://example.com，完整标签](https://example.com)');
    expect(html).toContain('>https://example.com，完整标签</a>');
  });

  it('裸链接边界修正拒绝非 HTTP 链接和自定义 href', () => {
    expect(repairAiBareUrlBoundaries('<a href="/help">https://example.com），帮助</a>')).toContain(
      '>https://example.com），帮助</a>',
    );
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

  it('流式阶段同样不会让裸 URL 吞掉中文尾随正文', () => {
    const html = renderStreamingMarkdown('查看（https://example.com），然后继续');
    const root = document.createElement('div');
    root.innerHTML = html;
    expect(root.querySelector('a')?.textContent).toBe('https://example.com');
    expect(root.textContent).toContain('），然后继续');
  });
});

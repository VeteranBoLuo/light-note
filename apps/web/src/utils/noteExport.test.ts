import { describe, expect, it } from 'vitest';
import { buildNoteExportHtml, buildNoteExportMarkdown, renderMarkdownForExport } from './noteExport';
import { createNoteTurndownService } from './noteHtmlToMarkdown';

const MD_SOURCE = `# 我的第一篇笔记

把这篇示例改成你自己的内容吧。

## 今天想做的事

- [ ] 收藏一篇稍后阅读的文章
- [x] 记录一个突然出现的灵感

**加粗** 和 *斜体*，还有 [链接](https://example.com)。

\`\`\`js
const a = 1;
\`\`\`
`;

describe('buildNoteExportMarkdown', () => {
  const turndown = createNoteTurndownService();
  const toMd = (html: string) => turndown.turndown(html);

  it('markdown 笔记原样输出，不经 turndown 破坏语法与换行', () => {
    const out = buildNoteExportMarkdown('我的第一篇笔记', MD_SOURCE, 'markdown', toMd);
    // 旧实现会把 # 转义成 \\#、** 转义成 \\*\\*，并把整篇压成一行
    expect(out).not.toContain('\\#');
    expect(out).not.toContain('\\*');
    expect(out).toContain('- [ ] 收藏一篇稍后阅读的文章');
    expect(out).toContain('```js');
    // 换行结构完整保留
    expect(out.split('\n').length).toBeGreaterThan(10);
  });

  it('markdown 笔记正文已自带 H1 时不再重复补标题', () => {
    const out = buildNoteExportMarkdown('我的第一篇笔记', MD_SOURCE, 'markdown', toMd);
    expect(out.match(/^# /gm)?.length).toBe(1);
  });

  it('html 笔记走 turndown 转换，并补上标题', () => {
    const out = buildNoteExportMarkdown(
      '富文本笔记',
      '<p><strong>加粗</strong>段落</p><ul><li>列表项</li></ul>',
      'html',
      toMd,
    );
    expect(out.startsWith('# 富文本笔记')).toBe(true);
    expect(out).toContain('**加粗**');
    expect(out).toContain('列表项');
  });

  it('turndown 抛错时降级为原文，不让导出失败', () => {
    const out = buildNoteExportMarkdown('异常笔记', '<p>正文</p>', 'html', () => {
      throw new Error('boom');
    });
    expect(out).toContain('<p>正文</p>');
  });
});

describe('renderMarkdownForExport', () => {
  it('markdown 源码渲染为 HTML 结构，而不是原样文本', async () => {
    const html = await renderMarkdownForExport(MD_SOURCE);
    expect(html).toContain('<h1');
    expect(html).toContain('<h2');
    expect(html).toContain('<code');
    // 任务清单渲染成 checkbox，且导出为静态文件时不可交互
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('disabled');
    // 不应残留 markdown 原始符号
    expect(html).not.toContain('- [ ]');
  });

  it('空 Markdown 待办导出时仍保留复选框语义', async () => {
    const html = await renderMarkdownForExport('- [ ]');

    expect(html).toContain('type="checkbox"');
    expect(html).toContain('class="note-task-list"');
    expect(html).not.toContain('[ ]');
  });

  it('消毒掉脚本，避免导出的 HTML 变成可执行载体', async () => {
    const html = await renderMarkdownForExport('正常内容\n\n<script>alert(1)</script>');
    expect(html).not.toContain('<script');
  });
});

describe('buildNoteExportHtml', () => {
  it('输出自包含文档:内联样式且不依赖站内 CSS 变量', () => {
    const doc = buildNoteExportHtml('标题', '<p>正文</p>');
    expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(doc).toContain('<style>');
    // 离线打开时 var(--x) 会全部失效，必须是固定色值
    expect(doc).not.toContain('var(--');
    // 覆盖表格/代码块/任务清单/资源引用胶囊
    expect(doc).toContain('table th');
    expect(doc).toContain('pre code');
    expect(doc).toContain("input[type='checkbox']");
    expect(doc).toContain('a.ln-resource-link');
  });

  it('正文已以 h1 开头时不再重复补标题（md 笔记首行常是 # 标题）', () => {
    const doc = buildNoteExportHtml('我的第一篇笔记', '<h1>我的第一篇笔记</h1>\n<p>正文</p>');
    expect(doc.match(/<h1/g)?.length).toBe(1);
  });

  it('正文没有标题时补上，避免离线打开看不出这是哪篇笔记', () => {
    const doc = buildNoteExportHtml('富文本笔记', '<p>正文</p>');
    expect(doc).toContain('<h1>富文本笔记</h1>');
  });

  it('标题参与转义，防止破坏文档结构', () => {
    const doc = buildNoteExportHtml('<img src=x onerror=alert(1)>', '<p>正文</p>');
    expect(doc).not.toContain('<img src=x');
    expect(doc).toContain('&lt;img src=x');
  });
});

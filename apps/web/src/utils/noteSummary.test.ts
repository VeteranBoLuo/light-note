import { describe, expect, it } from 'vitest';
import { htmlToSummaryLines, noteSummaryText, truncateSummary } from './noteSummary.ts';

const MARKDOWN_WITH_HTML_IN_CODE = [
  '## 1. 快速实现接口与响应',
  '',
  'FastAPI可以定义Get、Post等各种类型的HTTP接口。',
  '',
  '```python',
  'from fastapi import FastAPI',
  'app = FastAPI()',
  '@app.get("/")',
  'def index() -> str:',
  '    return HTMLResponse("<h1>Hello World</h1>")',
  '```',
  '',
  '## 2. URL及参数',
].join('\n');

describe('noteSummary', () => {
  it('Markdown 正文里出现 HTML 标签时,摘要仍保留真实正文(旧实现只剩 Hello World)', async () => {
    const summary = await noteSummaryText(MARKDOWN_WITH_HTML_IN_CODE, 'markdown', { maxLength: 300 });

    expect(summary).toContain('快速实现接口与响应');
    expect(summary).toContain('FastAPI可以定义Get、Post等各种类型的HTTP接口。');
    expect(summary).toContain('URL及参数');
    // 代码块里的标签只能作为字面文本出现,不能被当成真的元素
    expect(summary).toContain('<h1>Hello World</h1>');
    expect(summary.startsWith('Hello World')).toBe(false);
  });

  it('Markdown 语法符号不进摘要,标题与段落各自成行', async () => {
    const summary = await noteSummaryText('# 标题\n\n正文**加粗**内容', 'markdown');

    expect(summary).toBe('标题\n正文加粗内容');
  });

  it('singleLine 把块级换行压成空格,供列表单行展示', async () => {
    const summary = await noteSummaryText('# 标题\n\n正文', 'markdown', { singleLine: true });

    expect(summary).toBe('标题 正文');
  });

  it('HTML 笔记取渲染后的可见文本,脚本内容不进摘要', async () => {
    const summary = await noteSummaryText('<p>第一段</p><script>alert(1)</script><p>第二段</p>', 'html');

    expect(summary).toBe('第一段\n第二段');
  });

  it('htmlToSummaryLines 按块级元素分行,行内元素并入同一行', () => {
    const lines = htmlToSummaryLines('<p>前<strong>中</strong>后</p><ul><li>甲</li><li>乙</li></ul>');

    expect(lines).toEqual(['前中后', '甲', '乙']);
  });

  it('超长摘要按上限截断并补省略号', () => {
    expect(truncateSummary('abcdefg', 3)).toBe('abc…');
    expect(truncateSummary('abc', 10)).toBe('abc');
  });

  it('图表源码不进摘要(卡片上一段 mindmap 源码没有任何信息量)', async () => {
    const md = '# 项目脑图\n\n```mermaid\nmindmap\n  root((轻笺))\n    笔记\n```\n\n下面是正文说明。';
    const summary = await noteSummaryText(md, 'markdown');

    expect(summary).toContain('项目脑图');
    expect(summary).toContain('下面是正文说明。');
    expect(summary).not.toContain('mindmap');
    expect(summary).not.toContain('root((');
  });

  it('富文本笔记里的图表源码块同样不进摘要', async () => {
    const html = '<p>前言</p><pre class="language-mermaid">mindmap\n  root((轻笺))</pre><p>后记</p>';
    const summary = await noteSummaryText(html, 'html');

    expect(summary).toBe('前言\n后记');
  });

  it('空内容返回空串', async () => {
    expect(await noteSummaryText('', 'markdown')).toBe('');
  });
});

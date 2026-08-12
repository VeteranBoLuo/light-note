import { describe, expect, it } from 'vitest';
import {
  htmlToSummaryLines,
  noteCardPreviewFromServer,
  noteCardPreviewText,
  notePreviewOriginalImageUrl,
  noteSummaryFromServerPreview,
  noteSummaryText,
  truncateSummary,
} from './noteSummary.ts';

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

  it('卡片缩略图按 HTML 正文里的真实先后顺序拆分文字', async () => {
    const source = 'https://boluo66.top/uploads/note-flow.png';
    const preview = await noteCardPreviewText(
      `<p>图片上方第一段</p><p>图片上方第二段</p><img src="${source}"><p>图片下方正文</p>`,
      'html',
      `/api/note/image-thumbnail/hash.webp?source=${encodeURIComponent(source)}`,
      { maxLength: 300 },
    );

    expect(preview).toEqual({
      summary: '图片上方第一段\n图片上方第二段\n图片下方正文',
      beforeImage: '图片上方第一段\n图片上方第二段',
      afterImage: '图片下方正文',
      imageLocated: true,
    });
  });

  it('v2 列表预览直接使用服务端纯文本，不依赖正文 content', () => {
    const note = {
      previewSummary: '图片上方\n图片下方',
      previewTextBeforeImage: '图片上方',
      previewTextAfterImage: '图片下方',
      previewImageLocated: true,
      previewImageUrl: '/api/note/image-thumbnail/hash.webp?source=source',
    };

    expect(noteSummaryFromServerPreview(note, { singleLine: true })).toBe('图片上方 图片下方');
    expect(noteCardPreviewFromServer(note, { maxLength: 300 })).toEqual({
      summary: '图片上方\n图片下方',
      beforeImage: '图片上方',
      afterImage: '图片下方',
      imageLocated: true,
    });
    expect(noteSummaryFromServerPreview({ content: '<p>旧响应</p>' })).toBeNull();
  });

  it('只从缩略图参数提取本站 uploads 原图，供 localhost 开发回退', () => {
    const source = 'https://boluo66.top/uploads/note-local-fallback.jpg';
    expect(
      notePreviewOriginalImageUrl(`/api/note/image-thumbnail/hash.webp?source=${encodeURIComponent(source)}`),
    ).toBe(source);
    expect(
      notePreviewOriginalImageUrl(
        `/api/note/image-thumbnail/hash.webp?source=${encodeURIComponent('https://evil.example/cover.jpg')}`,
      ),
    ).toBe('');
    expect(
      notePreviewOriginalImageUrl(
        `/api/note/image-thumbnail/hash.webp?source=${encodeURIComponent('https://boluo66.top/uploads/folder/cover.jpg')}`,
      ),
    ).toBe('');
  });

  it('兼容历史正文中的 HTTP 本站图片地址', async () => {
    const source = 'https://boluo66.top/uploads/note-http-history.png';
    const preview = await noteCardPreviewText(
      '<p>图片之前</p><img src="http://boluo66.top/uploads/note-http-history.png"><p>图片之后</p>',
      'html',
      `/api/note/image-thumbnail/hash.webp?source=${encodeURIComponent(source)}`,
      { maxLength: 300 },
    );

    expect(preview.beforeImage).toBe('图片之前');
    expect(preview.afterImage).toBe('图片之后');
    expect(preview.imageLocated).toBe(true);
  });

  it('Markdown 卡片只定位服务端选中的本站首图，不被前面的外链图改变顺序', async () => {
    const source = 'https://boluo66.top/uploads/note-markdown-flow.webp';
    const markdown = [
      '外链图之前',
      '',
      '![外链](https://example.com/not-preview.png)',
      '',
      '本站图之前',
      '',
      `![本站首图](${source})`,
      '',
      '本站图之后',
    ].join('\n');
    const preview = await noteCardPreviewText(
      markdown,
      'markdown',
      `/api/note/image-thumbnail/hash.webp?source=${encodeURIComponent(source)}`,
      { maxLength: 300 },
    );

    expect(preview.beforeImage).toBe('外链图之前\n本站图之前');
    expect(preview.afterImage).toBe('本站图之后');
    expect(preview.imageLocated).toBe(true);
  });

  it('缩略图来源无法精确对应正文时安全退回“纯文本在前、图片在后”', async () => {
    const preview = await noteCardPreviewText(
      '<p>正文摘要</p><img src="/uploads/note-fallback.png">',
      'html',
      '/api/note/image-thumbnail/hash.webp',
    );

    expect(preview.summary).toBe('正文摘要');
    expect(preview.beforeImage).toBe('正文摘要');
    expect(preview.afterImage).toBe('');
    expect(preview.imageLocated).toBe(false);
  });

  it('空内容返回空串', async () => {
    expect(await noteSummaryText('', 'markdown')).toBe('');
  });
});

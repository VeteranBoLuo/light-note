import { describe, expect, it } from 'vitest';
import { collectResourceRefsFromHtml, parseResourceHref } from './noteResourceRefs';
import {
  buildPdfExcerptHtml,
  buildPdfExcerptMarkdown,
  normalizePdfSelectionText,
  pdfExcerptNoteTitle,
} from './pdfExcerpt';

const source = { fileId: 'f1', fileName: '访谈<指南>.pdf', page: 12, pageLabel: '第 12 页' };

describe('normalizePdfSelectionText', () => {
  it('合并 PDF 硬折行：中文直接相连，英文补空格，断词连字符拼回', () => {
    expect(normalizePdfSelectionText('记录时把受访者的原话和研\n究者的解读分开写。')).toBe(
      '记录时把受访者的原话和研究者的解读分开写。',
    );
    expect(normalizePdfSelectionText('Keep the quote\nseparate from the inter-\npretation.')).toBe(
      'Keep the quote separate from the interpretation.',
    );
    expect(normalizePdfSelectionText('使用\nPDF 文件\n阅读')).toBe('使用PDF 文件阅读');
  });

  it('空行保留为段落分隔，去掉多余空白与零宽字符', () => {
    expect(normalizePdfSelectionText('  第一段\u00a0 第一行\n第二行\n\n\n第二段\u200b  \r\n')).toBe(
      '第一段 第一行第二行\n\n第二段',
    );
    expect(normalizePdfSelectionText(' \n \n')).toBe('');
  });

  it('康熙部首字符转回标准汉字，全角标点保持不变', () => {
    expect(normalizePdfSelectionText('最容易出错的地\u2f45，\u2f7d是\u2f83\u2f30的理解；\u2f00起：「我认为」！')).toBe(
      '最容易出错的地方，而是自己的理解；一起：「我认为」！',
    );
  });

  it('只有大写或数字跟在连字符后时不拼合，避免改坏复合词', () => {
    expect(normalizePdfSelectionText('pre-\nGPT era')).toBe('pre- GPT era');
  });
});

describe('PDF 摘录格式', () => {
  it('富文本：引用块 + 指向该页的文件资源链接，正文与文件名都转义', () => {
    const html = buildPdfExcerptHtml('原话<b>加引号</b>\n\n第二段', source);
    expect(html).toBe(
      '<blockquote><p>原话&lt;b&gt;加引号&lt;/b&gt;</p><p>第二段</p>' +
        '<p>— <a href="/cloudSpace?fileId=f1&amp;page=12" contenteditable="false" data-ln-resource-type="file" data-ln-resource-id="f1">访谈&lt;指南&gt;.pdf</a> · 第 12 页</p></blockquote>',
    );
    expect(collectResourceRefsFromHtml(html)).toEqual([{ type: 'file', id: 'f1' }]);
  });

  it('Markdown：逐段引用，段首的 Markdown 语法被转义', () => {
    const markdown = buildPdfExcerptMarkdown('# 不是标题\n\n- 不是列表', { ...source, fileName: '指南[v2].pdf' });
    expect(markdown).toBe('> \\# 不是标题\n>\n> \\- 不是列表\n>\n> — [指南\\[v2\\].pdf](/cloudSpace?fileId=f1&page=12) · 第 12 页');
    expect(parseResourceHref('/cloudSpace?fileId=f1&page=12')).toEqual({ type: 'file', id: 'f1' });
  });

  it('新建笔记标题去掉扩展名', () => {
    expect(pdfExcerptNoteTitle('用户访谈方法指南.pdf', '摘录')).toBe('用户访谈方法指南 摘录');
    expect(pdfExcerptNoteTitle('季度汇报.pptx', 'excerpts')).toBe('季度汇报 excerpts');
    expect(pdfExcerptNoteTitle('README', '摘录')).toBe('README 摘录');
  });
});

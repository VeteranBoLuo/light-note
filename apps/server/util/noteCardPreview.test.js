import { describe, expect, it } from 'vitest';
import { buildNoteCardPreview, extractNoteCardPreviewImage, NOTE_CARD_PREVIEW_MAX_TEXT } from './noteCardPreview.js';

describe('笔记卡片首图提取', () => {
  it('一次生成纯文本摘要，并保留首图在正文中的原始顺序', () => {
    const preview = buildNoteCardPreview(
      '<p>图片上方第一段</p><p>图片上方第二段</p><img src="/uploads/note-flow.png"><p>图片下方正文</p>',
      'html',
    );

    expect(preview).toEqual({
      summary: '图片上方第一段\n图片上方第二段\n图片下方正文',
      beforeImage: '图片上方第一段\n图片上方第二段',
      afterImage: '图片下方正文',
      imageUrl: 'https://boluo66.top/uploads/note-flow.png',
      imageLocated: true,
      hasContent: true,
    });
  });

  it('Markdown 摘要不执行 raw HTML，也不把代码和外链图片当成本站首图', () => {
    const preview = buildNoteCardPreview(
      [
        '# 标题',
        '',
        '<script>不应显示</script>',
        '',
        '`![伪图片](/uploads/note-fake.png)` ![外链](https://example.com/external.png) 本站图片之前',
        '![本站图片](/uploads/note-real.webp) 本站图片之后',
      ].join('\n'),
      'markdown',
    );

    expect(preview.summary).toContain('标题');
    expect(preview.summary).toContain('本站图片之前');
    expect(preview.summary).toContain('本站图片之后');
    expect(preview.summary).not.toContain('不应显示');
    expect(preview.imageUrl).toBe('https://boluo66.top/uploads/note-real.webp');
    expect(preview.imageLocated).toBe(true);
  });

  it('提取 HTML 正文开头的本站图片，不返回外链图片', () => {
    expect(
      extractNoteCardPreviewImage(
        '<h2>周报</h2><p>本周进展</p><img src="https://boluo66.top/uploads/note-1-cover.png" />',
        'html',
      ),
    ).toBe('https://boluo66.top/uploads/note-1-cover.png');
    expect(extractNoteCardPreviewImage('<img src="https://evil.example/cover.png" />', 'html')).toBe('');
  });

  it('图片离正文开头过远时不再把它误当卡片封面', () => {
    const longIntro = '正文'.repeat(Math.ceil(NOTE_CARD_PREVIEW_MAX_TEXT / 2) + 10);
    expect(
      extractNoteCardPreviewImage(`${longIntro}<img src="https://boluo66.top/uploads/note-late.png" />`, 'html'),
    ).toBe('');
  });

  it('忽略代码中的伪图片，并支持 Markdown 图片与 raw HTML 图片', () => {
    const markdown = [
      '# 标题',
      '',
      '`![不是图片](https://boluo66.top/uploads/note-fake.png)`',
      '',
      '![封面](https://boluo66.top/uploads/note-real.webp)',
    ].join('\n');
    expect(extractNoteCardPreviewImage(markdown, 'markdown')).toBe('https://boluo66.top/uploads/note-real.webp');
    expect(extractNoteCardPreviewImage('<figure><img src="/uploads/note-relative.jpg"></figure>', 'markdown')).toBe(
      'https://boluo66.top/uploads/note-relative.jpg',
    );
    expect(extractNoteCardPreviewImage('![旧格式封面](/uploads/note-legacy.jpg)', 'md')).toBe(
      'https://boluo66.top/uploads/note-legacy.jpg',
    );
  });

  it('不把 SVG、脚本内容或普通图片文字当成卡片图片', () => {
    expect(extractNoteCardPreviewImage('<svg><image href="/uploads/note-vector.png" /></svg>', 'html')).toBe('');
    expect(extractNoteCardPreviewImage('<code>&lt;img src="/uploads/note-code.png"&gt;</code>', 'html')).toBe('');
    expect(extractNoteCardPreviewImage('图片：https://boluo66.top/uploads/note-plain.png', 'markdown')).toBe('');
  });

  it('统一识别空富文本占位、代码正文与无文字视觉内容', () => {
    expect(buildNoteCardPreview('<p><br></p><p>&nbsp;</p>', 'html').hasContent).toBe(false);
    expect(buildNoteCardPreview('<script>仅元数据</script><style>.x{color:red}</style>', 'html').hasContent).toBe(
      false,
    );
    expect(buildNoteCardPreview('<pre><code>const answer = 42;</code></pre>', 'html').hasContent).toBe(true);
    expect(buildNoteCardPreview('<svg viewBox="0 0 10 10"></svg>', 'html').hasContent).toBe(true);
    expect(buildNoteCardPreview('   \n\t', 'markdown').hasContent).toBe(false);
    expect(buildNoteCardPreview('```js\nconst answer = 42;\n```', 'markdown').hasContent).toBe(true);
  });
});

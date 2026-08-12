import { describe, expect, it } from 'vitest';
import { extractNoteCardPreviewImage, NOTE_CARD_PREVIEW_MAX_TEXT } from './noteCardPreview.js';

describe('笔记卡片首图提取', () => {
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
});

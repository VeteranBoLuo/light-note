import { describe, expect, it } from 'vitest';
import { renderCommunityMarkdown } from './communityMarkdown';

describe('community markdown', () => {
  it('renders text formatting and links', () => {
    const html = renderCommunityMarkdown('## 标题\n\n**重点** 与 [链接](https://example.com)');
    expect(html).toContain('<h2>标题</h2>');
    expect(html).toContain('<strong>重点</strong>');
    expect(html).toContain('href="https://example.com"');
  });
  it('renders emphasis adjacent to digits and preserves paragraph boundaries', () => {
    const html = renderCommunityMarkdown('21321\n\n1231**13321**\n\n- 第一项\n- 第二项');
    expect(html).toContain('1231<strong>13321</strong>');
    expect(html).toContain('<p>21321</p>');
    expect(html).toContain('<li>第一项</li>');
  });
  it('preserves every heading level', () => {
    for (let level = 1; level <= 6; level++)
      expect(renderCommunityMarkdown('#'.repeat(level) + ' 标题')).toContain(`<h${level}>标题</h${level}>`);
  });
  it('removes executable content and remote media', () => {
    const html = renderCommunityMarkdown(
      '<script>alert(1)</script>\n\n<img src="https://example.com/a" onerror="alert(1)">\n\n[x](javascript:alert%281%29)\n\n![图片](https://example.com/a)',
    );
    expect(html).not.toMatch(/<script|<img|onerror|javascript:/i);
  });
  it('keeps code inert and supports empty drafts', () => {
    expect(renderCommunityMarkdown('```html\n<script>alert(1)</script>\n```')).toContain('&lt;script&gt;');
    expect(renderCommunityMarkdown('')).toBe('');
  });
});

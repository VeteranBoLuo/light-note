import { describe, it, expect } from 'vitest';
import { publicMaterial } from './material.js';
describe('public snapshot boundary', () => {
  it('preserves paragraphs, strips private link destinations and ignores tags/placement', () => {
    const note = {
      title: '方法',
      type: 'html',
      content: '<p>第一段 <a href="/noteLibrary/private-id">文字</a></p><p>第二段</p>',
    };
    const result = publicMaterial('note', note);
    expect(result.body).toBe('第一段 文字\n\n第二段');
    expect(JSON.stringify(result)).not.toContain('private-id');
    expect(publicMaterial('note', { ...note, tags: ['私人标签'], parentId: 'private-parent' }).fingerprint).toBe(
      result.fingerprint,
    );
    expect(publicMaterial('note', { ...note, content: '<p>新文字</p>' }).fingerprint).not.toBe(result.fingerprint);
  });
  it.each([
    '<img src="https://a.invalid/x.png">',
    '<video></video>',
    '<svg></svg>',
    '<canvas></canvas>',
    '<iframe></iframe>',
  ])('rejects media before sanitization: %s', (media) => {
    expect(() => publicMaterial('note', { title: '含媒体', type: 'html', content: `<p>文字</p>${media}` })).toThrow(
      'PUBLIC_RESOURCE_TEXT_ONLY',
    );
  });
  it('supports complete 30000-character text but rejects longer text and markdown images', () => {
    expect(publicMaterial('note', { title: '长文', type: 'markdown', content: '字'.repeat(30000) }).body).toHaveLength(
      30000,
    );
    expect(() => publicMaterial('note', { title: '过长', type: 'markdown', content: '字'.repeat(30001) })).toThrow(
      'PUBLIC_RESOURCE_TOO_LARGE',
    );
    expect(() =>
      publicMaterial('note', { title: '图片', type: 'markdown', content: '文字 ![图](https://a.invalid/i.png)' }),
    ).toThrow('PUBLIC_RESOURCE_TEXT_ONLY');
  });
  it.each([
    'https://u:p@example.org/',
    'https://example.org/?share_token=secret',
    'https://example.org/#token=secret',
    'https://example.org/?shareToken=secret',
    'https://example.org/#/share?accessToken=secret',
    'https://example.org/?api_key=secret',
    'https://example.org/share/' + 'x'.repeat(43),
    'https://example.org/share/legacy-id/' + 'x'.repeat(43),
    'javascript:alert(1)',
    'https://example.org/' + 'a'.repeat(255),
  ])('rejects unsafe or unsaveable bookmark URL %s', (url) => {
    expect(() => publicMaterial('bookmark', { title: '网址', url })).toThrow('PUBLIC_RESOURCE_INVALID_URL');
  });
  it('normalizes legacy Markdown before checking media and extracting text', () => {
    expect(publicMaterial('note', { title: '旧版', type: 'md', content: '# 标题\n\n正文' }).body).toBe('标题\n\n正文');
    expect(() =>
      publicMaterial('note', { title: '旧版', type: 'md', content: '文字 ![图](https://a.invalid/a.png)' }),
    ).toThrow('PUBLIC_RESOURCE_TEXT_ONLY');
  });
  it('includes bookmark description in confirmed material and fingerprint', () => {
    const a = publicMaterial('bookmark', { title: '网址', url: 'https://example.org', description: '说明' });
    expect(a.description).toBe('说明');
    expect(a.fingerprint).not.toBe(
      publicMaterial('bookmark', { title: '网址', url: 'https://example.org', description: '新说明' }).fingerprint,
    );
  });
});

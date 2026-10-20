import { describe, expect, it } from 'vitest';
import { communityImageMarkdown, parseCommunityPostDocument } from '@lightnote/shared/community-feed';
import { communityRichPostHtml } from './communityPostEditing';
import { communityHtmlToMarkdown, sanitizeCommunityHtml } from './communityContent';
import { communityNoteContent } from './communityPostSave';
const id = '11111111-1111-4111-8111-111111111111';
const attached = '22222222-2222-4222-8222-222222222222';
const image = {
  publicId: id,
  url: '/api/community/images/' + id,
  width: 600,
  height: 300,
  fileSize: 20,
  contentType: 'image/png',
};
describe('community editor image boundaries', () => {
  it('round trips authorized images while stripping arbitrary media and handlers', () => {
    const body = `前\n\n${communityImageMarkdown(id, '步骤')}\n\n后`;
    const html = communityRichPostHtml(body, [image]);
    const restored = communityHtmlToMarkdown(html + '<img src="https://example.com/tracker"><script>bad()</script>', [
      image,
    ]);
    expect(
      parseCommunityPostDocument(restored).imageIds,
      JSON.stringify({ html, safe: sanitizeCommunityHtml(html, [image]), restored }),
    ).toEqual([id]);
    expect(restored).toContain('前');
    expect(restored).toContain('后');
    expect(restored).not.toContain('tracker');
    expect(restored).not.toContain('bad()');
    expect(sanitizeCommunityHtml(html)).not.toContain('<img');
    const safe = sanitizeCommunityHtml(
      `<img data-community-image="${id}" src="https://evil.example" onerror="bad()">`,
      [image],
    );
    expect(safe).toContain(image.url);
    expect(safe).not.toMatch(/evil|onerror/);
  });
  it('copies images once into their original positions and keeps attachments first', () => {
    const html = communityNoteContent(
      {
        publicId: 'post',
        title: 'title',
        body: `前\n\n${communityImageMarkdown(id)}\n\n后`,
        images: [image, { ...image, publicId: attached }],
      } as any,
      ['copy-one', 'copy-two'],
      '',
      '来源',
      '想法',
    );
    expect(html.indexOf('前')).toBeLessThan(html.indexOf('copy-one'));
    expect(html.indexOf('copy-one')).toBeLessThan(html.indexOf('后'));
    expect(html.indexOf('copy-two')).toBeLessThan(html.indexOf('前'));
    expect(html.match(/<img/g)).toHaveLength(2);
  });
});

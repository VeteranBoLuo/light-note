import { expect, it } from 'vitest';
import { communityNoteContent, communityPostUrl } from './communityPostSave';
it('keeps copied images before the body and records the source without executable markup', () => {
  const html = communityNoteContent(
    {
      publicId: 'post',
      title: '<script>title</script>',
      body: '**正文**\n<script>alert(1)</script>',
      author: { name: '<作者>' },
    } as any,
    ['owned-image'],
    '<img src=x onerror=alert(1)>',
    '来源',
    '我的想法',
  );
  const node = document.createElement('div');
  node.innerHTML = html;
  expect(node.querySelector('img')?.getAttribute('src')).toBe('/api/file/image/owned-image');
  expect(node.querySelectorAll('img')).toHaveLength(1);
  expect(node.querySelector('script')).toBeNull();
  expect(html.indexOf('/api/file/image/')).toBeLessThan(html.indexOf('<strong>正文'));
  expect(node.querySelector('a')?.getAttribute('href')).toBe(communityPostUrl('post'));
  expect(node.textContent).toContain('<作者>');
  expect(node.querySelector('blockquote')?.textContent).toContain('<img src=x onerror=alert(1)>');
  expect(node.querySelector('blockquote strong')?.textContent).toBe('我的想法');
  expect(node.querySelector('blockquote h2')).toBeNull();
  expect(node.lastElementChild?.tagName).toBe('BLOCKQUOTE');
});
it('creates a direct link without navigation or notification parameters', () => {
  expect(communityPostUrl('post', 'https://example.com/community?comment=x')).toBe(
    'https://example.com/community/posts/post',
  );
});

it('omits the thoughts block when no personal thoughts were entered', () => {
  const html = communityNoteContent(
    { publicId: 'post', title: '标题', body: '正文' } as any,
    [],
    '  ',
    '来源',
    '我的想法',
  );
  expect(html).not.toContain('<blockquote>');
});

import type { FeedPost } from '@/api/communityFeedApi';
import { renderCommunityMarkdown } from './communityMarkdown';
import { parseCommunityPostDocument } from '@lightnote/shared/community-feed';

export function communityPostUrl(id: string, origin = window.location.origin) {
  return new URL('/community/posts/' + encodeURIComponent(id), origin).href;
}
export function escapePostText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );
}
export function communityNoteContent(
  post: FeedPost,
  images: string[],
  thoughts: string,
  sourceLabel: string,
  thoughtsLabel: string,
) {
  const imageHtml = images
    .map((id) => `<p><img src="/api/file/image/${encodeURIComponent(id)}" alt="" /></p>`)
    .join('');
  const source = `<hr><p>${escapePostText(sourceLabel)}：${escapePostText(post.author?.name || '')} · <a href="${escapePostText(communityPostUrl(post.publicId))}">${escapePostText(post.title)}</a></p>`;
  const personal = thoughts.trim()
    ? `<blockquote><p><strong>${escapePostText(thoughtsLabel)}</strong></p><p>${escapePostText(thoughts).replace(/\n/g, '<br>')}</p></blockquote>`
    : '';
  const document = parseCommunityPostDocument(post.body);
  if (!document.imageIds.length) return imageHtml + renderCommunityMarkdown(post.body) + source + personal;
  const copies = new Map((post.images || []).map((image, index) => [image.publicId, images[index]]));
  const inline = document.blocks
    .map((block) =>
      block.kind === 'text'
        ? renderCommunityMarkdown(block.source + '\n\n' + document.definitions)
        : copies.get(block.id)
          ? `<p><img src="/api/file/image/${encodeURIComponent(copies.get(block.id)!)}" alt="${escapePostText(block.alt)}" /></p>`
          : '',
    )
    .join('');
  const attached = (post.images || [])
    .filter((image) => !document.imageIds.includes(image.publicId))
    .map((image) =>
      copies.get(image.publicId)
        ? `<p><img src="/api/file/image/${encodeURIComponent(copies.get(image.publicId)!)}" alt="" /></p>`
        : '',
    )
    .join('');
  return attached + inline + source + personal;
}

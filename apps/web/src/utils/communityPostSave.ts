import type { FeedPost } from '@/api/communityFeedApi';
import { renderCommunityMarkdown } from './communityMarkdown';

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
    ? `<h2>${escapePostText(thoughtsLabel)}</h2><p>${escapePostText(thoughts).replace(/\n/g, '<br>')}</p>`
    : '';
  return imageHtml + renderCommunityMarkdown(post.body) + source + personal;
}

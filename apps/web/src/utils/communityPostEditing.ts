import { parseCommunityPostDocument } from '@lightnote/shared/community-feed';
import type { FeedImage } from '@/api/communityFeedApi';
import { renderCommunityMarkdown } from './communityMarkdown';
import { communityEditorImageSource } from './communityContent';

export function communityRichPostHtml(body: string, images: FeedImage[]) {
  const document = parseCommunityPostDocument(body);
  return document.blocks
    .map((block) => {
      if (block.kind === 'text') return renderCommunityMarkdown(block.source + '\n\n' + document.definitions);
      const image = images.find((i) => i.publicId === block.id);
      if (!image) return '';
      const element = window.document.createElement('img');
      element.setAttribute('data-community-image', block.id);
      element.setAttribute('src', communityEditorImageSource(image));
      if (!image.url) element.setAttribute('data-community-placeholder', 'true');
      const status = (image as FeedImage & { status?: string }).status;
      if (status) element.setAttribute('data-community-state', status);
      element.setAttribute('alt', block.alt);
      if (image.width && image.height) {
        element.width = image.width;
        element.height = image.height;
      }
      return '<p>' + element.outerHTML + '</p>';
    })
    .join('');
}

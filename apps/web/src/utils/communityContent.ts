import DOMPurify from 'dompurify';
import contentStyle from '@/assets/css/community-content.css?inline';
import { createNoteTurndownService } from './noteHtmlToMarkdown';
import { communityImageMarkdown } from '@lightnote/shared/community-feed';
import type { FeedImage } from '@/api/communityFeedApi';
import icon from '@/config/icon';

export function communityEditorImageSource(image: FeedImage) {
  return image.url || 'data:image/svg+xml,' + encodeURIComponent(icon.noteDetail.toolbar.image);
}

// The editor and rendered body share a small, non-executable document vocabulary.
const elements: Record<string, string[]> = {
  p: [],
  br: [],
  strong: [],
  b: [],
  em: [],
  i: [],
  del: [],
  s: [],
  u: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  blockquote: [],
  ul: [],
  ol: ['start'],
  li: [],
  pre: [],
  code: [],
  a: ['href', 'title'],
  hr: [],
  table: [],
  thead: [],
  tbody: [],
  tr: [],
  th: ['align', 'colspan', 'rowspan'],
  td: ['align', 'colspan', 'rowspan'],
  input: ['type', 'checked', 'disabled', 'tabindex'],
};
export const communityRichValidElements = Object.entries(elements)
  .map(([tag, attributes]) => tag + (attributes.length ? `[${attributes.join('|')}]` : ''))
  .join(',');

export function sanitizeCommunityHtml(html: string, images?: FeedImage[]): string {
  const vocabulary = images
    ? {
        ...elements,
        img: [
          'src',
          'alt',
          'data-community-image',
          'data-community-state',
          'data-community-placeholder',
          'width',
          'height',
        ],
      }
    : elements;
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: Object.keys(vocabulary),
    ALLOWED_ATTR: [...new Set(Object.values(vocabulary).flat())],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  for (const element of fragment.querySelectorAll('*')) {
    const allowed = vocabulary[element.tagName.toLowerCase()] || [];
    for (const attribute of Array.from(element.attributes))
      if (!allowed.includes(attribute.name)) element.removeAttribute(attribute.name);
    if (element.tagName === 'IMG') {
      const image = images?.find((i) => i.publicId === element.getAttribute('data-community-image'));
      if (!image) {
        element.remove();
        continue;
      }
      element.setAttribute('src', communityEditorImageSource(image));
      if (!image.url) element.setAttribute('data-community-placeholder', 'true');
      else element.removeAttribute('data-community-placeholder');
      const status = (image as FeedImage & { status?: string }).status;
      if (status) element.setAttribute('data-community-state', status);
      else element.removeAttribute('data-community-state');
    }
    // Task markers are document content, never interactive form controls.
    if (element.tagName === 'INPUT') {
      if (element.getAttribute('type') !== 'checkbox' || !element.closest('li')) {
        element.remove();
        continue;
      }
      element.setAttribute('disabled', '');
      element.setAttribute('tabindex', '-1');
    }
  }
  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}

export function communityHtmlToMarkdown(html: string, images?: FeedImage[]): string {
  const container = document.createElement('div');
  container.innerHTML = sanitizeCommunityHtml(html, images);
  // TinyMCE's FormatBlock command produces a bare pre; Turndown expects pre > code.
  for (const pre of container.querySelectorAll('pre')) {
    if (pre.children.length === 1 && pre.firstElementChild?.tagName === 'CODE') continue;
    const code = document.createElement('code');
    code.textContent = pre.textContent;
    pre.replaceChildren(code);
  }
  const converter = createNoteTurndownService({
    blankReplacement: (_content, node) => (node.nodeName === 'P' ? '\n\n<p><br></p>\n\n' : node.isBlock ? '\n\n' : ''),
  });
  if (images)
    converter.addRule('communityImage', {
      filter: 'img',
      replacement: (_content, node) =>
        '\n\n' +
        communityImageMarkdown(
          (node as HTMLElement).getAttribute('data-community-image')!,
          (node as HTMLElement).getAttribute('alt') || '',
        ) +
        '\n\n',
    });
  converter.addRule('communityEmptyParagraph', {
    filter: (node) =>
      node.nodeName === 'P' && !(node.textContent || '').trim() && !(node as HTMLElement).querySelector('img'),
    replacement: () => '\n\n<p><br></p>\n\n',
  });
  // GFM cannot represent headerless tables or merged cells. Keep only sanitized HTML.
  converter.addRule('communityTable', {
    filter: (node) => {
      if (node.nodeName !== 'TABLE') return false;
      const table = node as HTMLTableElement;
      const firstRow = table.rows[0];
      return (
        !firstRow ||
        !Array.from(firstRow.cells).every((cell) => cell.tagName === 'TH') ||
        Boolean(table.querySelector('[colspan], [rowspan], p, pre, ul, ol, blockquote, table'))
      );
    },
    replacement: (_content, node) => `\n\n${(node as HTMLElement).outerHTML}\n\n`,
  });
  return converter.turndown(container.innerHTML);
}

export function communityRichContentStyle(root: HTMLElement = document.documentElement): string {
  const theme = getComputedStyle(root);
  const tokens = [
    '--app-font-family',
    '--text-color',
    '--desc-color',
    '--workspace-purple-text',
    '--workspace-hover',
    '--workspace-open-canvas',
    '--workspace-border',
    '--pre-bg-color',
    '--pre-text-color',
    '--pre-border-color',
    '--pre-highlight-color',
    '--ui-space-16',
    '--ui-layout-120',
  ];
  const variables = tokens.map((token) => `${token}:${theme.getPropertyValue(token)};`).join('');
  return `:root { ${variables} } ${contentStyle}
    html { cursor: text; min-height: 100%; }
    img[data-community-image] { display: block; max-width: 100%; height: auto; margin: var(--ui-space-16, 16px) auto; border: 1px solid var(--workspace-border); border-radius: 8px; }
    img[data-mce-selected] { outline: 2px solid var(--workspace-purple-text); }
    img[data-community-placeholder] { width: 100%; height: var(--ui-layout-120, 120px); object-fit: contain; background: var(--workspace-hover); }
    img[data-community-state="error"] { border-style: dashed; border-color: var(--workspace-purple-text); }
    img[data-community-state="uploading"] { opacity: .6; }
    body.community-markdown { cursor: text; min-height: calc(100% - var(--ui-space-16, 16px) - var(--ui-space-16, 16px)); margin: var(--ui-space-16, 16px) 0; background: var(--workspace-open-canvas); }`;
}

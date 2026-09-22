import DOMPurify from 'dompurify';
import contentStyle from '@/assets/css/community-content.css?inline';
import { createNoteTurndownService } from './noteHtmlToMarkdown';

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

export function sanitizeCommunityHtml(html: string): string {
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: Object.keys(elements),
    ALLOWED_ATTR: [...new Set(Object.values(elements).flat())],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  for (const element of fragment.querySelectorAll('*')) {
    const allowed = elements[element.tagName.toLowerCase()] || [];
    for (const attribute of Array.from(element.attributes))
      if (!allowed.includes(attribute.name)) element.removeAttribute(attribute.name);
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

export function communityHtmlToMarkdown(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = sanitizeCommunityHtml(html);
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
  converter.addRule('communityEmptyParagraph', {
    filter: (node) => node.nodeName === 'P' && !(node.textContent || '').trim(),
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
  ];
  const variables = tokens.map((token) => `${token}:${theme.getPropertyValue(token)};`).join('');
  return `:root { ${variables} } ${contentStyle}
    html { cursor: text; min-height: 100%; }
    body.community-markdown { cursor: text; min-height: calc(100% - 32px); margin: 16px 0; background: var(--workspace-open-canvas); }`;
}

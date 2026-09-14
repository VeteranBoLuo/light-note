import type { Token, TokensList } from 'marked';

export type ScrollAnchor = { source: number; preview: number };
export const SOURCE_ATTRIBUTE = 'data-ln-md-source';

/** Preview-only metadata: keep it out of saved Markdown and HTML conversions. */
export function renderMarkdownScrollMap(
  markdown: string,
  renderer: {
    lexer: (source: string) => TokensList;
    parser: (tokens: TokensList) => string;
    walkTokens: (tokens: TokensList, callback: (token: Token) => void) => unknown;
  },
  walkToken: (token: Token) => void,
): string {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const tokens = renderer.lexer(normalized);
  renderer.walkTokens(tokens, walkToken);
  // getRandomValues also works on LAN HTTP previews, unlike randomUUID.
  const nonce = Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(36)).join('-');
  const marker = `ln-scroll-${nonce}:`;
  const positions: Array<{ from: number; codeStart?: number }> = [];
  let offset = 0;
  const raw = tokens
    .map((token) => {
      const start = normalized.indexOf(token.raw, offset);
      if (start >= 0) offset = start;
      const from = offset;
      offset += token.raw.length;
      const single = Object.assign([token], { links: tokens.links }) as TokensList;
      const html = renderer.parser(single);
      if (!html.trim()) return html;
      const opening = token.type === 'code' ? /^( {0,3})(`{3,}|~{3,})[^\n]*\n/.exec(token.raw) : null;
      const codeStart = opening && !opening[1] ? from + opening[0].length : undefined;
      const index = positions.push({ from, codeStart }) - 1;
      return `<!--${marker}${index}-->${html}`;
    })
    .join('');
  // Parse once so raw HTML spanning multiple Markdown blocks retains its hierarchy.
  const template = document.createElement('template');
  template.innerHTML = raw;
  template.content.querySelectorAll(`[${SOURCE_ATTRIBUTE}], [data-ln-md-code]`).forEach((node) => {
    node.removeAttribute(SOURCE_ATTRIBUTE);
    node.removeAttribute('data-ln-md-code');
  });
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_COMMENT);
  const markers: Comment[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.textContent?.startsWith(marker)) markers.push(node as Comment);
  }
  for (const comment of markers) {
    const position = positions[Number(comment.textContent!.slice(marker.length))];
    const element = comment.nextSibling;
    if (position && element instanceof Element) {
      element.setAttribute(SOURCE_ATTRIBUTE, String(position.from));
      if (position.codeStart !== undefined && element.tagName === 'PRE') {
        element.setAttribute('data-ln-md-code', String(position.codeStart));
      }
    }
    comment.remove();
  }
  return template.innerHTML;
}

/** Piecewise interpolation, with explicit document edges and degenerate-range handling. */
export function mapScrollPosition(position: number, anchors: ScrollAnchor[], from: 'source' | 'preview'): number {
  const to = from === 'source' ? 'preview' : 'source';
  if (!anchors.length) return 0;
  if (position <= anchors[0][from]) return anchors[0][to];
  let low = 0;
  let high = anchors.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >>> 1;
    if (anchors[mid][from] <= position) low = mid;
    else high = mid;
  }
  const a = anchors[low];
  const b = anchors[high];
  const span = b[from] - a[from];
  if (span <= 0) return b[to];
  return a[to] + Math.min(1, Math.max(0, (position - a[from]) / span)) * (b[to] - a[to]);
}

/** Text ranges survive syntax highlighting spans and respect soft-wrapped code lines. */
export function codeLinePositions(code: HTMLElement): Array<{ offset: number; top: number }> {
  const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  const result: Array<{ offset: number; top: number }> = [];
  let offset = 0;
  let lineStart = true;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    for (let index = 0; index < text.length; index++) {
      if (lineStart) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getClientRects()[0];
        if (rect) result.push({ offset: offset + index, top: rect.top });
      }
      lineStart = text[index] === '\n';
    }
    offset += text.length;
  }
  return result;
}

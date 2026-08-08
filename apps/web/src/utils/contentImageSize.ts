export const CONTENT_IMAGE_SIZES = ['original', 'small', 'medium', 'large', 'full'] as const;

export type ContentImageSize = (typeof CONTENT_IMAGE_SIZES)[number];

export const MARKDOWN_IMAGE_INDEX_ATTRIBUTE = 'data-ln-source-image-index';

interface LocatedContentImage {
  start: number;
  end: number;
  raw: string;
  kind: 'markdown' | 'html';
  src: string;
  alt: string;
  title: string;
  size: ContentImageSize;
}

export interface ResizeMarkdownContentImageResult {
  changed: boolean;
  markdown: string;
  start: number;
  end: number;
  replacement: string;
}

const HTML_IMAGE_PATTERN = /<img\b[^>]*>/giu;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]\n]*)\]\(\s*(<[^>\n]+>|[^\s)\n]+)(?:\s+(["'])(.*?)\3)?\s*\)/giu;
const IMAGE_SIZE_PATTERN = /\sdata-ln-size=(["'])(original|small|medium|large|full)\1/iu;

export function isContentImageSize(value: unknown): value is ContentImageSize {
  return CONTENT_IMAGE_SIZES.includes(String(value || '') as ContentImageSize);
}

export function normalizeContentImageSize(value: unknown): ContentImageSize {
  return isContentImageSize(value) ? value : 'original';
}

function escapeHtmlAttribute(value: string) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

function readHtmlAttribute(tag: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const quoted = tag.match(new RegExp(`\\s${escapedName}\\s*=\\s*(["'])(.*?)\\1`, 'iu'));
  if (quoted) return quoted[2];
  return tag.match(new RegExp(`\\s${escapedName}\\s*=\\s*([^\\s>]+)`, 'iu'))?.[1] || '';
}

function stripImageDimensionStyles(tag: string) {
  return tag.replace(/\sstyle=(["'])(.*?)\1/iu, (_match, quote: string, style: string) => {
    const nextStyle = style
      .split(';')
      .map((rule) => rule.trim())
      .filter(Boolean)
      .filter((rule) => !/^(?:width|max-width|height)\s*:/iu.test(rule))
      .join('; ');
    return nextStyle ? ` style=${quote}${nextStyle}${quote}` : '';
  });
}

export function applyContentImageSizeToHtmlTag(tag: string, size: ContentImageSize) {
  const normalizedSize = normalizeContentImageSize(size);
  const withoutDimensions = stripImageDimensionStyles(tag)
    .replace(IMAGE_SIZE_PATTERN, '')
    .replace(/\s(?:width|height)=(["'])[^"']*\1/giu, '')
    .replace(/\s(?:width|height)=[^\s>]+/giu, '');
  return withoutDimensions.replace(/\s*\/?>$/u, ` data-ln-size="${normalizedSize}" />`);
}

export function createSizedContentImageHtml(
  src: string,
  alt: string,
  size: ContentImageSize,
  title = '',
) {
  const titleAttribute = title ? ` title="${escapeHtmlAttribute(title)}"` : '';
  return `<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}"${titleAttribute} data-ln-size="${normalizeContentImageSize(size)}" />`;
}

export function readContentImageSizeFromHtmlTag(tag: string): ContentImageSize {
  return normalizeContentImageSize(tag.match(IMAGE_SIZE_PATTERN)?.[2]);
}

export function readContentImageSizeFromElement(element: Element | null): ContentImageSize {
  return normalizeContentImageSize(element?.getAttribute('data-ln-size'));
}

export function applyContentImageSizeToElement(element: HTMLElement, size: ContentImageSize) {
  element.setAttribute('data-ln-size', normalizeContentImageSize(size));
  element.removeAttribute('width');
  element.removeAttribute('height');
  element.style.removeProperty('width');
  element.style.removeProperty('max-width');
  element.style.removeProperty('height');
  if (!element.getAttribute('style')?.trim()) element.removeAttribute('style');
}

function fencedCodeRanges(source: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  const lines = source.match(/.*(?:\n|$)/gu) || [];
  let offset = 0;
  let open: { start: number; marker: '`' | '~'; length: number } | null = null;

  for (const line of lines) {
    if (!line) continue;
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
    if (!open && marker) {
      open = { start: offset, marker: marker[0] as '`' | '~', length: marker.length };
    } else if (open && marker && marker[0] === open.marker && marker.length >= open.length) {
      ranges.push({ start: open.start, end: offset + line.length });
      open = null;
    }
    offset += line.length;
  }

  if (open) ranges.push({ start: open.start, end: source.length });
  return ranges;
}

function inlineCodeRanges(source: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  const pattern = /(`+)([^`\n]*?)\1/gu;
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    ranges.push({ start, end: start + match[0].length });
  }
  return ranges;
}

function insideRanges(index: number, ranges: Array<{ start: number; end: number }>) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

export function locateMarkdownContentImages(markdown: string): LocatedContentImage[] {
  const source = String(markdown || '');
  const excluded = [...fencedCodeRanges(source), ...inlineCodeRanges(source)];
  const images: LocatedContentImage[] = [];

  for (const match of source.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const start = match.index ?? 0;
    if (insideRanges(start, excluded)) continue;
    const rawSrc = match[2] || '';
    images.push({
      start,
      end: start + match[0].length,
      raw: match[0],
      kind: 'markdown',
      src: rawSrc.startsWith('<') && rawSrc.endsWith('>') ? rawSrc.slice(1, -1) : rawSrc,
      alt: match[1] || '',
      title: match[4] || '',
      size: 'original',
    });
  }

  for (const match of source.matchAll(HTML_IMAGE_PATTERN)) {
    const start = match.index ?? 0;
    if (insideRanges(start, excluded)) continue;
    images.push({
      start,
      end: start + match[0].length,
      raw: match[0],
      kind: 'html',
      src: readHtmlAttribute(match[0], 'src'),
      alt: readHtmlAttribute(match[0], 'alt'),
      title: readHtmlAttribute(match[0], 'title'),
      size: readContentImageSizeFromHtmlTag(match[0]),
    });
  }

  return images.sort((left, right) => left.start - right.start);
}

export function resizeMarkdownContentImage(
  markdown: string,
  imageIndex: number,
  size: ContentImageSize,
): ResizeMarkdownContentImageResult {
  const source = String(markdown || '');
  const image = locateMarkdownContentImages(source)[imageIndex];
  if (!image) return { changed: false, markdown: source, start: -1, end: -1, replacement: '' };

  const normalizedSize = normalizeContentImageSize(size);
  const replacement =
    image.kind === 'html'
      ? applyContentImageSizeToHtmlTag(image.raw, normalizedSize)
      : normalizedSize === 'original'
        ? image.raw
        : createSizedContentImageHtml(image.src, image.alt, normalizedSize, image.title);
  const nextMarkdown = source.slice(0, image.start) + replacement + source.slice(image.end);
  return {
    changed: nextMarkdown !== source,
    markdown: nextMarkdown,
    start: image.start,
    end: image.end,
    replacement,
  };
}

export function decorateRenderedMarkdownImageIndexes(html: string) {
  if (!html || typeof DOMParser === 'undefined') return html || '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.body.querySelectorAll<HTMLImageElement>('img').forEach((image, index) => {
    image.setAttribute(MARKDOWN_IMAGE_INDEX_ATTRIBUTE, String(index));
  });
  return doc.body.innerHTML;
}

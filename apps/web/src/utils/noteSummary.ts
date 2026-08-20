import { noteContentToHtml } from '@/utils/common';

/**
 * 笔记列表/卡片的摘要文本口径。
 *
 * 历史坑:卡片曾用 `type === 'markdown' && !content.includes('<')` 判断是不是 Markdown,
 * 正文里只要出现一个 `<`(例如代码块里的 `<h1>Hello World</h1>`)就被当成 HTML 笔记,
 * 直接塞进 innerHTML 后再 `querySelectorAll('*')` 只收元素节点,顶层文本节点全被丢掉,
 * 摘要于是只剩下那段被浏览器"当真"解析的标签内容。
 *
 * 现在统一走 noteContentToHtml(Markdown 过 marked、HTML 过 DOMPurify),
 * 再按块级元素拆行取纯文本,只信 note.type,不再靠字符猜格式。
 */

// 取文本时整段跳过:要么没有可读文本,要么内容不该出现在摘要里
const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head', 'title']);

// 服务端不会把代码块、脚本或 SVG 中看起来像图片的标签当成卡片首图。
// 客户端定位缩略图顺序时保持同一边界，避免把后面的真实首图提前到代码块位置。
const IMAGE_LOCATION_SKIP_TAGS = new Set(['code', 'pre', 'script', 'style', 'svg']);
const TRUSTED_NOTE_IMAGE_ORIGINS = new Set(['https://boluo66.top', 'http://boluo66.top']);

// 块级元素各自成行;td/th 之类留给所在行内联,避免表格摘要被拆得太碎
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'tfoot',
  'thead',
  'tr',
  'ul',
]);

/** mermaid 图表源码块(Markdown 渲染出的 pre>code,或富文本里的 pre) */
function isMermaidSource(el: Element): boolean {
  return (
    /language-mermaid/.test(el.getAttribute('class') || '') || !!el.querySelector('code[class*="language-mermaid"]')
  );
}

/** 无 DOM 环境(预渲染)的兜底:按块级闭合标签断行后去标签 */
function htmlToLinesWithoutDom(html: string): string[] {
  return html
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|pre|blockquote|section|article|header|footer|ul|ol|table)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

interface SummaryLinesAroundImage {
  beforeImage: string[];
  afterImage: string[];
  imageLocated: boolean;
}

function normalizeImageSource(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'https://boluo66.top');
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    // 与服务端 cleanCandidateUrl 保持一致，兼容历史正文里的 http 本站图片。
    if (TRUSTED_NOTE_IMAGE_ORIGINS.has(parsed.origin)) return `https://boluo66.top${parsed.pathname}`;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '';
  }
}

/**
 * 缩略图地址的 source 参数是服务端已经校验过的本站原图。
 * 用它定位正文中的同一张图片，不重复猜“第一张 img”，也不会让前面的外链图改变顺序。
 */
export function notePreviewOriginalImageUrl(previewImageUrl: string): string {
  const raw = String(previewImageUrl || '').trim();
  if (!raw) return '';
  try {
    const previewUrl = new URL(raw, 'https://boluo66.top');
    const source = normalizeImageSource(previewUrl.searchParams.get('source') || '');
    if (!source) return '';
    const parsedSource = new URL(source);
    if (parsedSource.origin !== 'https://boluo66.top') return '';
    const pathname = decodeURIComponent(parsedSource.pathname);
    if (!/^\/uploads\/[^/]+\.(?:gif|jpe?g|png|webp)$/iu.test(pathname)) return '';
    return `https://boluo66.top${pathname}`;
  } catch {
    return '';
  }
}

function sourceFromPreviewImageUrl(previewImageUrl: string): string {
  return notePreviewOriginalImageUrl(previewImageUrl);
}

function sourceFromPreviewElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === 'img') return normalizeImageSource(el.getAttribute('src') || '');
  if (tag !== 'source') return '';
  const firstSrcsetCandidate = String(el.getAttribute('srcset') || '')
    .split(',')[0]
    ?.trim()
    .split(/\s+/u)[0];
  return normalizeImageSource(firstSrcsetCandidate || '');
}

/** 把安全 HTML 拆成首张卡片缩略图前后的纯文本行。 */
function htmlToSummaryLinesAroundImage(html: string, previewImageUrl = ''): SummaryLinesAroundImage {
  if (!html) return { beforeImage: [], afterImage: [], imageLocated: false };
  const expectedImageSource = sourceFromPreviewImageUrl(previewImageUrl);
  if (typeof document === 'undefined') {
    return {
      beforeImage: htmlToLinesWithoutDom(html),
      afterImage: [],
      imageLocated: false,
    };
  }

  const root = document.createElement('div');
  root.innerHTML = html;

  const beforeImage: string[] = [];
  const afterImage: string[] = [];
  let imageLocated = false;
  let buffer = '';
  const flush = () => {
    const text = buffer.replace(/\s+/g, ' ').trim();
    if (text) (imageLocated ? afterImage : beforeImage).push(text);
    buffer = '';
  };

  const walk = (node: Node, imageLocationIgnored = false) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        buffer += child.nodeValue || '';
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;

      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) return;
      // 图表源码不是给人读的摘要:一整段 `mindmap root((..))` 挤在卡片上没有任何信息量
      if (tag === 'pre' && isMermaidSource(el)) return;

      const childImageLocationIgnored = imageLocationIgnored || IMAGE_LOCATION_SKIP_TAGS.has(tag);
      if (
        !imageLocated &&
        !childImageLocationIgnored &&
        expectedImageSource &&
        (tag === 'img' || tag === 'source') &&
        sourceFromPreviewElement(el) === expectedImageSource
      ) {
        flush();
        imageLocated = true;
        return;
      }
      if (tag === 'br') {
        flush();
        return;
      }
      if (BLOCK_TAGS.has(tag)) {
        flush();
        walk(el, childImageLocationIgnored);
        flush();
        return;
      }
      // 行内元素(span/a/strong/code…)并入当前行
      walk(el, childImageLocationIgnored);
    });
  };

  walk(root);
  flush();
  return { beforeImage, afterImage, imageLocated };
}

/** 把(已消毒的)HTML 拆成按块级元素分行的纯文本 */
export function htmlToSummaryLines(html: string): string[] {
  const { beforeImage, afterImage } = htmlToSummaryLinesAroundImage(html);
  return [...beforeImage, ...afterImage];
}

/** 超长摘要截断,末尾补省略号 */
export function truncateSummary(text: string, maxLength: number): string {
  if (maxLength <= 0 || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '…';
}

export interface NoteSummaryOptions {
  maxLength?: number;
  /** 列表这类单行展示场景,把块级换行压成空格 */
  singleLine?: boolean;
}

export interface NoteCardPreviewText {
  /** 图片加载失败时恢复的完整纯文本摘要。 */
  summary: string;
  /** 正文中位于首张缩略图之前的纯文本。 */
  beforeImage: string;
  /** 正文中位于首张缩略图之后的纯文本。 */
  afterImage: string;
  /** 是否在正文中精确定位到了服务端选中的首图。 */
  imageLocated: boolean;
}

function truncatePreviewParts(beforeImage: string, afterImage: string, maxLength: number, separator: string) {
  if (maxLength <= 0 || beforeImage.length + separator.length + afterImage.length <= maxLength) {
    return { beforeImage, afterImage };
  }
  if (beforeImage.length >= maxLength) {
    return { beforeImage: truncateSummary(beforeImage, maxLength), afterImage: '' };
  }
  const remaining = Math.max(0, maxLength - beforeImage.length - separator.length);
  return {
    beforeImage,
    afterImage: remaining > 0 ? truncateSummary(afterImage, remaining) : '',
  };
}

function hasServerNotePreview(note: unknown): note is Record<string, unknown> {
  return Boolean(
    note &&
    typeof note === 'object' &&
    Object.prototype.hasOwnProperty.call(note as Record<string, unknown>, 'previewSummary'),
  );
}

function normalizeServerPreviewText(value: unknown, singleLine: boolean): string {
  const text = String(value ?? '').trim();
  if (singleLine) return text.replace(/\s+/gu, ' ').trim();
  return text
    .split(/\r?\n/gu)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** v2 列表响应已经是可信纯文本；返回 null 表示旧服务端，调用方才需要解析 content。 */
export function noteSummaryFromServerPreview(note: unknown, options: NoteSummaryOptions = {}): string | null {
  if (!hasServerNotePreview(note)) return null;
  if (note.type === 'drawing') return '';
  const { maxLength = 200, singleLine = false } = options;
  return truncateSummary(normalizeServerPreviewText(note.previewSummary, singleLine), maxLength);
}

/** 读取 v2 响应中的有序首图预览，整个过程只有字符串整理，不创建 DOM。 */
export function noteCardPreviewFromServer(note: unknown, options: NoteSummaryOptions = {}): NoteCardPreviewText | null {
  if (hasServerNotePreview(note) && note.type === 'drawing') {
    return { summary: '', beforeImage: '', afterImage: '', imageLocated: false };
  }
  const summary = noteSummaryFromServerPreview(note, options);
  if (summary === null || !hasServerNotePreview(note)) return null;
  const { maxLength = 200, singleLine = false } = options;
  const imageLocated = Boolean(note.previewImageLocated && note.previewImageUrl);
  if (!imageLocated) return { summary, beforeImage: summary, afterImage: '', imageLocated: false };

  const separator = singleLine ? ' ' : '\n';
  const beforeImage = normalizeServerPreviewText(note.previewTextBeforeImage, singleLine);
  const afterImage = normalizeServerPreviewText(note.previewTextAfterImage, singleLine);
  const betweenParts = beforeImage && afterImage ? separator : '';
  const previewParts = truncatePreviewParts(beforeImage, afterImage, maxLength, betweenParts);
  return { summary, ...previewParts, imageLocated: true };
}

/**
 * 笔记卡片的有序预览：仍只解析一次安全 HTML，并把服务端选中的压缩首图放回正文原位置。
 * 不渲染数据库 HTML、不请求额外资源，也不扫描 4000 字符列表前缀以外的内容。
 */
export async function noteCardPreviewText(
  content: string = '',
  type?: string,
  previewImageUrl: string = '',
  options: NoteSummaryOptions = {},
): Promise<NoteCardPreviewText> {
  if (type === 'drawing') return { summary: '', beforeImage: '', afterImage: '', imageLocated: false };
  if (!content) return { summary: '', beforeImage: '', afterImage: '', imageLocated: false };
  const { maxLength = 200, singleLine = false } = options;
  const html = await noteContentToHtml(content, type);
  const lines = htmlToSummaryLinesAroundImage(html, previewImageUrl);
  const lineSeparator = singleLine ? ' ' : '\n';
  const beforeImage = lines.beforeImage.join(lineSeparator);
  const afterImage = lines.afterImage.join(lineSeparator);
  const betweenParts = beforeImage && afterImage ? lineSeparator : '';
  const summary = truncateSummary(`${beforeImage}${betweenParts}${afterImage}`, maxLength);

  if (!lines.imageLocated) {
    return { summary, beforeImage: summary, afterImage: '', imageLocated: false };
  }
  const previewParts = truncatePreviewParts(beforeImage, afterImage, maxLength, betweenParts);
  return { summary, ...previewParts, imageLocated: true };
}

/** 笔记内容 → 摘要纯文本(交给模板插值,不走 v-html) */
export async function noteSummaryText(
  content: string = '',
  type?: string,
  options: NoteSummaryOptions = {},
): Promise<string> {
  if (!content) return '';
  const { maxLength = 200, singleLine = false } = options;
  if (type === 'drawing') {
    try {
      const { parseDrawingScene } = await import('@lightnote/shared/drawing-note');
      const scene = parseDrawingScene(content);
      const text = scene.elements
        .flatMap((element) => (element.kind === 'text' ? [element.text.trim()] : []))
        .filter(Boolean)
        .join(singleLine ? ' ' : '\n');
      return truncateSummary(text, maxLength);
    } catch {
      return '';
    }
  }
  const html = await noteContentToHtml(content, type);
  const lines = htmlToSummaryLines(html);
  return truncateSummary(lines.join(singleLine ? ' ' : '\n'), maxLength);
}

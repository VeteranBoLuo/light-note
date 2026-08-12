import { parseDocument } from 'htmlparser2';
import { marked } from 'marked';
import path from 'node:path';

export const NOTE_CARD_PREVIEW_MAX_TEXT = 280;
export const NOTE_CARD_PREVIEW_MAX_BLOCKS = 3;
export const NOTE_CARD_PREVIEW_SUMMARY_MAX_LENGTH = 300;
const NOTE_CARD_PREVIEW_SOURCE_MAX_LENGTH = 4000;

const TRUSTED_ORIGINS = new Set(['https://boluo66.top', 'http://boluo66.top']);
const SAFE_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'fieldset',
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
  'table',
  'ul',
]);
const IGNORED_TAGS = new Set(['code', 'pre', 'script', 'style', 'svg']);
const SUMMARY_IGNORED_TAGS = new Set(['head', 'noscript', 'script', 'style', 'svg', 'template', 'title']);

function cleanCandidateUrl(value) {
  const raw = String(value || '')
    .trim()
    .replace(/&amp;/giu, '&');
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw, 'https://boluo66.top');
  } catch {
    return '';
  }
  if (!TRUSTED_ORIGINS.has(parsed.origin)) return '';
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return '';
  }
  if (!pathname.startsWith('/uploads/')) return '';
  const fileName = path.basename(pathname);
  if (!fileName || pathname !== `/uploads/${fileName}` || fileName.includes('\0')) return '';
  if (!SAFE_IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase())) return '';
  // 保留登记时的原始文件名形态，缩略图接口才能用 note_images.url 的索引做精确归属校验。
  return `https://boluo66.top/uploads/${fileName}`;
}

function sourceFromSrcset(value) {
  const first = String(value || '')
    .split(',')[0]
    ?.trim()
    .split(/\s+/u)[0];
  return first || '';
}

function isMermaidSourceNode(node) {
  if (String(node?.name || '').toLowerCase() !== 'pre') return false;
  if (/language-mermaid/u.test(String(node.attribs?.class || ''))) return true;
  return (node.children || []).some(
    (child) =>
      String(child?.name || '').toLowerCase() === 'code' &&
      /language-mermaid/u.test(String(child.attribs?.class || '')),
  );
}

function normalizePreviewLine(value) {
  return String(value || '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function truncatePreviewText(value, maxLength) {
  const text = String(value || '');
  if (maxLength <= 0 || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

function truncatePreviewParts(beforeImage, afterImage, maxLength, separator) {
  if (maxLength <= 0 || beforeImage.length + separator.length + afterImage.length <= maxLength) {
    return { beforeImage, afterImage };
  }
  if (beforeImage.length >= maxLength) {
    return { beforeImage: truncatePreviewText(beforeImage, maxLength), afterImage: '' };
  }
  const remaining = Math.max(0, maxLength - beforeImage.length - separator.length);
  return {
    beforeImage,
    afterImage: remaining > 0 ? truncatePreviewText(afterImage, remaining) : '',
  };
}

function inspectHtmlCardPreview(content) {
  const document = parseDocument(String(content || ''), {
    decodeEntities: true,
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
  });
  let textLength = 0;
  let blocks = 0;
  let imageUrl = '';
  let buffer = '';
  const beforeImage = [];
  const afterImage = [];

  const flush = () => {
    const text = normalizePreviewLine(buffer);
    if (text) (imageUrl ? afterImage : beforeImage).push(text);
    buffer = '';
  };

  const visit = (nodes, summaryIgnored = false, imageLocationIgnored = false) => {
    for (const node of nodes || []) {
      if (node.type === 'text') {
        if (!summaryIgnored) buffer += String(node.data || '');
        if (!imageUrl && !imageLocationIgnored) textLength += normalizePreviewLine(node.data).length;
        continue;
      }
      if (node.type !== 'tag') continue;
      const tagName = String(node.name || '').toLowerCase();
      const childSummaryIgnored = summaryIgnored || SUMMARY_IGNORED_TAGS.has(tagName) || isMermaidSourceNode(node);
      const childImageLocationIgnored = imageLocationIgnored || IGNORED_TAGS.has(tagName);
      const isBlock = !childSummaryIgnored && BLOCK_TAGS.has(tagName);
      if (isBlock) {
        flush();
        if (!imageUrl && !childImageLocationIgnored) blocks += 1;
      }
      if (
        !imageUrl &&
        !childImageLocationIgnored &&
        textLength <= NOTE_CARD_PREVIEW_MAX_TEXT &&
        blocks <= NOTE_CARD_PREVIEW_MAX_BLOCKS &&
        (tagName === 'img' || tagName === 'source')
      ) {
        const candidate = tagName === 'img' ? node.attribs?.src : sourceFromSrcset(node.attribs?.srcset);
        const locatedImageUrl = cleanCandidateUrl(candidate);
        if (locatedImageUrl) {
          // 先把已经累计的正文写入图片前半段，再切换位置标记。
          flush();
          imageUrl = locatedImageUrl;
        }
      }
      if (tagName === 'br') flush();
      visit(node.children, childSummaryIgnored, childImageLocationIgnored);
      if (isBlock) flush();
    }
  };

  visit(document.children);
  flush();
  return { beforeImage, afterImage, imageUrl };
}

function previewHtmlFromContent(content, type) {
  const normalizedType = String(type || '').toLowerCase();
  if (normalizedType !== 'markdown' && normalizedType !== 'md') return content;
  return String(marked.parse(String(content || ''), { gfm: true, async: false }));
}

/**
 * 服务端一次生成卡片纯文本摘要、首图位置和可信原图地址。
 * 这里不会渲染 HTML，也不信任任意外链；输入和输出都有硬上限，避免把正文解析工作
 * 分摊到几十个移动端 WebView 卡片组件上。
 */
export function buildNoteCardPreview(content, type, options = {}) {
  const source = String(content || '').slice(0, NOTE_CARD_PREVIEW_SOURCE_MAX_LENGTH);
  if (!source) {
    return { summary: '', beforeImage: '', afterImage: '', imageUrl: '', imageLocated: false };
  }
  try {
    const maxLength = Math.max(0, Number(options.maxLength ?? NOTE_CARD_PREVIEW_SUMMARY_MAX_LENGTH) || 0);
    const {
      beforeImage: beforeLines,
      afterImage: afterLines,
      imageUrl,
    } = inspectHtmlCardPreview(previewHtmlFromContent(source, type));
    const separator = options.singleLine ? ' ' : '\n';
    const beforeText = beforeLines.join(separator);
    const afterText = afterLines.join(separator);
    const betweenParts = beforeText && afterText ? separator : '';
    const summary = truncatePreviewText(`${beforeText}${betweenParts}${afterText}`, maxLength);
    if (!imageUrl) {
      return { summary, beforeImage: summary, afterImage: '', imageUrl: '', imageLocated: false };
    }
    const previewParts = truncatePreviewParts(beforeText, afterText, maxLength, betweenParts);
    return { summary, ...previewParts, imageUrl, imageLocated: true };
  } catch {
    return { summary: '', beforeImage: '', afterImage: '', imageUrl: '', imageLocated: false };
  }
}

/** 兼容旧版列表响应：仅返回正文开头的本站图片。 */
export function extractNoteCardPreviewImage(content, type) {
  return buildNoteCardPreview(content, type).imageUrl;
}

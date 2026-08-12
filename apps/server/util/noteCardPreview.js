import { parseDocument } from 'htmlparser2';
import { marked } from 'marked';
import path from 'node:path';

export const NOTE_CARD_PREVIEW_MAX_TEXT = 280;
export const NOTE_CARD_PREVIEW_MAX_BLOCKS = 3;

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

function inspectHtmlPreview(content) {
  const document = parseDocument(String(content || ''), {
    decodeEntities: true,
    lowerCaseAttributeNames: true,
    lowerCaseTags: true,
  });
  let textLength = 0;
  let blocks = 0;
  let imageUrl = '';

  const visit = (nodes, ignored = false) => {
    for (const node of nodes || []) {
      if (imageUrl || textLength > NOTE_CARD_PREVIEW_MAX_TEXT || blocks > NOTE_CARD_PREVIEW_MAX_BLOCKS) return;
      if (node.type === 'text') {
        if (!ignored)
          textLength += String(node.data || '')
            .replace(/\s+/gu, ' ')
            .trim().length;
        continue;
      }
      if (node.type !== 'tag') continue;
      const tagName = String(node.name || '').toLowerCase();
      const childIgnored = ignored || IGNORED_TAGS.has(tagName);
      if (!childIgnored && BLOCK_TAGS.has(tagName)) blocks += 1;
      if (!childIgnored && (tagName === 'img' || tagName === 'source')) {
        const candidate = tagName === 'img' ? node.attribs?.src : sourceFromSrcset(node.attribs?.srcset);
        imageUrl = cleanCandidateUrl(candidate);
        if (imageUrl) return;
      }
      visit(node.children, childIgnored);
    }
  };

  visit(document.children);
  return imageUrl;
}

function inspectMarkdownPreview(content) {
  let textLength = 0;
  let blocks = 0;
  let imageUrl = '';
  const seen = new Set();

  const walk = (value) => {
    if (imageUrl || value == null || textLength > NOTE_CARD_PREVIEW_MAX_TEXT || blocks > NOTE_CARD_PREVIEW_MAX_BLOCKS) {
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);

    const token = value;
    const type = String(token.type || '');
    if (type === 'image') {
      imageUrl = cleanCandidateUrl(token.href);
      return;
    }
    if (type === 'html') {
      imageUrl = inspectHtmlPreview(token.raw || token.text);
      if (imageUrl) return;
    }
    if (['heading', 'paragraph', 'blockquote', 'list_item', 'table', 'code'].includes(type)) blocks += 1;
    if (type === 'text' && !Array.isArray(token.tokens)) {
      textLength += String(token.text || '')
        .replace(/\s+/gu, ' ')
        .trim().length;
    }
    if (type === 'code' || type === 'codespan') return;

    for (const [key, child] of Object.entries(token)) {
      if (['raw', 'text', 'href', 'title'].includes(key)) continue;
      if (key === 'tokens' || key === 'items' || key === 'header' || key === 'rows') walk(child);
    }
  };

  walk(marked.lexer(String(content || ''), { gfm: true }));
  return imageUrl;
}

/**
 * 只为卡片返回正文开头的本站图片。这里不渲染 HTML，也不信任任意外链；
 * 列表正文已被 SQL 截到 4000 字符，因此解析成本和内存都有硬上限。
 */
export function extractNoteCardPreviewImage(content, type) {
  const source = String(content || '').slice(0, 4000);
  if (!source) return '';
  try {
    const normalizedType = String(type || '').toLowerCase();
    return normalizedType === 'markdown' || normalizedType === 'md'
      ? inspectMarkdownPreview(source)
      : inspectHtmlPreview(source);
  } catch {
    return '';
  }
}

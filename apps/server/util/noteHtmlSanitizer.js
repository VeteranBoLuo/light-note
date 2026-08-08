import sanitizeHtml from 'sanitize-html';

// TinyMCE 正文允许的语义/排版元素。白名单覆盖当前富文本、任务清单、代码块、
// Mermaid 源码块和站内资源引用；脚本、表单、对象嵌入等主动内容不进入持久层。
const ALLOWED_TAGS = [
  'a',
  'abbr',
  'address',
  'article',
  'aside',
  'b',
  'bdi',
  'bdo',
  'blockquote',
  'br',
  'caption',
  'center',
  'cite',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'details',
  'dfn',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'i',
  'img',
  'input',
  'ins',
  'kbd',
  'li',
  'main',
  'mark',
  'nav',
  'ol',
  'p',
  'pre',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'section',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'time',
  'tr',
  'u',
  'ul',
  'var',
  'wbr',
];

// 只开放不会加载外部资源、不会覆盖页面布局的样式属性。值仍显式拒绝 URL、脚本
// 与旧浏览器行为表达式；TinyMCE 的颜色、对齐、字号、表格和图片尺寸均可保留。
const SAFE_STYLE_VALUE = /^(?![\s\S]*(?:url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|@import|behavior\s*:))[\s\S]{1,256}$/i;
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i;

const SANITIZE_OPTIONS = Object.freeze({
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    '*': ['class', 'style', 'title', 'dir', 'lang', 'data-*', 'aria-*'],
    a: ['href', 'target', 'rel', 'contenteditable', 'title', 'class', 'data-*', 'aria-*'],
    img: ['src', 'alt', 'title', 'width', 'height', 'class', 'style', 'data-*'],
    input: ['type', 'checked', 'disabled', 'class', 'data-*', 'aria-*'],
    ol: ['start', 'type', 'reversed', 'class', 'style'],
    li: ['value', 'class', 'style', 'data-*'],
    table: ['width', 'height', 'border', 'cellpadding', 'cellspacing', 'class', 'style', 'data-*'],
    col: ['span', 'width', 'class', 'style'],
    colgroup: ['span', 'width', 'class', 'style'],
    td: ['colspan', 'rowspan', 'headers', 'scope', 'width', 'height', 'class', 'style', 'data-*'],
    th: ['colspan', 'rowspan', 'headers', 'scope', 'abbr', 'width', 'height', 'class', 'style', 'data-*'],
    time: ['datetime', 'class', 'style'],
  },
  allowedStyles: {
    '*': {
      color: [SAFE_STYLE_VALUE],
      'background-color': [SAFE_STYLE_VALUE],
      'font-family': [SAFE_STYLE_VALUE],
      'font-size': [SAFE_STYLE_VALUE],
      'font-style': [SAFE_STYLE_VALUE],
      'font-weight': [SAFE_STYLE_VALUE],
      'text-align': [SAFE_STYLE_VALUE],
      'text-decoration': [SAFE_STYLE_VALUE],
      'text-indent': [SAFE_STYLE_VALUE],
      'line-height': [SAFE_STYLE_VALUE],
      'letter-spacing': [SAFE_STYLE_VALUE],
      'vertical-align': [SAFE_STYLE_VALUE],
      'white-space': [SAFE_STYLE_VALUE],
      width: [SAFE_STYLE_VALUE],
      'min-width': [SAFE_STYLE_VALUE],
      'max-width': [SAFE_STYLE_VALUE],
      height: [SAFE_STYLE_VALUE],
      'min-height': [SAFE_STYLE_VALUE],
      'max-height': [SAFE_STYLE_VALUE],
      margin: [SAFE_STYLE_VALUE],
      'margin-top': [SAFE_STYLE_VALUE],
      'margin-right': [SAFE_STYLE_VALUE],
      'margin-bottom': [SAFE_STYLE_VALUE],
      'margin-left': [SAFE_STYLE_VALUE],
      padding: [SAFE_STYLE_VALUE],
      'padding-top': [SAFE_STYLE_VALUE],
      'padding-right': [SAFE_STYLE_VALUE],
      'padding-bottom': [SAFE_STYLE_VALUE],
      'padding-left': [SAFE_STYLE_VALUE],
      border: [SAFE_STYLE_VALUE],
      'border-width': [SAFE_STYLE_VALUE],
      'border-style': [SAFE_STYLE_VALUE],
      'border-color': [SAFE_STYLE_VALUE],
      'border-collapse': [SAFE_STYLE_VALUE],
      'border-spacing': [SAFE_STYLE_VALUE],
      'list-style-type': [SAFE_STYLE_VALUE],
      'list-style-position': [SAFE_STYLE_VALUE],
      display: [SAFE_STYLE_VALUE],
      float: [SAFE_STYLE_VALUE],
      clear: [SAFE_STYLE_VALUE],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  nonTextTags: ['style', 'script', 'textarea', 'option', 'xmp', 'noscript', 'iframe', 'object', 'embed', 'form'],
  transformTags: {
    a(tagName, attribs) {
      const next = { ...attribs };
      if (String(next.target || '').toLowerCase() === '_blank') {
        const rel = new Set(String(next.rel || '').split(/\s+/).filter(Boolean));
        rel.add('noopener');
        rel.add('noreferrer');
        next.rel = [...rel].join(' ');
      }
      if (Object.prototype.hasOwnProperty.call(next, 'contenteditable')) next.contenteditable = 'false';
      return { tagName, attribs: next };
    },
  },
  exclusiveFilter(frame) {
    if (frame.tag === 'input') return String(frame.attribs.type || '').toLowerCase() !== 'checkbox';
    if (frame.tag !== 'img') return false;
    const src = String(frame.attribs.src || '').trim();
    if (!src || /^blob:/i.test(src)) return true;
    return /^data:/i.test(src) && !SAFE_DATA_IMAGE.test(src);
  },
});

function countMatches(value, pattern) {
  return [...String(value || '').matchAll(pattern)].length;
}

export function summarizeNoteHtmlSanitization(before, after) {
  const source = String(before || '');
  const result = String(after || '');
  const removedTags = countMatches(
    source,
    /<\/?\s*(?:script|style|iframe|object|embed|form|textarea|meta|link|base|svg|math|noscript)\b/giu,
  );
  const removedEventAttributes = countMatches(source, /\s+on[a-z][\w:-]*\s*=/giu);
  const removedUnsafeUrls = countMatches(
    source,
    /\s+(?:href|src)\s*=\s*(?:["']\s*)?(?:javascript|vbscript|data:text\/html)\s*:/giu,
  );
  const removedUnsafeStyles = countMatches(
    source,
    /(?:url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|@import|behavior\s*:)/giu,
  );
  const categories = [];
  if (removedTags) categories.push('active_tag');
  if (removedEventAttributes) categories.push('event_attribute');
  if (removedUnsafeUrls) categories.push('unsafe_url');
  if (removedUnsafeStyles) categories.push('unsafe_style');
  if (source !== result && !categories.length) categories.push('non_allowlisted_markup');
  return {
    changed: source !== result,
    categories,
    removedTags,
    removedEventAttributes,
    removedUnsafeUrls,
    removedUnsafeStyles,
    beforeLength: source.length,
    afterLength: result.length,
  };
}

export function sanitizeNoteHtml(value) {
  const before = String(value ?? '');
  const html = sanitizeHtml(before, SANITIZE_OPTIONS);
  return { html, report: summarizeNoteHtmlSanitization(before, html) };
}

export function sanitizePersistedNoteContent(value, type, scene = 'unknown') {
  if (String(type || '').toLowerCase() !== 'html') return String(value ?? '');
  const { html, report } = sanitizeNoteHtml(value);
  const securityRelevantChange = report.categories.some((category) => category !== 'non_allowlisted_markup');
  if (securityRelevantChange) {
    // 只记录稳定类别与计数，绝不记录正文、属性值、URL 或用户标识。
    console.warn(
      '[note-html] sanitized scene=%s categories=%s tags=%d attrs=%d urls=%d styles=%d before=%d after=%d',
      scene,
      report.categories.join(',') || 'unknown',
      report.removedTags,
      report.removedEventAttributes,
      report.removedUnsafeUrls,
      report.removedUnsafeStyles,
      report.beforeLength,
      report.afterLength,
    );
  }
  return html;
}

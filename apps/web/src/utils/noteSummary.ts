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
    /language-mermaid/.test(el.getAttribute('class') || '') ||
    !!el.querySelector('code[class*="language-mermaid"]')
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

/** 把(已消毒的)HTML 拆成按块级元素分行的纯文本 */
export function htmlToSummaryLines(html: string): string[] {
  if (!html) return [];
  if (typeof document === 'undefined') return htmlToLinesWithoutDom(html);

  const root = document.createElement('div');
  root.innerHTML = html;

  const lines: string[] = [];
  let buffer = '';
  const flush = () => {
    const text = buffer.replace(/\s+/g, ' ').trim();
    if (text) lines.push(text);
    buffer = '';
  };

  const walk = (node: Node) => {
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
      if (tag === 'br') {
        flush();
        return;
      }
      if (BLOCK_TAGS.has(tag)) {
        flush();
        walk(el);
        flush();
        return;
      }
      // 行内元素(span/a/strong/code…)并入当前行
      walk(el);
    });
  };

  walk(root);
  flush();
  return lines;
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

/** 笔记内容 → 摘要纯文本(交给模板插值,不走 v-html) */
export async function noteSummaryText(
  content: string = '',
  type?: string,
  options: NoteSummaryOptions = {},
): Promise<string> {
  if (!content) return '';
  const { maxLength = 200, singleLine = false } = options;
  const html = await noteContentToHtml(content, type);
  const lines = htmlToSummaryLines(html);
  return truncateSummary(lines.join(singleLine ? ' ' : '\n'), maxLength);
}

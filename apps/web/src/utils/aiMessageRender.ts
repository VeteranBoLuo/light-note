import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import i18n from '@/i18n';
import { configureMarkdownRenderer } from '@/utils/markdownRenderer';
import { highlightCode, escapeCodeText } from '@/utils/codeHighlight';
import { normalizeCodeLanguage, supportsCodeHighlight } from '@/config/codeLanguages';

// AI 配置只作用于私有实例，不能让摘要、导出或笔记正文因模块加载顺序而执行高亮。
const marked = configureMarkdownRenderer(new Marked());
marked.use({
  renderer: {
    code({ text, lang }) {
      const requested = normalizeCodeLanguage(lang);
      if (requested === 'mermaid') return `<pre><code class="language-mermaid">${escapeCodeText(text)}</code></pre>\n`;
      const language = supportsCodeHighlight(requested)
        ? String(lang).trim().split(/\s+/u)[0].toLowerCase()
        : 'plaintext';
      return `<pre><code class="hljs language-${language}">${highlightCode(text, language)}</code></pre>\n`;
    },
  },
});
marked.setOptions({ breaks: true, gfm: true });

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'span',
  'a',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];

function safeAnchorPart(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

const CJK_URL_SENTENCE_BOUNDARY = /[，。；：！？、）】》」』”’]/u;

function canonicalHttpUrl(value: string) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function hrefMatchesBareUrlText(href: string, visibleText: string) {
  if (!/^https?:\/\//iu.test(visibleText)) return false;
  try {
    if (href === visibleText || href === encodeURI(visibleText)) return true;
  } catch {
    return false;
  }
  const canonicalText = canonicalHttpUrl(visibleText);
  return Boolean(canonicalText) && canonicalText === canonicalHttpUrl(href);
}

function bareUrlSentenceBoundary(value: string) {
  const cjkBoundary = CJK_URL_SENTENCE_BOUNDARY.exec(value)?.index ?? -1;
  let roundDepth = 0;
  let squareDepth = 0;
  let curlyDepth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '(') roundDepth += 1;
    else if (char === ')') {
      if (roundDepth === 0) return cjkBoundary === -1 ? index : Math.min(index, cjkBoundary);
      roundDepth -= 1;
    } else if (char === '[') squareDepth += 1;
    else if (char === ']') {
      if (squareDepth === 0) return cjkBoundary === -1 ? index : Math.min(index, cjkBoundary);
      squareDepth -= 1;
    } else if (char === '{') curlyDepth += 1;
    else if (char === '}') {
      if (curlyDepth === 0) return cjkBoundary === -1 ? index : Math.min(index, cjkBoundary);
      curlyDepth -= 1;
    }
  }
  return cjkBoundary;
}

/**
 * marked 的 GFM 裸链接会把紧随 URL 的中文标点与正文一起吞进 href，例如
 * `https://example.com），标题…`。这里只修正“可见文字与 href 指向同一完整 URL”的
 * 自动链接；显式 Markdown 链接、代码和自定义文案链接保持原语义。
 */
export function repairAiBareUrlBoundaries(html: string): string {
  if (typeof document === 'undefined' || !html) return html;
  const root = document.createElement('div');
  root.innerHTML = html;
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (anchor.childElementCount > 0) continue;
    const visibleText = String(anchor.textContent || '');
    const originalHref = String(anchor.getAttribute('href') || '');
    if (!hrefMatchesBareUrlText(originalHref, visibleText)) continue;
    const boundary = bareUrlSentenceBoundary(visibleText);
    if (boundary <= 0) continue;
    const urlText = visibleText.slice(0, boundary);
    if (!canonicalHttpUrl(urlText)) continue;
    const trailingText = visibleText.slice(boundary);
    anchor.textContent = urlText;
    anchor.setAttribute('href', urlText);
    anchor.after(document.createTextNode(trailingText));
  }
  return root.innerHTML;
}

export function getAiEvidenceAnchorId(citationKey: string, scope = ''): string {
  const safeScope = safeAnchorPart(scope);
  const safeKey = safeAnchorPart(citationKey);
  return `ai-evidence-${safeScope ? `${safeScope}-` : ''}${safeKey || 'unknown'}`;
}

/**
 * 仅把证据协议中真实存在的 citationKey 变成链接。未知编号保持普通文本，
 * 并跳过 code/pre/a，防止代码样例或已有链接被误改写。
 */
export function decorateAiCitations(html: string, citationKeys: string[] = [], anchorScope = ''): string {
  if (typeof document === 'undefined' || !citationKeys.length) return html;
  const knownKeys = new Map(
    citationKeys
      .map((key) => String(key || '').trim())
      .filter(Boolean)
      .map((key) => [key.toLocaleLowerCase(), key]),
  );
  if (!knownKeys.size) return html;

  const root = document.createElement('div');
  root.innerHTML = html;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    const parent = current.parentElement;
    if (parent && !parent.closest('a, code, pre')) textNodes.push(current as Text);
    current = walker.nextNode();
  }

  const candidatePattern = /\[([^\[\]\r\n]{1,64})\]/g;
  for (const node of textNodes) {
    const value = node.nodeValue || '';
    candidatePattern.lastIndex = 0;
    if (!candidatePattern.test(value)) continue;
    candidatePattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = candidatePattern.exec(value))) {
      const knownKey = knownKeys.get(match[1].trim().toLocaleLowerCase());
      if (!knownKey) continue;
      if (match.index > cursor) fragment.append(value.slice(cursor, match.index));
      // 角标改为不可点的 span(去掉 href 与点击跳转):证据账本已下线、点击无意义;
      // hover 由 ChatMessageItem 用主题 tooltip 显示来源名(读 data-citation-key)。
      const anchor = document.createElement('span');
      anchor.className = 'ai-inline-citation';
      anchor.dataset.citationKey = knownKey;
      // 可聚焦(键盘/读屏可达):hover 与 focus 都会触发 ChatMessageItem 的来源名 tooltip,并在聚焦时把真实来源名写进 aria-label
      anchor.setAttribute('tabindex', '0');
      anchor.setAttribute('aria-label', i18n.global.t('ai.citationAriaLabel', { key: knownKey }));
      anchor.textContent = `[${knownKey}]`;
      fragment.append(anchor);
      cursor = match.index + match[0].length;
    }
    if (!cursor) continue;
    if (cursor < value.length) fragment.append(value.slice(cursor));
    node.replaceWith(fragment);
  }
  return root.innerHTML;
}

export function renderAssistantMarkdown(content: string, citationKeys: string[] = [], anchorScope = ''): string {
  try {
    const html = DOMPurify.sanitize(marked.parse(String(content || '')) as string, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'class', 'data-citation-key', 'aria-label'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    });
    return decorateAiCitations(repairAiBareUrlBoundaries(html), citationKeys, anchorScope);
  } catch {
    return DOMPurify.sanitize(String(content || ''), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).replace(/\n/g, '<br>');
  }
}

/**
 * 流式渲染前补全「未闭合」的 Markdown 语法。最典型也最影响观感的是未闭合的围栏代码块:
 * 一旦 ``` 开了没闭合,marked 会把后续所有文字都吞进代码块样式,整段中间态错乱。补全后中间态也能
 * 正确渲染,不再露出原始符号。只服务流式中间态;回答落定后走完整 renderAssistantMarkdown,不经此。
 *
 * 处理:未闭合围栏 ```/~~~(含语言标注、4+ 反引号)→ 末尾补对应闭合;正文区未闭合的行内 ` → 末尾补一个。
 * 强调(** * ~~)与半截链接不主动补——marked 会把未配对符号当普通文本,短暂露出可接受,而主动补全易误判
 * (把不该加粗的补成加粗),得不偿失;下一帧 AI 吐出后半符号即自然配对。
 */
export function closeStreamingMarkdown(content: string): string {
  const text = String(content ?? '');
  if (!text) return text;

  let inFence = false;
  let fenceChar = '`';
  let fenceLen = 3;
  let inlineTicks = 0;

  for (const line of text.split('\n')) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1];
      if (!inFence) {
        inFence = true;
        fenceChar = marker[0];
        fenceLen = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceLen) {
        inFence = false;
      }
      continue; // 围栏标记行本身不参与行内反引号统计
    }
    if (!inFence) inlineTicks += (line.match(/`/g) || []).length;
  }

  if (inFence) return text + (text.endsWith('\n') ? '' : '\n') + fenceChar.repeat(fenceLen);
  if (inlineTicks % 2 === 1) return text + '`';
  return text;
}

/**
 * 流式中间态渲染:先补全未闭合语法,再复用 renderAssistantMarkdown(走同一套 marked + 高亮 + DOMPurify,
 * 故代码块流式时就带色、与落定态视觉一致)。唯一区别是不传 citationKeys → decorateAiCitations 直接短路
 * (流式阶段来源尚未到位,本就不装饰),省去全文 TreeWalker;配合打字机逐帧节奏每帧至多一次,足够流畅。
 * 回答落定后由完整渲染补上 [n] 引用链接。
 */
export function renderStreamingMarkdown(content: string): string {
  return renderAssistantMarkdown(closeStreamingMarkdown(content));
}

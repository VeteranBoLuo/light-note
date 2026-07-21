import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import plaintext from 'highlight.js/lib/languages/plaintext';
import i18n from '@/i18n';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
// core 构建默认不含 plaintext;显式注册,避免将来接回高亮时对无/未知语言的代码块抛 "Unknown language: plaintext"。
hljs.registerLanguage('plaintext', plaintext);

// marked v5+ 移除了 highlight / smartLists / smartypants 选项(v4 时代的 setOptions 写法在 v17 下被静默
// 忽略,导致代码块一直没有语法高亮)。语法高亮改为自定义 code renderer 接 highlight.js;注意必须同时放开
// 下方 DOMPurify 的 span 白名单,否则 hljs 生成的 <span class="hljs-*"> token 会被净化掉,高亮依旧不显。
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      const value = hljs.highlight(text, { language }).value;
      return `<pre><code class="hljs language-${language}">${value}</code></pre>\n`;
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
    const processedContent = String(content || '').replace(
      /([\s\n]|^)(https?:\/\/[^\s<]*?)(?=[）\)】」』」。，、；：\s<]|$)/g,
      '$1<$2>',
    );
    const html = DOMPurify.sanitize(marked.parse(processedContent) as string, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'class', 'data-citation-key', 'aria-label'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    });
    return decorateAiCitations(html, citationKeys, anchorScope);
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

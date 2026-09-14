import hljs from 'highlight.js/lib/core';
import type { LanguageFn } from 'highlight.js';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import { normalizeCodeLanguage, supportsCodeHighlight, MAX_CODE_HIGHLIGHT_LENGTH } from '@/config/codeLanguages';

const MAX_CACHE_SIZE = 1_000_000;
export function escapeCodeText(text: string): string {
  return text.replace(
    /[&<>"']/gu,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}
/** 私有实例和有界缓存；笔记额外语言在展示时按需加载，不扩大 AI/首屏依赖。 */
export function createCodeHighlighter(extraLanguages: Record<string, LanguageFn> = {}) {
  const highlighter = hljs.newInstance();
  Object.entries({
    bash,
    css,
    javascript,
    json,
    markdown,
    python,
    sql,
    typescript,
    html: xml,
    ...extraLanguages,
  }).forEach(([name, grammar]) => highlighter.registerLanguage(name, grammar));
  const cache = new Map<string, string>();
  let cacheSize = 0;
  /** 仅接受纯代码文本；不猜语言，未知/超长/失败均安全退回纯文本。 */
  function highlightCode(text: string, requestedLanguage: string): string {
    const language = normalizeCodeLanguage(requestedLanguage);
    if (
      !text ||
      text.length > MAX_CODE_HIGHLIGHT_LENGTH ||
      !supportsCodeHighlight(language) ||
      !highlighter.getLanguage(language)
    )
      return escapeCodeText(text);
    const key = `${language}\0${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    let html: string;
    try {
      html = highlighter.highlight(text, { language, ignoreIllegals: true }).value;
    } catch {
      return escapeCodeText(text);
    }
    const size = key.length + html.length;
    if (size <= MAX_CACHE_SIZE) {
      while (cache.size && (cacheSize + size > MAX_CACHE_SIZE || cache.size >= 128)) {
        const first = cache.keys().next().value!;
        cacheSize -= first.length + cache.get(first)!.length;
        cache.delete(first);
      }
      cache.set(key, html);
      cacheSize += size;
    }
    return html;
  }

  return highlightCode;
}
let defaultHighlighter: ReturnType<typeof createCodeHighlighter> | undefined;
export function highlightCode(text: string, language: string): string {
  defaultHighlighter ||= createCodeHighlighter();
  return defaultHighlighter(text, language);
}

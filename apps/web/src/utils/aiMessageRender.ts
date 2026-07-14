import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';

marked.setOptions({
  highlight(code: string, lang: string) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  breaks: true,
  gfm: true,
  smartLists: true,
  smartypants: true,
} as any);

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li',
  'blockquote', 'code', 'pre', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

export function renderAssistantMarkdown(content: string): string {
  try {
    const processedContent = String(content || '').replace(
      /([\s\n]|^)(https?:\/\/[^\s<]*?)(?=[）\)】」』」。，、；：\s<]|$)/g,
      '$1<$2>',
    );
    return DOMPurify.sanitize(marked.parse(processedContent) as string, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'class'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    });
  } catch {
    return DOMPurify.sanitize(String(content || ''), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).replace(/\n/g, '<br>');
  }
}

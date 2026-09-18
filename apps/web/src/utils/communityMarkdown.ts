import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { configureMarkdownRenderer } from './markdownRenderer';

const markdown = configureMarkdownRenderer(new Marked({ breaks: true, gfm: true }));
// Community text never embeds remote media, executable markup, or account resource previews.
export function renderCommunityMarkdown(body: string): string {
  return DOMPurify.sanitize(markdown.parse(body || '', { async: false }) as string, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'del',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'ul',
      'ol',
      'li',
      'pre',
      'code',
      'a',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
  });
}

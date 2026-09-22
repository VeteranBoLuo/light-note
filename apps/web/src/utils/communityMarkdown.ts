import { Marked } from 'marked';
import { sanitizeCommunityHtml } from './communityContent';
import { configureMarkdownRenderer } from './markdownRenderer';

const markdown = configureMarkdownRenderer(new Marked({ breaks: true, gfm: true }));
// Community text never embeds remote media, executable markup, or account resource previews.
export function renderCommunityMarkdown(body: string): string {
  return sanitizeCommunityHtml(markdown.parse(body || '', { async: false }) as string);
}

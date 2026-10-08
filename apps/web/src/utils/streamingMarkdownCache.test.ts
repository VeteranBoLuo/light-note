// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import DOMPurify from 'dompurify';
import { createStreamingMarkdownRenderer, renderStreamingMarkdown } from './aiMessageRender';

it.each([
  '# Heading\n\nA **paragraph**\n\nNext',
  '- one\n- two\n\n> quoted\n\nNext',
  '| A | B |\n| --- | --- |\n| a | b |\n\nNext',
  '```js\nconst answer = 42;\n```\n\nNext',
  'Before\n\n```js\nconst unfinished = 1',
  '[reference][link]\n\n[link]: https://example.com\n\nNext',
  '<div>HTML\n\nspanning blocks</div>\n\n<img src="x" onerror="alert(1)">',
  'Inline <span>HTML\n\nacross blocks</span>',
  '[bad](javascript:alert(1))\n\nhttps://example.com，中文说明',
])('cached rendering preserves full-document Markdown and safety: %s', (source) => {
  const render = createStreamingMarkdownRenderer();
  expect(render(source)).toBe(renderStreamingMarkdown(source));
  expect(render(source + ' appended')).toBe(renderStreamingMarkdown(source + ' appended'));
});

it('completed blocks are not sanitized again when only the trailing paragraph changes', () => {
  const render = createStreamingMarkdownRenderer();
  const sanitize = vi.spyOn(DOMPurify, 'sanitize');
  try {
    render('# Fixed heading\n\n```js\nconst fixed = 1;\n```\n\nDraft');
    sanitize.mockClear();
    render('# Fixed heading\n\n```js\nconst fixed = 1;\n```\n\nDraft grows');
    expect(sanitize).toHaveBeenCalledTimes(1);
    expect(String(sanitize.mock.calls[0][0])).toContain('Draft grows');
  } finally {
    sanitize.mockRestore();
  }
});

it('repair resets and late reference definitions invalidate the affected cached blocks', () => {
  const render = createStreamingMarkdownRenderer();
  render('[reference][link]\n\nDraft');
  const source = '[reference][link]\n\nDraft\n\n[link]: https://example.com';
  expect(render(source)).toBe(renderStreamingMarkdown(source));
  expect(render('A repaired **answer**')).toBe(renderStreamingMarkdown('A repaired **answer**'));
  expect(render('')).toBe('');
});

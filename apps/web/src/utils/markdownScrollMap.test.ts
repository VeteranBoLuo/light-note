// @vitest-environment jsdom
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { describe, expect, it } from 'vitest';
import { configureMarkdownRenderer } from './markdownRenderer';
import { promoteEmptyMarkdownTaskToken } from './noteHtmlToMarkdown';
import { mapScrollPosition, renderMarkdownScrollMap, SOURCE_ATTRIBUTE } from './markdownScrollMap';

const parser = configureMarkdownRenderer(new Marked());
function render(source: string) {
  const root = document.createElement('div');
  root.innerHTML = DOMPurify.sanitize(renderMarkdownScrollMap(source, parser, promoteEmptyMarkdownTaskToken));
  return root;
}

describe('Markdown preview source map', () => {
  it.each([
    '# 标题\n\n**事：**正文\n\n---\n\n结尾',
    '- [ ]\n- [x]\n\n> 引用\n> 第二行',
    '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n结尾',
    '[链接][ref]\n\n[ref]: https://example.com\n\n再次[链接][ref]',
    '```js\nconst a = 1;\n\nconsole.log(a);\n```\n\n![图](https://example.com/a.png)',
    '<div>安全 HTML</div>\n\n正文\n\n    indented code',
    '<div>\n\n# Nested heading\n\n正文\n\n</div>\n\n# Outside',
    '# CRLF\r\n\r\n```js\r\nconst a = 1;\r\n```',
  ])('preserves existing rendering: %s', (source) => {
    const actual = render(source);
    actual.querySelectorAll('*').forEach((e) => {
      e.removeAttribute(SOURCE_ATTRIBUTE);
      e.removeAttribute('data-ln-md-code');
    });
    const expected = document.createElement('div');
    expected.innerHTML = DOMPurify.sanitize(
      String(parser.parse(source, { walkTokens: promoteEmptyMarkdownTaskToken })),
    );
    expect(actual.innerHTML).toBe(expected.innerHTML);
  });

  it('maps repeated blocks, reference definitions and fenced code to exact offsets', () => {
    const source = '[ref]: https://example.com\n\n# Same\n\n# Same\n\n```js\nline1\n\nline3\n```';
    const root = render(source);
    const headings = root.querySelectorAll('h1');
    expect(Number(headings[0].getAttribute(SOURCE_ATTRIBUTE))).toBe(source.indexOf('# Same'));
    expect(Number(headings[1].getAttribute(SOURCE_ATTRIBUTE))).toBe(source.lastIndexOf('# Same'));
    expect(Number(root.querySelector('pre')?.getAttribute('data-ln-md-code'))).toBe(source.indexOf('line1'));
  });

  it('keeps sanitization and prevents forged nested source anchors', () => {
    const root = render(
      '<div data-ln-md-source="999"><p data-ln-md-source="999" data-ln-md-code="999">x</p><img src="x" onerror="alert(1)"></div>',
    );
    expect(root.firstElementChild?.getAttribute(SOURCE_ATTRIBUTE)).toBe('0');
    expect(root.querySelector('p')?.hasAttribute(SOURCE_ATTRIBUTE)).toBe(false);
    expect(root.querySelector('img')?.hasAttribute('onerror')).toBe(false);
  });
});

describe('piecewise scroll mapping', () => {
  const anchors = [
    { source: 0, preview: 0 },
    { source: 100, preview: 100 },
    { source: 120, preview: 900 },
    { source: 500, preview: 1200 },
  ];
  it('confines tall image expansion to its own block and maps both directions', () => {
    expect(mapScrollPosition(110, anchors, 'source')).toBe(500);
    expect(mapScrollPosition(500, anchors, 'preview')).toBe(110);
    expect(mapScrollPosition(120, anchors, 'source')).toBe(900);
  });
  it('handles document edges, empty documents and non-scrollable panes', () => {
    expect(mapScrollPosition(-20, anchors, 'source')).toBe(0);
    expect(mapScrollPosition(9999, anchors, 'source')).toBe(1200);
    expect(mapScrollPosition(9999, anchors, 'preview')).toBe(500);
    expect(mapScrollPosition(0, [], 'source')).toBe(0);
    expect(
      mapScrollPosition(
        0,
        [
          { source: 0, preview: 0 },
          { source: 0, preview: 900 },
        ],
        'source',
      ),
    ).toBe(0);
  });
});

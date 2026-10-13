import { describe, expect, it } from 'vitest';
import { Marked } from 'marked';
import { noteMathHtml, noteMathMarkedExtension, noteMathMarkdown } from '@lightnote/shared/note-math';
import { renderNoteMathSource } from '@lightnote/shared/note-math-renderer';
import { clearNoteMathEditingUi, serializeNoteMath, renderNoteMathHtml, renderNoteMathElements, isNoteMathActivation } from './noteMath';
import { noteHtmlToMarkdown } from './noteHtmlToMarkdown';
import { noteContentToHtml } from './common';
import { renderMarkdownScrollMap } from './markdownScrollMap';

const marked = new Marked(noteMathMarkedExtension());
const formulas = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return [...div.querySelectorAll<HTMLElement>('[data-ln-math]')];
};

describe('note formula source contract', () => {
  it('only activates on click, Enter or Space even for TinyMCE plain keyboard events', () => {
    expect(isNoteMathActivation({ type: 'click' })).toBe(true);
    for (const key of ['Enter', ' ']) expect(isNoteMathActivation({ type: 'keydown', key })).toBe(true);
    for (const key of ['Tab', 'Shift', 'Escape', 'ArrowRight', 'Backspace']) {
      expect(isNoteMathActivation({ type: 'keydown', key })).toBe(false);
    }
  });

  it('keeps accessible editing metadata without adding text to the equation or saved content', async () => {
    const source = noteMathHtml('x^2', 'block');
    const holder = document.createElement('div');
    holder.innerHTML = source;
    await renderNoteMathElements(holder, '编辑公式');
    await renderNoteMathElements(holder, 'Edit formula');
    expect(holder.querySelectorAll('.katex')).toHaveLength(1);
    expect(holder.firstElementChild?.getAttribute('aria-label')).toBe('Edit formula');
    expect(holder.textContent).not.toContain('Edit formula');
    expect(serializeNoteMath(holder.innerHTML)).toBe(source);
    expect(noteHtmlToMarkdown(holder.innerHTML)).toContain('x^2');
    expect(noteHtmlToMarkdown(holder.innerHTML)).not.toContain('Edit formula');
    for (const readHtml of [await renderNoteMathHtml(holder.innerHTML), await noteContentToHtml(holder.innerHTML, 'html')]) {
      expect(readHtml).toContain('katex');
      expect(readHtml).not.toMatch(/role="button"|Edit formula|contenteditable/);
    }
  });

  it('cleans selected formula UI from a PDF clone without changing the live editor or rendered equation', async () => {
    const original = document.createElement('div');
    original.innerHTML = await renderNoteMathHtml(noteMathHtml('x^2', 'block'), 'Edit formula');
    original.firstElementChild!.setAttribute('data-mce-selected', '1');
    const clone = original.cloneNode(true) as HTMLElement;
    clearNoteMathEditingUi(clone);
    expect(clone.innerHTML).not.toMatch(/data-mce-selected|role="button"|mceNonEditable|Edit formula/);
    expect(clone.querySelector('.katex')?.outerHTML).toBe(original.querySelector('.katex')?.outerHTML);
    expect(original.firstElementChild?.getAttribute('role')).toBe('button');
    expect(original.firstElementChild?.getAttribute('data-mce-selected')).toBe('1');
  });

  it('round trips inline, block and escaped HTML through rendering, conversion and re-editing', async () => {
    const inline = String.raw`E=mc^2`;
    const block = String.raw`\begin{bmatrix}a&b\\c&d\end{bmatrix}`;
    const source = `能量 $${inline}$。\n\n$$\n${block}\n$$`;
    const html = String(marked.parse(source));
    expect(formulas(html).map((n) => n.dataset.lnLatex)).toEqual([inline, block]);
    const rendered = await renderNoteMathHtml(html);
    expect(formulas(rendered).every((n) => n.querySelector('.katex'))).toBe(true);
    expect(serializeNoteMath(rendered)).not.toContain('katex');
    const restored = String(marked.parse(noteHtmlToMarkdown(rendered)));
    expect(formulas(restored).map((n) => n.dataset.lnLatex)).toEqual([inline, block]);
  });

  it('preserves adjacent formulas and following digits through Markdown conversion', () => {
    const html = `<p>${noteMathHtml('x')}${noteMathHtml('y')}2</p>`;
    expect(formulas(String(marked.parse(noteHtmlToMarkdown(html)))).map((node) => node.dataset.lnLatex)).toEqual([
      'x',
      'y',
    ]);
  });

  it('does not interpret currency, escaped delimiters, code, or unterminated input as formulas', () => {
    const source = String.raw`价格 $20 和 $30，\$x$，` + '`$x$`\n\n```latex\n$x$\n$$\ny\n$$\n```\n\n$unfinished';
    expect(formulas(String(marked.parse(source)))).toHaveLength(0);
  });

  it('preserves source with dollar signs or line breaks using controlled HTML', () => {
    for (const value of [String.raw`\text{cost \$5}`, 'a\nb', 'a<b & c>d', ' x ', '|x|', 'a`b']) {
      const html = noteMathHtml(value, 'inline');
      expect(formulas(String(marked.parse(noteMathMarkdown(value))))[0]?.dataset.lnLatex).toBe(value);
      expect(formulas(String(marked.parse(noteHtmlToMarkdown(html))))[0]?.dataset.lnLatex).toBe(value);
      const preview = formulas(renderMarkdownScrollMap(noteMathMarkdown(value), marked, () => {}))[0];
      expect(preview.dataset.lnMathFrom).toBe('0');
      expect(Number(preview.dataset.lnMathTo)).toBe(noteMathMarkdown(value).length);
    }
  });

  it.each(['html', 'markdown'])(
    'renders %s in shared read-only previews without interactive controls',
    async (type) => {
      const source = type === 'html' ? noteMathHtml('x^2') : '$x^2$';
      const html = await noteContentToHtml(source, type);
      expect(html).toContain('katex');
      expect(html).not.toContain('role="button"');
      expect(html).not.toContain('contenteditable');
    },
  );

  it('keeps malformed input visible and blocks trusted HTML/URL commands', async () => {
    const bad = String.raw`\frac{`;
    expect(renderNoteMathSource(bad).error).toBe(true);
    const html = await renderNoteMathHtml(noteMathHtml(bad));
    expect(formulas(html)[0].textContent).toBe(bad);
    expect(renderNoteMathSource(String.raw`\href{javascript:alert(1)}{x}`).html).not.toContain('href=');
    expect(renderNoteMathSource(String.raw`\htmlStyle{position:fixed}{x}`).html).not.toMatch(
      /style="[^"]*position:fixed/u,
    );
    expect(renderNoteMathSource(String.raw`\def\a{\a}\a`).error).toBe(true);
  });

  it('maps repeated formulas to their own source ranges and skips identical text inside code', async () => {
    const source = '`$x$` and $x$ and **$x$**\n\n- $x$\n\n$$\ny^2\n$$\n';
    const html = renderMarkdownScrollMap(source, marked, () => {});
    const nodes = formulas(await renderNoteMathHtml(html, 'Edit formula'));
    expect(nodes).toHaveLength(4);
    const ranges = nodes.map((n) => [Number(n.dataset.lnMathFrom), Number(n.dataset.lnMathTo)]);
    expect(ranges.map(([from, to]) => source.slice(from, to))).toEqual(['$x$', '$x$', '$x$', '$$\ny^2\n$$\n']);
    expect(new Set(ranges.map((r) => r[0])).size).toBe(4);
    expect(ranges[0][0]).toBeGreaterThan(source.indexOf('and'));
    expect(serializeNoteMath(html)).not.toContain('data-ln-math-from');
  });
  it('does not trust source offsets supplied in raw Markdown HTML', () => {
    const source =
      '<span data-ln-math="&#105;nline" data-ln-latex="x" data-ln-math-from="0" data-ln-math-to="1">x</span>';
    const node = formulas(renderMarkdownScrollMap(source, marked, () => {}))[0];
    expect(node.hasAttribute('data-ln-math-from')).toBe(false);
    expect(node.hasAttribute('data-ln-math-to')).toBe(false);
  });

  it('locates formulas inside tables and multiline quotes without stealing code occurrences', () => {
    const source = '> code `$x$`\n> next $x$\n\n| One | Two |\n| --- | --- |\n| `$x$` | $x$ |\n\n- item\n  next $x$';
    const nodes = formulas(renderMarkdownScrollMap(source, marked, () => {}));
    expect(nodes).toHaveLength(3);
    for (const node of nodes) {
      expect(source.slice(Number(node.dataset.lnMathFrom), Number(node.dataset.lnMathTo))).toBe('$x$');
    }
    expect(new Set(nodes.map((n) => n.dataset.lnMathFrom)).size).toBe(3);
  });
});

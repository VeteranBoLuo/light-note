import { describe, expect, it } from 'vitest';
import { noteMathHtml, NOTE_MATH_MAX_LENGTH } from '@lightnote/shared/note-math';
import { renderNoteMathSource } from '@lightnote/shared/note-math-renderer';
import { noteMathExportStyles } from '@lightnote/shared/note-math-export-node';
import { sanitizeNoteHtml, sanitizePersistedNoteContent } from './noteHtmlSanitizer.js';

describe('persisted note math', () => {
  it('keeps source across save, restore, public read and repeated sanitization', () => {
    const source = String.raw`\begin{bmatrix}a&b\\c&d\end{bmatrix}`;
    const html = noteMathHtml(source, 'block');
    expect(sanitizePersistedNoteContent(html, 'html')).toBe(html);
    expect(sanitizeNoteHtml(sanitizeNoteHtml(html).html).html).toBe(html);
    expect(sanitizePersistedNoteContent(`$$\n${source}\n$$`, 'markdown')).toBe(`$$\n${source}\n$$`);
  });
  it('never persists generated renderer markup or supplied scripts inside a formula', () => {
    const clean = noteMathHtml('x^2');
    const decorated = clean.replace('>x^2<', `>${renderNoteMathSource('x^2').html}<`);
    expect(sanitizeNoteHtml(decorated).html).toBe(clean);
    const hostile = clean.replace('>x^2<', '><img src="x" onerror="alert(1)"><script>bad()</script><');
    expect(sanitizeNoteHtml(hostile).html).toBe(clean);
  });
  it('rejects invalid modes and oversized source without enabling active markup', () => {
    const html = `<span data-ln-math="unknown" data-ln-latex="x">x</span><span data-ln-math="inline" data-ln-latex="${'x'.repeat(NOTE_MATH_MAX_LENGTH + 1)}">fallback</span>`;
    const result = sanitizeNoteHtml(html).html;
    expect(result).not.toContain('data-ln-math');
    expect(result).toContain('fallback');
  });
  it('embeds real WOFF2 fonts for offline HTML exports', async () => {
    const css = await noteMathExportStyles();
    expect(css).toContain('data:font/woff2;base64,');
    expect(css).not.toMatch(/url\([^)]*\.(?:woff2?|ttf)/u);
    expect(css).toContain('.ln-math');
  });
});

import { describe, expect, it } from 'vitest';
import { Marked, marked } from 'marked';
import DOMPurify from 'dompurify';
import { highlightNoteCodeBlocks } from './noteCodeHighlight';
import { highlightCode } from './noteCodeHighlightRuntime';
import { MAX_CODE_HIGHLIGHT_LENGTH } from '@/config/codeLanguages';
import { CODE_LANGUAGES } from '@/config/codeLanguages';

function root(html: string) {
  const element = document.createElement('article');
  element.innerHTML = DOMPurify.sanitize(html);
  return element;
}
describe('note code highlighting', () => {
  it('renders Markdown and saved rich-text code, preserving original text and attributes', async () => {
    const text = 'const value = "<script>alert(1)</script>"; // 中文 & < >';
    const md = root(new Marked().parse('```js\n' + text + '\n```') as string);
    const rich = root(
      `<pre class="language-javascript" style="text-align:left"><span>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</span></pre>`,
    );
    for (const el of [md, rich]) {
      const before = el.textContent;
      await highlightNoteCodeBlocks(el);
      expect(el.textContent).toBe(before);
      expect(el.querySelector('.hljs-keyword')?.textContent).toBe('const');
      expect(el.querySelector('script')).toBeNull();
      expect(el.querySelector('pre')?.dataset.lnCodeLanguage).toBe('JavaScript');
      const once = el.innerHTML;
      await highlightNoteCodeBlocks(el);
      expect(el.innerHTML).toBe(once);
    }
    expect(rich.querySelector('pre')?.style.textAlign).toBe('left');
  });
  it('supports every offered language; explicit plain text, unknown and long code stay plain', async () => {
    const samples: Record<string, string> = {
      javascript: 'const value = 42;',
      typescript: 'const value: number = 42;',
      html: '<div>hello</div>',
      css: '.item { color: red; }',
      json: '{"value": 42}',
      bash: 'echo "$HOME"',
      python: 'def demo(): pass',
      java: 'public class Demo {}',
      go: 'func main() {}',
      rust: 'fn main() {}',
      cpp: 'int main() {}',
      sql: 'SELECT id FROM notes;',
    };
    for (const language of CODE_LANGUAGES.filter((item) => item.value !== 'plaintext')) {
      expect(highlightCode(samples[language.value], language.value), language.value).toContain('hljs-');
    }
    for (const language of ['plaintext', 'made-up', 'constructor', '__proto__']) {
      expect(highlightCode('<unsafe> &', language)).toBe('&lt;unsafe&gt; &amp;');
      const el = root(`<pre><code class="language-${language}">value = 42</code></pre>`);
      await highlightNoteCodeBlocks(el);
      expect(el.querySelector('.hljs')).toBeNull();
    }
    const el = root(
      `<pre><code class="language-js">${'const a = 1;\n'.repeat(MAX_CODE_HIGHLIGHT_LENGTH)}</code></pre>`,
    );
    const before = el.textContent;
    await highlightNoteCodeBlocks(el);
    expect(el.querySelector('.hljs')).toBeNull();
    expect(el.textContent).toBe(before);
  });
  it('leaves Mermaid untouched and respects per-document work limit', async () => {
    const mermaid = '<pre><code class="language-mermaid">flowchart TD\nA--&gt;B</code></pre>';
    const el = root(mermaid);
    const before = el.innerHTML;
    await highlightNoteCodeBlocks(el);
    expect(el.innerHTML).toBe(before);
    const many = root(
      Array.from(
        { length: 8 },
        () => `<pre><code class="language-js">${'const a = 1;\n'.repeat(700)}</code></pre>`,
      ).join(''),
    );
    await highlightNoteCodeBlocks(many);
    expect(many.querySelectorAll('.hljs').length).toBe(4);
    expect(many.querySelectorAll('pre').length).toBe(8);
  });
  it('cancels when the owning preview changes during lazy loading', async () => {
    const el = root('<pre><code class="language-js">const a = 1;</code></pre>');
    let current = true;
    const pending = highlightNoteCodeBlocks(el, () => current);
    current = false;
    await pending;
    expect(el.querySelector('.hljs')).toBeNull();
  });
  it('AI rendering never installs highlighting into the global Markdown parser', async () => {
    const source = '```js\nconst value = 42;\n```';
    const before = marked.parse(source);
    const { renderAssistantMarkdown } = await import('./aiMessageRender');
    expect(renderAssistantMarkdown(source)).toContain('hljs-keyword');
    expect(marked.parse(source)).toBe(before);
    const { noteContentToHtml } = await import('./common');
    expect(await noteContentToHtml(source, 'markdown')).not.toContain('hljs-keyword');
  });
});

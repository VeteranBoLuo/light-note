import { bundleNoteMathCss } from '@lightnote/shared/note-math';
import { loadNoteMathRuntime, renderNoteMathHtml, serializeNoteMath } from './noteMath';

const fonts = import.meta.glob('/node_modules/katex/dist/fonts/*.woff2', { query: '?url', import: 'default' });
let styles: Promise<string> | null = null;
async function exportStyles() {
  if (!styles)
    styles = (async () => {
      const { default: css } = await import('katex/dist/katex.min.css?raw');
      return bundleNoteMathCss(css, async (name) => {
        const loader = fonts[`/node_modules/katex/dist/fonts/${name}`];
        if (!loader) throw new Error('NOTE_MATH_FONT_MISSING');
        const response = await fetch(String(await loader()));
        if (!response.ok) throw new Error('NOTE_MATH_FONT_UNAVAILABLE');
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('NOTE_MATH_FONT_UNAVAILABLE'));
          reader.readAsDataURL(blob);
        });
      });
    })().catch((error) => {
      styles = null;
      throw error;
    });
  return styles;
}

export async function inlineNoteMathForExport(html: string) {
  if (!html.includes('data-ln-math')) return html;
  await loadNoteMathRuntime();
  const [rendered, css] = await Promise.all([renderNoteMathHtml(serializeNoteMath(html)), exportStyles()]);
  return `<style data-ln-math-export>${css}</style>${rendered}`;
}

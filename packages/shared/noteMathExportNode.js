import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { bundleNoteMathCss } from './noteMath.js';

let styles;
export function noteMathExportStyles() {
  if (!styles)
    styles = (async () => {
      const cssUrl = new URL(
        './katex.min.css',
        pathToFileURL(createRequire(import.meta.url).resolve('katex')),
      );
      return bundleNoteMathCss(await readFile(cssUrl, 'utf8'), async (name) => {
        const bytes = await readFile(new URL(`./fonts/${name}`, cssUrl));
        return `data:font/woff2;base64,${bytes.toString('base64')}`;
      });
    })().catch((error) => {
      styles = undefined;
      throw error;
    });
  return styles;
}

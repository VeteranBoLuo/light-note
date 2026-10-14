import { expect, it } from 'vitest';
import { buildOcrPages } from './ocrPages.js';
it('uses parser page identities, retains missing page gaps, and never infers pages from retrieval chunks', () => {
  const source = { id: 'f1', file_name: 'scan.pdf' };
  const result = {
    segments: [
      { locator: { type: 'page', value: '第 1 页' }, text: 'first' },
      { locator: { type: 'page', value: '第 3 页' }, text: 'third' },
      { locator: { type: 'paragraph', value: '第 4 段' }, text: 'not a page' },
    ],
  };
  expect(buildOcrPages([{ source, result }])[0].pages.map((page) => page.number)).toEqual([1, 3]);
  expect(buildOcrPages([{ source, result: { chunks: [{ content: 'old chunks' }] } }])[0].pages).toEqual([]);
});

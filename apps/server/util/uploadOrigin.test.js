import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../db/index.js', () => ({ default: {} }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it('extracts local note image URLs without accepting a different host or port', async () => {
  vi.stubEnv('LIGHTNOTE_LOCAL_TEST', '1');
  const { extractNoteImageUrls } = await import('./noteImages.js');
  expect(extractNoteImageUrls('<img src="http://localhost:15173/uploads/a.png"><img src="http://localhost:15174/uploads/b.png"><img src="http://localhost:15173.evil.test/uploads/c.png">')).toEqual(['http://localhost:15173/uploads/a.png']);
});
it('keeps production URL extraction compatible with HTTP, HTTPS and duplicate references', async () => {
  vi.stubEnv('LIGHTNOTE_LOCAL_TEST', undefined);
  const { extractNoteImageUrls } = await import('./noteImages.js');
  expect(extractNoteImageUrls('https://boluo66.top/uploads/a.png http://boluo66.top/uploads/b.jpg https://boluo66.top/uploads/a.png')).toEqual(['https://boluo66.top/uploads/a.png', 'http://boluo66.top/uploads/b.jpg']);
});

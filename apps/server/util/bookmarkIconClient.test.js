import { describe, expect, it } from 'vitest';
import { buildFaviconApiUrl, normalizeOrigin } from './bookmarkIconClient.js';

describe('bookmarkIconClient URL construction', () => {
  it('uses the configured base path for favicon and health requests', () => {
    expect(
      buildFaviconApiUrl('', 'http://127.0.0.1:3456/custom/', {
        url: 'https://example.com/path',
        preview: '1',
      }).toString(),
    ).toBe(
      'http://127.0.0.1:3456/custom/?url=https%3A%2F%2Fexample.com%2Fpath&preview=1',
    );
    expect(
      buildFaviconApiUrl('health', 'http://127.0.0.1:3480/favimg/').toString(),
    ).toBe('http://127.0.0.1:3480/favimg/health');
  });

  it('normalizes uppercase schemes and bare domains', () => {
    expect(normalizeOrigin('  HTTPS://Example.com/path  ')).toBe('https://example.com');
    expect(normalizeOrigin('example.com/path')).toBe('https://example.com');
    expect(normalizeOrigin('')).toBeNull();
  });
});

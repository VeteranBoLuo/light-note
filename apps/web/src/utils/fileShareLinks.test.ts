import { beforeEach, describe, expect, it } from 'vitest';
import { rememberFileShareToken, readFileShareToken, forgetFileShareToken, buildFileShareUrl } from './fileShareLinks';

beforeEach(() => sessionStorage.clear());

describe('file share owner links', () => {
  it('retains a known link only for a matching record and token hint', () => {
    rememberFileShareToken('share-1', 'secret-token', 'et-token');
    expect(readFileShareToken('share-1', 'et-token')).toBe('secret-token');
    expect(readFileShareToken('share-1', 'new-hint')).toBe('');
    expect(readFileShareToken('share-2', 'et-token')).toBe('');
    forgetFileShareToken('share-1');
    expect(readFileShareToken('share-1', 'et-token')).toBe('');
  });
  it('bounds retained links and keeps the latest record', () => {
    for (let i = 0; i < 35; i++) rememberFileShareToken(String(i), `token-${i}`, 'hint');
    expect(readFileShareToken('0', 'hint')).toBe('');
    expect(readFileShareToken('34', 'hint')).toBe('token-34');
  });
  it('builds the public route with an encoded token', () => {
    expect(buildFileShareUrl('a/b')).toBe(`${location.origin}/share/a%2Fb`);
  });
});

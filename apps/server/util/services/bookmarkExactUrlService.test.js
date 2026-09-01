import { describe, expect, it } from 'vitest';
import {
  bookmarkExactUrlHashHex,
  createBookmarkExactUrlHash,
  normalizeBookmarkGroupKey,
} from './bookmarkExactUrlService.js';

describe('bookmarkExactUrlService', () => {
  it('只按持久化 URL 的 UTF-8 字节计算精确哈希', () => {
    const first = createBookmarkExactUrlHash('https://example.com/Path');
    const second = createBookmarkExactUrlHash('https://example.com/Path');

    expect(Buffer.isBuffer(first)).toBe(true);
    expect(first).toHaveLength(32);
    expect(first?.equals(second)).toBe(true);
    expect(bookmarkExactUrlHashHex('https://example.com/Path')).toHaveLength(64);
    expect(bookmarkExactUrlHashHex('https://example.com/Path')).not.toBe(
      bookmarkExactUrlHashHex('https://example.com/path'),
    );
    expect(bookmarkExactUrlHashHex('https://example.com')).not.toBe(
      bookmarkExactUrlHashHex('https://example.com/'),
    );
  });

  it('不偷偷做 Unicode 归一化，空值不产生分组事实', () => {
    expect(bookmarkExactUrlHashHex('https://example.com/caf\u00e9')).not.toBe(
      bookmarkExactUrlHashHex('https://example.com/cafe\u0301'),
    );
    expect(createBookmarkExactUrlHash('')).toBeNull();
    expect(bookmarkExactUrlHashHex(null)).toBe('');
  });

  it('只接受完整的 64 位十六进制分组键', () => {
    const key = 'AB'.repeat(32);
    expect(normalizeBookmarkGroupKey(key)).toBe(key.toLowerCase());
    expect(normalizeBookmarkGroupKey('abc')).toBe('');
    expect(normalizeBookmarkGroupKey('z'.repeat(64))).toBe('');
  });
});

import crypto from 'node:crypto';

/**
 * 相同网址治理只比较当前持久化 URL 的 UTF-8 字节，不做二次规范化。
 * 调用方应在 URL 已通过 bookmarkUrl 的权威校验后使用本函数。
 */
export function createBookmarkExactUrlHash(url) {
  const value = String(url ?? '');
  if (!value) return null;
  return crypto.createHash('sha256').update(Buffer.from(value, 'utf8')).digest();
}

export function bookmarkExactUrlHashHex(url) {
  return createBookmarkExactUrlHash(url)?.toString('hex') || '';
}

export function normalizeBookmarkGroupKey(value) {
  const groupKey = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(groupKey) ? groupKey : '';
}

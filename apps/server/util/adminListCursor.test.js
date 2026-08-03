import { describe, expect, it } from 'vitest';
import {
  adminCursorScope,
  adminCursorTime,
  decodeAdminListCursor,
  encodeAdminListCursor,
  isAdminCursorRequest,
  normalizeAdminListLimit,
} from './adminListCursor.js';

describe('adminListCursor', () => {
  it('round trips a scoped keyset cursor', () => {
    const scope = adminCursorScope('api-logs', ['hello', true]);
    const cursor = encodeAdminListCursor(scope, { value: '2026-08-03 10:00:00', id: 'log-1' });
    expect(decodeAdminListCursor(cursor, scope)).toEqual({ value: '2026-08-03 10:00:00', id: 'log-1' });
  });

  it('rejects a cursor reused with different filters', () => {
    const cursor = encodeAdminListCursor(adminCursorScope('api-logs', ['a']), { value: '2026-08-03', id: '1' });
    expect(() => decodeAdminListCursor(cursor, adminCursorScope('api-logs', ['b']))).toThrow('查询游标无效');
  });

  it('normalizes limits and distinguishes legacy paging', () => {
    expect(normalizeAdminListLimit(0)).toBe(1);
    expect(normalizeAdminListLimit(999)).toBe(100);
    expect(normalizeAdminListLimit('bad', 40)).toBe(40);
    expect(isAdminCursorRequest({ currentPage: 1, pageSize: 20 })).toBe(false);
    expect(isAdminCursorRequest({ cursor: null, limit: 50 })).toBe(true);
    expect(adminCursorTime('2026-08-03T10:00:00.000Z')).toBe(1785751200000);
  });
});

import { describe, expect, it } from 'vitest';
import { buildPagedResult, normalizeOptionalPagination } from './pagination.js';

describe('resource pagination helpers', () => {
  it('keeps legacy calls unpaged when pageSize is absent or -1', () => {
    expect(normalizeOptionalPagination({}).enabled).toBe(false);
    expect(normalizeOptionalPagination({ pageSize: -1 }).enabled).toBe(false);
  });

  it('normalizes page aliases, offsets and the maximum page size', () => {
    expect(normalizeOptionalPagination({ currentPage: 3, pageSize: 24 })).toEqual({
      enabled: true,
      page: 3,
      pageSize: 24,
      offset: 48,
    });
    expect(normalizeOptionalPagination({ page: 2, pageSize: 999 }, { maxPageSize: 80 })).toEqual({
      enabled: true,
      page: 2,
      pageSize: 80,
      offset: 80,
    });
  });

  it('reports whether another page exists from the filtered total', () => {
    expect(buildPagedResult([{ id: 1 }], 49, { page: 1, pageSize: 48 }).hasMore).toBe(true);
    expect(buildPagedResult([{ id: 49 }], 49, { page: 2, pageSize: 48 })).toMatchObject({
      total: 49,
      page: 2,
      pageSize: 48,
      hasMore: false,
    });
  });
});

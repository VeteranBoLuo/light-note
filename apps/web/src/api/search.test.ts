import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiBasePost: vi.fn(),
}));

vi.mock('@/http/request.ts', () => ({
  apiBasePost: mocks.apiBasePost,
}));

vi.mock('@/i18n', () => ({
  default: {
    global: {
      locale: { value: 'zh-CN' },
    },
  },
}));

import { clearGlobalSearchCache, fetchGlobalSearch } from './search.ts';

describe('fetchGlobalSearch cache policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGlobalSearchCache();
  });

  it('同页重复查询可以复用缓存，重新进入资源中心时可强制获取最新资源', async () => {
    mocks.apiBasePost
      .mockResolvedValueOnce({
        status: 200,
        data: {
          items: [{ id: 'bookmark-old', type: 'bookmark', title: '旧书签' }],
          total: 1,
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          items: [{ id: 'bookmark-new', type: 'bookmark', title: '新书签' }],
          total: 1,
        },
      });

    const first = await fetchGlobalSearch('', 0);
    const cached = await fetchGlobalSearch('', 0);
    const refreshed = await fetchGlobalSearch('', 0, true);

    expect(mocks.apiBasePost).toHaveBeenCalledTimes(2);
    expect(first.items[0]?.id).toBe('bookmark-old');
    expect(cached.items[0]?.id).toBe('bookmark-old');
    expect(refreshed.items[0]?.id).toBe('bookmark-new');
  });

  it('分页和筛选条件会进入请求与缓存键，不会复用其他页结果', async () => {
    mocks.apiBasePost
      .mockResolvedValueOnce({
        status: 200,
        data: { items: [{ id: 'page-1', type: 'note', title: '第一页' }], page: 1, hasMore: true },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: { items: [{ id: 'page-2', type: 'note', title: '第二页' }], page: 2, hasMore: false },
      });

    const query = {
      type: 'note' as const,
      sort: 'updated' as const,
      date: '30d' as const,
      tags: ['工作'],
      untagged: false,
    };
    const first = await fetchGlobalSearch('项目', 12, false, { ...query, page: 1 });
    const second = await fetchGlobalSearch('项目', 12, false, { ...query, page: 2 });

    expect(first.items[0]?.id).toBe('page-1');
    expect(second.items[0]?.id).toBe('page-2');
    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(2, '/api/search/global', {
      keyword: '项目',
      limitPerType: 12,
      page: 2,
      type: 'note',
      sort: 'updated',
      date: '30d',
      tags: ['工作'],
      untagged: false,
    });
  });

  it('有序分页按游标请求 40 条，追加批次不会重复请求统计元数据', async () => {
    mocks.apiBasePost
      .mockResolvedValueOnce({
        status: 200,
        data: {
          items: Array.from({ length: 40 }, (_, index) => ({
            id: `bookmark-${index + 1}`,
            type: 'bookmark',
            title: `书签 ${index + 1}`,
          })),
          total: 60,
          typeTotals: { bookmark: 40, note: 20, file: 0, tag: 0 },
          tagOptions: ['工作'],
          pageSize: 40,
          hasMore: true,
          nextCursor: { type: 'note', offset: 0 },
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          items: Array.from({ length: 20 }, (_, index) => ({
            id: `note-${index + 1}`,
            type: 'note',
            title: `笔记 ${index + 1}`,
          })),
          pageSize: 40,
          hasMore: false,
          nextCursor: null,
        },
      });

    const initial = await fetchGlobalSearch('', 40, true, {
      type: 'all',
      paginationMode: 'ordered',
      cursor: null,
      includeMetadata: true,
    });
    const appended = await fetchGlobalSearch('', 40, false, {
      type: 'all',
      paginationMode: 'ordered',
      cursor: initial.nextCursor,
      includeMetadata: false,
    });

    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(1, '/api/search/global', {
      keyword: '',
      pageSize: 40,
      type: 'all',
      sort: 'relevance',
      date: 'all',
      tags: [],
      untagged: false,
      paginationMode: 'ordered',
      cursor: null,
      includeMetadata: true,
    });
    expect(mocks.apiBasePost).toHaveBeenNthCalledWith(2, '/api/search/global', {
      keyword: '',
      pageSize: 40,
      type: 'all',
      sort: 'relevance',
      date: 'all',
      tags: [],
      untagged: false,
      paginationMode: 'ordered',
      cursor: { type: 'note', offset: 0 },
      includeMetadata: false,
    });
    expect(initial.nextCursor).toEqual({ type: 'note', offset: 0 });
    expect(initial.typeTotals).toEqual({ bookmark: 40, note: 20, file: 0, tag: 0 });
    expect(appended.items).toHaveLength(20);
    expect(appended.nextCursor).toBeNull();
    expect(appended.typeTotals).toBeUndefined();
    expect(appended.tagOptions).toBeUndefined();
  });
});

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

import { clearGlobalSearchCache, fetchGlobalSearch, fetchGlobalSearchSuggestions } from './search.ts';

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
    expect(initial.typeTotals).toEqual({ bookmark: 40, note: 20, file: 0, tag: 0, todo: 0 });
    expect(appended.items).toHaveLength(20);
    expect(appended.nextCursor).toBeNull();
    expect(appended.typeTotals).toBeUndefined();
    expect(appended.tagOptions).toBeUndefined();
  });

  it('默认调用不请求待办，避免资源选择器等既有调用方突然拿到行动对象', async () => {
    mocks.apiBasePost.mockResolvedValue({ status: 200, data: { items: [] } });
    await fetchGlobalSearch('备案', 10);
    const body = mocks.apiBasePost.mock.calls[0]?.[1];
    expect(body.types).toBeUndefined();
    expect(body.todoStatus).toBeUndefined();
  });

  it('只有显式声明 todo 时才下发待办筛选条件', async () => {
    mocks.apiBasePost.mockResolvedValue({ status: 200, data: { items: [] } });
    await fetchGlobalSearch('备案', 10, false, {
      types: ['bookmark', 'todo'],
      todoStatus: 'pending',
      todoPriority: [2, 0],
      todoDue: 'overdue',
    });
    const body = mocks.apiBasePost.mock.calls[0]?.[1];
    expect(body.types).toEqual(['bookmark', 'todo']);
    expect(body.todoStatus).toBe('pending');
    expect(body.todoPriority).toEqual([0, 2]);
    expect(body.todoDue).toBe('overdue');
  });

  it('未选中待办时丢弃待办筛选条件，不污染缓存键', async () => {
    mocks.apiBasePost.mockResolvedValue({ status: 200, data: { items: [] } });
    await fetchGlobalSearch('备案', 10, false, { types: ['bookmark'], todoStatus: 'pending' });
    const body = mocks.apiBasePost.mock.calls[0]?.[1];
    expect(body.todoStatus).toBeUndefined();
  });
});

describe('fetchGlobalSearchSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGlobalSearchCache();
  });

  it('使用轻量 suggest 模式，默认覆盖含待办的全部类型', async () => {
    mocks.apiBasePost.mockResolvedValue({ status: 200, data: { items: [], hasMore: false } });
    await fetchGlobalSearchSuggestions('备案');

    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/search/global',
      {
        keyword: '备案',
        types: ['bookmark', 'file', 'note', 'tag', 'todo'],
        mode: 'suggest',
        includeMetadata: false,
      },
      expect.objectContaining({ silent: true }),
    );
  });

  it('空关键词直接返回空结果，不发请求', async () => {
    const res = await fetchGlobalSearchSuggestions('   ');
    expect(mocks.apiBasePost).not.toHaveBeenCalled();
    expect(res).toEqual({ keyword: '', items: [], hasMore: false });
  });

  it('同关键词短时间内复用缓存，清缓存后重新请求', async () => {
    mocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: { items: [{ id: 't1', type: 'todo', title: '提交备案' }], hasMore: true },
    });

    const first = await fetchGlobalSearchSuggestions('备案');
    const cached = await fetchGlobalSearchSuggestions('备案');
    expect(mocks.apiBasePost).toHaveBeenCalledTimes(1);
    expect(cached.items).toEqual(first.items);
    expect(cached.hasMore).toBe(true);

    clearGlobalSearchCache();
    await fetchGlobalSearchSuggestions('备案');
    expect(mocks.apiBasePost).toHaveBeenCalledTimes(2);
  });

  it('服务端失败时抛错，不把网络故障伪装成没有结果', async () => {
    mocks.apiBasePost.mockResolvedValue({ status: 500, msg: '统一搜索暂时不可用', requestId: 'req-1' });
    await expect(fetchGlobalSearchSuggestions('备案')).rejects.toThrow('统一搜索暂时不可用');
  });
});

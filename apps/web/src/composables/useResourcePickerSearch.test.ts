import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGlobalSearch } from '@/api/search';
import {
  resourceItemKey,
  resolveResourcePickerSort,
  takePerType,
  useResourcePickerSearch,
} from './useResourcePickerSearch';

vi.mock('@/api/search', () => ({
  fetchGlobalSearch: vi.fn(),
}));

const fetchGlobalSearchMock = vi.mocked(fetchGlobalSearch);

const item = (type: string, id: string) => ({ type, id, title: `${type}-${id}` });

describe('useResourcePickerSearch', () => {
  beforeEach(() => fetchGlobalSearchMock.mockReset());

  it('按书签→笔记→文件的固定顺序分组,不与其它类型混排', () => {
    // 搜索接口按类型分段返回,直接截断会只剩书签;这里要保证三类都露出
    const rows = [item('bookmark', 'b1'), item('bookmark', 'b2'), item('note', 'n1'), item('file', 'f1')];
    expect(takePerType(rows, { perType: 5 }).map((row) => row.id)).toEqual(['b1', 'b2', 'n1', 'f1']);
  });

  it('每类最多取 perType 条', () => {
    const rows = [
      item('bookmark', 'b1'),
      item('bookmark', 'b2'),
      item('bookmark', 'b3'),
      item('note', 'n1'),
      item('note', 'n2'),
    ];
    expect(takePerType(rows, { perType: 2 }).map((row) => row.id)).toEqual(['b1', 'b2', 'n1', 'n2']);
  });

  it('同类内部保持接口给的顺序(最新在前)', () => {
    const rows = [item('note', 'n1'), item('note', 'n2'), item('note', 'n3')];
    expect(takePerType(rows, { perType: 5 }).map((row) => row.id)).toEqual(['n1', 'n2', 'n3']);
  });

  it('空输入按最新更新时间浏览，输入关键词后按相关度搜索', () => {
    expect(resolveResourcePickerSort('')).toBe('updated');
    expect(resolveResourcePickerSort('   ')).toBe('updated');
    expect(resolveResourcePickerSort('开发文档')).toBe('relevance');
  });

  it('order 之外的类型追加在末尾,不丢结果', () => {
    const rows = [item('tag', 't1'), item('bookmark', 'b1')];
    expect(takePerType(rows, { perType: 5 }).map((row) => row.id)).toEqual(['b1', 't1']);
  });

  it('按 order 限定类型顺序', () => {
    const rows = [item('bookmark', 'b1'), item('note', 'n1'), item('file', 'f1')];
    expect(takePerType(rows, { perType: 5, order: ['file', 'note', 'bookmark'] }).map((row) => row.id)).toEqual([
      'f1',
      'n1',
      'b1',
    ]);
  });

  it('空输入返回空数组', () => {
    expect(takePerType([], { perType: 5 })).toEqual([]);
  });

  it('资源 key 由类型与 ID 组成', () => {
    expect(resourceItemKey({ type: 'note', id: '1' })).toBe('note:1');
  });

  it('单类型浏览使用 ordered 游标分页并追加后续结果', async () => {
    fetchGlobalSearchMock
      .mockResolvedValueOnce({
        keyword: '',
        items: [item('note', 'n1'), item('note', 'n2')],
        groups: [],
        total: 3,
        typeTotals: { note: 3 },
        hasMore: true,
        nextCursor: { type: 'note', offset: 2 },
      } as any)
      .mockResolvedValueOnce({
        keyword: '',
        items: [item('note', 'n3')],
        groups: [],
        total: 0,
        hasMore: false,
        nextCursor: null,
      } as any);

    const picker = useResourcePickerSearch({
      allowedTypes: ['note'],
      exhaustiveSingleType: true,
      singleTypePageSize: 2,
    });
    await picker.searchNow('');

    expect(fetchGlobalSearchMock).toHaveBeenNthCalledWith(
      1,
      '',
      2,
      true,
      expect.objectContaining({
        types: ['note'],
        paginationMode: 'ordered',
        cursor: null,
      }),
    );
    expect(picker.results.value.map((row) => row.id)).toEqual(['n1', 'n2']);
    expect(picker.total.value).toBe(3);
    expect(picker.hasMore.value).toBe(true);

    await picker.loadMore();

    expect(fetchGlobalSearchMock).toHaveBeenNthCalledWith(
      2,
      '',
      2,
      false,
      expect.objectContaining({
        types: ['note'],
        paginationMode: 'ordered',
        cursor: { type: 'note', offset: 2 },
        includeMetadata: false,
      }),
    );
    expect(picker.results.value.map((row) => row.id)).toEqual(['n1', 'n2', 'n3']);
    expect(picker.hasMore.value).toBe(false);
  });

  it('全部类型继续使用每类取样，不请求游标全量列表', async () => {
    fetchGlobalSearchMock.mockResolvedValueOnce({
      keyword: '',
      items: [
        ...Array.from({ length: 10 }, (_, index) => item('bookmark', `b${index}`)),
        ...Array.from({ length: 10 }, (_, index) => item('note', `n${index}`)),
        ...Array.from({ length: 10 }, (_, index) => item('file', `f${index}`)),
      ],
      groups: [],
      total: 30,
      hasMore: true,
      nextCursor: null,
    } as any);

    const picker = useResourcePickerSearch({
      allowedTypes: ['bookmark', 'note', 'file'],
      exhaustiveSingleType: true,
      limit: 8,
      perType: 8,
    });
    await picker.searchNow('');

    expect(fetchGlobalSearchMock).toHaveBeenCalledWith(
      '',
      8,
      true,
      expect.not.objectContaining({ paginationMode: 'ordered' }),
    );
    expect(picker.results.value).toHaveLength(24);
    expect(picker.hasMore.value).toBe(false);
  });

  it('区分首屏请求失败与真实空结果，并可由下一次搜索恢复', async () => {
    fetchGlobalSearchMock
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ keyword: '', items: [], groups: [], total: 0, hasMore: false, nextCursor: null } as any);
    const picker = useResourcePickerSearch();

    await picker.searchNow('开发文档');
    expect(picker.results.value).toEqual([]);
    expect(picker.searchFailed.value).toBe(true);

    await picker.searchNow('');
    expect(picker.results.value).toEqual([]);
    expect(picker.searchFailed.value).toBe(false);
  });
});

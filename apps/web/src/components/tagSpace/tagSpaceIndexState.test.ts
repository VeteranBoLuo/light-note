import { describe, expect, it } from 'vitest';
import { readTagSpaceHistoryState, readTagSpaceQuery, writeTagSpaceQuery } from './tagSpaceIndexState';

describe('标签空间列表状态', () => {
  it('从 URL 读取搜索、筛选和排序，异常值回退到低门槛默认值', () => {
    expect(readTagSpaceQuery({ q: '  产品  ', filter: 'note', sort: 'nameAsc' })).toEqual({
      keyword: '产品',
      filter: 'note',
      sort: 'nameAsc',
    });
    expect(readTagSpaceQuery({ filter: 'todo', sort: 'unknown' })).toEqual({
      keyword: '',
      filter: 'all',
      sort: 'recent',
    });
  });

  it('回写 URL 时保留无关查询项，并不把默认值变成噪声', () => {
    expect(
      writeTagSpaceQuery({ lang: 'zh-CN', mode: 'manage', q: 'old' }, { keyword: '', filter: 'all', sort: 'recent' }),
    ).toEqual({ lang: 'zh-CN' });
  });

  it('安全恢复已加载页数与滚动位置', () => {
    expect(readTagSpaceHistoryState({ tagSpaceIndex: { page: 3.8, scrollTop: 560 } })).toEqual({
      page: 3,
      scrollTop: 560,
    });
    expect(readTagSpaceHistoryState({ tagSpaceIndex: { page: -1, scrollTop: Number.NaN } })).toEqual({
      page: 1,
      scrollTop: 0,
    });
    expect(readTagSpaceHistoryState({ tagSpaceIndex: { page: 999, scrollTop: 1 } }).page).toBe(20);
  });
});

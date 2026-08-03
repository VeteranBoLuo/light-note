import { describe, expect, it } from 'vitest';
import { buildQueryRequestData } from '@/http/queryRequest.ts';

describe('buildQueryRequestData', () => {
  it('保留旧分页查询的默认参数', () => {
    expect(buildQueryRequestData({ filters: { key: '轻笺' } })).toEqual({
      pageSize: 10,
      currentPage: 1,
      level: 0,
      filters: { key: '轻笺' },
      order: {},
    });
  });

  it('保留虚拟列表需要的首屏游标、批量大小与后端排序', () => {
    expect(
      buildQueryRequestData({
        cursor: null,
        limit: 50,
        filters: { key: '' },
        sort: { field: 'lastActiveTime', order: 'desc' },
      }),
    ).toMatchObject({
      cursor: null,
      limit: 50,
      filters: { key: '' },
      sort: { field: 'lastActiveTime', order: 'desc' },
    });
  });

  it('保留后续页游标', () => {
    expect(buildQueryRequestData({ cursor: 'next-page', limit: 100 })).toMatchObject({
      cursor: 'next-page',
      limit: 100,
    });
  });
});

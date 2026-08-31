import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiBasePost: vi.fn() }));

vi.mock('@/http/request.ts', () => ({ apiBasePost: mocks.apiBasePost }));

const { fetchTagSpace, fetchTagSpaceResources, fetchTagSpaces } = await import('./tagSpace');

describe('tagSpace api', () => {
  beforeEach(() => vi.clearAllMocks());

  it('首页只向摘要接口下发分页、筛选、排序和空标签包含条件', async () => {
    mocks.apiBasePost.mockResolvedValue({ status: 200, data: { items: [], total: 0 } });
    await fetchTagSpaces({
      keyword: '产品',
      filter: 'note',
      sort: 'recent',
      includeEmpty: true,
      page: 2,
      pageSize: 24,
    });
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/bookmark/queryTagSpaces',
      { keyword: '产品', filter: 'note', sort: 'recent', includeEmpty: true, page: 2, pageSize: 24 },
      { silent: true, feedback: false },
    );
  });

  it('详情使用精确标签 ID，并把非成功响应转成异常', async () => {
    mocks.apiBasePost.mockResolvedValueOnce({ status: 200, data: { tag: { id: 'tag-1' }, relatedTags: [] } });
    await expect(fetchTagSpace('tag-1')).resolves.toMatchObject({ tag: { id: 'tag-1' } });
    expect(mocks.apiBasePost).toHaveBeenLastCalledWith(
      '/api/bookmark/getTagSpace',
      { id: 'tag-1', relatedLimit: 8 },
      { silent: true, feedback: false },
    );

    mocks.apiBasePost.mockResolvedValueOnce({ status: 404, msg: '标签不存在' });
    await expect(fetchTagSpace('missing')).rejects.toThrow('标签不存在');
  });

  it('空间内容使用独立的跨类型排序和页码', async () => {
    mocks.apiBasePost.mockResolvedValueOnce({ status: 200, data: { items: [], total: 0, page: 2 } });
    await fetchTagSpaceResources({
      id: 'tag-1',
      keyword: '方案',
      type: 'file',
      sort: 'added',
      page: 2,
      pageSize: 20,
    });
    expect(mocks.apiBasePost).toHaveBeenLastCalledWith(
      '/api/bookmark/queryTagSpaceResources',
      { id: 'tag-1', keyword: '方案', type: 'file', sort: 'added', page: 2, pageSize: 20 },
      { silent: true, feedback: false },
    );
  });
});

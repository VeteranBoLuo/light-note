import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const searchPersonalKnowledge = vi.fn();

vi.mock('../../../db/index.js', () => ({ default: { query: poolQuery } }));
vi.mock('../../personalKnowledgeSearch.js', () => ({ searchPersonalKnowledge }));

const { default: tool } = await import('./query_bookmarks.js');

const ctx = { userId: 'user-1', userRole: 'user' };

function mockMainQuery({ rows = [], total = 0 } = {}) {
  poolQuery.mockResolvedValueOnce([rows]).mockResolvedValueOnce([[{ total }]]);
}

describe('query_bookmarks 工具', () => {
  beforeEach(() => vi.clearAllMocks());

  it('有关键词时按相关度排序，通配符按字面转义', async () => {
    mockMainQuery({ rows: [{ id: 'b1', name: '50%折扣站', url: 'https://x.dev', create_time: null }], total: 1 });

    const result = await tool.execute({ keyword: '50%折扣站' }, ctx);

    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toContain('ORDER BY CASE');
    expect(params).toContain('%50\\%折扣站%');
    expect(params).toContain('50%折扣站'); // 精确档用原词
    expect(result.matchMode).toBe('like');
    expect(searchPersonalKnowledge).not.toHaveBeenCalled();
  });

  it('无关键词时保持时间排序，零结果不触发降级', async () => {
    mockMainQuery({ rows: [], total: 0 });

    await tool.execute({ tag: '工具' }, ctx);

    const [sql] = poolQuery.mock.calls[0];
    expect(sql).not.toContain('ORDER BY CASE');
    expect(sql).toContain('ORDER BY b.create_time DESC');
    expect(searchPersonalKnowledge).not.toHaveBeenCalled();
  });

  it('LIKE 零结果时降级语义索引，二次查询保留归属与 tag/时间条件', async () => {
    mockMainQuery({ rows: [], total: 0 });
    searchPersonalKnowledge.mockResolvedValue({
      hits: [
        { type: 'bookmark', id: 'b2' },
        { type: 'note', id: 'n1' }, // 非书签命中被过滤
        { type: 'bookmark', id: 'b1' },
      ],
    });
    poolQuery.mockResolvedValueOnce([
      [
        { id: 'b1', name: '甲', url: 'https://a.dev', create_time: null },
        { id: 'b2', name: '乙', url: 'https://b.dev', create_time: null },
      ],
    ]);

    const result = await tool.execute({ keyword: '我之前收藏过一个画图的网站', tag: '工具', timeRange: '今年' }, ctx);

    expect(searchPersonalKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', scope: { types: ['bookmark'] } }),
    );
    const [sql, params] = poolQuery.mock.calls[2];
    expect(sql).toContain('b.id IN (?)');
    expect(sql).toContain('b.user_id = ?');
    expect(sql).toContain('resource_tag_relations'); // tag 条件保留
    expect(sql).toContain('b.create_time >= ?'); // 时间条件保留
    expect(params[0]).toEqual(['b2', 'b1']);
    // 顺序跟随索引相关度
    expect(result.items.map((item) => item.id)).toEqual(['b2', 'b1']);
    expect(result.matchMode).toBe('semantic');
  });

  it('降级自身失败时 fail-open 回到空结果', async () => {
    mockMainQuery({ rows: [], total: 0 });
    searchPersonalKnowledge.mockRejectedValue(new Error('INDEX_DOWN'));

    const result = await tool.execute({ keyword: '任意词' }, ctx);

    expect(result).toEqual({ total: 0, items: [], matchMode: 'like' });
  });

  it('降级结果的文案不冒充精确计数', () => {
    const semantic = tool.transform(
      { matchMode: 'semantic', total: 1, items: [{ id: 'b1', name: '画图站', url: 'https://d.dev', create_time: null }] },
      { keyword: '画图的网站' },
    );
    expect(semantic).toContain('没有精确匹配');
    expect(semantic).not.toContain('共 1 条书签');
    expect(tool.summarize({ matchMode: 'semantic', total: 1 }, { keyword: 'x' })).toContain('语义匹配');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const searchPersonalKnowledge = vi.fn();

vi.mock('../../../db/index.js', () => ({ default: { query: poolQuery } }));
vi.mock('../../personalKnowledgeSearch.js', () => ({ searchPersonalKnowledge }));

const { default: tool } = await import('./query_notes.js');

const ctx = { userId: 'user-1', userRole: 'user' };

function mockMainQuery({ rows = [], total = 0 } = {}) {
  // execute 里 Promise.all 先行查询后计数
  poolQuery.mockResolvedValueOnce([rows]).mockResolvedValueOnce([[{ total }]]);
}

describe('query_notes 工具', () => {
  beforeEach(() => vi.clearAllMocks());

  it('有关键词时按相关度排序，通配符按字面转义', async () => {
    mockMainQuery({
      rows: [{ id: 'n1', title: '100%完成', content: '', type: 'markdown', create_time: null }],
      total: 1,
    });

    const result = await tool.execute({ keyword: '100%完成' }, ctx);

    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toContain('ORDER BY CASE');
    expect(sql).toContain('LOWER(n.title) = LOWER(?)');
    // where 里的 LIKE 模式必须转义 %（否则 "100%完成" 会通配成 "100任意字符完成"）
    expect(params).toContain('%100\\%完成%');
    // 排序参数：精确比较用原词，前缀/包含用转义模式
    expect(params).toContain('100%完成');
    expect(params).toContain('100\\%完成%');
    expect(result.matchMode).toBe('like');
    expect(searchPersonalKnowledge).not.toHaveBeenCalled();
  });

  it('无关键词时保持时间排序，不注入相关度参数', async () => {
    mockMainQuery({ rows: [], total: 0 });

    await tool.execute({}, ctx);

    const [sql] = poolQuery.mock.calls[0];
    expect(sql).not.toContain('ORDER BY CASE');
    expect(sql).toContain('ORDER BY n.create_time DESC');
    // 无关键词的零结果不触发语义降级
    expect(searchPersonalKnowledge).not.toHaveBeenCalled();
  });

  it('返回后端实际解析的时间范围，空结果文案明确自然日口径', async () => {
    mockMainQuery({ rows: [], total: 0 });

    const result = await tool.execute({ timeRange: '今天' }, ctx);
    const text = tool.transform(result, { timeRange: '今天' });

    expect(result.resolvedTimeRange).toMatchObject({
      expression: '今天',
      start: expect.stringMatching(/^\d{4}-\d{2}-\d{2} 00:00:00$/),
      end: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
    });
    expect(text).toMatch(/^今天（\d{4}-\d{2}-\d{2}，截至 \d{2}:\d{2} · Asia\/Shanghai）没有找到笔记$/);
    expect(tool.summarize(result, { timeRange: '今天' })).toContain('今天（');
  });

  it('手绘笔记只投影结构摘要和可验证文字，不读取完整 scene JSON', async () => {
    mockMainQuery({
      rows: [
        {
          id: 'drawing-1',
          title: '设计草图',
          content: '',
          type: 'drawing',
          drawing_element_count: 3,
          drawing_texts_json: '["首页布局","安全"]',
          create_time: null,
        },
      ],
      total: 1,
    });

    const result = await tool.execute({}, ctx);
    const [sql] = poolQuery.mock.calls[0];
    const text = tool.transform(result, {});

    expect(sql).toContain("JSON_LENGTH(n.content, '$.elements')");
    expect(sql).toContain("JSON_EXTRACT(n.content, '$.elements[*].text')");
    expect(sql).toContain("IF(n.type = 'drawing', ''");
    expect(text).toContain('[手绘笔记]');
    expect(text).toContain('画布包含 3 个绘制元素');
    expect(text).toContain('首页布局；安全');
  });

  it('LIKE 零结果时降级语义索引，按索引顺序返回并二次校验归属', async () => {
    mockMainQuery({ rows: [], total: 0 });
    searchPersonalKnowledge.mockResolvedValue({
      hits: [
        { type: 'note', id: 'n2' },
        { type: 'bookmark', id: 'b9' }, // 非笔记命中必须被过滤
        { type: 'note', id: 'n1' },
        { type: 'note', id: 'n2' }, // 重复 id 去重
      ],
    });
    // 二次查行：数据库返回顺序故意与索引顺序相反
    poolQuery.mockResolvedValueOnce([
      [
        { id: 'n1', title: '甲', content: '', type: 'markdown', create_time: null },
        { id: 'n2', title: '乙', content: '', type: 'markdown', create_time: null },
      ],
    ]);

    const result = await tool.execute({ keyword: '我记得有一篇讲开发计划的笔记' }, ctx);

    expect(searchPersonalKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', scope: { types: ['note'] } }),
    );
    const [sql, params] = poolQuery.mock.calls[2];
    expect(sql).toContain('n.id IN (?)');
    expect(sql).toContain('n.create_by = ?');
    expect(params[0]).toEqual(['n2', 'n1']);
    expect(params[1]).toBe('user-1');
    // 顺序跟随索引相关度（n2 在前），而不是数据库返回顺序
    expect(result.items.map((item) => item.id)).toEqual(['n2', 'n1']);
    expect(result.matchMode).toBe('semantic');
    expect(result.total).toBe(2);
  });

  it('降级保留 timeRange 条件，索引命中但超出时间范围的行被过滤', async () => {
    mockMainQuery({ rows: [], total: 0 });
    searchPersonalKnowledge.mockResolvedValue({ hits: [{ type: 'note', id: 'n1' }] });
    poolQuery.mockResolvedValueOnce([[]]); // 时间条件过滤后无行

    const result = await tool.execute({ keyword: '开发计划相关的笔记', timeRange: '最近7天' }, ctx);

    const [sql] = poolQuery.mock.calls[2];
    expect(sql).toContain('n.create_time >= ?');
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('降级自身失败时 fail-open 回到空结果，不升级成报错', async () => {
    mockMainQuery({ rows: [], total: 0 });
    searchPersonalKnowledge.mockRejectedValue(new Error('INDEX_DOWN'));

    const result = await tool.execute({ keyword: '任意词' }, ctx);

    expect(result).toMatchObject({
      total: 0,
      items: [],
      matchMode: 'like',
      resultMetadata: { total: 0, returned: 0, completeness: 'complete' },
    });
  });

  it('降级结果的文案不冒充精确计数', () => {
    const semantic = tool.transform(
      {
        matchMode: 'semantic',
        total: 1,
        items: [{ id: 'n1', title: '开发计划', content: '正文', type: 'markdown', create_time: null }],
      },
      { keyword: '我记得有一篇讲开发计划的' },
    );
    expect(semantic).toContain('没有精确匹配');
    expect(semantic).toContain('语义相关');
    expect(semantic).not.toContain('共 1 条');

    const like = tool.transform(
      {
        matchMode: 'like',
        total: 3,
        items: [{ id: 'n1', title: '开发计划', content: '正文', type: 'markdown', create_time: null }],
      },
      { keyword: '开发计划' },
    );
    expect(like).toContain('共 3 条');

    expect(tool.summarize({ matchMode: 'semantic', total: 1 }, { keyword: 'x' })).toContain('语义匹配');
  });
});

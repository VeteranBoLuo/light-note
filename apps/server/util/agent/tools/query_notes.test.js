import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAgentAnswerRequirements } from '../answerRequirements.js';
import { normalizeToolArguments } from '../toolArguments.js';
import { validateToolArgumentsAgainstSchema } from '../toolPolicy.js';

const poolQuery = vi.fn();
const searchPersonalKnowledge = vi.fn();

vi.mock('../../../db/index.js', () => ({ default: { query: poolQuery } }));
vi.mock('../../personalKnowledgeSearch.js', () => ({ searchPersonalKnowledge }));

const { default: tool } = await import('./query_notes.js');

const ctx = { userId: 'user-1', userRole: 'user' };

function mockMainQuery({ rows = [], total = 0, breakdown = [], fallbackRows = [] } = {}) {
  poolQuery.mockImplementation(async (sql) => {
    if (sql.includes('n.id IN (?)')) return [fallbackRows];
    if (sql.includes('GROUP BY note_type')) return [breakdown];
    if (sql.includes('SELECT COUNT(*) as total')) return [[{ total }]];
    return [rows];
  });
}

describe('query_notes 工具', () => {
  beforeEach(() => vi.clearAllMocks());

  it('未指定可选筛选条件时，归一化结果仍满足公开工具 Schema', () => {
    const normalized = normalizeToolArguments(tool, {});

    expect(normalized).toEqual({ view: 'list', limit: 10 });
    expect(() => validateToolArgumentsAgainstSchema(tool.parameters, normalized)).not.toThrow();
  });

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

  it('把完整笔记格式别名提升为结构化类型筛选，而不是标题正文关键词', async () => {
    mockMainQuery({
      rows: [{ id: 'n1', title: '普通标题', content: '<p>正文</p>', type: 'html', create_time: null }],
      total: 67,
      breakdown: [
        { note_type: 'html', c: 67 },
        { note_type: 'markdown', c: 2 },
        { note_type: 'drawing', c: 16 },
      ],
    });

    const result = await tool.execute({ keyword: '富文本' }, ctx);
    const listCall = poolQuery.mock.calls.find(([sql]) => sql.includes('n.id, n.title'));
    const [breakdownSql, breakdownParams] = poolQuery.mock.calls.find(([sql]) => sql.includes('GROUP BY note_type'));

    expect(listCall).toBeUndefined();
    expect(breakdownSql).toContain('GROUP BY note_type');
    expect(breakdownParams).toEqual(['user-1']);
    expect(result).toMatchObject({
      total: 67,
      typeFilter: 'html',
      view: 'type_breakdown',
      typeBreakdown: { html: 67, markdown: 2, drawing: 16 },
      resultMetadata: {
        facets: {
          noteType: {
            exact: true,
            values: { html: 67, markdown: 2, drawing: 16 },
          },
        },
      },
    });
    expect(tool.transform(result, { keyword: '富文本' })).toBe(
      '富文本笔记共 67 条。\n笔记类型精确分布：富文本 67 条、Markdown 2 条、手绘 16 条。',
    );
  });

  it('显式支持 Markdown、手绘及统计视图，并保持同一口径的完整分布', async () => {
    mockMainQuery({
      rows: [],
      total: 2,
      breakdown: [
        { note_type: 'html', c: 67 },
        { note_type: 'markdown', c: 2 },
        { note_type: 'drawing', c: 16 },
      ],
    });

    const result = await tool.execute({ noteType: 'MD 笔记', view: 'distribution' }, ctx);
    expect(result).toMatchObject({ total: 2, typeFilter: 'markdown', view: 'type_breakdown' });
    expect(poolQuery.mock.calls.find(([sql]) => sql.includes('SELECT COUNT(*)'))?.[1]).toEqual(['user-1', 'markdown']);
    expect(tool.transform(result, { noteType: 'MD 笔记', view: 'distribution' })).toBe(
      'Markdown笔记共 2 条。\n笔记类型精确分布：富文本 67 条、Markdown 2 条、手绘 16 条。',
    );
    expect(tool.getAnswerRequirements(result)).toEqual([
      expect.objectContaining({
        id: 'note.type_count.markdown',
        appendText: 'Markdown笔记共 2 条。',
        onMissing: 'replace',
      }),
      expect.objectContaining({
        id: 'note.type_breakdown',
        appendText: '笔记类型精确分布：富文本 67 条、Markdown 2 条、手绘 16 条。',
        onMissing: 'replace',
      }),
    ]);
    expect(searchPersonalKnowledge).not.toHaveBeenCalled();
  });

  it('类型分布视图同时保留用户直接询问的总数主事实', async () => {
    mockMainQuery({
      rows: [],
      total: 85,
      breakdown: [
        { note_type: 'html', c: 67 },
        { note_type: 'markdown', c: 2 },
        { note_type: 'drawing', c: 16 },
      ],
    });

    const result = await tool.execute({ view: 'type_breakdown' }, ctx);

    expect(tool.transform(result, { view: 'type_breakdown' })).toBe(
      '当前查询范围内共 85 条笔记。\n笔记类型精确分布：富文本 67 条、Markdown 2 条、手绘 16 条。',
    );
    expect(tool.getAnswerRequirements(result)).toEqual([
      expect.objectContaining({ id: 'note.total_count', appendText: '当前查询范围内共 85 条笔记。' }),
      expect.objectContaining({ id: 'note.type_breakdown' }),
    ]);
    expect(
      applyAgentAnswerRequirements('只提到了分布。', tool.getAnswerRequirements(result), {
        allowAuthoritativeReplacement: true,
      }).answer,
    ).toBe('当前查询范围内共 85 条笔记。\n笔记类型精确分布：富文本 67 条、Markdown 2 条、手绘 16 条。');
  });

  it('假模型沿用错误列表数量时，最终层确定性补回数据库类型分布', async () => {
    mockMainQuery({
      rows: [{ id: 'n1', title: '测试富文本', content: '', type: 'html', create_time: null }],
      total: 67,
      breakdown: [
        { note_type: 'html', c: 67 },
        { note_type: 'markdown', c: 2 },
        { note_type: 'drawing', c: 16 },
      ],
    });

    const result = await tool.execute({ keyword: '富文本' }, ctx);
    const repaired = applyAgentAnswerRequirements('富文本笔记只有 5 条。', tool.getAnswerRequirements(result), {
      allowAuthoritativeReplacement: true,
    });

    expect(repaired).toEqual({
      answer: '富文本笔记共 67 条。\n笔记类型精确分布：富文本 67 条、Markdown 2 条、手绘 16 条。',
      addedCount: 2,
    });
  });

  it('类型列表查询只补精确计数，不会用分布覆盖模型返回的笔记明细', async () => {
    mockMainQuery({
      rows: [{ id: 'n1', title: '项目计划', content: '正文', type: 'html', create_time: null }],
      total: 3,
      breakdown: [
        { note_type: 'html', c: 3 },
        { note_type: 'markdown', c: 2 },
      ],
    });

    const result = await tool.execute({ type: 'html', keyword: '项目', view: 'list' }, ctx);
    const repaired = applyAgentAnswerRequirements('找到《项目计划》。', tool.getAnswerRequirements(result), {
      allowAuthoritativeReplacement: true,
    });

    expect(repaired.answer).toBe('找到《项目计划》。\n\n富文本笔记共 3 条。');
    expect(repaired.answer).toContain('项目计划');
  });

  it('不会从长关键词中抽取格式词，避免把真实内容检索改成类型筛选', async () => {
    mockMainQuery({ rows: [], total: 0 });
    searchPersonalKnowledge.mockResolvedValue({ hits: [] });

    await tool.execute({ keyword: '富文本编辑器优化' }, ctx);

    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toContain('n.title LIKE ?');
    expect(params).toContain('%富文本编辑器优化%');
    expect(params).not.toContain('html');
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
    expect(text).toMatch(
      /^笔记类型精确分布：富文本 0 条、Markdown 0 条、手绘 0 条。\n今天（\d{4}-\d{2}-\d{2}，截至 \d{2}:\d{2} · Asia\/Shanghai）没有找到笔记$/,
    );
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
    mockMainQuery({
      rows: [],
      total: 0,
      // 二次查行的数据库顺序故意与索引顺序相反。
      fallbackRows: [
        { id: 'n1', title: '甲', content: '', type: 'markdown', create_time: null },
        { id: 'n2', title: '乙', content: '', type: 'markdown', create_time: null },
      ],
    });
    searchPersonalKnowledge.mockResolvedValue({
      hits: [
        { type: 'note', id: 'n2' },
        { type: 'bookmark', id: 'b9' }, // 非笔记命中必须被过滤
        { type: 'note', id: 'n1' },
        { type: 'note', id: 'n2' }, // 重复 id 去重
      ],
    });
    const result = await tool.execute({ keyword: '我记得有一篇讲开发计划的笔记' }, ctx);

    expect(searchPersonalKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', scope: { types: ['note'] } }),
    );
    const [sql, params] = poolQuery.mock.calls[3];
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
    mockMainQuery({ rows: [], total: 0, fallbackRows: [] });
    searchPersonalKnowledge.mockResolvedValue({ hits: [{ type: 'note', id: 'n1' }] });

    const result = await tool.execute({ keyword: '开发计划相关的笔记', timeRange: '最近7天' }, ctx);

    const [sql] = poolQuery.mock.calls[3];
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
    expect(semantic).not.toContain('笔记类型精确分布');

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

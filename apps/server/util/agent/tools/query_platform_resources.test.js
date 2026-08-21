import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db/index.js', () => ({ default: { query: mocks.query } }));

const { default: tool } = await import('./query_platform_resources.js');

const ROW = {
  resource_type: 'note',
  resource_id: 'note-1',
  title: '探店脚本',
  create_time: '2026-08-06 01:55:46',
  user_id: 'user-1',
  alias: '于怀',
  email: 'a@example.test',
};

function mockRows(rows, total = rows.length) {
  mocks.query.mockImplementation((sql) => Promise.resolve(sql.includes('COUNT(*)') ? [[{ total }]] : [rows]));
}

describe('query_platform_resources 工具', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRows([ROW]);
  });

  it('只有管理员可用', () => {
    expect(tool.requireRoot).toBe(true);
  });

  it('跨用户联合三类资源，并沿用排行榜的过滤口径', async () => {
    await tool.execute({ timeRange: '今天' });
    const [sql, params] = mocks.query.mock.calls[0];

    expect(sql).toContain('FROM bookmark t');
    expect(sql).toContain('FROM note t');
    expect(sql).toContain('FROM files t');
    // 与 get_resource_creation_ranking 相同：引导期示例资源和内部账号都不计入。
    expect(sql.match(/onboarding_seed_resources/g)).toHaveLength(3);
    expect(sql).toContain('u.del_flag = 0');
    expect(sql).toContain('u.role NOT IN (?, ?)');
    // 归属列三张表各不相同，UNION 前必须各按各的列取。
    expect(sql).toContain('CONVERT(t.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS owner_id');
    expect(sql).toContain('CONVERT(t.create_by USING utf8mb4) COLLATE utf8mb4_unicode_ci AS owner_id');
    expect(params.slice(-3)).toEqual(['root', 'test', 30]);
  });

  it('联合历史 utf8 与 utf8mb4 表时统一所有字符串投影和用户 ID 比较口径', async () => {
    await tool.execute({ timeRange: '今天' });
    const [sql] = mocks.query.mock.calls[0];

    expect(sql.match(/AS CHAR CHARACTER SET utf8mb4\) COLLATE utf8mb4_unicode_ci AS resource_id/g)).toHaveLength(3);
    expect(sql).toContain('CONVERT(t.name USING utf8mb4) COLLATE utf8mb4_unicode_ci AS title');
    expect(sql).toContain('CONVERT(t.title USING utf8mb4) COLLATE utf8mb4_unicode_ci AS title');
    expect(sql).toContain('CONVERT(t.file_name USING utf8mb4) COLLATE utf8mb4_unicode_ci AS title');
    expect(sql).toContain('ON BINARY u.id = BINARY resources.owner_id');
  });

  it('限定单一类型时不联合其它表', async () => {
    await tool.execute({ timeRange: '今天', resourceType: 'note' });
    const [sql] = mocks.query.mock.calls[0];

    expect(sql).toContain('FROM note t');
    expect(sql).not.toContain('FROM bookmark t');
    expect(sql).not.toContain('FROM files t');
    expect(sql).not.toContain('UNION ALL');
  });

  it('时间范围必填，缺失或无法识别都要失败而不是悄悄查全量', async () => {
    await expect(tool.execute({})).rejects.toThrow('平台资源清单需要明确时间范围');
    await expect(tool.execute({ timeRange: '随便什么时候' })).rejects.toThrow('资源新增时间范围无法识别');
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('传“全部”时放行全量口径，不加时间过滤', async () => {
    await tool.execute({ timeRange: '全部' });
    const [sql, params] = mocks.query.mock.calls[0];

    expect(sql).not.toContain('t.create_time >= ?');
    expect(params.slice(0, 3)).toEqual(['bookmark', 'note', 'file']);
  });

  it('includeInternal=true 时保留内部账号', async () => {
    await tool.execute({ timeRange: '今天', includeInternal: true });
    const [sql] = mocks.query.mock.calls[0];

    expect(sql).not.toContain('u.role NOT IN');
  });

  it('可把资源明细限定为上一问中的新注册用户', async () => {
    const raw = await tool.execute({ timeRange: '今天', registeredWithin: '今天' });
    const [sql, params] = mocks.query.mock.calls[0];

    expect(sql).toContain('u.create_time >= ? AND u.create_time < ?');
    expect(params).toHaveLength(14);
    expect(raw.registeredWithin).toBe('今天');
  });

  it('limit 收敛到 1..100', async () => {
    await tool.execute({ timeRange: '今天', limit: 999 });
    expect(mocks.query.mock.calls[0][1].slice(-1)).toEqual([100]);
  });

  it('按归属人分组输出标题，便于承接“都是谁的”之后的追问', async () => {
    mockRows([
      ROW,
      { ...ROW, resource_id: 'note-2', title: '未命名文档' },
      {
        ...ROW,
        resource_type: 'bookmark',
        resource_id: 'bm-1',
        title: '轻笺官网',
        user_id: 'user-2',
        alias: '柳七',
        email: 'b@example.test',
      },
    ]);
    const raw = await tool.execute({ timeRange: '今天' });
    const text = tool.transform(raw);

    expect(text).toContain('2 位用户共 3 条');
    expect(text).toContain('于怀（a@example.test）：2 条');
    expect(text).toContain('《探店脚本》');
    expect(text).toContain('《未命名文档》');
    expect(text).toContain('柳七（b@example.test）：1 条');
    expect(text).toContain('[书签]《轻笺官网》');
  });

  it('结果被 limit 截断时说明总数，不冒充完整清单', async () => {
    mockRows([ROW], 42);
    const raw = await tool.execute({ timeRange: '今天', limit: 1 });

    expect(tool.transform(raw)).toContain('共 42 条，以下是最近 1 条');
    expect(tool.summarize(raw)).toContain('共 42 条，已返回 1 条标题');
  });

  it('无记录时明确说没有，不返回空清单让模型自由发挥', async () => {
    mockRows([], 0);
    const raw = await tool.execute({ timeRange: '今天', resourceType: 'note' });

    expect(tool.transform(raw)).toBe('今天平台新增的笔记：没有记录');
    expect(tool.summarize(raw)).toBe('今天平台新增笔记清单：无记录');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db/index.js', () => ({ default: { query: mocks.query } }));

const { default: tool } = await import('./get_resource_creation_ranking.js');

describe('get_resource_creation_ranking 工具', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([
      [
        {
          user_id: 'user-1',
          alias: '甲',
          email: 'a@example.test',
          bookmark_count: '3',
          note_count: '2',
          file_count: '1',
          total_count: '6',
        },
      ],
    ]);
  });

  it('默认统计昨天的三类有效资源，并排除内部账号和新手引导资源', async () => {
    const raw = await tool.execute({});
    const [sql, params] = mocks.query.mock.calls[0];

    expect(sql).toContain('FROM bookmark');
    expect(sql).toContain('FROM note');
    expect(sql).toContain('FROM files');
    expect(sql.match(/onboarding_seed_resources/g)).toHaveLength(3);
    expect(sql).toContain('u.del_flag = 0');
    expect(sql).toContain('u.role NOT IN (?, ?)');
    expect(sql).toContain('ORDER BY total_count DESC');
    expect(params[0]).toMatch(/^\d{4}-\d{2}-\d{2} 00:00:00$/);
    expect(params[1]).toMatch(/^\d{4}-\d{2}-\d{2} 23:59:59$/);
    expect(params.slice(0, 6)).toEqual([params[0], params[1], params[0], params[1], params[0], params[1]]);
    expect(params.slice(-3)).toEqual(['root', 'test', 10]);
    expect(raw).toMatchObject({
      timeRange: '昨天',
      registeredWithin: null,
      includeInternal: false,
      items: [
        {
          userId: 'user-1',
          bookmarkCount: 3,
          noteCount: 2,
          fileCount: 1,
          totalCount: 6,
        },
      ],
    });
  });

  it('可限制用户注册时间，并按显式选项包含内部账号', async () => {
    await tool.execute({
      resourceTimeRange: '今天',
      userRegisteredWithin: '昨天',
      includeInternal: true,
      limit: 999,
    });
    const [sql, params] = mocks.query.mock.calls[0];

    expect(sql).not.toContain('u.role NOT IN');
    expect(sql).toContain('u.create_time >= ? AND u.create_time <= ?');
    expect(params).toHaveLength(9);
    expect(params.at(-1)).toBe(50);
  });

  it('明确展示三类明细，并正确说明第一名并列', () => {
    const output = tool.transform({
      timeRange: '昨天',
      registeredWithin: '昨天',
      items: [
        { alias: '甲', email: 'a@example.test', bookmarkCount: 2, noteCount: 1, fileCount: 0, totalCount: 3 },
        { alias: '乙', email: 'b@example.test', bookmarkCount: 1, noteCount: 1, fileCount: 1, totalCount: 3 },
      ],
    });

    expect(output).toContain('昨天注册的用户中');
    expect(output).toContain('甲、乙 并列最多，各 3 项');
    expect(output).toContain('书签 2、笔记 1、文件 0');
  });

  it('拒绝无法识别的时间范围，避免误查成全部历史数据', async () => {
    await expect(tool.execute({ timeRange: '随便某一天' })).rejects.toThrow('资源新增时间范围无法识别');
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

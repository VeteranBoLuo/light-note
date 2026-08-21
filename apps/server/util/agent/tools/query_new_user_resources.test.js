import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db/index.js', () => ({ default: { query: mocks.query } }));

const { default: tool } = await import('./query_new_user_resources.js');

describe('query_new_user_resources 工具', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockImplementation((sql) =>
      Promise.resolve(
        sql.includes('COUNT(*)')
          ? [[{ total: 1 }]]
          : [
              [
                {
                  resource_type: 'note',
                  resource_id: 'note-1',
                  title: '新用户笔记',
                  create_time: '2026-08-12 10:00:00',
                  user_id: 'user-1',
                  alias: '新用户',
                  email: 'new@example.test',
                },
              ],
            ],
      ),
    );
  });

  it('用一次跨用户查询同时限定注册时间与资源时间', async () => {
    const raw = await tool.execute({ registeredWithin: '今天', resourceTimeRange: '今天' });
    const [sql] = mocks.query.mock.calls[0];

    expect(tool.requireRoot).toBe(true);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(sql).toContain('FROM bookmark t');
    expect(sql).toContain('FROM note t');
    expect(sql).toContain('FROM files t');
    expect(sql).toContain('u.create_time >= ? AND u.create_time < ?');
    expect(raw.registeredWithin).toBe('今天');
    expect(tool.transform(raw)).toContain('今天注册用户中，今天平台新增的资源');
  });

  it('两个时间范围都必填，禁止退化成个人资源查询', async () => {
    expect(() => tool.execute({ registeredWithin: '今天' })).toThrow('资源创建时间');
    expect(() => tool.execute({ resourceTimeRange: '今天' })).toThrow('用户注册时间');
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
import { buildRecapUnion, getRecap } from './recap.js';

describe('growth recap', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  it('游客不访问数据库并返回空回顾', async () => {
    await expect(getRecap('visitor')).resolves.toEqual({ weekly: [], onThisDay: [], buried: [] });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('UNION 前统一字符串排序规则，兼容历史表字段 collation 不一致', () => {
    const sql = buildRecapUnion('create_time IS NOT NULL', 'create_time IS NOT NULL', 'create_time DESC', 10);
    expect(sql.match(/COLLATE utf8mb4_unicode_ci/g)).toHaveLength(8);
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('ORDER BY create_time DESC LIMIT 10');
  });

  it('按最近、那年今日和尘封三个分组返回稳定结构', async () => {
    pool.query
      .mockResolvedValueOnce([[{ type: 'note', id: 'n1', title: '', url: null, create_time: '2026-08-01' }]])
      .mockResolvedValueOnce([
        [{ type: 'bookmark', id: 'b1', title: '旧书签', url: 'https://example.com', create_time: '2025-08-01' }],
      ])
      .mockResolvedValueOnce([[]]);

    await expect(getRecap('user-1')).resolves.toEqual({
      weekly: [{ type: 'note', id: 'n1', title: '(无标题)', url: null, time: '2026-08-01' }],
      onThisDay: [{ type: 'bookmark', id: 'b1', title: '旧书签', url: 'https://example.com', time: '2025-08-01' }],
      buried: [],
    });
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query.mock.calls.every(([, params]) => params[0] === 'user-1' && params[1] === 'user-1')).toBe(true);
  });
});

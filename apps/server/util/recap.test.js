import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
import { buildRecapUnion, getRecap, updateRecapState } from './recap.js';

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
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    await expect(
      getRecap('user-1', {
        calendar: { dayKey: '20260801', timezone: 'Asia/Shanghai', shiftMinutes: 0 },
      }),
    ).resolves.toEqual({
      weekly: [{ type: 'note', id: 'n1', title: '(无标题)', url: null, time: '2026-08-01' }],
      onThisDay: [{ type: 'bookmark', id: 'b1', title: '旧书签', url: 'https://example.com', time: '2025-08-01' }],
      buried: [],
      stableDate: '2026-08-01',
      timezone: 'Asia/Shanghai',
    });
    expect(pool.query).toHaveBeenCalledTimes(4);
    expect(
      pool.query.mock.calls.slice(0, 3).every(([, params]) => params[0] === 'user-1' && params[1] === 'user-1'),
    ).toBe(true);
    expect(pool.query.mock.calls[3][1]).toEqual(['user-1']);
    expect(pool.query.mock.calls[2][0]).toContain("CRC32(CONCAT('2026-08-01'");
  });

  it('旧入口稍后提醒不会清掉已有永久屏蔽，且只会延长提醒时间', async () => {
    pool.query.mockResolvedValueOnce([[{ count: 1 }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(
      updateRecapState('user-1', { type: 'bookmark', id: 'bookmark-1', action: 'snooze_7d' }),
    ).resolves.toEqual({ ok: true, action: 'snooze_7d' });

    const sql = pool.query.mock.calls[1][0];
    expect(sql).toContain('growth_recap_state.dismissed_at IS NULL');
    expect(sql).toContain('GREATEST(COALESCE(growth_recap_state.snoozed_until, NOW())');
    expect(sql).not.toContain('dismissed_at = VALUES(dismissed_at)');
  });

  it('旧入口永久屏蔽保持幂等，并清掉已失效的稍后提醒', async () => {
    pool.query.mockResolvedValueOnce([[{ count: 1 }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);

    await updateRecapState('user-1', { type: 'note', id: 'note-1', action: 'dismiss' });

    const sql = pool.query.mock.calls[1][0];
    expect(sql).toContain('snoozed_until = NULL');
    expect(sql).toContain('dismissed_at = COALESCE(growth_recap_state.dismissed_at, VALUES(dismissed_at))');
  });
});

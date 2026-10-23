import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db/index.js', () => ({ default: { query: mocks.query } }));
import { getLotteryHistory } from './lotteryHistoryService.js';

function receipt(id, rewards = [{ id: 'ai100', kind: 'ai_pack', amount: 100000 }]) {
  return {
    id: String(id),
    operation_type: 'lottery_free',
    cost_points: 0,
    create_time: '2026-10-23T02:14:00Z',
    cursor_time: '2026-10-23 10:14:00',
    result_json: JSON.stringify({ ok: true, results: rewards }),
  };
}
beforeEach(() => {
  mocks.query.mockReset();
  mocks.query.mockResolvedValue([[]]);
});

describe('抽奖历史收据', () => {
  it('只读本人成功收据，历史 AI 数量不从现目录反推', async () => {
    mocks.query.mockResolvedValue([[receipt(12)]]);
    expect(await getLotteryHistory('owner')).toMatchObject({
      rows: [{ id: '12', mode: 'free', cost: 0, results: [{ kind: 'ai_pack', amount: 100000 }] }],
      hasMore: false,
      nextCursor: null,
    });
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain("user_id = ? AND status = 'succeeded'");
    expect(sql).toContain('ORDER BY create_time DESC, points_economy_operations.id DESC');
    expect(params).toEqual(['owner', 'lottery_free', 'lottery_paid']);
    expect(sql.trim().startsWith('SELECT')).toBe(true);
  });
  it('十连以一条收据返回全部十项与保底命中', async () => {
    const results = Array.from({ length: 10 }, (_, index) => ({
      id: 'p20',
      kind: 'points',
      amount: 20,
      guaranteed: index === 9,
    }));
    const row = { ...receipt(11, results), operation_type: 'lottery_paid', cost_points: 1600 };
    mocks.query.mockResolvedValue([[row]]);
    const data = await getLotteryHistory('owner', { mode: 'paid' });
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({ mode: 'paid', cost: 1600 });
    expect(data.rows[0].results).toHaveLength(10);
    expect(data.rows[0].results[9]).toMatchObject({ index: 10, guaranteed: true });
    expect(mocks.query.mock.calls[0][1]).toEqual(['owner', 'lottery_paid']);
  });
  it('同秒记录按时间加 ID 游标续页，并绑定筛选条件', async () => {
    mocks.query.mockResolvedValue([[receipt(13), receipt(12), receipt(11)]]);
    const first = await getLotteryHistory('owner', { limit: 2, mode: 'free' });
    expect(first.rows.map((row) => row.id)).toEqual(['13', '12']);
    expect(first.hasMore).toBe(true);
    mocks.query.mockResolvedValue([[receipt(11)]]);
    const next = await getLotteryHistory('owner', { limit: 2, mode: 'free', cursor: first.nextCursor });
    expect(next.hasMore).toBe(false);
    expect(mocks.query.mock.calls[1][1]).toEqual([
      'owner',
      'lottery_free',
      '2026-10-23 10:14:00',
      '2026-10-23 10:14:00',
      '12',
    ]);
    await expect(getLotteryHistory('owner', { mode: 'paid', cursor: first.nextCursor })).rejects.toMatchObject({
      code: 'INVALID_LOTTERY_HISTORY_QUERY',
    });
  });
  it('游客返回空记录，非法筛选或游标失败关闭', async () => {
    expect(await getLotteryHistory('visitor')).toEqual({ rows: [], hasMore: false, nextCursor: null });
    expect(mocks.query).not.toHaveBeenCalled();
    await expect(getLotteryHistory('owner', { mode: 'other' })).rejects.toMatchObject({
      code: 'INVALID_LOTTERY_HISTORY_QUERY',
    });
    await expect(getLotteryHistory('owner', { cursor: 'broken' })).rejects.toMatchObject({
      code: 'INVALID_LOTTERY_HISTORY_QUERY',
    });
  });
  it('限制每页数量，不把损坏收据误报成空记录', async () => {
    await getLotteryHistory('owner', { limit: 100000 });
    expect(mocks.query.mock.calls[0][0]).toContain('LIMIT 51');
    mocks.query.mockResolvedValue([[{ ...receipt(1), result_json: '{}' }]]);
    await expect(getLotteryHistory('owner')).rejects.toThrow('LOTTERY_HISTORY_RECEIPT_INVALID');
  });
});

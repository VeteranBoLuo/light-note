import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  grantItem: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.query, getConnection: mocks.getConnection } }));
vi.mock('./items.js', () => ({ grantItem: mocks.grantItem }));

const { AdminPointsError, adminGrantPoints, buyItem, getPointsLog, searchAdminUsers } = await import('./points.js');

function connectionWith({ user = true, points = 120, storage = 512, cards = 1 } = {}) {
  const connection = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      const statement = String(sql);
      if (statement.includes('FROM user WHERE')) {
        return [user ? [{ id: 'user-1', alias: '测试用户', email: 'user@example.com' }] : []];
      }
      if (statement.includes('SELECT points, storage_bonus_mb')) {
        return [[{ points, storage_bonus_mb: storage, streak_protect_cards: cards }]];
      }
      return [{ affectedRows: 1 }];
    }),
  };
  mocks.getConnection.mockResolvedValue(connection);
  return connection;
}

describe('积分运营选人与资产事务', () => {
  beforeEach(() => vi.clearAllMocks());

  it('可按 ID、邮箱或昵称搜索全量活跃用户', async () => {
    mocks.query.mockResolvedValueOnce([
      [{ userId: 'user-1', alias: '小笺', email: 'user@example.com', points: 88, lastActiveTime: null }],
    ]);

    const rows = await searchAdminUsers('小笺', { limit: 100 });

    expect(rows[0]).toMatchObject({ userId: 'user-1', alias: '小笺', points: 88 });
    expect(mocks.query.mock.calls[0][0]).toContain('u.del_flag = 0');
    expect(mocks.query.mock.calls[0][0]).toContain('LIMIT 20');
    expect(mocks.query.mock.calls[0][1]).toContain('%小笺%');
  });

  it('在同一事务内写入审计流水与最终余额', async () => {
    const connection = connectionWith();

    const result = await adminGrantPoints('user-1', { points: 30, storageMb: -12, cards: 1, note: '补发活动奖励' });

    expect(result).toMatchObject({ ok: true, points: 150, storageBonusMb: 500, cards: 2 });
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('SET points = ?'), [150, 500, 2, 'user-1']);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('扣减超过余额时回滚，不执行资产 UPDATE', async () => {
    const connection = connectionWith({ points: 10 });

    await expect(adminGrantPoints('user-1', { points: -11 })).rejects.toMatchObject({
      name: 'AdminPointsError',
      code: 'INSUFFICIENT_POINTS',
    });

    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('SET points = ?'))).toBe(false);
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('目标用户不存在时返回可识别的 404 业务错误', async () => {
    const connection = connectionWith({ user: false });
    await expect(adminGrantPoints('missing', { points: 10 })).rejects.toEqual(
      expect.objectContaining({ code: 'USER_NOT_FOUND', status: 404 }),
    );
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(AdminPointsError).toBeTypeOf('function');
  });
});

describe('积分流水来源语义', () => {
  beforeEach(() => vi.clearAllMocks());

  it('把成就键和每周挑战周期拆成结构化字段', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          { delta: 20, reason: 'achievement', ref: 'streak_7', create_time: '2026-08-06 12:00:00' },
          { delta: 50, reason: 'weekly', ref: '202632:wk_todo', create_time: '2026-08-06 11:00:00' },
        ],
      ])
      .mockResolvedValueOnce([[{ c: 2 }]]);

    const result = await getPointsLog('user-1');
    expect(result.rows[0]).toMatchObject({ sourceType: 'achievement', sourceKey: 'streak_7' });
    expect(result.rows[1]).toMatchObject({ sourceType: 'weekly', sourceKey: 'wk_todo', sourceMeta: '202632' });
  });

  it('返回稳定记录 ID、游标并把分页参数截断为安全整数', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          { id: 12, delta: -88, reason: 'lottery_cost', ref: 'x1', create_time: '2026-08-06 12:00:00' },
          { id: 11, delta: 30, reason: 'lottery_win', ref: 'p30', create_time: '2026-08-06 11:00:00' },
        ],
      ])
      .mockResolvedValueOnce([[{ c: 2 }]]);

    const result = await getPointsLog('user-1', { limit: 1.9, offset: 2.8, filter: 'lottery' });

    expect(result).toMatchObject({
      rows: [{ id: 12 }],
      limit: 1,
      offset: 2,
      filter: 'lottery',
      hasMore: true,
      nextCursor: expect.any(String),
    });
    expect(String(mocks.query.mock.calls[0][0])).toContain('ORDER BY id DESC LIMIT 2 OFFSET 2');
  });
});

describe('AI 加油包兑换', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['ai_pack_small', 90, 300_000],
    ['ai_pack', 150, 600_000],
  ])('%s 兑换后直接进入永久余额', async (itemId, cost, tokens) => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('SELECT points, level, streak_protect_cards')) {
          return [[{ points: 500, level: 5, streak_protect_cards: 0 }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    mocks.getConnection.mockResolvedValue(connection);
    mocks.query.mockResolvedValueOnce([[{ points: 500 - cost }]]);

    await expect(buyItem('user-1', itemId)).resolves.toMatchObject({
      ok: true,
      points: 500 - cost,
      item: itemId,
    });

    expect(connection.query).toHaveBeenCalledWith(
      'UPDATE user_growth SET ai_bonus_tokens = ai_bonus_tokens + ? WHERE user_id = ?',
      [tokens, 'user-1'],
    );
    expect(mocks.grantItem).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledOnce();
  });
});

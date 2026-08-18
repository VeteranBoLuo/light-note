import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  grantItem: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.query, getConnection: mocks.getConnection } }));
vi.mock('./items.js', () => ({ grantItem: mocks.grantItem }));

const { AdminPointsError, adminGrantPoints, buyItem, getPointsLog, getPointsOverview, searchAdminUsers } =
  await import('./points.js');

function connectionWith({ user = true, points = 120, storage = 512, cards = 1 } = {}) {
  let operation = null;
  const connection = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(async (sql, params = []) => {
      const statement = String(sql);
      if (statement.includes('INSERT IGNORE INTO points_grant_operations')) {
        if (operation) return [{ affectedRows: 0 }];
        operation = {
          id: 81,
          operationHash: params[2],
          status: 'pending',
          resultJson: null,
        };
        return [{ affectedRows: 1, insertId: 81 }];
      }
      if (statement.includes('FROM points_grant_operations')) return [[operation]];
      if (statement.includes('UPDATE points_grant_operations')) {
        operation.status = 'succeeded';
        operation.resultJson = JSON.parse(params[0]);
        return [{ affectedRows: 1 }];
      }
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

function adminActionContext(requestId) {
  return {
    definition: { action: 'growth.grant_points', riskLevel: 'high', auditRequired: true },
    reason: '自动化测试验收用途',
    requestId,
    intentAuditId: 'intent-audit-id',
    baseEntry: {
      actorUserId: 'root-1',
      action: 'growth.grant_points',
      targetType: 'user',
      targetId: 'user-1',
      reason: '自动化测试验收用途',
      requestId,
      ip: '127.0.0.1',
    },
    metadata: {},
  };
}

const auditedReason = {
  reasonCode: 'test_acceptance',
  reason: '自动化测试验收用途',
};

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

    const result = await adminGrantPoints('user-1', {
      points: 30,
      storageMb: -12,
      cards: 1,
      note: '补发活动奖励',
      ...auditedReason,
    });

    expect(result).toMatchObject({ ok: true, points: 150, storageBonusMb: 500, cards: 2 });
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('SET points = ?'), [150, 500, 2, 'user-1']);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('扣减超过余额时回滚，不执行资产 UPDATE', async () => {
    const connection = connectionWith({ points: 10 });

    await expect(adminGrantPoints('user-1', { points: -11, ...auditedReason })).rejects.toMatchObject({
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
    await expect(adminGrantPoints('missing', { points: 10, ...auditedReason })).rejects.toEqual(
      expect.objectContaining({ code: 'USER_NOT_FOUND', status: 404 }),
    );
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(AdminPointsError).toBeTypeOf('function');
  });

  it('拒绝缺少结构化原因的 Root 资产调整', async () => {
    await expect(adminGrantPoints('user-1', { points: 10 })).rejects.toMatchObject({
      code: 'REASON_CODE_REQUIRED',
    });
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });

  it('同一运营请求重放时返回原结果且不重复写余额和流水', async () => {
    const connection = connectionWith();
    const actionContext = adminActionContext('manual-grant-idem-0001');

    const first = await adminGrantPoints('user-1', { points: 30, ...auditedReason }, { actionContext });
    const replay = await adminGrantPoints('user-1', { points: 30, ...auditedReason }, { actionContext });

    expect(first).toMatchObject({ ok: true, points: 150, idempotent: false });
    expect(replay).toMatchObject({ ok: true, points: 150, idempotent: true });
    expect(connection.query.mock.calls.filter(([sql]) => String(sql).includes('UPDATE user_growth')).length).toBe(1);
    expect(connection.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO points_log')).length).toBe(
      1,
    );
  });

  it('同一运营请求标识携带不同负载时失败关闭', async () => {
    connectionWith();
    const actionContext = adminActionContext('manual-grant-idem-0002');

    await adminGrantPoints('user-1', { points: 30, ...auditedReason }, { actionContext });
    await expect(adminGrantPoints('user-1', { points: 31, ...auditedReason }, { actionContext })).rejects.toMatchObject(
      { code: 'IDEMPOTENCY_KEY_REUSED', status: 409 },
    );
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

  it('让新旧抽奖资产流水都返回明确到账数量', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            id: 14,
            delta: 0,
            reason: 'lottery_free_asset',
            ref: 'ai200',
            meta: null,
            create_time: '2026-08-17 10:00:00',
          },
          {
            id: 13,
            delta: 0,
            reason: 'lottery_paid_asset',
            ref: 's512',
            meta: JSON.stringify({ assetType: 'storage_mb', assetAmount: 512 }),
            create_time: '2026-08-17 09:00:00',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ c: 2 }]]);

    const result = await getPointsLog('user-1');

    expect(result.rows[0]).toMatchObject({ assetChange: { type: 'ai', amount: 200_000 } });
    expect(result.rows[1]).toMatchObject({ assetChange: { type: 'storage', amount: 512 } });
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

describe('积分经济运营聚合', () => {
  beforeEach(() => vi.clearAllMocks());

  it('同时返回新旧流水、版本收据和可聚合资产指标', async () => {
    mocks.query
      .mockResolvedValueOnce([[{ s: '1000' }]])
      .mockResolvedValueOnce([[{ s: '600' }]])
      .mockResolvedValueOnce([[{ s: '400' }]])
      .mockResolvedValueOnce([[{ reason: 'lottery_paid_cost', delta: '-170', cnt: '1' }]])
      .mockResolvedValueOnce([[{ s: '170' }]])
      .mockResolvedValueOnce([[{ s: '20' }]])
      .mockResolvedValueOnce([[{ s: '10' }]])
      .mockResolvedValueOnce([
        [{ economyVersion: 'points-economy-c4', operationType: 'lottery_paid', operations: '1', replays: '2' }],
      ])
      .mockResolvedValueOnce([
        [
          {
            economyVersion: 'points-economy-c4',
            operationType: 'lottery_paid',
            itemId: null,
            operations: '1',
            costPoints: '170',
            pointsRewarded: '20',
            aiTokensGranted: '0',
            storageMbGranted: '0',
            makeupCardsGranted: '0',
            drawCount: '1',
            pityHits: '0',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ s: '3' }]])
      .mockResolvedValueOnce([[{ c: '2' }]])
      .mockResolvedValueOnce([[{ user_id: 'user-1', points: '88', alias: '小笺', email: 'user@example.com' }]]);

    const result = await getPointsOverview();

    expect(result).toMatchObject({
      issued: 1000,
      spent: 600,
      outstanding: 400,
      lottery: { cost: 170, winPoints: 20, freeWinPoints: 10, payoutRatio: 11.8 },
      byEconomyVersion: [{ economyVersion: 'points-economy-c4', operations: 1, replays: 2 }],
      operationMetrics: [{ costPoints: 170, pointsRewarded: 20, drawCount: 1 }],
      holders: 2,
    });
  });
});

describe('AI 加油包兑换', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.POINTS_ECONOMY_C4_ENABLED = 'true';
    process.env.POINTS_ECONOMY_REQUIRE_WRITE_VERSION = 'false';
  });

  it.each([
    ['ai_pack_small', 240, 300_000],
    ['ai_pack', 420, 600_000],
  ])('%s 兑换后直接进入永久余额', async (itemId, cost, tokens) => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (String(sql).includes('FROM points_economy_operations')) return [[]];
        if (String(sql).includes('INSERT IGNORE INTO points_economy_operations')) {
          return [{ affectedRows: 1, insertId: 51 }];
        }
        if (String(sql).includes('SELECT points, level, streak_protect_cards')) {
          return [[{ points: 500, level: 5, streak_protect_cards: 0 }]];
        }
        if (String(sql).includes('SELECT points, storage_bonus_mb')) {
          return [[{ points: 500 - cost, storage_bonus_mb: 0, ai_bonus_tokens: tokens }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    mocks.getConnection.mockResolvedValue(connection);

    await expect(
      buyItem('user-1', itemId, {
        clientRequestId: `c4-buy-${itemId}-request`,
        economyVersion: 'points-economy-c4',
        expectedCost: cost,
      }),
    ).resolves.toMatchObject({
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

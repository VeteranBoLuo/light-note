import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  poolQuery: vi.fn(),
  grantItem: vi.fn(),
  creditAiBonusTokens: vi.fn(async (_connection, input) => ({
    ledgerId: 'wallet-ledger',
    amountTokens: input.amountTokens,
    balanceAfter: input.amountTokens,
  })),
  levelForExp: vi.fn(() => 10),
}));

vi.mock('../db/index.js', () => ({
  default: { getConnection: mocks.getConnection, query: mocks.poolQuery },
}));
vi.mock('./growth.js', () => ({ levelForExp: mocks.levelForExp }));
vi.mock('./items.js', () => ({ grantItem: mocks.grantItem }));
vi.mock('./aiBonusWallet.js', () => ({ creditAiBonusTokens: mocks.creditAiBonusTokens }));

import { drawLottery, getLotteryStatus, pickWeighted } from './lottery.js';

const originalC4Flag = process.env.POINTS_ECONOMY_C4_ENABLED;
const originalWriteVersionFlag = process.env.POINTS_ECONOMY_REQUIRE_WRITE_VERSION;

afterAll(() => {
  if (originalC4Flag === undefined) delete process.env.POINTS_ECONOMY_C4_ENABLED;
  else process.env.POINTS_ECONOMY_C4_ENABLED = originalC4Flag;
  if (originalWriteVersionFlag === undefined) delete process.env.POINTS_ECONOMY_REQUIRE_WRITE_VERSION;
  else process.env.POINTS_ECONOMY_REQUIRE_WRITE_VERSION = originalWriteVersionFlag;
});

afterEach(() => vi.unstubAllEnvs());

function mockConnection({ points = 5000, totalCount = 9, paidCount = 9, paidPity = 9, freeUsed = 0 } = {}) {
  const conn = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      const statement = String(sql);
      if (statement.includes('FROM points_economy_operations')) return [[]];
      if (statement.includes('INSERT IGNORE INTO points_economy_operations'))
        return [{ affectedRows: 1, insertId: 41 }];
      if (statement.includes('FROM points_log')) return [Array.from({ length: freeUsed }, (_, id) => ({ id }))];
      if (statement.includes('FROM user_growth') && statement.includes('FOR UPDATE')) {
        return [
          [
            {
              points,
              exp: 0,
              lottery_count: totalCount,
              lottery_paid_count: paidCount,
              lottery_paid_pity_progress: paidPity,
              lottery_free_day: null,
              lottery_free_used: freeUsed,
            },
          ],
        ];
      }
      if (statement.includes('SELECT points, storage_bonus_mb')) {
        return [[{ points: points - 170, storage_bonus_mb: 0, ai_bonus_tokens: 0, streak_protect_cards: 0 }]];
      }
      return [{ affectedRows: 1, insertId: 1 }];
    }),
  };
  mocks.getConnection.mockResolvedValue(conn);
  return conn;
}

let requestSequence = 0;
function c4Request(options) {
  requestSequence += 1;
  const mode = options.mode === 'free' ? 'free' : 'paid';
  const times = mode === 'free' ? 1 : Number(options.times) === 10 ? 10 : 1;
  return {
    ...options,
    mode,
    times,
    clientRequestId: `c4-lottery-test-${requestSequence}`,
    economyVersion: 'points-economy-c4',
    expectedCost: mode === 'free' ? 0 : times === 10 ? 1600 : 170,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.poolQuery.mockResolvedValue([[]]);
  requestSequence = 0;
  process.env.POINTS_ECONOMY_C4_ENABLED = 'true';
  process.env.POINTS_ECONOMY_REQUIRE_WRITE_VERSION = 'false';
  mocks.grantItem.mockResolvedValue({ ok: true, qty: 1, overflowQty: 0 });
});

describe('免费次数逐日防重', () => {
  it('切到另一天再返回也不能重领，并且状态与写入口使用相同流水', async () => {
    const growth = { points: 0, exp: 1000, lottery_count: 0, lottery_free_day: null, lottery_free_used: 0 };
    const days = [];
    const query = vi.fn(async (sql, params = []) => {
      const text = String(sql);
      if (text.includes('FROM points_economy_operations')) return [[]];
      if (text.includes('INSERT IGNORE INTO points_economy_operations')) return [{ affectedRows: 1, insertId: 1 }];
      if (text.includes('FROM points_log')) return [days.filter((day) => day === params[1]).map((_, id) => ({ id }))];
      if (text.includes('FROM user_growth')) return [[{ ...growth }]];
      if (text.includes('SET lottery_free_day')) [growth.lottery_free_day, growth.lottery_free_used] = params;
      if (text.includes("'lottery_free', ?")) days.push(params[1]);
      if (text.includes('SET points = points +')) growth.points += params[0];
      return [{ affectedRows: 1 }];
    });
    const conn = { query, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
    mocks.getConnection.mockResolvedValue(conn);
    mocks.poolQuery.mockImplementation(query);
    mocks.levelForExp.mockReturnValue(3);
    const draw = (dayKey) => drawLottery('u1', c4Request({ mode: 'free', calendar: { dayKey }, randomIntFn: () => 0 }));
    expect(await draw('20261023')).toMatchObject({ ok: true });
    expect(await draw('20261022')).toMatchObject({ ok: true });
    for (const day of ['20261023', '20261022', '20261023']) {
      expect(await draw(day)).toMatchObject({ ok: false, reason: 'no_free' });
      expect(await getLotteryStatus('u1', { calendar: { dayKey: day } })).toMatchObject({ free: { daily: 1, remaining: 0 } });
    }
    expect(days).toEqual(['20261023', '20261022']);
    expect(growth.points).toBe(20);
  });
});

describe('C4 加权随机边界', () => {
  it('覆盖第一项、区间边界和最后一项', () => {
    const pool = [
      { id: 'a', weight: 2 },
      { id: 'b', weight: 3 },
      { id: 'c', weight: 5 },
    ];
    expect(pickWeighted(pool, () => 0).id).toBe('a');
    expect(pickWeighted(pool, () => 2).id).toBe('b');
    expect(pickWeighted(pool, () => 9).id).toBe('c');
  });
});

describe('C10 免费惊喜发放', () => {
  it.each([
    [0, 'points', 3], [649, 'points', 3],
    [650, 'points', 5], [879, 'points', 5],
    [880, 'points', 20], [899, 'points', 20],
    [900, 'ai_pack', 20000], [979, 'ai_pack', 20000],
    [980, 'ai_pack', 50000], [999, 'ai_pack', 50000],
  ])('随机值 %i 发放 %s %i，保持免费次数与付费保底隔离', async (cursor, kind, amount) => {
    vi.stubEnv('POINTS_ECONOMY_C10_ENABLED', 'true');
    const conn = mockConnection();
    const result = await drawLottery('u1', {
      ...c4Request({ mode: 'free', calendar: { dayKey: '20261026' }, randomIntFn: () => cursor }),
      economyVersion: 'points-economy-c10',
    });
    expect(result).toMatchObject({ ok: true, cost: 0, economyVersion: 'points-economy-c10', results: [{ kind, amount }] });
    expect(conn.query.mock.calls.some(([sql]) => String(sql).includes('lottery_paid_pity_progress ='))).toBe(false);
    if (kind === 'ai_pack') {
      expect(mocks.creditAiBonusTokens).toHaveBeenCalledWith(conn, expect.objectContaining({
        amountTokens: amount, sourceType: 'lottery_free', policyVersion: 'points-economy-c10',
      }));
    } else {
      expect(conn.query.mock.calls.find(([sql]) => String(sql).includes('SET points = points +'))?.[1][0]).toBe(amount);
      expect(mocks.creditAiBonusTokens).not.toHaveBeenCalled();
    }
    expect(conn.commit).toHaveBeenCalledOnce();
  });

  it('状态接口公示当前免费奖池，与发放共用同一目录', async () => {
    vi.stubEnv('POINTS_ECONOMY_C10_ENABLED', 'true');
    const status = await getLotteryStatus('visitor');
    expect(status).toMatchObject({ economyVersion: 'points-economy-c10', free: { poolVersion: 'c10-free-v1', countsPaidPity: false } });
    expect(status.free.pool.map(({ amount, normalRate }) => [amount, normalRate])).toEqual([
      [3, 65], [5, 23], [20, 2], [20000, 8], [50000, 2],
    ]);
    expect(status.free.pool.every(({ pityRate }) => pityRate === 0)).toBe(true);
  });
});

describe('C4 免费与付费奖池隔离', () => {
  it('完整 C4 协议拒绝非法抽奖模式和次数，且不会取得数据库连接', async () => {
    const protocol = {
      clientRequestId: 'c4-invalid-draw-request',
      economyVersion: 'points-economy-c4',
      expectedCost: 170,
    };
    await expect(drawLottery('u1', { ...protocol, mode: 'invalid', times: 1 })).rejects.toMatchObject({
      code: 'INVALID_DRAW_MODE',
      status: 400,
    });
    await expect(drawLottery('u1', { ...protocol, mode: 'paid', times: 2 })).rejects.toMatchObject({
      code: 'INVALID_DRAW_TIMES',
      status: 400,
    });
    await expect(drawLottery('u1', { ...protocol, mode: 'paid', free: true, times: 1 })).rejects.toMatchObject({
      code: 'INVALID_DRAW_MODE',
      status: 400,
    });
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });

  it('免费抽只发积分或 AI，且不推进付费保底', async () => {
    const conn = mockConnection({ paidPity: 9 });
    const result = await drawLottery(
      'u1',
      c4Request({
        mode: 'free',
        calendar: { dayKey: '20260813', timezone: 'Asia/Shanghai' },
        randomIntFn: () => 999,
      }),
    );
    expect(result).toMatchObject({ ok: true, mode: 'free' });
    expect(result).not.toHaveProperty('pityProgressBefore');
    expect(result).not.toHaveProperty('pityProgressAfter');
    expect(['points', 'ai_pack']).toContain(result.results[0].kind);
    expect(String(conn.query.mock.calls.find(([sql]) => String(sql).includes('FROM user_growth'))?.[0])).not.toContain(
      'lottery_paid_pity_progress',
    );
    expect(conn.query.mock.calls.some(([sql]) => String(sql).includes('lottery_paid_pity_progress ='))).toBe(false);
    expect(
      conn.query.mock.calls.some(
        ([sql, params]) => String(sql).includes('INSERT INTO points_log') && params?.includes('lottery_free_asset'),
      ),
    ).toBe(true);
    expect(
      conn.query.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('INSERT INTO points_log') &&
          params?.includes(JSON.stringify({ assetType: 'ai_tokens', assetAmount: 200_000 })),
      ),
    ).toBe(true);
    expect(mocks.creditAiBonusTokens).toHaveBeenCalledWith(
      conn,
      expect.objectContaining({
        userId: 'u1',
        amountTokens: 200_000,
        sourceType: 'lottery_free',
        policyVersion: 'points-economy-c4',
      }),
    );
  });

  it('付费第十抽只从稀有池取奖并把保底归零', async () => {
    mockConnection({ paidPity: 9 });
    const result = await drawLottery('u1', c4Request({ mode: 'paid', times: 1, randomIntFn: () => 0 }));
    expect(result).toMatchObject({
      ok: true,
      mode: 'paid',
      cost: 170,
      pityTriggered: true,
      pityHitIndexes: [1],
      pityProgressBefore: 9,
      pityProgressAfter: 0,
    });
    expect(result.results[0]).toMatchObject({ kind: 'card', guaranteed: true });
  });

  it('十连从 9/10 开始只触发一次保底，结束仍为 9/10', async () => {
    mockConnection({ paidPity: 9 });
    const result = await drawLottery('u1', c4Request({ mode: 'paid', times: 10, randomIntFn: () => 0 }));
    expect(result).toMatchObject({ pityHitIndexes: [1], pityProgressAfter: 9, nextPityIn: 1 });
  });

  it('抽中补签卡直接发卡，不转换为积分', async () => {
    const conn = mockConnection({ paidPity: 9 });
    const result = await drawLottery('u1', c4Request({ mode: 'paid', times: 1, randomIntFn: () => 0 }));
    expect(result.results[0]).toMatchObject({ kind: 'card', amount: 1 });
    expect(result.results[0].compensated).not.toBe(true);
    expect(mocks.grantItem).toHaveBeenCalledWith(conn, 'u1', 'makeup_card', 1, {
      sourceType: 'lottery_paid', sourceRef: '41:1',
    });
    expect(conn.query.mock.calls.some(([, params]) => params?.includes('lottery_paid_compensation'))).toBe(false);
  });

  it('发卡失败时回滚整次抽奖，不产生成功收据', async () => {
    const conn = mockConnection({ paidPity: 9 });
    mocks.grantItem.mockResolvedValueOnce({ ok: false, qty: 0 });
    await expect(drawLottery('u1', c4Request({ mode: 'paid', times: 1, randomIntFn: () => 0 }))).rejects.toThrow(
      'MAKEUP_CARD_GRANT_FAILED',
    );
    expect(conn.rollback).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('状态接口返回分组奖池，免费次数上限为 3 且明确不计保底', async () => {
    mocks.poolQuery.mockResolvedValueOnce([
      [
        {
          points: 5000,
          exp: 0,
          lottery_count: 99,
          lottery_paid_count: 10,
          lottery_paid_pity_progress: 4,
          lottery_free_day: null,
          lottery_free_used: 0,
        },
      ],
    ]);
    mocks.levelForExp.mockReturnValueOnce(15);
    const status = await getLotteryStatus('u1', { calendar: { dayKey: '20260813', timezone: 'Asia/Singapore' } });
    expect(status).toMatchObject({
      economyVersion: 'points-economy-c4',
      free: { daily: 3, remaining: 3, countsPaidPity: false },
      paid: { singleCost: 170, tenCost: 1600, pityProgress: 4, toPity: 6, overflowPolicy: null },
    });
    expect(new Set(status.free.pool.map((item) => item.kind))).toEqual(new Set(['points', 'ai_pack']));
    expect(status.free.pool.every((item) => item.pityRate === 0)).toBe(true);
  });

  it('C3 灰度兼容状态明确免费抽共享保底概率', async () => {
    process.env.POINTS_ECONOMY_C4_ENABLED = 'false';
    mocks.poolQuery.mockResolvedValueOnce([
      [
        {
          points: 500,
          exp: 0,
          lottery_count: 9,
          lottery_paid_count: 0,
          lottery_paid_pity_progress: 0,
          lottery_free_day: null,
          lottery_free_used: 0,
        },
      ],
    ]);
    mocks.levelForExp.mockReturnValueOnce(10);

    const status = await getLotteryStatus('u1', { calendar: { dayKey: '20260813', timezone: 'Asia/Singapore' } });

    expect(status).toMatchObject({
      economyVersion: 'points-economy-c3',
      free: { countsPaidPity: true },
      paid: { toPity: 1 },
    });
    expect(status.free.pool.filter((item) => item.rare).every((item) => item.pityRate > 0)).toBe(true);
  });
});

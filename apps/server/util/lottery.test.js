import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  poolQuery: vi.fn(),
  grantItem: vi.fn(),
  levelForExp: vi.fn(() => 1),
}));

vi.mock('../db/index.js', () => ({
  default: {
    getConnection: mocks.getConnection,
    query: mocks.poolQuery,
  },
}));

vi.mock('./growth.js', () => ({
  levelForExp: mocks.levelForExp,
}));

vi.mock('./items.js', () => ({
  grantItem: mocks.grantItem,
}));

import { drawLottery, getLotteryStatus } from './lottery.js';

function mockGrowthConnection(lotteryCount) {
  const conn = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      if (sql.includes('FROM user_growth') && sql.includes('FOR UPDATE')) {
        return [
          [
            {
              points: 5_000,
              exp: 0,
              lottery_count: lotteryCount,
              lottery_free_day: null,
              lottery_free_used: 0,
            },
          ],
        ];
      }
      return [{ affectedRows: 1 }];
    }),
  };
  mocks.getConnection.mockResolvedValue(conn);
  return conn;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.poolQuery.mockResolvedValue([[{ points: 4_200 }]]);
  mocks.grantItem.mockResolvedValue({ ok: true, qty: 1, overflowQty: 0 });
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('积分抽奖保底反馈', () => {
  it('从 4/10 开始十连时标记第 6 抽触发保底，并返回下一轮 4/10', async () => {
    const conn = mockGrowthConnection(4);

    const result = await drawLottery('user-1', { times: 10 });

    expect(result).toMatchObject({
      ok: true,
      pityTriggered: true,
      pityHitIndexes: [6],
      pityProgressBefore: 4,
      pityProgressAfter: 4,
      nextPityIn: 6,
    });
    expect(result.results).toHaveLength(10);
    expect(result.results.filter((prize) => prize.guaranteed)).toHaveLength(1);
    expect(result.results[5]).toMatchObject({ id: 'card', rare: true, guaranteed: true });
    expect(conn.commit).toHaveBeenCalledOnce();
    expect(conn.release).toHaveBeenCalledOnce();
  });

  it('未跨过第 10 抽时明确返回未触发，普通结果不带保底命中', async () => {
    mockGrowthConnection(4);

    const result = await drawLottery('user-1', { times: 1 });

    expect(result).toMatchObject({
      ok: true,
      pityTriggered: false,
      pityHitIndexes: [],
      pityProgressBefore: 4,
      pityProgressAfter: 5,
      nextPityIn: 5,
    });
    expect(result.results[0]).toMatchObject({ id: 'p10', rare: false, guaranteed: false });
  });

  it('第 10 抽单抽命中保底后从新一轮 0/10 开始累计', async () => {
    mockGrowthConnection(9);

    const result = await drawLottery('user-1', { times: 1 });

    expect(result).toMatchObject({
      ok: true,
      pityTriggered: true,
      pityHitIndexes: [1],
      pityProgressBefore: 9,
      pityProgressAfter: 0,
      nextPityIn: 10,
    });
    expect(result.results[0]).toMatchObject({ rare: true, guaranteed: true });
  });

  it('补签卡库存已满时明确转换为 70 积分补偿', async () => {
    const conn = mockGrowthConnection(9);
    mocks.grantItem.mockResolvedValueOnce({ ok: true, qty: 0, overflowQty: 1 });

    const result = await drawLottery('user-1', { times: 1 });

    expect(result.results[0]).toMatchObject({
      kind: 'points',
      amount: 70,
      compensated: true,
      compensationReason: 'makeup_card_full',
      originalReward: { kind: 'card', amount: 1 },
      guaranteed: true,
    });
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO points_log'),
      ['user-1', 70, 'lottery_compensation', 'makeup_card_full'],
    );
  });

  it('免费抽也累计全局次数并可触发第十抽保底', async () => {
    const conn = mockGrowthConnection(9);
    mocks.levelForExp.mockReturnValueOnce(3);

    const result = await drawLottery('user-1', {
      free: true,
      calendar: { dayKey: '20260812', timezone: 'Asia/Shanghai' },
    });

    expect(result).toMatchObject({
      ok: true,
      free: true,
      cost: 0,
      pityTriggered: true,
      pityHitIndexes: [1],
      pityProgressAfter: 0,
    });
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('lottery_free_day = ?'),
      ['20260812', 1, 'user-1'],
    );
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('lottery_count = lottery_count + ?'), [1, 'user-1']);
  });

  it('抽奖状态按账号日期重置免费次数并公示两套概率', async () => {
    mocks.poolQuery.mockResolvedValueOnce([
      [
        {
          points: 120,
          exp: 500,
          lottery_count: 9,
          lottery_free_day: '20260811',
          lottery_free_used: 1,
        },
      ],
    ]);
    mocks.levelForExp.mockReturnValueOnce(3);

    const result = await getLotteryStatus('user-1', {
      calendar: { dayKey: '20260812', timezone: 'Asia/Singapore' },
    });

    expect(result).toMatchObject({
      freeDaily: 1,
      freeRemaining: 1,
      toPity: 1,
      pityCountsFreeDraws: true,
      timezone: 'Asia/Singapore',
    });
    expect(result.pool.every((prize) => 'normalRate' in prize && 'pityRate' in prize)).toBe(true);
  });
});

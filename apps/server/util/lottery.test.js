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

import { drawLottery } from './lottery.js';

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
});

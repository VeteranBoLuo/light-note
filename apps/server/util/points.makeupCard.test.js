import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { getConnection: mocks.getConnection } }));
vi.mock('./aiBonusWallet.js', () => ({ creditAiBonusTokens: vi.fn() }));
const { buyItem } = await import('./points.js');
const { grantItem } = await import('./items.js');
const { assertPointsEconomyActivationReady } = await import('./pointsEconomyOperations.js');

const args = { clientRequestId: 'makeup-card-request-001', economyVersion: 'points-economy-c8', expectedCost: 600 };

// 模拟 SQL 结果与事务回滚；不替代真实数据库的并发锁验证。
function database({ cards = 0, points = 1000, grantFails = false } = {}) {
  const state = { cards, points, receipts: new Map(), logs: 0 };
  let before;
  const connection = {
    beginTransaction: vi.fn(async () => {
      before = { ...state, receipts: new Map(state.receipts) };
    }),
    commit: vi.fn(),
    rollback: vi.fn(async () => Object.assign(state, before)),
    release: vi.fn(),
    query: vi.fn(async (sql, params = []) => {
      if (sql.includes('SELECT id, operation_type')) return [[state.receipts.get(params[1])].filter(Boolean)];
      if (sql.includes('INSERT IGNORE INTO points_economy_operations')) {
        state.receipts.set(params[1], {
          id: state.receipts.size + 1,
          operation_type: params[2],
          operation_hash: params[4],
          status: 'pending',
        });
        return [{ affectedRows: 1, insertId: state.receipts.size }];
      }
      if (sql.includes('SELECT points, level, streak_protect_cards'))
        return [[{ points: state.points, level: 1, streak_protect_cards: state.cards }]];
      if (sql.includes('SELECT streak_protect_cards AS qty')) return [grantFails ? [] : [{ qty: state.cards }]];
      if (sql.includes('UPDATE user_growth SET points = points -')) state.points -= params[0];
      if (sql.includes('UPDATE user_growth SET streak_protect_cards = streak_protect_cards +'))
        state.cards += params[0];
      if (sql.includes('INSERT INTO points_log')) state.logs++;
      if (sql.includes('SELECT points, storage_bonus_mb, ai_bonus_tokens'))
        return [[{ points: state.points, streak_protect_cards: state.cards }]];
      if (sql.includes("SET status = 'succeeded'")) {
        const receipt = [...state.receipts.values()].find((r) => r.id === params[9]);
        Object.assign(receipt, { status: 'succeeded', result_json: JSON.parse(params[0]), granted: params[6] });
      }
      return [{ affectedRows: 1 }];
    }),
  };
  mocks.getConnection.mockResolvedValue(connection);
  return { state, connection };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('POINTS_ECONOMY_C8_ENABLED', 'true');
});
afterEach(() => vi.unstubAllEnvs());

describe('补签卡积分兑换', () => {
  it.each([2, 3, 99])('Lv.1 已有 %i 张仍可用 600 积分兑换，并记录实际到账数', async (cards) => {
    const { state, connection } = database({ cards, points: 600 });
    await expect(buyItem('u1', 'makeup_card', args)).resolves.toMatchObject({
      ok: true,
      cost: 600,
      points: 0,
      purchaseLimit: null,
      effect: { type: 'makeup_card', amount: 1 },
      assets: { protectCards: cards + 1 },
    });
    expect(state.cards).toBe(cards + 1);
    expect([...state.receipts.values()][0].granted).toBe(1);
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it.each([{ cards: 0, points: 599, reason: 'insufficient' }])(
    '拒绝 $reason，积分、卡数、流水和收据不变',
    async ({ cards, points, reason }) => {
      const { state, connection } = database({ cards, points });
      await expect(buyItem('u1', 'makeup_card', args)).resolves.toMatchObject({ ok: false, reason });
      expect(state).toEqual({ cards, points, receipts: new Map(), logs: 0 });
      expect(connection.commit).not.toHaveBeenCalled();
    },
  );

  it('响应丢失重试只回放，超过旧上限后仍不重复扣款发卡', async () => {
    const { state } = database({ cards: 3 });
    const original = await buyItem('u1', 'makeup_card', args);
    await expect(buyItem('u1', 'makeup_card', args)).resolves.toEqual({ ...original, idempotent: true });
    expect(state).toMatchObject({ cards: 4, points: 400, logs: 1 });
  });

  it('不同请求允许连续兑换，超过旧库存上限仍正常到账', async () => {
    const { state } = database({ cards: 2, points: 2000 });
    await buyItem('u1', 'makeup_card', args);
    await expect(
      buyItem('u1', 'makeup_card', { ...args, clientRequestId: 'makeup-card-request-002' }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      buyItem('u1', 'makeup_card', { ...args, clientRequestId: 'makeup-card-request-003' }),
    ).resolves.toMatchObject({ ok: true });
    expect(state).toMatchObject({ cards: 5, points: 200, logs: 3 });
  });

  it.each([{ economyVersion: 'points-economy-c7', expectedCost: 300 }, { expectedCost: 300 }])(
    '过期目录或价格拒绝新扣款',
    async (override) => {
      const { state } = database();
      await expect(buyItem('u1', 'makeup_card', { ...args, ...override })).rejects.toMatchObject({
        code: 'ECONOMY_CATALOG_CHANGED',
      });
      expect(state).toMatchObject({ cards: 0, points: 1000, logs: 0 });
    },
  );

  it('C7 成功收据在 C8 启用后按原价回放，绝不再次扣款发卡', async () => {
    const { state } = database();
    vi.stubEnv('POINTS_ECONOMY_C8_ENABLED', 'false');
    vi.stubEnv('POINTS_ECONOMY_C7_ENABLED', 'true');
    const oldArgs = { ...args, economyVersion: 'points-economy-c7', expectedCost: 300 };
    const original = await buyItem('u1', 'makeup_card', oldArgs);
    expect(original).toMatchObject({ ok: true, cost: 300 });
    vi.stubEnv('POINTS_ECONOMY_C8_ENABLED', 'true');
    await expect(buyItem('u1', 'makeup_card', oldArgs)).resolves.toEqual({ ...original, idempotent: true });
    expect(state).toMatchObject({ cards: 1, points: 700, logs: 1 });
  });

  it('发卡异常时回滚扣分与流水', async () => {
    const { state, connection } = database({ grantFails: true });
    await expect(buyItem('u1', 'makeup_card', args)).rejects.toThrow('MAKEUP_CARD_GRANT_FAILED');
    expect(state).toEqual({ cards: 0, points: 1000, receipts: new Map(), logs: 0 });
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it.each(['points-economy-c6', 'points-economy-c7', 'points-economy-c8'])(
    '%s 沿用既有迁移基线',
    async (economyVersion) => {
      const db = { query: vi.fn().mockResolvedValue([[{ ready: 1 }]]) };
      await expect(assertPointsEconomyActivationReady({ db, runtime: { economyVersion } })).resolves.toBe(true);
      expect(db.query).toHaveBeenCalledTimes(2);
    },
  );
});

describe('赠卡、抽奖共用不限量库存', () => {
  it.each([
    [2, 1],
    [3, 1],
    [99, 5],
  ])('已有 %i 张时仍全量到账 %i 张', async (cards, qty) => {
    const { state, connection } = database({ cards });
    await expect(grantItem(connection, 'u1', 'makeup_card', qty)).resolves.toMatchObject({
      ok: true,
      qty,
      overflowQty: 0,
    });
    expect(state.cards).toBe(cards + qty);
  });

  it.each([0, -1, Infinity, NaN])('无效数量 %s 不增加库存', async (qty) => {
    const { state, connection } = database({ cards: 3 });
    await expect(grantItem(connection, 'u1', 'makeup_card', qty)).resolves.toMatchObject({
      ok: false,
      reason: 'bad_qty',
    });
    expect(state.cards).toBe(3);
    expect(connection.query).not.toHaveBeenCalled();
  });
});

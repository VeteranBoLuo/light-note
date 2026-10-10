import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAKEUP_CARD_MAX_INVENTORY } from '@lightnote/shared';

const mocks = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { getConnection: mocks.getConnection } }));
vi.mock('./aiBonusWallet.js', () => ({ creditAiBonusTokens: vi.fn() }));
const { buyItem } = await import('./points.js');
const { grantItem } = await import('./items.js');
const { assertPointsEconomyActivationReady } = await import('./pointsEconomyOperations.js');

const args = { clientRequestId: 'makeup-card-request-001', economyVersion: 'points-economy-c7', expectedCost: 300 };

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
  vi.stubEnv('POINTS_ECONOMY_C7_ENABLED', 'true');
});
afterEach(() => vi.unstubAllEnvs());

describe('补签卡积分兑换', () => {
  it('Lv.1 可用 300 积分兑换，库存从 2 到 3，并记录实际到账数', async () => {
    const { state, connection } = database({ cards: 2, points: 300 });
    await expect(buyItem('u1', 'makeup_card', args)).resolves.toMatchObject({
      ok: true,
      cost: 300,
      points: 0,
      purchaseLimit: null,
      effect: { type: 'makeup_card', amount: 1 },
      assets: { protectCards: 3 },
    });
    expect(state.cards).toBe(MAKEUP_CARD_MAX_INVENTORY);
    expect([...state.receipts.values()][0].granted).toBe(1);
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it.each([
    { cards: 3, points: 1000, reason: 'card_max' },
    { cards: 0, points: 299, reason: 'insufficient' },
  ])('拒绝 $reason，积分、卡数、流水和收据不变', async ({ cards, points, reason }) => {
    const { state, connection } = database({ cards, points });
    await expect(buyItem('u1', 'makeup_card', args)).resolves.toMatchObject({ ok: false, reason });
    expect(state).toEqual({ cards, points, receipts: new Map(), logs: 0 });
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('响应丢失重试只回放，满仓后仍可恢复原成功结果', async () => {
    const { state } = database({ cards: 2 });
    const original = await buyItem('u1', 'makeup_card', args);
    await expect(buyItem('u1', 'makeup_card', args)).resolves.toEqual({ ...original, idempotent: true });
    expect(state).toMatchObject({ cards: 3, points: 700, logs: 1 });
  });

  it('不同请求允许再次兑换，但超过库存上限不扣款', async () => {
    const { state } = database({ cards: 1 });
    await buyItem('u1', 'makeup_card', args);
    await expect(
      buyItem('u1', 'makeup_card', { ...args, clientRequestId: 'makeup-card-request-002' }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      buyItem('u1', 'makeup_card', { ...args, clientRequestId: 'makeup-card-request-003' }),
    ).resolves.toMatchObject({ ok: false, reason: 'card_max' });
    expect(state).toMatchObject({ cards: 3, points: 400, logs: 2 });
  });

  it.each([{ economyVersion: 'points-economy-c6' }, { expectedCost: 120 }])(
    '过期目录或价格拒绝新扣款',
    async (override) => {
      const { state } = database();
      await expect(buyItem('u1', 'makeup_card', { ...args, ...override })).rejects.toMatchObject({
        code: 'ECONOMY_CATALOG_CHANGED',
      });
      expect(state).toMatchObject({ cards: 0, points: 1000, logs: 0 });
    },
  );

  it('发卡异常时回滚扣分与流水', async () => {
    const { state, connection } = database({ grantFails: true });
    await expect(buyItem('u1', 'makeup_card', args)).rejects.toThrow('MAKEUP_CARD_GRANT_FAILED');
    expect(state).toEqual({ cards: 0, points: 1000, receipts: new Map(), logs: 0 });
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it.each(['points-economy-c6', 'points-economy-c7'])('%s 沿用既有迁移基线', async (economyVersion) => {
    const db = { query: vi.fn().mockResolvedValue([[{ ready: 1 }]]) };
    await expect(assertPointsEconomyActivationReady({ db, runtime: { economyVersion } })).resolves.toBe(true);
    expect(db.query).toHaveBeenCalledTimes(2);
  });
});

describe('赠卡、抽奖共用库存上限', () => {
  it.each([
    [2, 1, 0],
    [3, 0, 1],
    [5, 0, 1],
  ])('已有 %i 张时到账 %i 张、溢出 %i 张，旧库存不追回', async (cards, qty, overflowQty) => {
    const { state, connection } = database({ cards });
    await expect(grantItem(connection, 'u1', 'makeup_card', 1)).resolves.toMatchObject({ ok: true, qty, overflowQty });
    expect(state.cards).toBe(cards + qty);
  });
});

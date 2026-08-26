import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  grantItem: vi.fn(),
  creditAiBonusTokens: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.query, getConnection: mocks.getConnection } }));
vi.mock('./items.js', () => ({ grantItem: mocks.grantItem }));
vi.mock('./aiBonusWallet.js', () => ({ creditAiBonusTokens: mocks.creditAiBonusTokens }));

const originalC4Flag = process.env.POINTS_ECONOMY_C4_ENABLED;
const originalC5Flag = process.env.POINTS_ECONOMY_C5_ENABLED;
process.env.POINTS_ECONOMY_C4_ENABLED = 'true';
process.env.POINTS_ECONOMY_C5_ENABLED = 'true';

const { buyItem, getClaimedLimitedShopItemIds } = await import('./points.js');

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function purchaseConnection({ claimed = false, claimInsertAffectedRows = 1, points = 6000 } = {}) {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      const statement = String(sql);
      if (statement.includes('FROM points_economy_operations')) return [[]];
      if (statement.includes('INSERT IGNORE INTO points_economy_operations')) {
        return [{ affectedRows: 1, insertId: 71 }];
      }
      if (statement.includes('SELECT points, level, streak_protect_cards')) {
        return [[{ points, level: 8, streak_protect_cards: 0 }]];
      }
      if (statement.includes('SELECT 1 FROM points_shop_item_claims')) {
        return [claimed ? [{ exists: 1 }] : []];
      }
      if (statement.includes('INSERT IGNORE INTO points_shop_item_claims')) {
        return [{ affectedRows: claimInsertAffectedRows }];
      }
      if (statement.includes('SELECT points, storage_bonus_mb, ai_bonus_tokens')) {
        return [[{ points: points - 500, storage_bonus_mb: 128, ai_bonus_tokens: 0 }]];
      }
      return [{ affectedRows: 1 }];
    }),
  };
  mocks.getConnection.mockResolvedValue(connection);
  return connection;
}

afterAll(() => {
  restoreEnv('POINTS_ECONOMY_C4_ENABLED', originalC4Flag);
  restoreEnv('POINTS_ECONOMY_C5_ENABLED', originalC5Flag);
});

describe('积分永久空间每档一次', () => {
  beforeEach(() => vi.clearAllMocks());

  it('在同一事务内先锁定领取事实，再扣分并增加空间', async () => {
    const connection = purchaseConnection();

    await expect(
      buyItem('user-1', 'storage_128', {
        clientRequestId: 'c5-storage-128-request-0001',
        economyVersion: 'points-economy-c5',
        expectedCost: 500,
      }),
    ).resolves.toMatchObject({
      ok: true,
      itemId: 'storage_128',
      purchaseLimit: 1,
      effect: { type: 'storage', amountMb: 128 },
    });

    const claimCall = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT IGNORE INTO points_shop_item_claims'),
    );
    expect(claimCall?.[1]).toEqual(['user-1', 'storage_128', 'points-economy-c5', 71]);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('历史或既有领取事实命中后不扣分、不重复扩容', async () => {
    const connection = purchaseConnection({ claimed: true });

    await expect(
      buyItem('user-1', 'storage_128', {
        clientRequestId: 'c5-storage-128-request-0002',
        economyVersion: 'points-economy-c5',
        expectedCost: 500,
      }),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'purchase_limit',
      code: 'POINTS_ITEM_PURCHASE_LIMIT_REACHED',
    });

    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE user_growth SET points = points -')),
    ).toBe(false);
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO points_log'))).toBe(false);
  });

  it('唯一键竞争失败时回滚整个事务，不让并发请求重复到账', async () => {
    const connection = purchaseConnection({ claimInsertAffectedRows: 0 });

    await expect(
      buyItem('user-1', 'storage_128', {
        clientRequestId: 'c5-storage-128-request-0003',
        economyVersion: 'points-economy-c5',
        expectedCost: 500,
      }),
    ).resolves.toMatchObject({ ok: false, reason: 'purchase_limit' });

    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('storage_bonus_mb +'))).toBe(false);
  });

  it('AI 永久余额包继续允许重复兑换，不占空间领取事实', async () => {
    const connection = purchaseConnection({ points: 1000 });

    await expect(
      buyItem('user-1', 'ai_pack_small', {
        clientRequestId: 'c5-ai-small-request-0001',
        economyVersion: 'points-economy-c5',
        expectedCost: 240,
      }),
    ).resolves.toMatchObject({ ok: true, purchaseLimit: null });

    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('points_shop_item_claims'))).toBe(false);
  });

  it('一次读取当前账号全部有限次领取事实，不逐商品查询', async () => {
    mocks.query.mockResolvedValueOnce([[{ itemId: 'storage_128' }, { itemId: 'storage_512' }]]);

    await expect(getClaimedLimitedShopItemIds('user-1')).resolves.toEqual(['storage_128', 'storage_512']);
    expect(mocks.query).toHaveBeenCalledOnce();
  });
});

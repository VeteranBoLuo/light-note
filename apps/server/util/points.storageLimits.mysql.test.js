import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ db: null }));
vi.mock('../db/index.js', () => ({ default: {
  query: (...args) => fixture.db.query(...args),
  getConnection: (...args) => fixture.db.getConnection(...args),
} }));

const { buyItem, ensurePointsSchema, getLimitedShopPurchaseCounts } = await import('./points.js');
const { ensureAiBonusWalletSchema } = await import('./aiBonusWalletSchema.js');
const { assertPointsEconomyActivationReady } = await import('./pointsEconomyOperations.js');
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `points_shop_${randomUUID().replaceAll('-', '')}`;
const request = (expectedCost, economyVersion = 'points-economy-c12') => ({
  clientRequestId: randomUUID(), economyVersion, expectedCost,
});
let admin;

describe.skipIf(!socketPath)('C12 积分兑换事务', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema}`);
    fixture.db = mysql.createPool({ socketPath, user: 'root', database: schema, multipleStatements: true });
    await fixture.db.query(`CREATE TABLE user_growth (
      user_id VARCHAR(64) PRIMARY KEY, points INT DEFAULT 0, level INT DEFAULT 1, streak_protect_cards INT DEFAULT 0,
      storage_bonus_mb INT DEFAULT 0, ai_bonus_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0
    ) ENGINE=InnoDB`);
    await ensurePointsSchema();
    await ensureAiBonusWalletSchema();
    await fixture.db.query('ALTER TABLE points_shop_item_claims DROP COLUMN purchase_count');
    await fixture.db.query(`INSERT INTO user_growth (user_id, points, storage_bonus_mb) VALUES ('history', 13000, 2048);
      INSERT INTO points_shop_item_claims (user_id, item_id, claim_source) VALUES ('history', 'storage_2g', 'ledger_backfill');
      INSERT INTO points_economy_migration_state (migration_key)
        VALUES ('points-economy-c4-paid-pity-v1'), ('points-economy-c5-storage-limits-v1');`);
    const migration = await readFile(new URL('../migrations/20261125_points_economy_c12_shop_purchase_count.sql', import.meta.url), 'utf8');
    await fixture.db.query(migration);
    await fixture.db.query(migration);
  });
  beforeEach(() => vi.stubEnv('POINTS_ECONOMY_C12_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await fixture.db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${schema}`);
      await admin.end();
    }
  });

  async function account(userId, points = 20_000) {
    await fixture.db.query('INSERT INTO user_growth (user_id, points) VALUES (?, ?)', [userId, points]);
  }
  async function balance(userId) {
    const [[row]] = await fixture.db.query('SELECT points, storage_bonus_mb, ai_bonus_tokens FROM user_growth WHERE user_id = ?', [userId]);
    return row;
  }

  it('历史领取原样计为首次，同档不存在新的首购资格', async () => {
    await expect(assertPointsEconomyActivationReady()).resolves.toBe(true);
    expect(await getLimitedShopPurchaseCounts('history')).toEqual(new Map([['storage_2g', 1]]));
    await expect(buyItem('history', 'storage_2g', request(5200))).rejects.toMatchObject({
      code: 'ECONOMY_CATALOG_CHANGED', data: { expectedCost: 6500, refresh: true },
    });
    expect(await balance('history')).toMatchObject({ points: 13000, storage_bonus_mb: 2048 });
    expect(await buyItem('history', 'storage_2g', request(6500))).toMatchObject({
      ok: true, cost: 6500, purchaseCount: 2, effect: { type: 'storage', amountMb: 2048 },
    });
    const [[claim]] = await fixture.db.query("SELECT purchase_count, claim_source FROM points_shop_item_claims WHERE user_id = 'history'");
    expect(claim).toMatchObject({ purchase_count: 2, claim_source: 'ledger_backfill' });
    expect(await balance('history')).toMatchObject({ points: 6500, storage_bonus_mb: 4096 });
  });

  it('不同请求并发只能按确认价买到当前一次，同请求与跨版本重放保留旧收据', async () => {
    await account('race');
    const firstQuote = request(5200);
    const firstAttempts = await Promise.all([
      buyItem('race', 'storage_2g', firstQuote), buyItem('race', 'storage_2g', firstQuote),
    ]);
    expect(firstAttempts.every((result) => result.ok)).toBe(true);
    expect(firstAttempts.filter((result) => result.idempotent)).toHaveLength(1);
    const secondAttempts = await Promise.all([
      buyItem('race', 'storage_2g', request(6500)), buyItem('race', 'storage_2g', request(6500)),
    ]);
    expect(secondAttempts.filter((result) => result.ok)).toHaveLength(1);
    expect(secondAttempts.find((result) => result.ok)).toMatchObject({ purchaseCount: 2, cost: 6500 });
    expect(secondAttempts.find((result) => !result.ok)).toMatchObject({ reason: 'purchase_limit' });
    expect(await balance('race')).toMatchObject({ points: 8300, storage_bonus_mb: 4096 });
    vi.stubEnv('POINTS_ECONOMY_C12_ENABLED', 'false');
    vi.stubEnv('POINTS_ECONOMY_C11_ENABLED', 'true');
    expect(await buyItem('race', 'storage_2g', firstQuote)).toMatchObject({ ok: true, idempotent: true, purchaseCount: 1, cost: 5200 });
    expect(await buyItem('race', 'storage_2g', request(5200, 'points-economy-c11'))).toMatchObject({ reason: 'purchase_limit' });
    const [[receiptCount]] = await fixture.db.query("SELECT COUNT(*) AS total FROM points_economy_operations WHERE user_id = 'race'");
    expect(receiptCount.total).toBe(2);
  });

  it('余额不足不消耗第二次资格，小包与 AI 入门包继续限兑一次', async () => {
    await account('limits', 12_000);
    for (const [item, cost] of [['storage_128', 500], ['storage_512', 1600], ['ai_pack_starter', 60]]) {
      expect(await buyItem('limits', item, request(cost))).toMatchObject({ ok: true, cost });
      expect(await buyItem('limits', item, request(cost))).toMatchObject({ reason: 'purchase_limit' });
    }
    await buyItem('limits', 'storage_2g', request(5200));
    expect(await buyItem('limits', 'storage_2g', request(6500))).toMatchObject({ reason: 'insufficient' });
    expect((await getLimitedShopPurchaseCounts('limits')).get('storage_2g')).toBe(1);
    expect(await balance('limits')).toMatchObject({ points: 4640, storage_bonus_mb: 2688, ai_bonus_tokens: 50_000 });
  });

  it.each([['ai_pack_small', 240, 200_000], ['ai_pack', 420, 400_000]])('常规 AI 档 %s 可重复兑换并写入新版额度', async (item, cost, amountTokens) => {
    await account(item);
    for (let index = 0; index < 2; index++) {
      expect(await buyItem(item, item, request(cost))).toMatchObject({ ok: true, cost, effect: { type: 'ai_pack', amountTokens } });
    }
    expect(await balance(item)).toMatchObject({ ai_bonus_tokens: 2 * amountTokens, points: 20_000 - 2 * cost });
  });
});

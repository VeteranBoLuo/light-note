import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../db/index.js', () => ({
  default: {
    query: (...args) => state.db.query(...args),
    getConnection: () => state.db.getConnection(),
  },
}));
import { getInventoryAcquisitions } from './inventoryAcquisitionService.js';
import { grantItem } from '../items.js';
import { acquisitionMeta } from '../assetAcquisition.js';
import { AI_BONUS_WALLET_TABLE_SQL } from '../aiBonusWalletSchema.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `acquisitions_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!socketPath)('背包各渠道获得记录与发放原子性 · 隔离 MySQL', () => {
  let admin,
    created = false;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema}`);
    created = true;
    state.db = mysql.createPool({ socketPath, user: 'root', database: schema });
    await state.db.query(`CREATE TABLE points_log (
      id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id VARCHAR(64), delta INT, reason VARCHAR(32), ref VARCHAR(64), meta JSON,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_owner_time(user_id,create_time,id)) ENGINE=InnoDB`);
    await state.db.query(`CREATE TABLE user_growth (
      user_id VARCHAR(64) PRIMARY KEY, ai_bonus_tokens BIGINT NOT NULL DEFAULT 0,
      streak_protect_cards INT NOT NULL DEFAULT 0) ENGINE=InnoDB`);
    await state.db.query(`CREATE TABLE user_item (user_id VARCHAR(64), item_id VARCHAR(64), qty INT,
      PRIMARY KEY(user_id,item_id)) ENGINE=InnoDB`);
    for (const sql of AI_BONUS_WALLET_TABLE_SQL) await state.db.query(sql);
    await state.db.query(`CREATE TABLE points_economy_operations (
      id BIGINT PRIMARY KEY, user_id VARCHAR(64), operation_type VARCHAR(32), status VARCHAR(16), result_json JSON,
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP, KEY idx_owner_time(user_id,create_time,id)) ENGINE=InnoDB`);
    await state.db.query(`CREATE TABLE admin_operation_audit (
      id CHAR(36) PRIMARY KEY, target_type VARCHAR(64), target_id VARCHAR(64), action VARCHAR(64), outcome VARCHAR(16),
      metadata JSON, create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_target(target_type,target_id,create_time,id)) ENGINE=InnoDB`);
    await state.db.query(`CREATE TABLE support_entitlement_grants (
      id CHAR(36) PRIMARY KEY, user_id VARCHAR(64) CHARACTER SET utf8 COLLATE utf8_general_ci,
      storage_log_ref VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci, entitlement_type VARCHAR(32),
      granted_storage_mb INT, credited_at DATETIME) ENGINE=InnoDB`);
  });
  afterAll(async () => {
    await state.db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  beforeEach(async () => {
    for (const table of [
      'points_log',
      'ai_bonus_ledger',
      'ai_bonus_lots',
      'user_item',
      'user_growth',
      'points_economy_operations',
      'admin_operation_audit',
      'support_entitlement_grants',
    ]) {
      await state.db.query(`DELETE FROM ${table}`);
    }
    await state.db.query("INSERT INTO user_growth(user_id) VALUES ('owner')");
  });
  async function point(id, delta, reason, meta = null, owner = 'owner', ref = null) {
    await state.db.query(
      'INSERT INTO points_log(id,user_id,delta,reason,meta,ref,create_time) VALUES (?,?,?,?,?,?,?)',
      [id, owner, delta, reason, meta ? JSON.stringify(meta) : null, ref, '2026-10-23 10:14:00'],
    );
  }
  async function wallet(source, owner = 'owner', type = 'credit') {
    await state.db.query(
      `INSERT INTO ai_bonus_ledger
      (id,user_id,entry_type,amount_tokens,balance_after,source_type,source_ref,idempotency_key,idempotency_hash,policy_version,create_time)
      VALUES (?,?,?,100000,100000,?,'private-ref',?,?,'test','2026-10-23 10:14:00')`,
      [randomUUID(), owner, type, source, randomUUID(), randomUUID()],
    );
  }
  async function operation(id, type, receipt, owner = 'owner') {
    await state.db.query('INSERT INTO points_economy_operations VALUES (?,?,?,?,?,?)', [
      id,
      owner,
      type,
      'succeeded',
      JSON.stringify(receipt),
      '2026-10-23 10:14:00',
    ]);
  }
  async function audit(metadata, outcome = 'succeeded', owner = 'owner') {
    await state.db.query('INSERT INTO admin_operation_audit VALUES (?,?,?,?,?,?,?)', [
      randomUUID(),
      'points',
      owner,
      'growth.grant_points',
      outcome,
      JSON.stringify(metadata),
      '2026-10-23 10:14:00',
    ]);
  }
  it('按实际数量覆盖各渠道，排除预扣退回、初始化和其他账号，公共结果不含内部审计', async () => {
    await point(1, 100, 'achievement');
    await point(2, 20, 'campaign');
    await point(3, 20, 'checkin');
    await point(4, -600, 'buy');
    await point(5, 500, 'correction');
    await point(6, 90, 'admin', null, 'other');
    await point(7, 0, 'asset_grant', acquisitionMeta('card', 2, 'level_up'));
    await point(8, 0, 'storage:streak_milestone', acquisitionMeta('storage', 128, 'streak_milestone'));
    await point(9, 0, 'storage:streak_milestone'); // 没有历史数量，不从当前里程碑配置反推
    for (const source of [
      'lottery_free',
      'points_shop',
      'support_package',
      'support_campaign',
      'admin',
      'ai_usage_refund',
      'legacy_baseline',
      'legacy_reconciliation',
    ])
      await wallet(source);
    await wallet('campaign', 'other');
    await wallet('ai_usage', 'owner', 'debit');
    await audit({ cardsDelta: 3, storageMbDelta: 64, reason: 'private-note', ticketRef: 'secret-ticket' });
    await audit({ cardsDelta: 3, idempotentReplay: true });
    await audit({ cardsDelta: 90 }, 'intent');
    await audit({ cardsDelta: 90 }, 'succeeded', 'other');
    await audit({ cardsDelta: 3.5 });
    const result = await getInventoryAcquisitions('owner', { limit: 50 });
    expect(result.rows).toHaveLength(12);
    expect(new Set(result.rows.map((row) => row.source))).toEqual(
      new Set([
        'achievement',
        'campaign',
        'checkin',
        'level_up',
        'streak_milestone',
        'lottery_free',
        'shop',
        'purchase',
        'admin',
      ]),
    );
    expect(
      result.rows
        .filter((row) => row.results[0].kind === 'card')
        .map((row) => row.results[0].amount)
        .sort(),
    ).toEqual([2, 3]);
    const text = JSON.stringify(result);
    for (const privateValue of ['private-note', 'secret-ticket', 'private-ref', 'target_id', 'metadata'])
      expect(text).not.toContain(privateValue);
    const paged = [];
    let cursor = null;
    do {
      const page = await getInventoryAcquisitions('owner', { limit: 3, cursor });
      paged.push(...page.rows);
      cursor = page.nextCursor;
    } while (cursor);
    expect(paged.map((row) => row.id)).toEqual(result.rows.map((row) => row.id));
  });
  it('旧抽奖/兑换收据只补非积分资产，已写新账的收据不重复；AI 只从钱包读一次', async () => {
    await wallet('lottery_paid');
    await point(1, 20, 'lottery_paid_win');
    const results = [
      { kind: 'ai_pack', amount: 100000 },
      { kind: 'points', amount: 20 },
      { kind: 'card', amount: 1 },
      { kind: 'storage', amount: 128 },
      ...Array.from({ length: 6 }, () => ({ kind: 'points', amount: 20 })),
    ];
    await operation(10, 'lottery_paid', { ok: true, results });
    await operation(11, 'shop_buy', { ok: true, effect: { type: 'makeup_card', amount: 2 } });
    await operation(12, 'shop_buy', { ok: true, effect: { type: 'storage', amountMb: 512 } });
    await operation(13, 'lottery_paid', { ok: true, acquisitionVersion: 1, results: [{ kind: 'card', amount: 3 }] });
    await point(2, 0, 'asset_grant', acquisitionMeta('card', 3, 'lottery_paid'));
    await audit({ cardsDelta: 3, acquisitionVersion: 1 });
    await operation(14, 'lottery_paid', { ok: true, results: [{ kind: 'card', amount: -1 }] });
    await operation(15, 'shop_buy', { ok: true, effect: { type: 'makeup_card', amount: 3.5 } });
    await operation(16, 'lottery_paid', {
      ok: true,
      results: [
        { kind: 'card', amount: 1 },
        { kind: 'card', amount: 2 },
      ],
    });
    const { rows } = await getInventoryAcquisitions('owner');
    expect(rows).toHaveLength(7);
    expect(rows.filter((row) => row.results[0].kind === 'ai_pack')).toHaveLength(1);
    expect(rows.filter((row) => row.results[0].kind === 'points')).toHaveLength(1);
    expect(
      rows
        .filter((row) => row.results[0].kind === 'card')
        .map((row) => row.results[0].amount)
        .sort(),
    ).toEqual([1, 2, 3]);
  });
  it('同秒分页稳定且 BIGINT 不丢精度，资产筛选与游标绑定', async () => {
    for (const id of ['99', '100', '101', '9007199254740992', '9007199254740993']) await point(id, 10, 'achievement');
    await point('9007199254740994', 0, 'asset_grant', acquisitionMeta('card', 1, 'admin'));
    const first = await getInventoryAcquisitions('owner', { limit: 2, kind: 'points' });
    expect(first.rows.map((row) => row.id)).toEqual(['p00009007199254740993', 'p00009007199254740992']);
    const second = await getInventoryAcquisitions('owner', { limit: 2, kind: 'points', cursor: first.nextCursor });
    const third = await getInventoryAcquisitions('owner', { limit: 2, kind: 'points', cursor: second.nextCursor });
    expect([...second.rows, ...third.rows].map((row) => row.id)).toEqual([
      'p00000000000000000101',
      'p00000000000000000100',
      'p00000000000000000099',
    ]);
    expect(third.hasMore).toBe(false);
    await expect(getInventoryAcquisitions('owner', { kind: 'card', cursor: first.nextCursor })).rejects.toMatchObject({
      code: 'INVALID_ACQUISITION_QUERY',
    });
  });
  it('可追溯的旧购买空间从到账凭证读取，新日志不重复', async () => {
    await point(1, 0, 'storage:support_package', null, 'owner', 'old-order');
    await point(
      2,
      0,
      'storage:support_package',
      acquisitionMeta('storage', 512, 'support_package'),
      'owner',
      'new-order',
    );
    for (const ref of ['old-order', 'new-order'])
      await state.db.query('INSERT INTO support_entitlement_grants VALUES (?,?,?,?,?,?)', [
        randomUUID(),
        'owner',
        ref,
        'permanent',
        512,
        '2026-10-23 10:14:00',
      ]);
    const { rows } = await getInventoryAcquisitions('owner', { kind: 'storage' });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.source === 'purchase' && row.results[0].amount === 512)).toBe(true);
  });
  it('发卡与记账在同一事务，使用后仍保留获得事实；记账失败整体回滚', async () => {
    await grantItem(null, 'owner', 'makeup_card', 2, { sourceType: 'campaign', sourceRef: 'event-one' });
    await state.db.query("UPDATE user_growth SET streak_protect_cards=0 WHERE user_id='owner'");
    expect((await getInventoryAcquisitions('owner', { kind: 'card' })).rows[0]).toMatchObject({
      source: 'campaign',
      results: [{ amount: 2 }],
    });
    await state.db.query('RENAME TABLE points_log TO points_log_unavailable');
    try {
      await expect(grantItem(null, 'owner', 'makeup_card', 3, { sourceType: 'admin' })).rejects.toThrow();
    } finally {
      await state.db.query('RENAME TABLE points_log_unavailable TO points_log');
    }
    const [[row]] = await state.db.query("SELECT streak_protect_cards AS qty FROM user_growth WHERE user_id='owner'");
    expect(row.qty).toBe(0);
  });
  it('新 AI 包按实际额度自动到账并幂等记账，不产生待使用卡', async () => {
    const source = { sourceType: 'campaign', sourceRef: 'event-ai', idempotencyKey: 'test:event-ai' };
    await grantItem(null, 'owner', 'ai_pack', 2, source);
    await grantItem(null, 'owner', 'ai_pack', 2, source);
    const [[balance]] = await state.db.query("SELECT ai_bonus_tokens AS tokens FROM user_growth WHERE user_id='owner'");
    expect(Number(balance.tokens)).toBe(1200000);
    const [[items]] = await state.db.query('SELECT COUNT(*) AS n FROM user_item');
    expect(items.n).toBe(0);
    const { rows } = await getInventoryAcquisitions('owner', { kind: 'ai_pack' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'campaign', results: [{ kind: 'ai_pack', amount: 1200000 }] });
  });
});

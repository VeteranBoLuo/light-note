import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ db: null }));
vi.mock('../../db/index.js', () => ({ default: { query: (...args) => fixture.db.query(...args) } }));

import { ensurePointsSchema, getPointsLog } from '../points.js';
import { readImageRepairPoints, settleImageRepairPoints } from './imageRepairBilling.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `repair_${randomUUID().replaceAll('-', '')}`;

describe.skipIf(!socketPath)('图片去水印积分结算', () => {
  let admin;
  let created = false;

  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema}`);
    created = true;
    fixture.db = mysql.createPool({ socketPath, user: 'root', database: schema });
    await fixture.db.query('CREATE TABLE user_growth (user_id VARCHAR(64) PRIMARY KEY, points INT NOT NULL)');
    await ensurePointsSchema();
  });

  afterAll(async () => {
    await fixture.db?.end();
    try {
      if (created) await admin.query(`DROP DATABASE ${schema}`);
    } finally {
      await admin?.end();
    }
  });

  function account(userId, points) {
    return fixture.db.query('INSERT INTO user_growth (user_id, points) VALUES (?, ?)', [userId, points]);
  }

  function settlement(userId, overrides) {
    return { accountId: userId, clientRequestId: randomUUID(), expectedCost: 1, ...overrides };
  }

  function settle(userId, input) {
    return settleImageRepairPoints({ userId, input, database: fixture.db });
  }

  it('同一请求并发与余额清零后的重试只结算一次，并写入积分明细', async () => {
    await account('retry', 1);
    const input = settlement('retry');
    const receipts = await Promise.all([settle('retry', input), settle('retry', input)]);
    expect(receipts.map(({ idempotent }) => Boolean(idempotent)).sort()).toEqual([false, true]);
    await expect(settle('retry', input)).resolves.toMatchObject({ cost: 1, idempotent: true });
    await expect(readImageRepairPoints('retry')).resolves.toEqual({ balance: 0, cost: 1 });
    const { rows } = await getPointsLog('retry', { filter: 'spent' });
    expect(rows).toMatchObject([{ delta: -1, reason: 'toolbox_image_repair', ref: null }]);
    const [operations] = await fixture.db.query(
      'SELECT status, cost_points FROM points_economy_operations WHERE user_id = ?',
      ['retry'],
    );
    expect(operations).toEqual([{ status: 'succeeded', cost_points: 1 }]);
  });

  it('不同请求争用最后一点积分时只有一次成功，过期价格和其他账号不能扣费', async () => {
    await account('owner', 1);
    await expect(settle('owner', settlement('other'))).rejects.toMatchObject({
      code: 'TOOLBOX_IMAGE_REPAIR_ACCOUNT_CHANGED',
    });
    await expect(settle('owner', settlement('owner', { expectedCost: 2 }))).rejects.toMatchObject({
      code: 'TOOLBOX_PRICING_CHANGED',
    });
    const requests = await Promise.allSettled([
      settle('owner', settlement('owner')),
      settle('owner', settlement('owner')),
    ]);
    expect(requests.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(requests.find(({ status }) => status === 'rejected')?.reason).toMatchObject({
      code: 'TOOLBOX_POINTS_INSUFFICIENT',
    });
    expect((await getPointsLog('owner')).rows).toHaveLength(1);
    expect((await readImageRepairPoints('owner')).balance).toBe(0);
  });

  it('流水写入失败时回滚余额和收据，原请求可再次结算', async () => {
    await account('rollback', 1);
    const input = settlement('rollback');
    await fixture.db.query(
      "CREATE TRIGGER reject_repair_log BEFORE INSERT ON points_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fixture ledger failure'",
    );
    try {
      await expect(settle('rollback', input)).rejects.toThrow('fixture ledger failure');
      expect((await readImageRepairPoints('rollback')).balance).toBe(1);
      expect((await getPointsLog('rollback')).rows).toEqual([]);
    } finally {
      await fixture.db.query('DROP TRIGGER reject_repair_log');
    }
    await expect(settle('rollback', input)).resolves.toMatchObject({ cost: 1 });
    expect((await readImageRepairPoints('rollback')).balance).toBe(0);
  });
});

import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: null }));
vi.mock('../../db/index.js', () => ({ default: { query: (...args) => state.db.query(...args) } }));
import { getLotteryHistory } from './lotteryHistoryService.js';

const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `lottery_history_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!socket)('抽奖收据分页 · 隔离 MySQL', () => {
  let admin,
    created = false;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socket)) throw Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema}`);
    created = true;
    state.db = mysql.createPool({ socketPath: socket, user: 'root', database: schema });
    await state.db.query(`CREATE TABLE points_economy_operations (
      id BIGINT NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL, operation_type VARCHAR(32) NOT NULL,
      status VARCHAR(16) NOT NULL, cost_points INT NOT NULL, result_json JSON NOT NULL,
      create_time DATETIME NOT NULL, KEY idx_history(user_id,status,create_time,id)
    ) ENGINE=InnoDB`);
  });
  afterAll(async () => {
    await state.db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  beforeEach(async () => {
    await state.db.query('DELETE FROM points_economy_operations');
  });
  async function add(
    id,
    owner = 'owner',
    mode = 'free',
    status = 'succeeded',
    results = [{ id: 'ai100', kind: 'ai_pack', amount: 100000 }],
  ) {
    await state.db.query('INSERT INTO points_economy_operations VALUES (?,?,?,?,?,?,?)', [
      id,
      owner,
      `lottery_${mode}`,
      status,
      mode === 'free' ? 0 : 1600,
      JSON.stringify({ ok: true, results }),
      '2026-10-23 10:14:00',
    ]);
  }
  it('同秒跨 99/100 位数仍按数值排序和续页，不含其他账号或未完成请求', async () => {
    for (const id of ['99', '100', '101']) await add(id);
    await add('102', 'other');
    await add('103', 'owner', 'free', 'pending');
    const first = await getLotteryHistory('owner', { limit: 2 });
    expect(first.rows.map((row) => row.id)).toEqual(['101', '100']);
    const next = await getLotteryHistory('owner', { limit: 2, cursor: first.nextCursor });
    expect(next.rows.map((row) => row.id)).toEqual(['99']);
    expect(next.hasMore).toBe(false);
    expect(next.rows[0].results[0].amount).toBe(100000);
  });
  it('BIGINT 收据 ID 不丢精度', async () => {
    await add('9007199254740993');
    await add('9007199254740992');
    const first = await getLotteryHistory('owner', { limit: 1 });
    expect(first.rows[0].id).toBe('9007199254740993');
    const next = await getLotteryHistory('owner', { limit: 1, cursor: first.nextCursor });
    expect(next.rows[0].id).toBe('9007199254740992');
  });
  it('免费与积分筛选保持收据完整，十连保留全部实际奖励', async () => {
    await add('1');
    const results = Array.from({ length: 10 }, (_, i) => ({
      id: 'ai',
      kind: 'ai_pack',
      amount: 600000,
      guaranteed: i === 9,
    }));
    await add('2', 'owner', 'paid', 'succeeded', results);
    const paid = await getLotteryHistory('owner', { mode: 'paid' });
    expect(paid.rows).toHaveLength(1);
    expect(paid.rows[0].cost).toBe(1600);
    expect(paid.rows[0].results).toHaveLength(10);
    expect(paid.rows[0].results[9].guaranteed).toBe(true);
    expect((await getLotteryHistory('owner', { mode: 'free' })).rows.map((row) => row.id)).toEqual(['1']);
  });
});

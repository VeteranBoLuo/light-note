import { randomUUID } from 'node:crypto';
import { buildApproximateFunnelQuery } from './conversionFunnelQuery.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { ACTIVE_USERS_QUERY, ACTIVATION_QUERY, COHORT_RETENTION_QUERY } from './productInsightsQueries.js';

// Opt-in isolated MySQL integration test. Writes only a newly created, randomly named test schema.
// Never reads project database credentials or connects over TCP.
const socketPath = process.env.M01_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('增长测量 SQL 行为（隔离 MySQL）', () => {
  let db;
  const schema = `m01_test_${randomUUID().replaceAll('-', '')}`;
  let created = false;
  beforeAll(async () => {
    db = await mysql.createConnection({ socketPath, user: 'root' });
    await db.query(`CREATE DATABASE ${schema}`);
    created = true;
    await db.query(`USE ${schema}`);
    await db.query("SET timestamp = UNIX_TIMESTAMP('2026-09-11 12:00:00')");
    await db.query(`CREATE TABLE conversion_events (
      fingerprint VARCHAR(128), user_id VARCHAR(64), visitor_type VARCHAR(20), event VARCHAR(64), create_time DATETIME,
      KEY idx_event_time(event,create_time), KEY idx_fingerprint(fingerprint), KEY idx_user_event(user_id,event))`);
    await db.query(
      `CREATE TABLE user (id VARCHAR(64) PRIMARY KEY, role VARCHAR(20), del_flag CHAR(1), create_time DATETIME)`,
    );
    await db.query(
      `CREATE TABLE api_logs (user_id VARCHAR(64), del_flag CHAR(1), request_time DATETIME, KEY idx_user_time(user_id,request_time))`,
    );
  });
  afterAll(async () => {
    try {
      if (created) await db.query(`DROP DATABASE ${schema}`);
    } finally {
      await db?.end();
    }
  });
  beforeEach(async () => {
    for (const table of ['conversion_events', 'user', 'api_logs']) await db.query(`DELETE FROM ${table}`);
  });
  it('活跃存在性查询保持时间、角色、删除和重复过滤', async () => {
    await db.query(
      "INSERT INTO user VALUES ('yes','user','0','2026-01-01'),('old','user','0','2026-01-01'),('deletedLog','user','0','2026-01-01'),('disabled','user','1','2026-01-01'),('internal','root','0','2026-01-01')",
    );
    await db.query(
      "INSERT INTO api_logs VALUES ('yes','0','2026-09-04 12:00:00'),('yes','0','2026-09-11 11:00:00'),('old','0','2026-09-04 11:59:59'),('deletedLog','1','2026-09-11 11:00:00'),('disabled','0','2026-09-11 11:00:00'),('internal','0','2026-09-11 11:00:00'),('orphan','0','2026-09-11 11:00:00')",
    );
    const [rows] = await db.query(ACTIVE_USERS_QUERY, [7]);
    expect(rows[0].users).toBe(1);
    expect((await db.query(ACTIVE_USERS_QUERY, [30]))[0][0].users).toBe(2);
  });
  it('近似路径覆盖同秒、重试与去重，逆序/跨设备/内部/空指纹不拼成成功', async () => {
    const rows = [];
    const add = (id, event, second, type = event === 'register' ? 'user' : 'visitor') =>
      rows.push([id, id, type, event, `2026-09-01 10:00:0${second}`]);
    // Deliberately reverse insertion order: IDs cannot establish causality for same-second events.
    for (const event of ['register', 'signup_submit', 'signup_open', 'page_view']) add('same', event, 1);
    for (const [event, second] of [
      ['signup_open', 0],
      ['page_view', 1],
      ['signup_open', 2],
      ['signup_submit', 3],
      ['register', 4],
      ['register', 4],
    ])
      add('retry', event, second);
    for (const [event, second] of [
      ['register', 0],
      ['page_view', 1],
      ['signup_open', 2],
      ['signup_submit', 3],
    ])
      add('reverse', event, second);
    add('device-a', 'page_view', 1);
    add('device-b', 'register', 4);
    for (const event of ['page_view', 'signup_open', 'signup_submit', 'register']) {
      add('', event, 1);
      add('internal', event, 1, 'root');
    }
    await db.query('INSERT INTO conversion_events VALUES ?', [rows]);
    const query = buildApproximateFunnelQuery({ startDate: '2026-09-01', endDate: '2026-09-01' });
    const [result] = await db.query(query.sql, query.params);
    expect(result[0]).toEqual({ pageView: 4, signupOpen: 3, signupSubmit: 3, registerSuccess: 2 });
    const outside = buildApproximateFunnelQuery({ startDate: '2026-09-02', endDate: '2026-09-02' });
    expect((await db.query(outside.sql, outside.params))[0][0].pageView).toBe(0);
  });
  it('激活仅纳入完整七天，边界包含起点排除终点，内部与停用账号不参与', async () => {
    const users = [
      ['mature', 'user', '0', '2026-09-04 12:00:00'],
      ['immature', 'user', '0', '2026-09-04 12:00:01'],
      ['late', 'user', '0', '2026-09-03 12:00:00'],
      ['internal', 'root', '0', '2026-09-03 12:00:00'],
      ['disabled', 'user', '1', '2026-09-03 12:00:00'],
    ];
    await db.query('INSERT INTO user VALUES ?', [users]);
    const events = users.map(([id, , , created]) => [id, id, 'user', 'first_own_resource', created]);
    events[2][4] = '2026-09-10 12:00:00';
    events.push(events[0]);
    await db.query('INSERT INTO conversion_events VALUES ?', [events]);
    const [rows] = await db.query(ACTIVATION_QUERY, [30]);
    expect(rows[0]).toEqual({ new_users: 2, activated_users: 1 });
  });
  it.each([1, 7, 30])('D%i 的分子分母都等到完整窗口结束，重复请求不重复计数', async (day) => {
    const now = new Date('2026-09-11T12:00:00Z');
    const format = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
    const end = now.getTime() - (day + 1) * 86400000;
    await db.query('INSERT INTO user VALUES ?', [
      [
        ['mature', 'user', '0', format(end)],
        ['immature', 'user', '0', format(end + 1000)],
        ['outside', 'user', '0', format(end)],
        ['internal', 'test', '0', format(end)],
      ],
    ]);
    await db.query('INSERT INTO api_logs VALUES ?', [
      [
        ['mature', '0', format(end + day * 86400000)],
        ['mature', '0', format(end + day * 86400000)],
        ['immature', '0', format(end + day * 86400000 + 1000)],
        ['outside', '0', format(now.getTime())],
        ['internal', '0', format(end + day * 86400000)],
      ],
    ]);
    const [rows] = await db.query(COHORT_RETENTION_QUERY, [90]);
    expect(rows.reduce((sum, r) => sum + r[`d${day}_eligible`], 0)).toBe(2);
    expect(rows.reduce((sum, r) => sum + r[`d${day}_retained`], 0)).toBe(1);
  });
});

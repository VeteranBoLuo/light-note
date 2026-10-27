import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { query } }));
await import('../util/common.js');
const { getOperationLogs, getApiLogs, getApiLogDetail } = await import('./commonHandle.js');
const { getUserList } = await import('./userHandle.js');

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('后台游标列表 SQL 与索引', () => {
  const schema = `admin_lists_${randomUUID().replaceAll('-', '')}`;
  let db;
  let created = false;
  let durationAssertion;

  const statements = (source) =>
    source
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((sql) => sql.trim())
      .filter(Boolean);

  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    db = await mysql.createConnection({ socketPath, user: 'root', dateStrings: true });
    await db.query(`CREATE DATABASE ${schema} CHARACTER SET utf8 COLLATE utf8_general_ci`);
    created = true;
    await db.query(`USE ${schema}`);
    // 保留线上 VARCHAR 删除标记；用 INT 建夹具会掩盖隐式转换导致的索引失效。
    await db.query(`CREATE TABLE user (
      id VARCHAR(255) PRIMARY KEY, alias VARCHAR(255), email VARCHAR(255), role VARCHAR(20),
      del_flag VARCHAR(255) NOT NULL DEFAULT '0', create_time DATETIME,
      head_picture TEXT, phone_number VARCHAR(30), ip VARCHAR(255),
      KEY idx_user_created_list (del_flag, create_time, id)
    )`);
    await db.query(`CREATE TABLE operation_logs (
      id VARCHAR(255) PRIMARY KEY, create_by VARCHAR(255), create_time DATETIME,
      del_flag VARCHAR(255) NOT NULL DEFAULT '0', module VARCHAR(255), operation VARCHAR(255),
      ip VARCHAR(255), \`system\` TEXT,
      KEY idx_operation_logs_admin_list (del_flag, create_time, id)
    )`);
    await db.query(`CREATE TABLE api_logs (
      id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, request_time DATETIME NOT NULL,
      del_flag VARCHAR(255) NOT NULL DEFAULT '0', status_code VARCHAR(255),
      url VARCHAR(255), method VARCHAR(255), ip VARCHAR(255), \`system\` VARCHAR(255),
      req LONGTEXT, request_id VARCHAR(64), duration_ms INT UNSIGNED,
      KEY idx_api_logs_admin_list (del_flag,request_time,id),
      KEY idx_api_logs_status_time (del_flag,status_code,request_time,id),
      KEY idx_api_logs_user_time (user_id,request_time),
      KEY idx_api_logs_request_id (request_id)
    )`);
    await db.query(`CREATE TABLE user_activity_daily (
      user_id VARCHAR(255), activity_date DATE, last_active_at DATETIME,
      PRIMARY KEY(activity_date, user_id), KEY idx_activity_user_date(user_id, activity_date)
    )`);
    await db.query(`CREATE TABLE user_growth (
      user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci PRIMARY KEY,
      level INT, equipped_frame VARCHAR(64)
    )`);
    await db.query(`CREATE TABLE admin_user_remarks (
      admin_user_id VARCHAR(255), target_user_id VARCHAR(255), remark_name VARCHAR(255),
      PRIMARY KEY(admin_user_id, target_user_id)
    )`);
    const users = Array.from({ length: 400 }, (_, n) => [
      `user-${String(n).padStart(4, '0')}`,
      `用户 ${n}`,
      `user-${n}@example.test`,
      n === 0 ? 'root' : n === 1 ? 'test' : 'user',
      n >= 300 ? '1' : '0',
      '2026-10-20 10:00:00',
    ]);
    await db.query('INSERT INTO user (id,alias,email,role,del_flag,create_time) VALUES ?', [users]);
    await db.query('INSERT INTO user_growth (user_id,level) VALUES ?', [users.map(([id]) => [id, 1])]);
    const logs = Array.from({ length: 2000 }, (_, n) => [
      `log-${String(n).padStart(4, '0')}`,
      `user-${String(n % 4).padStart(4, '0')}`,
      '2026-10-20 10:00:00',
      n >= 1600 ? '1' : '0',
      '笔记',
      `操作 ${n}`,
      '203.0.113.1',
    ]);
    await db.query('INSERT INTO operation_logs (id,create_by,create_time,del_flag,module,operation,ip) VALUES ?', [
      logs,
    ]);
    await db.query("INSERT INTO admin_user_remarks VALUES ('user-0000','user-0003','客户甲')");
    await db.query('INSERT INTO user_activity_daily (user_id,activity_date,last_active_at) VALUES ?', [
      users.map(([id]) => [id, '2026-10-19', '2026-10-19 10:00:00']),
    ]);
    await db.query("INSERT INTO user_activity_daily VALUES ('user-0003','2026-10-20','2026-10-20 11:00:00')");
    for (let start = 0; start < 30000; start += 5000) {
      const logs = Array.from({ length: 5000 }, (_, offset) => {
        const n = start + offset;
        return [
          `api-${String(n).padStart(5, '0')}`,
          n === 23999 ? 'missing-user' : `user-000${n % 4}`,
          '2026-10-20 10:00:00',
          n >= 24000 ? '1' : '0',
          n % 5 === 0 ? '500' : '200',
          '/api/fixture',
          n % 2 === 0 ? 'GET' : 'POST',
          '203.0.113.1',
          '{}',
          '{"fixture":true}',
          `trace-${n}`,
          n < 300 ? 2000 : 10,
        ];
      });
      await db.query(
        'INSERT INTO api_logs (id,user_id,request_time,del_flag,status_code,url,method,ip,`system`,req,request_id,duration_ms) VALUES ?',
        [logs],
      );
    }
    const migration = statements(
      await readFile(new URL('../migrations/20261027_api_log_duration_index.sql', import.meta.url), 'utf8'),
    );
    // 重复执行只安装一次索引，不改变现有记录。
    for (let pass = 0; pass < 2; pass++) for (const sql of migration) await db.query(sql);
    expect((await db.query('SELECT COUNT(*) AS n FROM api_logs'))[0][0].n).toBe(30000);
    durationAssertion = statements(
      await readFile(new URL('../migrations/schema-assertions.sql', import.meta.url), 'utf8'),
    ).find((sql) => sql.includes('[api-log-duration]'));
    expect((await db.query(durationAssertion))[0]).toEqual([]);
    await db.query('ANALYZE TABLE user, operation_logs, api_logs, user_growth, user_activity_daily');
    query.mockImplementation((sql, params) => {
      // 本组验证列表和总数 SQL，资源/设备补充读取由原有 Handler 测试覆盖。
      if (/FROM (bookmark|tag|note|files|user_sessions)\b/.test(sql)) return Promise.resolve([[]]);
      return db.query(sql, params);
    });
  });

  afterAll(async () => {
    try {
      if (created) await db.query(`DROP DATABASE ${schema}`);
    } finally {
      await db?.end();
    }
  });

  async function read(handler, body) {
    query.mockClear();
    let result;
    await handler(
      { user: { id: 'user-0000', role: 'root' }, body },
      {
        send(value) {
          result = value;
        },
      },
    );
    expect(result.status).toBe(200);
    return result.data;
  }

  async function expectOrderedIndex(table, index) {
    const [sql, params] = query.mock.calls[0];
    const [plan] = await db.query(`EXPLAIN ${sql}`, params);
    const entry = plan.find((row) => row.table === table);
    expect(entry.key).toBe(index);
    expect(entry.Extra || '', JSON.stringify(plan)).not.toContain('Using filesort');
  }

  it('日志默认页与续页使用排序索引，隐藏内部账号且不重复 COUNT', async () => {
    const body = { cursor: null, limit: 10, filters: {} };
    const first = await read(getOperationLogs, body);
    expect(first.total).toBe(800);
    expect(first.items.map((r) => r.id)).toEqual([
      'log-1599',
      'log-1598',
      'log-1595',
      'log-1594',
      'log-1591',
      'log-1590',
      'log-1587',
      'log-1586',
      'log-1583',
      'log-1582',
    ]);
    await expectOrderedIndex('o', 'idx_operation_logs_admin_list');
    const next = await read(getOperationLogs, { ...body, cursor: first.nextCursor });
    expect(next.items[0].id).toBe('log-1579');
    expect(next.total).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
    await expectOrderedIndex('o', 'idx_operation_logs_admin_list');
  });

  it('日志关键词、模块、用户、日期和内部账号开关保持完整筛选', async () => {
    const result = await read(getOperationLogs, {
      cursor: null,
      limit: 10,
      filters: {
        key: '操作 1599',
        module: '笔记',
        userId: 'user-0003',
        startDate: '2026-10-20',
        endDate: '2026-10-20',
      },
    });
    expect(result.items.map((r) => r.id)).toEqual(['log-1599']);
    expect(result.total).toBe(1);
    const all = await read(getOperationLogs, { cursor: null, limit: 10, filters: { hideInternal: false } });
    expect(all.total).toBe(1600);
  });

  it('用户注册时间游标沿用排序索引；空搜索、全部状态与私有备注搜索有效', async () => {
    const body = { cursor: null, limit: 10, sort: { field: 'createTime', order: 'desc' } };
    const first = await read(getUserList, body);
    expect(first.total).toBe(300);
    expect(first.items[0].id).toBe('user-0299');
    await expectOrderedIndex('u', 'idx_user_created_list');
    const next = await read(getUserList, { ...body, cursor: first.nextCursor });
    expect(next.items[0].id).toBe('user-0289');
    expect(next.total).toBeUndefined();
    await expectOrderedIndex('u', 'idx_user_created_list');
    const all = await read(getUserList, { ...body, filters: { status: 'all', key: '  ' } });
    expect(all.total).toBe(400);
    const banned = await read(getUserList, { ...body, filters: { status: 'banned' } });
    expect(banned.total).toBe(100);
    const remark = await read(getUserList, { ...body, filters: { key: '客户甲' } });
    expect(remark.items.map((r) => r.id)).toEqual(['user-0003']);
    expect(remark.total).toBe(1);
  });

  it('API 默认页保持时间索引、精确总数、孤儿日志与详情懒加载', async () => {
    const body = { cursor: null, limit: 10, filters: {} };
    const first = await read(getApiLogs, body);
    expect(first.total).toBe(12000);
    expect(first.items[0].id).toBe('api-23999');
    expect(first.items.every((r) => !('req' in r))).toBe(true);
    await expectOrderedIndex('a', 'idx_api_logs_admin_list');
    const next = await read(getApiLogs, { ...body, cursor: first.nextCursor });
    expect(next.total).toBeUndefined();
    expect(next.items.some((r) => first.items.some((prev) => prev.id === r.id))).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    await expectOrderedIndex('a', 'idx_api_logs_admin_list');
    const detail = await read(getApiLogDetail, { id: first.items[0].id });
    expect(detail.req).toEqual({ fixture: true });
  });

  it('API 耗时筛选使用范围索引，计数由覆盖索引完成，翻页结果保持一致', async () => {
    const body = { cursor: null, limit: 10, filters: { minDurationMs: 1000 } };
    const first = await read(getApiLogs, body);
    expect(first.total).toBe(150);
    expect(first.items[0].id).toBe('api-00299');
    const [sql, params] = query.mock.calls[0];
    const [plan] = await db.query('EXPLAIN ' + sql, params);
    expect(plan.find((r) => r.table === 'a').key).toBe('idx_api_logs_duration_time');
    const oldSql = sql.replace('FROM api_logs a', 'FROM api_logs a FORCE INDEX (idx_api_logs_admin_list)');
    const [oldRows] = await db.query(oldSql, params);
    expect(first.items.map((r) => r.id)).toEqual(oldRows.map((r) => r.id).slice(0, 10));
    const [countSql, countParams] = query.mock.calls[1];
    const [countPlan] = await db.query('EXPLAIN ' + countSql, countParams);
    const countEntry = countPlan.find((r) => r.table === 'a');
    expect(countEntry.key).toBe('idx_api_logs_duration_time');
    expect(countEntry.Extra).toContain('Using index');
    const next = await read(getApiLogs, { ...body, cursor: first.nextCursor });
    expect(next.items[0].id).toBe('api-00279');
    expect(next.total).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
    const all = await read(getApiLogs, { ...body, filters: { ...body.filters, hideInternal: false } });
    expect(all.total).toBe(300);
    const filtered = await read(getApiLogs, { ...body, filters: { ...body.filters, status: '5xx', method: 'POST' } });
    expect(filtered.total).toBe(15);
    expect(filtered.items.every((r) => r.durationMs >= 1000 && r.statusCode === '500' && r.method === 'POST')).toBe(
      true,
    );
    const trace = await read(getApiLogs, {
      ...body,
      filters: {
        ...body.filters,
        requestId: 'trace-299',
        key: '/api/fixture',
        startDate: '2026-10-20',
        endDate: '2026-10-20',
      },
    });
    expect(trace.total).toBe(1);
    expect(trace.items[0].id).toBe('api-00299');
  });

  it('耗时索引 Schema 门禁拒绝同名但列序错误的索引', async () => {
    await db.query('ALTER TABLE api_logs DROP INDEX idx_api_logs_duration_time');
    expect((await db.query(durationAssertion))[0]).toHaveLength(1);
    try {
      await db.query(
        'ALTER TABLE api_logs ADD KEY idx_api_logs_duration_time (duration_ms,del_flag,request_time,user_id)',
      );
      expect((await db.query(durationAssertion))[0]).toHaveLength(1);
    } finally {
      await db.query('ALTER TABLE api_logs DROP INDEX idx_api_logs_duration_time');
      await db.query(
        'ALTER TABLE api_logs ADD KEY idx_api_logs_duration_time (del_flag,duration_ms,request_time,user_id)',
      );
    }
  });
});

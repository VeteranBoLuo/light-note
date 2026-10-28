import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { query } }));
await import('../util/common.js');
const { getAdminOverviewSnapshot, getAdminOverviewTrend } = await import('./commonHandle.js');

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('总览异构字符集 SQL', () => {
  const schema = `admin_overview_${randomUUID().replaceAll('-', '')}`;
  let db,
    created = false;
  const tables = [
    'user',
    'bookmark',
    'note',
    'files',
    'onboarding_seed_resources',
    'ai_executions',
    'todo_items',
    'todo_series',
  ];
  const today = '2026-10-16 08:00:00',
    yesterday = '2026-10-15 08:00:00';

  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    db = await mysql.createConnection({ socketPath, user: 'root', dateStrings: true });
    await db.query(`CREATE DATABASE ${schema} CHARACTER SET utf8 COLLATE utf8_general_ci`);
    created = true;
    await db.query(`USE ${schema}`);
    await db.query(`CREATE TABLE user (
      id VARCHAR(255) PRIMARY KEY, role VARCHAR(20), del_flag VARCHAR(255), create_time DATETIME,
      KEY idx_user_created_list (del_flag, create_time, id)
    )`);
    await db.query(`CREATE TABLE bookmark (
      id VARCHAR(255) PRIMARY KEY, user_id VARCHAR(255), del_flag INT, create_time DATETIME
    )`);
    await db.query(`CREATE TABLE note (
      id VARCHAR(255) PRIMARY KEY, create_by VARCHAR(255), del_flag VARCHAR(255), create_time DATETIME,
      KEY idx_note_admin_created (del_flag, create_time, id)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await db.query(`CREATE TABLE files (
      id INT PRIMARY KEY, create_by VARCHAR(255), del_flag INT, create_time DATETIME, file_size INT
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await db.query(`CREATE TABLE ai_executions (
      id CHAR(36) PRIMARY KEY, actor_user_id VARCHAR(128), model_called INT, provider_tokens INT, created_at DATETIME
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await db.query(`CREATE TABLE onboarding_seed_resources (
      user_id VARBINARY(255), resource_type VARCHAR(20), resource_id VARBINARY(255),
      PRIMARY KEY (resource_type, user_id, resource_id)
    )`);
    await db.query(`CREATE TABLE todo_series (
      id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci PRIMARY KEY,
      user_id VARCHAR(255), create_time DATETIME,
      parent_series_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci
    )`);
    await db.query(`CREATE TABLE todo_items (
      id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci PRIMARY KEY,
      user_id VARCHAR(255), create_time DATETIME, del_flag INT, plan_version INT,
      series_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
      occurrence_no INT, generated_by_todo_id CHAR(36),
      UNIQUE KEY uk_todo_series_occurrence (series_id, occurrence_no)
    )`);
  });
  afterAll(async () => {
    try {
      if (created) await db.query(`DROP DATABASE ${schema}`);
    } finally {
      await db?.end();
    }
  });
  afterEach(() => vi.useRealTimers());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T04:00:00Z'));
    for (const table of tables) await db.query(`DELETE FROM ${table}`);
    await db.query('INSERT INTO user VALUES ?', [
      [
        ['ordinary', 'user', '0', today],
        ['root-Ä', 'root', '0', yesterday],
        ['internal-test', 'test', '0', today],
        ['visitor', 'visitor', '0', today],
        ['disabled', 'user', '1', today],
        ...Array.from({ length: 300 }, (_, n) => [`inactive-${n}`, 'user', '1', yesterday]),
      ],
    ]);
    const resources = [
      ['current', 'ordinary', '0', today],
      ['previous', 'ordinary', '0', yesterday],
      ['late-previous', 'ordinary', '0', '2026-10-15 13:00:00'],
      ['root', 'ROOT-ä', '0', yesterday],
      ['test', 'internal-test', '0', today],
      ['banned', 'disabled', '0', today],
      ['orphan', 'missing-user', '0', today],
      ['seed', 'ordinary', '0', today],
      ['deleted', 'ordinary', '1', today],
    ];
    await db.query('INSERT INTO note VALUES ?', [
      [...resources, ...Array.from({ length: 2000 }, (_, n) => [`deleted-${n}`, 'ordinary', '1', yesterday])],
    ]);
    // Bookmark owners retain their historical utf8 collation and active-account rule.
    await db.query('INSERT INTO bookmark VALUES ?', [resources.filter(([id]) => id !== 'late-previous')]);
    await db.query('INSERT INTO files VALUES ?', [
      [
        [1, 'ordinary', 0, today, 1048576],
        [2, 'ordinary', 0, yesterday, 1048576],
        [3, 'ROOT-ä', 0, yesterday, 1048576],
        [4, 'internal-test', 0, today, 1048576],
        [5, 'ordinary', 1, today, 3 * 1048576],
        [6, 'ROOT-ä', 1, today, 4 * 1048576],
        [7, 'ordinary', 2, today, 6 * 1048576],
        [8, 'ordinary', 0, today, 7 * 1048576],
      ],
    ]);
    await db.query('INSERT INTO onboarding_seed_resources VALUES ?', [
      [
        ['ordinary', 'note', 'seed'],
        ['ordinary', 'bookmark', 'seed'],
        ['ordinary', 'file', '8'],
      ],
    ]);
    await db.query('INSERT INTO ai_executions VALUES ?', [
      [
        ['current', 'ordinary', 1, 10, today],
        ['previous', 'ordinary', 1, 20, yesterday],
        ['late-previous', 'ordinary', 1, 30, '2026-10-15 13:00:00'],
        ['root', 'ROOT-ä', 1, 100, yesterday],
        ['test', 'internal-test', 1, 200, today],
        ['anonymous', null, 1, 7, today],
        ['orphan', 'missing-user', 1, 9, today],
        ['no-model', 'ordinary', 0, 999, today],
      ],
    ]);
    await db.query('ANALYZE TABLE user, note, files, ai_executions');
    query.mockReset().mockImplementation((sql, params) => {
      if (
        /admin_overview_snapshot_resources|admin_overview_trend|same_time_baseline|SUM\(provider_tokens\)/.test(sql)
      ) {
        return db.query(sql, params);
      }
      // 活跃覆盖、API、待办健康等无改动的独立领域由其现有用例验证。
      return Promise.resolve([[]]);
    });
  });

  async function read(handler, hideInternal) {
    let payload;
    await handler(
      { user: { role: 'root' }, body: { hideInternal, days: 7 } },
      {
        send(value) {
          payload = value;
        },
      },
    );
    expect(payload.status).toBe(200);
    return payload.data;
  }

  it.each([true, false])('首屏保留内部账号、教学资源、回收站和无账号 AI 的既有口径：hideInternal=%s', async (hide) => {
    const snapshot = await read(getAdminOverviewSnapshot, hide);
    expect(snapshot.users).toEqual({ total: hide ? 1 : 3, today: hide ? 1 : 2 });
    expect(snapshot.resources).toEqual({
      bookmarkTotal: hide ? 2 : 4,
      bookmarkToday: hide ? 1 : 2,
      noteTotal: hide ? 5 : 7,
      noteToday: hide ? 3 : 4,
      fileTotal: hide ? 2 : 4,
      fileToday: hide ? 1 : 2,
      storageMb: hide ? 2 : 4,
      trashMb: hide ? 3 : 7,
      trashCount: hide ? 1 : 2,
    });
    expect(snapshot.ai).toEqual({
      totalCount: hide ? 5 : 7,
      totalTokens: hide ? 76 : 376,
      todayCount: hide ? 3 : 4,
      todayTokens: hide ? 26 : 226,
    });
  });

  it.each([true, false])('趋势与同期比较继续复用相同范围和时间截点：hideInternal=%s', async (hide) => {
    const history = await read(getAdminOverviewTrend, hide);
    expect(history.todayBaseline.available).toBe(true);
    expect(history.trend.find((row) => row.date === '2026-10-15')).toMatchObject({
      bookmarks: hide ? 1 : 2,
      notes: hide ? 2 : 3,
      files: hide ? 1 : 2,
    });
    const expected = { yesterday: hide ? 1 : 2, average7d: hide ? 0.1 : 0.3 };
    for (const key of ['bookmarks', 'notes', 'files', 'aiCalls']) {
      expect(history.todayBaseline.metrics[key]).toEqual(expected);
    }
  });

  it('索引可用于 VARCHAR 删除标记，内部账号子查询避免逐行全表扫描', async () => {
    await read(getAdminOverviewSnapshot, true);
    const resources = query.mock.calls.find(([sql]) => sql.includes('admin_overview_snapshot_resources'));
    const [plan] = await db.query(`EXPLAIN ${resources[0]}`, resources[1]);
    expect(plan.find((entry) => entry.table === 'note').key).toBe('idx_note_admin_created');
    const ai = query.mock.calls.find(([sql]) => sql.includes('SUM(provider_tokens)'));
    const [aiPlan] = await db.query(`EXPLAIN ${ai[0]}`, ai[1]);
    // 同字符集书签仍可逐行主键点查；资料/AI 不能再次退化为逐行扫描账号表。
    expect(
      [...plan, ...aiPlan].filter(
        (entry) => entry.table === 'user' && entry.select_type === 'DEPENDENT SUBQUERY' && entry.type === 'ALL',
      ),
    ).toEqual([]);
  });

  it('空领域仍返回完整零值，不因 NULL 聚合失效', async () => {
    for (const table of tables) await db.query(`DELETE FROM ${table}`);
    const snapshot = await read(getAdminOverviewSnapshot, true);
    expect(snapshot.users).toEqual({ total: 0, today: 0 });
    expect(Object.values(snapshot.resources).every((value) => value === 0)).toBe(true);
    expect(snapshot.ai).toEqual({ totalCount: 0, totalTokens: 0, todayCount: 0, todayTokens: 0 });
    const history = await read(getAdminOverviewTrend, true);
    expect(history.trend.every((row) => row.contentTotal === 0)).toBe(true);
    expect(history.todayBaseline.metrics.notes).toEqual({ yesterday: 0, average7d: 0 });
  });
});

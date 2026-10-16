import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { query } }));
// Match application import order to avoid common.js/router/common.js's cycle.
await import('../util/common.js');
const { getAdminOverviewRecent } = await import('./commonHandle.js');

// Only a disposable local socket; never load application database credentials.
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('最近新增待办真实 SQL（MySQL 5.7）', () => {
  const schema = `recent_todos_${randomUUID().replaceAll('-', '')}`;
  let db;
  let created = false;

  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    db = await mysql.createConnection({ socketPath, user: 'root', dateStrings: true });
    await db.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    created = true;
    await db.query(`USE ${schema}`);
    await db.query(`CREATE TABLE user (
      id VARCHAR(64) PRIMARY KEY, role VARCHAR(20), del_flag INT DEFAULT 0, alias VARCHAR(64)
    )`);
    await db.query(`CREATE TABLE admin_user_remarks (
      admin_user_id VARCHAR(64), target_user_id VARCHAR(64), remark_name VARCHAR(64)
    )`);
    await db.query(`CREATE TABLE onboarding_seed_resources (
      user_id VARCHAR(64), resource_type VARCHAR(32), resource_id VARCHAR(64)
    )`);
    await db.query(`CREATE TABLE todo_series (
      id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), title VARCHAR(64),
      create_time DATETIME, parent_series_id VARCHAR(64)
    )`);
    await db.query(`CREATE TABLE todo_items (
      id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), title VARCHAR(64), status VARCHAR(20) DEFAULT 'pending',
      create_time DATETIME, del_flag INT DEFAULT 0, plan_version INT DEFAULT 2,
      series_id VARCHAR(64), occurrence_no INT, generated_by_todo_id VARCHAR(64),
      UNIQUE KEY series_occurrence (series_id, occurrence_no)
    )`);
    query.mockImplementation((...args) => db.query(...args));
  });

  afterAll(async () => {
    try {
      if (created) await db.query(`DROP DATABASE ${schema}`);
    } finally {
      await db?.end();
    }
  });

  beforeEach(async () => {
    for (const table of ['todo_items', 'todo_series', 'user', 'admin_user_remarks', 'onboarding_seed_resources']) {
      await db.query(`DELETE FROM ${table}`);
    }
    await db.query("INSERT INTO user VALUES ('root','root',0,'管理员'),('owner','user',0,'用户')");
  });

  const addItem = (id, fields = {}) =>
    db.query('INSERT INTO todo_items SET ?', {
      id,
      user_id: 'owner',
      title: id,
      create_time: '2026-10-16 08:00:00',
      ...fields,
    });
  const addSeries = (id, fields = {}) =>
    db.query('INSERT INTO todo_series SET ?', {
      id,
      user_id: 'owner',
      title: `系列 ${id}`,
      create_time: '2026-10-16 08:00:00',
      ...fields,
    });
  async function recent(body = {}) {
    let payload;
    await getAdminOverviewRecent(
      { user: { id: 'root', role: 'root' }, body: { type: 'todo', target: 'resource', cursor: null, ...body } },
      {
        send(value) {
          payload = value;
        },
      },
    );
    expect(payload.status).toBe(200);
    return payload.data;
  }

  it('旧系列当天补齐多个实例仍只展示一次，并保留系列原始创建时间和标题', async () => {
    await addSeries('old-series', { create_time: '2026-08-08 09:21:43' });
    for (let no = 9; no <= 13; no++) {
      await addItem(`buffer-${no}`, { series_id: 'old-series', occurrence_no: no });
    }
    await addItem('manual');
    const page = await recent();
    expect(page.items.map((r) => r.id)).toEqual(['manual', 'old-series']);
    // 系列没有单个实例的完成状态，避免首个实例完成后把整个系列显示为已完成。
    expect(page.items[1]).toMatchObject({ title: '系列 old-series', createdAt: '2026-08-08 09:21:43', status: null });
    expect(page.hasMore).toBe(false);
  });

  it('今日筛选不把补齐旧系列算作新建，新系列只展示一次且保留已完成单次任务', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00+08:00'));
    try {
      await addSeries('old-series', { create_time: '2026-08-08 09:21:43' });
      await addItem('buffer', { series_id: 'old-series', occurrence_no: 9 });
      await addSeries('new-series');
      await addItem('new-1', { series_id: 'new-series', occurrence_no: 1 });
      await addItem('new-2', { series_id: 'new-series', occurrence_no: 2 });
      await addItem('done', { status: 'completed' });
      expect((await recent({ period: 'today' })).items.map((r) => r.id)).toEqual(['new-series', 'done']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('完成后续生、旧版重复任务和编辑替代系列均不会重复计入', async () => {
    await addSeries('after-completion', { create_time: '2026-10-01 08:00:00' });
    await addItem('original', { series_id: 'after-completion', occurrence_no: 1, status: 'completed' });
    await addItem('next', { series_id: 'after-completion', occurrence_no: 2, generated_by_todo_id: 'original' });
    await addItem('legacy', { plan_version: 1, series_id: 'legacy', create_time: '2026-09-01 08:00:00' });
    await addItem('legacy-next', { plan_version: 1, series_id: 'legacy' });
    await addSeries('replacement', { parent_series_id: 'after-completion' });
    await addItem('replaced', { series_id: 'replacement', occurrence_no: 1 });
    await addItem('orphan', { series_id: 'missing-series', occurrence_no: 1 });
    await addItem('generated-orphan', { generated_by_todo_id: 'original' });
    expect((await recent()).items.map((r) => r.id)).toEqual(['after-completion', 'legacy']);
  });

  it('系列按稳定系列 ID 翻页，删除首个实例后仍保留原始创建事件且续页不漏项', async () => {
    for (const id of ['series-a', 'series-b', 'series-c']) {
      await addSeries(id);
      await addItem(`${id}-1`, { series_id: id, occurrence_no: 1 });
      await addItem(`${id}-2`, { series_id: id, occurrence_no: 2 });
    }
    const first = await recent({ limit: 1 });
    expect(first.items.map((r) => r.id)).toEqual(['series-c']);
    expect(first.hasMore).toBe(true);
    await db.query("UPDATE todo_items SET del_flag=1 WHERE id='series-b-1'");
    const second = await recent({ limit: 1, cursor: first.nextCursor });
    expect(second.items.map((r) => r.id)).toEqual(['series-b']);
    const third = await recent({ limit: 1, cursor: second.nextCursor });
    expect(third.items.map((r) => r.id)).toEqual(['series-a']);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();
  });

  it('沿用删除、教学资源、账号状态、内部账号和管理员备注过滤', async () => {
    await db.query("INSERT INTO user VALUES ('test','test',0,'测试'),('disabled','user',1,'停用')");
    await db.query("INSERT INTO admin_user_remarks VALUES ('root','owner','当前备注')");
    await addItem('manual');
    await addItem('deleted', { del_flag: 1 });
    await addItem('seed');
    await db.query("INSERT INTO onboarding_seed_resources VALUES ('owner','todo','seed')");
    await addSeries('all-deleted');
    await addItem('deleted-instance', { series_id: 'all-deleted', occurrence_no: 1, del_flag: 1 });
    await addSeries('internal', { user_id: 'test' });
    await addItem('internal-instance', { user_id: 'test', series_id: 'internal', occurrence_no: 1 });
    await addItem('disabled', { user_id: 'disabled' });
    await addItem('foreign-series', { user_id: 'owner', series_id: 'internal', occurrence_no: 2 });
    const page = await recent();
    expect(page.items.map((r) => r.id)).toEqual(['manual']);
    expect(page.items[0].userRemark).toBe('当前备注');
    expect((await recent({ hideInternal: false })).items.map((r) => r.id)).toEqual(['manual', 'internal']);
  });
});

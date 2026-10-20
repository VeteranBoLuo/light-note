import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Temporal } from '@js-temporal/polyfill';
import { snoozeV2Todo } from './todoSeriesService.js';
vi.mock('./todoService.js', () => ({
  listTodoPage: vi.fn(async (db, userId, { ids }) => {
    const [items] = await db.query(
      'SELECT id, title, priority, status, series_id AS seriesId FROM todo_items WHERE user_id = ? AND id IN (?) AND del_flag = 0',
      [userId, ids],
    );
    return { items };
  }),
}));
import {
  todoWorkspaceGroups,
  todoWorkspaceGroupPage,
  todoWorkspaceSeriesPage,
  workspaceNodeQuery,
  workspaceNodeCountQuery,
} from './todoWorkspaceService.js';

it('validates filters and page size before accessing data', () => {
  expect(() => workspaceNodeQuery('owner', { status: 'unknown' })).toThrow();
  expect(() => workspaceNodeQuery('owner', { limit: 101 })).toThrow();
  expect(() => workspaceNodeQuery('owner', { scope: 'unknown' })).toThrow();
});
it('binds malformed and cross-scope cursors before group queries', async () => {
  const db = { query: vi.fn() };
  await expect(todoWorkspaceGroupPage(db, 'owner', { groupKey: 'focus', cursor: 'bad' })).rejects.toMatchObject({
    code: 'TODO_CURSOR_INVALID',
  });
  expect(db.query).not.toHaveBeenCalled();
});

// Explicitly opt in to a disposable local socket. Never uses application database configuration.
const socket = process.env.TODO_WORKSPACE_TEST_SOCKET || process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socket)('workspace SQL against isolated MySQL', () => {
  let db;
  let created = false;
  const database = `todo_workspace_test_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socket)) throw new Error('Use a temporary isolated test socket');
    db = await mysql.createConnection({ socketPath: socket, user: 'root', dateStrings: true });
    const [[isolation]] = await db.query('SELECT @@global.skip_networking AS isolated');
    if (Number(isolation.isolated) !== 1) throw new Error('Disposable MySQL must disable TCP');
    await db.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    await db.query(`USE ${database}`);
    await db.query(`CREATE TABLE todo_items (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), title VARCHAR(200) DEFAULT '', description TEXT,
      status VARCHAR(16) DEFAULT 'pending', priority INT DEFAULT 1, list_id VARCHAR(64), series_id VARCHAR(64), plan_version INT DEFAULT 2,
      instance_state VARCHAR(16) DEFAULT 'normal', del_flag INT DEFAULT 0, occurrence_date DATE, start_at DATETIME, due_at DATETIME,
      completed_at DATETIME, instance_timezone VARCHAR(64) DEFAULT '+00:00', create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY owner_state(user_id, status, del_flag), KEY series_member(series_id))`);
    await db.query(
      `CREATE TABLE todo_series (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), repeat_mode VARCHAR(24) DEFAULT 'scheduled', timezone VARCHAR(64) DEFAULT '+00:00', create_time DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    );
    await db.query(
      'CREATE TABLE todo_tag_relations (user_id VARCHAR(64), target_type VARCHAR(16), target_id VARCHAR(64), tag_id VARCHAR(64))',
    );
    await db.query('CREATE TABLE tag (id VARCHAR(64), user_id VARCHAR(64), del_flag INT DEFAULT 0)');
    await db.query(`CREATE TABLE todo_reminder_jobs (
      id VARCHAR(64) PRIMARY KEY, todo_id VARCHAR(64), user_id VARCHAR(64), channel VARCHAR(16) DEFAULT 'in_app',
      status VARCHAR(16) DEFAULT 'pending', scheduled_at_local DATETIME, scheduled_at_utc DATETIME,
      sequence_no INT DEFAULT 1, cancel_reason VARCHAR(64), lease_token VARCHAR(64), lease_until DATETIME,
      KEY todo_status(todo_id, user_id, status, scheduled_at_local)
    )`);
    await db.query(`CREATE TABLE todo_reminders (
      id VARCHAR(64) PRIMARY KEY, todo_id VARCHAR(64), user_id VARCHAR(64),
      status VARCHAR(16) DEFAULT 'pending', scheduled_at DATETIME, KEY todo_status(todo_id, user_id, status)
    )`);
    await db.query("SET time_zone = '+00:00'");
  });
  afterAll(async () => {
    if (db) {
      if (created) await db.query(`DROP DATABASE ${database}`);
      await db.end();
    }
  });
  beforeEach(async () => {
    for (const table of [
      'todo_reminder_jobs',
      'todo_reminders',
      'todo_items',
      'todo_series',
      'todo_tag_relations',
      'tag',
    ])
      await db.query(`DELETE FROM ${table}`);
    await db.query(
      "INSERT INTO todo_series (id, user_id) VALUES ('series-a', 'owner'), ('series-b', 'owner'), ('foreign', 'other')",
    );
  });
  async function add(id, patch = {}) {
    const row = { id, user_id: 'owner', title: 'Same title', ...patch };
    await db.query('INSERT INTO todo_items SET ?', row);
  }
  async function date(offset) {
    const [[row]] = await db.query('SELECT DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL ? DAY), "%Y-%m-%d") AS day', [
      offset,
    ]);
    return row.day;
  }
  async function remind(todoId, at, patch = {}) {
    await db.query('INSERT INTO todo_reminder_jobs SET ?', {
      id: randomUUID(),
      todo_id: todoId,
      user_id: 'owner',
      scheduled_at_local: at,
      scheduled_at_utc: at,
      ...patch,
    });
  }
  const nodeId = (node) => (node.kind === 'series' ? node.representative.id : node.item.id);

  it('月历范围按截止日期筛选，覆盖跨月、全天与首尾边界，排除区间相交但截止在月外的任务', async () => {
    await add('cross-month', { start_at: '2026-10-17 19:10:00', due_at: '2026-11-04 13:10:00' });
    await add('start-only', { start_at: '2026-11-08 19:10:00' });
    await add('all-day', { occurrence_date: '2026-11-09' });
    await add('range-start', { due_at: '2026-11-01 00:00:00' });
    await add('range-end', { due_at: '2026-11-30 23:59:59' });
    await add('finishes-next-month', { start_at: '2026-11-10 12:00:00', due_at: '2026-12-01 00:00:00' });
    await add('finished-before-range', { due_at: '2026-10-31 23:59:59' });
    await add('no-date');
    await add('foreign-date', { user_id: 'other', due_at: '2026-11-08 10:00:00' });
    const page = await todoWorkspaceGroupPage(db, 'owner', {
      presentation: 'calendar',
      status: 'all',
      sort: 'due',
      groupKey: 'all',
      rangeStart: '2026-11-01',
      rangeEnd: '2026-11-30',
      limit: 100,
    });
    expect(page.nodes.map(nodeId).sort()).toEqual(
      ['cross-month', 'start-only', 'all-day', 'range-start', 'range-end'].sort(),
    );
    expect(page.total).toBe(5);
    expect(page.nextCursor).toBeNull();
  });

  it('同组无截止任务在分页前按有效提醒升序，忽略已发送、取消、暂停及其他账号的 Job', async () => {
    const tomorrow = await date(1);
    for (const id of ['a-late', 'z-early', 'legacy', 'no-reminder']) {
      await add(id, id === 'no-reminder' ? {} : { occurrence_date: tomorrow, start_at: `${tomorrow} 08:00:00` });
    }
    await remind('a-late', `${tomorrow} 11:10:00`);
    await remind('z-early', `${tomorrow} 10:00:00`);
    for (const status of ['cancelled', 'sent', 'paused']) await remind('a-late', `${tomorrow} 06:00:00`, { status });
    await remind('a-late', `${tomorrow} 05:00:00`, { user_id: 'other' });
    await remind('a-late', `${tomorrow} 12:00:00`, { channel: 'email' });
    await db.query('INSERT INTO todo_reminders SET ?', {
      id: 'legacy-job',
      todo_id: 'legacy',
      user_id: 'owner',
      scheduled_at: `${tomorrow} 09:00:00`,
    });
    const input = { status: 'pending', groupKey: 'unassigned', limit: 1 };
    const ids = [];
    let cursor = null;
    do {
      const page = await todoWorkspaceGroupPage(db, 'owner', { ...input, cursor });
      ids.push(...page.nodes.map(nodeId));
      expect(page.total).toBe(4);
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toEqual(['legacy', 'z-early', 'a-late', 'no-reminder']);
    expect(
      (await todoWorkspaceGroupPage(db, 'owner', { ...input, sort: 'priority', groupKey: 'all', limit: 10 })).nodes.map(
        nodeId,
      ),
    ).toEqual(ids);
  });

  it('稍后提醒后刷新从新的 Job 时间排序，可跨越原计划日期', async () => {
    const tomorrow = await date(1);
    await add('a-early', { occurrence_date: tomorrow, start_at: `${tomorrow} 08:00:00` });
    await add('z-late', { occurrence_date: tomorrow, start_at: `${tomorrow} 08:00:00` });
    await remind('a-early', `${tomorrow} 10:00:00`);
    await remind('z-late', `${tomorrow} 11:10:00`);
    const input = { status: 'pending', groupKey: 'unassigned', limit: 1 };
    const before = await todoWorkspaceGroupPage(db, 'owner', input);
    expect(before.nodes.map(nodeId)).toEqual(['a-early']);
    await snoozeV2Todo(db, 'owner', { id: 'a-early', instance_timezone: '+00:00' }, `${await date(2)} 09:00:00`);
    const after = await todoWorkspaceGroupPage(db, 'owner', input);
    expect(after.nodes.map(nodeId)).toEqual(['z-late']);
    const next = await todoWorkspaceGroupPage(db, 'owner', { ...input, cursor: after.nextCursor });
    expect(next.nodes.map(nodeId)).toEqual(['a-early']);
    expect(next.nextCursor).toBeNull();
  });

  it('提醒同刻维持稳定 ID 排序，截止任务、最近创建及已完成顺序不受提醒改动影响', async () => {
    const tomorrow = await date(1);
    await add('a', { occurrence_date: tomorrow, due_at: `${tomorrow} 12:00:00`, create_time: '2026-01-01' });
    await add('b', { occurrence_date: tomorrow, due_at: `${tomorrow} 13:00:00`, create_time: '2026-02-01' });
    await remind('a', `${tomorrow} 20:00:00`);
    await remind('b', `${tomorrow} 06:00:00`);
    expect((await todoWorkspaceGroupPage(db, 'owner', { groupKey: 'unassigned' })).nodes.map(nodeId)).toEqual([
      'a',
      'b',
    ]);
    expect((await todoWorkspaceGroupPage(db, 'owner', { groupKey: 'all', sort: 'newest' })).nodes.map(nodeId)).toEqual([
      'b',
      'a',
    ]);
    await db.query('UPDATE todo_items SET due_at = NULL WHERE user_id = ?', ['owner']);
    await db.query('UPDATE todo_reminder_jobs SET scheduled_at_local = ? WHERE user_id = ?', [
      `${tomorrow} 10:00:00`,
      'owner',
    ]);
    const first = await todoWorkspaceGroupPage(db, 'owner', { groupKey: 'unassigned', limit: 1 });
    const next = await todoWorkspaceGroupPage(db, 'owner', {
      groupKey: 'unassigned',
      limit: 1,
      cursor: first.nextCursor,
    });
    expect([...first.nodes, ...next.nodes].map(nodeId)).toEqual(['a', 'b']);
    await db.query("UPDATE todo_items SET status='completed', completed_at=IF(id='a','2026-01-01','2026-02-01')");
    expect(
      (await todoWorkspaceGroupPage(db, 'owner', { status: 'completed', groupKey: 'all' })).nodes.map(nodeId),
    ).toEqual(['b', 'a']);
  });
  it('hundreds of occurrences consume one row, with full counts and a today representative', async () => {
    const today = await date(0),
      future = await date(1),
      past = await date(-1);
    for (let n = 0; n < 120; n++)
      await add(`future-${String(n).padStart(3, '0')}`, {
        series_id: 'series-a',
        priority: 2,
        occurrence_date: future,
      });
    await add('today', { series_id: 'series-a', priority: 2, occurrence_date: today });
    await add('overdue', { series_id: 'series-a', priority: 2, due_at: `${past} 20:00:00` });
    await add('single', { priority: 2 });
    const summary = await todoWorkspaceGroups(db, 'owner', { status: 'pending' });
    expect(summary.groups).toEqual([{ key: 'focus', nodeCount: 2, instanceCount: 123 }]);
    const result = await todoWorkspaceGroupPage(db, 'owner', { status: 'pending', groupKey: 'focus' });
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.find((n) => n.kind === 'series')).toMatchObject({
      representative: { id: 'today' },
      instanceCount: 122,
      overdueCount: 1,
      futureCount: 120,
    });
  });
  it('promotes each series once, retaining same-title series and completed history', async () => {
    await add('a', { series_id: 'series-a', priority: 2 });
    await add('b', { series_id: 'series-a', priority: 1 });
    await add('c', { series_id: 'series-a', priority: 2, list_id: 'list-x' });
    await add('d', { series_id: 'series-b', priority: 2 });
    await add('e', { series_id: 'series-a', status: 'completed' });
    await add('f', { series_id: 'missing' });
    const result = await todoWorkspaceGroupPage(db, 'owner', { groupKey: 'all', sort: 'due' });
    expect(result.nodes).toHaveLength(4);
    expect(new Set(result.nodes.map((n) => n.key)).size).toBe(4);
    expect(result.nodes.filter((n) => n.kind === 'item')).toHaveLength(2);
  });
  it('promotes a mixed attention series only once and includes its future membership', async () => {
    await add('overdue', { series_id: 'series-a', due_at: `${await date(-1)} 10:00:00` });
    await add('future', { series_id: 'series-a', occurrence_date: await date(1) });
    await add('other');
    const summary = await todoWorkspaceGroups(db, 'owner', { status: 'pending' });
    expect(summary.groups).toEqual([
      { key: 'focus', nodeCount: 1, instanceCount: 2 },
      { key: 'unassigned', nodeCount: 1, instanceCount: 1 },
    ]);
    const focus = await todoWorkspaceGroupPage(db, 'owner', { status: 'pending', groupKey: 'focus' });
    expect(focus.nodes[0]).toMatchObject({ representative: { id: 'overdue' }, instanceCount: 2, futureCount: 1 });
    const ordinary = await todoWorkspaceGroupPage(db, 'owner', { status: 'pending', groupKey: 'unassigned' });
    expect(ordinary.nodes.map((node) => node.item.id)).toEqual(['other']);
  });
  it('filters before choosing the representative and counting membership', async () => {
    await add('a', { series_id: 'series-a', title: 'match', priority: 2 });
    await add('b', { series_id: 'series-a', title: 'excluded', priority: 2 });
    await db.query("INSERT INTO tag VALUES ('tag-a', 'owner', 0)");
    await db.query("INSERT INTO todo_tag_relations VALUES ('owner','todo','a','tag-a')");
    const result = await todoWorkspaceGroupPage(db, 'owner', {
      groupKey: 'focus',
      keyword: 'match',
      tagIds: ['tag-a'],
    });
    expect(result.nodes[0]).toMatchObject({ representative: { id: 'a' }, instanceCount: 1 });
  });
  it('chooses earliest overdue before future and undated instances', async () => {
    await add('future', { series_id: 'series-a', occurrence_date: await date(1), priority: 2 });
    await add('old', { series_id: 'series-a', due_at: `${await date(-3)} 10:00:00`, priority: 2 });
    await add('new', { series_id: 'series-a', due_at: `${await date(-1)} 10:00:00`, priority: 2 });
    const result = await todoWorkspaceGroupPage(db, 'owner', { groupKey: 'focus' });
    expect(result.nodes[0].representative.id).toBe('old');
  });
  it('paginates stable ties without duplicates and rejects reuse under another owner or filter', async () => {
    for (let n = 0; n < 101; n++) await add(`single-${String(n).padStart(3, '0')}`);
    const input = { groupKey: 'all', sort: 'due', limit: 100 };
    const first = await todoWorkspaceGroupPage(db, 'owner', input);
    expect(first.nodes).toHaveLength(100);
    const second = await todoWorkspaceGroupPage(db, 'owner', { ...input, cursor: first.nextCursor });
    expect(second.nodes).toHaveLength(1);
    expect(new Set([...first.nodes, ...second.nodes].map((n) => n.key)).size).toBe(101);
    await expect(todoWorkspaceGroupPage(db, 'other', { ...input, cursor: first.nextCursor })).rejects.toMatchObject({
      code: 'TODO_CURSOR_INVALID',
    });
    await expect(
      todoWorkspaceGroupPage(db, 'owner', { ...input, keyword: 'x', cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: 'TODO_CURSOR_INVALID' });
  });
  it('series drawer respects filters, explicit whole-series scope and ownership', async () => {
    await add('a', { series_id: 'series-a', priority: 2 });
    await add('b', { series_id: 'series-a', priority: 2, list_id: 'different' });
    await add('c', { series_id: 'series-a', priority: 1 });
    await add('private', { series_id: 'series-a', user_id: 'other', priority: 2 });
    const input = { seriesId: 'series-a', status: 'pending', priority: 2, listId: null };
    expect((await todoWorkspaceSeriesPage(db, 'owner', input)).items.map((i) => i.id)).toEqual(['a']);
    expect((await todoWorkspaceSeriesPage(db, 'owner', { ...input, wholeSeries: true })).total).toBe(3);
    await expect(todoWorkspaceSeriesPage(db, 'owner', { seriesId: 'foreign' })).rejects.toMatchObject({ status: 404 });
  });
  it('resolves IANA dates without MySQL timezone tables', async () => {
    const clock = vi.spyOn(Temporal.Now, 'instant').mockReturnValue(Temporal.Instant.from('2026-09-09T01:00:00Z'));
    try {
      await add('local-today', {
        series_id: 'series-a',
        priority: 2,
        occurrence_date: '2026-09-08',
        instance_timezone: 'America/Los_Angeles',
      });
      await add('utc-today', {
        series_id: 'series-a',
        priority: 2,
        occurrence_date: '2026-09-09',
        instance_timezone: 'America/Los_Angeles',
      });
      const result = await todoWorkspaceGroupPage(db, 'owner', { groupKey: 'focus' });
      expect(result.nodes[0]).toMatchObject({ representative: { id: 'local-today' }, futureCount: 1 });
    } finally {
      clock.mockRestore();
    }
  });
  it('orders series pages by time and completed history in reverse time', async () => {
    await add('later', { series_id: 'series-a', occurrence_date: '2026-10-02' });
    await add('first', { series_id: 'series-a', occurrence_date: '2026-10-01' });
    await add('done-old', { series_id: 'series-a', status: 'completed', completed_at: '2026-10-01 10:00:00' });
    await add('done-new', { series_id: 'series-a', status: 'completed', completed_at: '2026-10-02 10:00:00' });
    const first = await todoWorkspaceSeriesPage(db, 'owner', { seriesId: 'series-a', status: 'pending', limit: 1 });
    expect(first.items[0].id).toBe('first');
    const next = await todoWorkspaceSeriesPage(db, 'owner', {
      seriesId: 'series-a',
      status: 'pending',
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(next.items[0].id).toBe('later');
    const completed = await todoWorkspaceSeriesPage(db, 'owner', { seriesId: 'series-a', status: 'completed' });
    expect(completed.items.map((item) => item.id)).toEqual(['done-new', 'done-old']);
  });
  it('uses MySQL-compatible derived aggregation with an inspectable execution plan', async () => {
    const query = workspaceNodeQuery('owner', { status: 'pending' });
    const [plan] = await db.query(`EXPLAIN ${query.sql}`, query.params);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.some((row) => row.table === 'i')).toBe(true);
  });
  it('specialized counts match full aggregation across filtered membership and legacy states', async () => {
    await db.query("UPDATE todo_series SET repeat_mode='after_completion' WHERE id='series-b'");
    const past = `${await date(-1)} 10:00:00`;
    const rows = [
      ['a', { series_id: 'series-a', priority: 2, title: 'match' }],
      ['b', { series_id: 'series-a', list_id: 'list-x', title: 'excluded' }],
      ['c', { series_id: 'series-b', due_at: past, title: 'match' }],
      ['d', { series_id: 'series-b', list_id: 'list-y' }],
      ['done', { series_id: 'series-a', status: 'completed', priority: 2 }],
      ['legacy-list', { list_id: 'focus' }],
      ['legacy-plan', { series_id: 'series-a', plan_version: 1, priority: 2 }],
      ['missing', { series_id: 'missing', priority: 2 }],
      ['foreign-series', { series_id: 'foreign', priority: 2 }],
      ['deleted', { del_flag: 1, priority: 2 }],
      ['hidden-state', { instance_state: 'skipped', priority: 2 }],
      ['null-state', { instance_state: null }],
      ['foreign-user', { user_id: 'other', priority: 2 }],
    ];
    for (const [id, patch] of rows) await add(id, patch);
    await db.query("INSERT INTO tag VALUES ('tag-a', 'owner', 0)");
    await db.query("INSERT INTO todo_tag_relations VALUES ('owner','todo','a','tag-a')");
    for (const input of [
      { sort: 'due', groupKey: 'all' },
      { status: 'completed', groupKey: 'all' },
      { groupKey: 'focus' },
      { groupKey: 'focus', keyword: 'match' },
      { groupKey: 'focus', tagIds: ['tag-a'] },
      { groupKey: 'focus', priority: 2 },
      { groupKey: 'all', listId: null },
      { groupKey: 'all', sort: 'newest', ids: ['a', 'b', 'done'] },
      { groupKey: 'all', sort: 'oldest', ids: [] },
      { groupKey: 'wrong', sort: 'due' },
      { groupKey: 'ALL', sort: 'due' },
      { groupKey: 'áll', sort: 'due' },
    ]) {
      const baseline = workspaceNodeQuery('owner', input);
      const [[old]] = await db.query(`SELECT COUNT(*) AS total FROM (${baseline.sql}) nodes WHERE groupKey = ?`, [
        ...baseline.params,
        input.groupKey,
      ]);
      const query = workspaceNodeCountQuery('owner', input);
      const [[current]] = await db.query(query.sql, query.params);
      expect(Number(current.total), JSON.stringify(input)).toBe(Number(old.total));
    }
    expect(workspaceNodeCountQuery('owner', { groupKey: 'unassigned' })).toBeNull();
    expect(workspaceNodeCountQuery('owner', { groupKey: 'list-x' })).toBeNull();
  });

  it('counts an ungrouped overview without representative/date aggregation and preserves empty results', async () => {
    await add('a', { series_id: 'series-a' });
    await add('b', { series_id: 'series-a' });
    await add('done', { status: 'completed' });
    const measured = { query: vi.fn((...args) => db.query(...args)) };
    expect((await todoWorkspaceGroups(measured, 'owner', { sort: 'due' })).groups).toEqual([
      { key: 'all', nodeCount: 2, instanceCount: 3 },
    ]);
    expect(measured.query).toHaveBeenCalledTimes(1);
    expect((await todoWorkspaceGroups(measured, 'owner', { sort: 'due', keyword: 'no-match' })).groups).toEqual([]);
  });

  it('compares count plans and timings on 20000 occurrences without changing totals', async () => {
    await db.query('INSERT INTO todo_series (id,user_id) VALUES ?', [
      Array.from({ length: 1000 }, (_, i) => [`scale-${i}`, 'owner']),
    ]);
    for (let start = 0; start < 20000; start += 1000) {
      await db.query('INSERT INTO todo_items (id,user_id,series_id,title,priority,occurrence_date) VALUES ?', [
        Array.from({ length: 1000 }, (_, offset) => {
          const i = start + offset;
          return [`scale-${i}`, 'owner', `scale-${i % 1000}`, 'scale fixture', i < 1000 ? 2 : 1, '2030-01-01'];
        }),
      ]);
    }
    const measurements = [];
    for (const input of [{ groupKey: 'focus' }, { sort: 'due', groupKey: 'all' }]) {
      const baseline = workspaceNodeQuery('owner', input);
      const old = {
        sql: `SELECT COUNT(*) AS total FROM (${baseline.sql}) nodes WHERE groupKey = ?`,
        params: [...baseline.params, input.groupKey],
      };
      const optimized = workspaceNodeCountQuery('owner', input);
      const queries = [old, optimized];
      const samples = [[], []];
      for (const query of queries) {
        const [[result]] = await db.query(query.sql, query.params);
        expect(Number(result.total)).toBe(1000);
      }
      // Warm both plans and alternate execution order; compare medians without
      // a timing assertion that could make shared-runner tests flaky.
      for (let round = 0; round < 3; round += 1) {
        for (const index of round % 2 ? [1, 0] : [0, 1]) {
          const query = queries[index];
          const started = performance.now();
          const [[result]] = await db.query(query.sql, query.params);
          samples[index].push(performance.now() - started);
          expect(Number(result.total)).toBe(1000);
        }
      }
      const times = samples.map((values) => Number(values.sort((a, b) => a - b)[1].toFixed(2)));
      const [plan] = await db.query(`EXPLAIN ${optimized.sql}`, optimized.params);
      expect(plan.some((row) => row.select_type === 'DERIVED')).toBe(false);
      measurements.push({ group: input.groupKey, oldMedianMs: times[0], optimizedMedianMs: times[1], total: 1000 });
    }
    console.log('[todo-workspace-count-benchmark]', JSON.stringify(measurements));
  });
});

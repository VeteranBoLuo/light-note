import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
import { getSuggestionRun, getSuggestionWorkspace } from './organizeSuggestionService.js';

const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `organize_read_${randomUUID().replaceAll('-', '')}`;
describe.skipIf(!socket)('整理结果分组读取 · 隔离 MySQL', () => {
  let admin,
    db,
    created = false;
  const queryLog = [];
  const reader = {
    query: (sql, params) => {
      if (!/^SELECT\s/i.test(sql.trim())) throw Error('Read path must not write');
      queryLog.push(sql);
      return db.query(sql, params);
    },
  };
  const id = (n) => String(n).padStart(4, '0');
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socket)) throw Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@skip_networking AS isolated');
    if (Number(runtime.isolated) !== 1) throw Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = mysql.createPool({ socketPath: socket, user: 'root', database: schema, multipleStatements: true });
    for (const name of [
      '20260905_organize_suggestion_runs.sql',
      '20260906_organize_run_lifecycle.sql',
      '20260911_organize_processing_jobs.sql',
    ])
      await db.query(await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
    for (const [name, owner] of [
      ['bookmark', 'user_id'],
      ['note', 'create_by'],
      ['files', 'create_by'],
      ['tag', 'user_id'],
    ])
      await db.query(
        `CREATE TABLE ${name}(id VARCHAR(128) PRIMARY KEY, ${owner} VARCHAR(255), del_flag INT DEFAULT 0) CHARACTER SET utf8 COLLATE utf8_general_ci`,
      );
    await db.query(
      'CREATE TABLE resource_tag_relations(user_id VARCHAR(255),resource_type VARCHAR(16),resource_id VARCHAR(128),tag_id VARCHAR(128))',
    );
    const options = JSON.stringify({ resourceTypes: ['bookmark'], checks: ['tags', 'title'], scope: 'all', items: [] });
    await db.query(
      "INSERT INTO organize_suggestion_runs(id,user_id,request_id,options_json,summary_json,status,run_version) VALUES ('run','owner','request',?,?,'completed',3)",
      [options, JSON.stringify({ total: 260, types: { bookmark: 260 } })],
    );
    await db.query('INSERT INTO bookmark(id,user_id) VALUES ?', [
      Array.from({ length: 260 }, (_, n) => [id(n), 'owner']),
    ]);
    await db.query(
      'INSERT INTO organize_suggestion_items(id,run_id,user_id,resource_type,resource_id,snapshot_json,version_hash,ai_kinds_json,ai_status,rule_status) VALUES ?',
      [
        Array.from({ length: 260 }, (_, n) => [
          id(n),
          'run',
          'owner',
          'bookmark',
          id(n),
          JSON.stringify({ id: id(n), type: 'bookmark', title: `资料 ${n}`, source: { folder: '' }, guards: {} }),
          'v',
          '["tags"]',
          'completed',
          'completed',
        ]),
      ],
    );
    await db.query('INSERT INTO organize_suggestions(id,item_id,run_id,user_id,kind,status,payload_json) VALUES ?', [
      Array.from({ length: 260 }, (_, n) => [
        `s${id(n)}`,
        id(n),
        'run',
        'owner',
        'tags',
        'not_applicable',
        JSON.stringify({ kind: 'tags', after: [{ id: 't', name: '主题' }] }),
      ]),
    ]);
  });
  beforeEach(async () => {
    await db.query("UPDATE organize_suggestion_runs SET status='completed',run_version=3");
    await db.query('UPDATE bookmark SET del_flag=0');
    await db.query(
      "UPDATE organize_suggestions SET status=CASE WHEN item_id<'0243' THEN 'not_applicable' WHEN item_id<'0249' THEN 'insufficient' WHEN item_id<'0252' THEN 'failed' WHEN item_id<'0256' THEN 'applied' ELSE 'ignored' END",
    );
    queryLog.length = 0;
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  it('260 项首屏只读取 9 项需处理对象，摘要与旧接口一致，安静分组只带计数', async () => {
    const previous = [];
    let after = '',
      next;
    const oldStart = performance.now();
    do {
      next = await getSuggestionRun(reader, { userId: 'owner', id: 'run', resourceType: 'bookmark', after });
      previous.push(...next.items);
      after = next.nextCursor;
    } while (after);
    const oldMs = performance.now() - oldStart,
      oldQueries = queryLog.length;
    queryLog.length = 0;
    const start = performance.now();
    const result = await getSuggestionWorkspace(reader, { userId: 'owner' });
    const currentMs = performance.now() - start;
    expect(previous).toHaveLength(260);
    expect(result.review).toEqual(next.review);
    expect(result.overview).toEqual(next.overview);
    expect(result.groupTotals).toEqual({ clear: 243, manual: 6, unfinished: 3, reviewed: 8 });
    expect(Object.values(result.pages).flatMap((page) => page.items)).toHaveLength(9);
    expect(result.pages.clear).toBeUndefined();
    expect(queryLog.length).toBeLessThan(oldQueries / 3);
    expect(queryLog.filter((sql) => sql.includes('FROM organize_suggestion_runs'))).toHaveLength(1);
    console.info(
      JSON.stringify({
        scenario: '260 completed bookmarks',
        oldQueries,
        newQueries: queryLog.length,
        oldMs: Math.round(oldMs),
        newMs: Math.round(currentMs),
      }),
    );
  });
  it('折叠分组游标有界且完整，续页不重算摘要或审核总数', async () => {
    const ids = [];
    let after = '',
      page;
    do {
      page = await getSuggestionRun(reader, {
        userId: 'owner',
        id: 'run',
        resourceType: 'bookmark',
        group: 'clear',
        after,
      });
      expect(page.items.length).toBeLessThanOrEqual(30);
      expect(page.overview).toBeUndefined();
      ids.push(...page.items.map((item) => item.id));
      after = page.nextCursor;
    } while (after);
    expect(ids).toEqual(Array.from({ length: 243 }, (_, n) => id(n)));
    expect(
      queryLog.some((sql) => sql.includes('manual_objects') || sql.includes('GROUP BY resource_type,ai_status')),
    ).toBe(false);
  });
  it('后页可应用建议决定批量入口，检查筛选不扩大批量范围', async () => {
    await db.query("UPDATE organize_suggestions SET status='pending' WHERE item_id='0259'");
    const result = await getSuggestionWorkspace(reader, { userId: 'owner' });
    expect(result.batchAvailable).toBe(true);
    expect(result.pages.priority.items.map((item) => item.id)).toEqual(['0259']);
    const filtered = await getSuggestionWorkspace(reader, {
      userId: 'owner',
      preferredRunId: 'run',
      resourceType: 'bookmark',
      kind: 'title',
    });
    expect(filtered.batchAvailable).toBe(false);
    expect(Object.values(filtered.pages).flatMap((page) => page.items)).toEqual([]);
  });
  it('审核过滤、外部删除、历史协议与所有权在分组读取中保持一致', async () => {
    for (const version of [1, 2, 3]) {
      await db.query('UPDATE organize_suggestion_runs SET run_version=?', [version]);
      await db.query("UPDATE bookmark SET del_flag=1 WHERE id='0000'");
      const reviewed = await getSuggestionRun(reader, {
        userId: 'owner',
        id: 'run',
        group: 'reviewed',
        reviewState: 'ignored',
      });
      expect(reviewed.items.map((item) => item.id)).toEqual(['0256', '0257', '0258', '0259']);
      const missing = await getSuggestionRun(reader, { userId: 'owner', id: 'run', group: 'expired' });
      expect(missing.items.map((item) => item.id)).toEqual(['0000']);
    }
    expect(await getSuggestionWorkspace(reader, { userId: 'other' })).toBeNull();
    await expect(getSuggestionRun(reader, { userId: 'other', id: 'run', group: 'clear' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(getSuggestionRun(reader, { userId: 'owner', id: 'run', group: 'invalid' })).rejects.toMatchObject({
      code: 'ORGANIZE_GROUP_INVALID',
    });
  });
  it('新任务不会继承旧任务的资源筛选、折叠状态或分页游标', async () => {
    const result = await getSuggestionWorkspace(reader, {
      userId: 'owner',
      preferredRunId: 'old',
      resourceType: 'tag',
      kind: 'empty',
      groups: [],
      after: 'zzzz',
    });
    expect(result.resourceType).toBe('bookmark');
    expect(result.kind).toBe('');
    expect(Object.values(result.pages).flatMap((page) => page.items)).toHaveLength(9);
  });
  it('大量历史任务下按当前任务和账号判定条目状态，并复用已有联合索引', async () => {
    const statuses = [
      'queued',
      'waiting',
      'running',
      'failed',
      'conflict',
      'partial',
      'cancelled',
      'completed',
      'skipped',
    ];
    const jobs = statuses.map((status, n) => [
      `scope-job-${n}`,
      'run',
      id(n),
      'owner',
      `scope-work-${n}`,
      'analysis',
      'ai',
      status,
    ]);
    // 同一条目 ID 出现在其他任务或异常归属记录中，也不能改变当前账号的状态。
    jobs.push(
      ['scope-other-run', 'other-run', id(9), 'owner', 'scope-work', 'analysis', 'ai', 'running'],
      ['scope-other-owner', 'run', id(10), 'other-owner', 'scope-work', 'analysis', 'ai', 'failed'],
      ...Array.from({ length: 12_000 }, (_, n) => [
        `scope-history-${n}`,
        'history-run',
        `history-item-${n}`,
        'other-owner',
        `history-work-${n}`,
        'analysis',
        'ai',
        n % 2 ? 'completed' : 'queued',
      ]),
    );
    try {
      await db.query(
        'INSERT INTO organize_processing_jobs(id,run_id,item_id,user_id,work_key,kind,lane,status) VALUES ?',
        [jobs],
      );
      const result = await getSuggestionRun(reader, {
        userId: 'owner',
        id: 'run',
        resourceType: 'bookmark',
        groups: ['unfinished', 'clear'],
      });
      expect(result.groupTotals).toEqual({ clear: 236, manual: 6, unfinished: 10, reviewed: 8 });
      expect(result.pages.unfinished.items.map((item) => item.id)).toEqual([
        ...Array.from({ length: 7 }, (_, n) => id(n)),
        '0249',
        '0250',
        '0251',
      ]);
      expect(result.pages.clear.items.map((item) => item.id)).toEqual(
        expect.arrayContaining(['0007', '0008', '0009', '0010']),
      );
      const outcomeQuery = queryLog.find((sql) => sql.startsWith('SELECT i.id,i.resource_type'));
      expect(outcomeQuery).toBeDefined();
      const [plan] = await db.query(`EXPLAIN ${outcomeQuery}`, ['run', 'owner']);
      const jobReads = plan.filter((step) => step.table === 'j');
      const [indexes] = await db.query('SHOW INDEX FROM organize_processing_jobs');
      const scopedIndexes = new Set(
        indexes
          .filter((index) => index.Seq_in_index === 1 && index.Column_name === 'run_id')
          .map((index) => index.Key_name),
      );
      expect(jobReads).toHaveLength(2);
      for (const step of jobReads) {
        expect(scopedIndexes.has(step.key)).toBe(true);
        expect(step.type).not.toBe('ALL');
        expect(Number(step.rows)).toBeLessThan(100);
      }
    } finally {
      await db.query("DELETE FROM organize_processing_jobs WHERE id LIKE 'scope-%'");
    }
  });
  it('跨页分组按对象计数，批量读取同时遵守类型与检查筛选', async () => {
    await db.query("UPDATE organize_suggestions SET status='pending' WHERE item_id<'0065'");
    try {
      await db.query('INSERT INTO organize_suggestions(id,item_id,run_id,user_id,kind,status,payload_json) VALUES ?', [
        Array.from({ length: 35 }, (_, n) => [
          `title${id(n)}`,
          id(n),
          'run',
          'owner',
          'title',
          'pending',
          JSON.stringify({ kind: 'title', after: `标题 ${n}` }),
        ]),
      ]);
      const all = await getSuggestionWorkspace(reader, { userId: 'owner' });
      expect(all.groupTotals.priority).toBe(65);
      expect(all.review.pending).toBe(100);
      expect(Object.values(all.groupTotals).reduce((sum, count) => sum + count, 0)).toBe(260);
      const filtered = await getSuggestionRun(reader, {
        userId: 'owner',
        id: 'run',
        resourceType: 'bookmark',
        kind: 'title',
        groups: ['priority'],
      });
      expect(filtered.groupTotals).toEqual({ priority: 35 });
      expect(filtered.batchAvailable).toBe(true);
      const first = filtered.pages.priority;
      expect(first.items).toHaveLength(30);
      const rest = await getSuggestionRun(reader, {
        userId: 'owner',
        id: 'run',
        resourceType: 'bookmark',
        kind: 'title',
        group: 'priority',
        after: first.nextCursor,
      });
      expect([...first.items, ...rest.items].map((item) => item.id)).toEqual(
        Array.from({ length: 35 }, (_, n) => id(n)),
      );
      expect(rest.nextCursor).toBeNull();
      const notes = await getSuggestionRun(reader, {
        userId: 'owner',
        id: 'run',
        resourceType: 'note',
        group: 'priority',
      });
      expect(notes.items).toEqual([]);
    } finally {
      await db.query("DELETE FROM organize_suggestions WHERE kind='title'");
    }
  });
});

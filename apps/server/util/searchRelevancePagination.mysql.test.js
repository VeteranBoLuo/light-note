import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const pool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: pool }));
vi.mock('./common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  formatDateTime: (date) => date.toISOString().slice(0, 19).replace('T', ' '),
}));
import { globalSearch } from '../router_handle/searchHandle.js';
import { detectSignatures } from './security/detectors/signatureDetector.js';
const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;

describe.skipIf(!socket)('cross-type relevance pagination (isolated MySQL)', () => {
  let admin,
    db,
    created = false;
  const schema = `search_rank_${randomUUID().replaceAll('-', '')}`;
  const tables = [
    'collection_form_tags',
    'collection_forms',
    'resource_tag_relations',
    'todo_tag_relations',
    'todo_resource_refs',
    'bookmark',
    'note',
    'files',
    'folders',
    'tag',
    'todo_items',
  ];
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socket)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    const [[isolation]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(isolation.isolated) !== 1) throw new Error('Disposable MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = await mysql.createConnection({ socketPath: socket, user: 'root', database: schema });
    await db.query(`CREATE TABLE bookmark (id VARCHAR(36) PRIMARY KEY,user_id VARCHAR(36),del_flag INT DEFAULT 0,
      name VARCHAR(255),description TEXT,url VARCHAR(255),create_time DATETIME(6),is_top INT DEFAULT 0,sort INT DEFAULT 0)`);
    await db.query(`CREATE TABLE note (id VARCHAR(36) PRIMARY KEY,create_by VARCHAR(36),del_flag INT DEFAULT 0,
      title VARCHAR(255),content TEXT,type VARCHAR(30) DEFAULT 'html',create_time DATETIME(6),update_time DATETIME(6),
      update_by VARCHAR(36),deleted_at DATETIME,revision INT DEFAULT 1,parent_id VARCHAR(36),tree_delete_batch_id VARCHAR(36),
      is_top INT DEFAULT 0,sort INT DEFAULT 0,KEY idx_note_parent (parent_id))`);
    await db.query(`CREATE TABLE files (id INT PRIMARY KEY,create_by VARCHAR(36),del_flag INT DEFAULT 0,
      file_name VARCHAR(255),file_type VARCHAR(100),file_size BIGINT DEFAULT 0,folder_id INT,create_time DATETIME(6))`);
    await db.query(`CREATE TABLE folders (id INT PRIMARY KEY,name VARCHAR(255))`);
    await db.query(`CREATE TABLE tag (id VARCHAR(36) PRIMARY KEY,user_id VARCHAR(36),name VARCHAR(255),description TEXT,
      del_flag INT DEFAULT 0,sort INT DEFAULT 0,create_time DATETIME(6),icon_url TEXT)`);
    await db.query(`CREATE TABLE todo_items (id VARCHAR(36) PRIMARY KEY,user_id VARCHAR(36),title VARCHAR(255),description TEXT,
      status VARCHAR(20) DEFAULT 'pending',priority INT DEFAULT 1,due_at DATETIME(6),completed_at DATETIME,
      update_time DATETIME(6),del_flag INT DEFAULT 0,instance_state VARCHAR(20) DEFAULT 'normal')`);
    await db.query(
      `CREATE TABLE resource_tag_relations (tag_id VARCHAR(36),user_id VARCHAR(36),resource_id VARCHAR(36),resource_type VARCHAR(20))`,
    );
    await db.query(
      `CREATE TABLE todo_tag_relations (tag_id VARCHAR(36),user_id VARCHAR(36),target_id VARCHAR(36),target_type VARCHAR(20))`,
    );
    await db.query(`CREATE TABLE todo_resource_refs (todo_id VARCHAR(36),user_id VARCHAR(36))`);
    await db.query('CREATE TABLE collection_form_tags (form_id VARCHAR(36),tag_id VARCHAR(36),user_id VARCHAR(36))');
    await db.query('CREATE TABLE collection_forms (id VARCHAR(36) PRIMARY KEY,user_id VARCHAR(36))');
    pool.query.mockImplementation((sql, params) => db.query(sql, params));
  });
  beforeEach(async () => {
    for (const table of tables) await db.query(`DELETE FROM ${table}`);
    pool.query.mockClear();
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  async function insert(table, data) {
    await db.query(`INSERT INTO ${table} SET ?`, data);
  }
  async function request(body = {}, user = 'owner') {
    if (body.cursor?.seek) {
      expect(
        detectSignatures({
          method: 'POST',
          path: '/api/search/global',
          query: {},
          params: {},
          body: { keyword: 'needle', sort: 'relevance', paginationMode: 'ordered', ...body },
          headersSummary: {},
          files: [],
        }),
      ).toEqual([]);
    }
    const res = { send: vi.fn() };
    await globalSearch(
      {
        user: { id: user },
        headers: {},
        body: {
          keyword: 'needle',
          sort: 'relevance',
          paginationMode: 'ordered',
          pageSize: 40,
          types: ['bookmark', 'note', 'file', 'tag', 'todo'],
          includeMetadata: false,
          ...body,
        },
      },
      res,
    );
    return res.send.mock.calls.at(-1)[0];
  }
  function checkPageReads(data, hasCursor) {
    const calls = pool.query.mock.calls;
    const ranked = calls.filter(([sql]) => sql.includes(') ranked_search'));
    expect(ranked).toHaveLength(1);
    expect(ranked[0][1].slice(hasCursor ? -1 : -2)).toEqual(hasCursor ? [41] : [41, 0]);
    if (hasCursor) expect(ranked[0][0]).not.toContain('OFFSET');
    const hydration = calls.filter(([sql]) => /LIMIT \? OFFSET \?/.test(sql) && !sql.includes(') ranked_search'));
    const returned = new Set(data.items.map((item) => item.id));
    expect(hydration.reduce((n, [, params]) => n + params.at(-2), 0)).toBe(data.items.length);
    for (const [sql, params] of hydration) {
      expect(sql).toMatch(/\.id IN \(/);
      expect(params.at(-1)).toBe(0);
      // Full body/tag queries are scoped to returned IDs, never to all prefix candidates.
      expect(params.some((param) => returned.has(String(param)))).toBe(true);
    }
    expect(calls.some(([sql]) => sql.includes('COUNT(*) AS total'))).toBe(false);
  }

  it('ranks before limiting, visits beyond 500/type and hydrates only the current page', async () => {
    for (let i = 1; i <= 520; i += 1)
      await insert('bookmark', {
        id: `b${String(i).padStart(3, '0')}`,
        user_id: 'owner',
        name: 'other',
        description: 'needle detail',
        sort: i,
      });
    await insert('tag', { id: 'tag-exact', user_id: 'owner', name: 'needle' });
    await insert('resource_tag_relations', {
      tag_id: 'tag-exact',
      user_id: 'owner',
      resource_type: 'bookmark',
      resource_id: 'b520',
    });
    await insert('bookmark', { id: 'b-exact', user_id: 'owner', name: 'needle' });
    await insert('bookmark', { id: 'b-url', user_id: 'owner', name: 'other', url: 'https://example.test/needle' });
    await insert('bookmark', { id: 'b-accent', user_id: 'owner', name: 'néedle' });
    await insert('bookmark', { id: 'b-other-owner', user_id: 'other', name: 'needle' });
    await insert('bookmark', { id: 'b-deleted', user_id: 'owner', name: 'needle', del_flag: 1 });
    await insert('note', { id: 'n-exact', create_by: 'owner', title: 'needle' });
    await insert('note', { id: 'n-body', create_by: 'owner', title: 'other', content: '<p>needle</p>' });
    await insert('note', { id: 'n-drawing', create_by: 'owner', title: 'other', type: 'drawing', content: 'needle' });
    for (const id of [2, 10])
      await insert('files', { id, create_by: 'owner', file_name: 'needle', create_time: '2026-09-01 00:00:00.000001' });
    await insert('todo_items', { id: 't-exact', user_id: 'owner', title: 'needle', status: 'pending' });
    await insert('todo_items', { id: 't-done', user_id: 'owner', title: 'needle', status: 'completed' });
    await insert('todo_items', { id: 't-body', user_id: 'owner', title: 'other', description: 'needle' });
    await insert('todo_items', { id: 't-tag', user_id: 'owner', title: 'other' });
    await insert('todo_tag_relations', {
      tag_id: 'tag-exact',
      user_id: 'owner',
      target_type: 'todo',
      target_id: 't-tag',
    });
    const expected = [
      't-exact',
      'b-exact',
      'n-exact',
      '10',
      '2',
      'tag-exact',
      't-done',
      't-tag',
      'b520',
      'b-url',
      't-body',
      ...Array.from({ length: 519 }, (_, i) => `b${String(i + 1).padStart(3, '0')}`),
      'n-body',
      'b-accent',
    ];
    const actual = [];
    let cursor;
    for (let page = 0; page < 20; page += 1) {
      pool.query.mockClear();
      const response = await request({ cursor });
      expect(response.status).toBe(200);
      checkPageReads(response.data, Boolean(cursor));
      actual.push(...response.data.items.map((item) => item.id));
      if (!cursor) {
        expect(response.data.items.find((item) => item.id === 'b520').matchReason).toBe('tag');
        expect(response.data.items.find((item) => item.id === 't-done').matchReason).toBe('title_exact');
      }
      cursor = response.data.nextCursor;
      if (!cursor) break;
    }
    expect(actual).toEqual(expected);
    const legacy = await request({ cursor: { type: 'all', offset: 500 } });
    expect(legacy.status).toBe(200);
    expect(legacy.data.items.map((item) => item.id)).toEqual(expected.slice(500, 540));
    expect(legacy.data.nextCursor).toBeNull();
  });

  it('preserves filters and rejects cross-owner/filter/type cursors before SQL', async () => {
    await insert('tag', { id: 'filter', user_id: 'owner', name: 'filter' });
    for (let i = 1; i <= 4; i += 1) {
      await insert('todo_items', {
        id: `t${i}`,
        user_id: 'owner',
        title: 'needle',
        status: i === 4 ? 'completed' : 'pending',
        priority: i === 3 ? 0 : 2,
      });
      await insert('todo_tag_relations', {
        tag_id: 'filter',
        user_id: 'owner',
        target_type: 'todo',
        target_id: `t${i}`,
      });
    }
    const filters = {
      types: ['bookmark', 'todo'],
      tags: ['filter'],
      todoStatus: 'pending',
      todoPriority: [2],
      todoDue: 'none',
      pageSize: 1,
    };
    const first = await request(filters);
    expect(first.status).toBe(200);
    expect(first.data.items.map((item) => item.id)).toEqual(['t2']);
    const next = await request({ ...filters, cursor: first.data.nextCursor });
    expect(next.data.items.map((item) => item.id)).toEqual(['t1']);
    expect(next.data.nextCursor).toBeNull();
    for (const [change, owner] of [
      [{}, 'other'],
      [{ tags: [] }, 'owner'],
      [{ types: ['note', 'todo'] }, 'owner'],
      [{ sort: 'updated' }, 'owner'],
    ]) {
      pool.query.mockClear();
      const invalid = await request({ ...filters, ...change, cursor: first.data.nextCursor }, owner);
      expect(invalid.status).toBe(400);
      expect(pool.query).not.toHaveBeenCalled();
    }
  });

  it('keeps exact matches literal and orders equal pending tasks by due date including NULL', async () => {
    for (const [id, title, due_at] of [
      ['a', 'a_b', null],
      ['b', 'a_b', '2026-09-01 00:00:00.000001'],
      ['c', 'a_b', '2026-09-01 00:00:00.000002'],
      ['d', 'axb', null],
    ])
      await insert('todo_items', { id, user_id: 'owner', title, due_at });
    const ids = [];
    let cursor;
    for (let i = 0; i < 5; i += 1) {
      const response = await request({ keyword: 'a_b', types: ['bookmark', 'todo'], pageSize: 1, cursor });
      expect(response.status).toBe(200);
      ids.push(...response.data.items.map((item) => item.id));
      cursor = response.data.nextCursor;
      if (!cursor) break;
    }
    expect(ids).toEqual(['b', 'c', 'a', 'd']);
  });
  it('does not skip successors when the anchor is deleted or newer matches are inserted', async () => {
    for (let i = 1; i <= 5; i += 1)
      await insert('bookmark', { id: `b${i}`, user_id: 'owner', name: 'needle', sort: i });
    const first = await request({ types: ['bookmark', 'tag'], pageSize: 2 });
    expect(first.data.items.map((item) => item.id)).toEqual(['b1', 'b2']);
    await db.query("DELETE FROM bookmark WHERE id='b2'");
    await insert('bookmark', { id: 'new', user_id: 'owner', name: 'needle', sort: 0 });
    const next = await request({ types: ['bookmark', 'tag'], pageSize: 2, cursor: first.data.nextCursor });
    expect(next.data.items.map((item) => item.id)).toEqual(['b3', 'b4']);
    const last = await request({ types: ['bookmark', 'tag'], pageSize: 2, cursor: next.data.nextCursor });
    expect(last.data.items.map((item) => item.id)).toEqual(['b5']);
  });

  it('avoids transferring and parsing the hydrated note prefix on deep pages', async () => {
    const content = '<p>needle ' + '正文'.repeat(8000) + '</p>';
    for (let start = 0; start < 480; start += 40)
      await db.query('INSERT INTO note (id,create_by,title,content,sort) VALUES ?', [
        Array.from({ length: 40 }, (_, i) => [
          `n${String(start + i + 1).padStart(3, '0')}`,
          'owner',
          'other',
          content,
          start + i + 1,
        ]),
      ]);
    const previous = await request({ types: ['bookmark', 'note'], cursor: { type: 'all', offset: 360 } });
    expect(previous.status).toBe(200);
    pool.query.mockClear();
    const started = performance.now();
    const page = await request({ types: ['bookmark', 'note'], cursor: previous.data.nextCursor });
    const pageMs = performance.now() - started;
    expect(page.status).toBe(200);
    expect(page.data.items.map((item) => item.id)).toEqual(Array.from({ length: 40 }, (_, i) => `n${401 + i}`));
    const [hydrationSql, hydrationParams] = pool.query.mock.calls.find(
      ([sql]) => sql.includes('FROM note n') && !sql.includes(') ranked_search'),
    );
    // The previous implementation hydrated offset + pageSize + 1 (441) rows before slicing.
    // Replay that real SQL projection/order, removing only the new page-ID filter.
    const oldSql = hydrationSql.replace(/n\.id IN \([^)]*\) AND /, '');
    const oldParams = [...hydrationParams.slice(0, 3), ...hydrationParams.slice(3 + 40)];
    oldParams.splice(-2, 2, 441, 0);
    const [oldRows] = await db.query(oldSql, oldParams);
    expect(oldRows).toHaveLength(441);
    expect(oldRows.slice(400, 440).map((row) => row.id)).toEqual(page.data.items.map((item) => item.id));
    const oldBodyBytes = oldRows.reduce((sum, row) => sum + Buffer.byteLength(row.content), 0);
    const pageBodyBytes = page.data.items.reduce((sum, item) => sum + Buffer.byteLength(item.raw.content), 0);
    expect(pageBodyBytes).toBeLessThan(oldBodyBytes / 10);
    console.log(
      '[search-relevance-transfer]',
      JSON.stringify({
        matchedNotes: 480,
        offset: 400,
        oldHydrated: oldRows.length,
        hydrated: page.data.items.length,
        oldBodyBytes,
        pageBodyBytes,
        pageMs,
      }),
    );
  });
  it('keeps page hydration bounded while measuring exact body-match scans at account scale', async () => {
    const results = [];
    const status = async () => {
      const [rows] = await db.query(
        "SHOW SESSION STATUS WHERE Variable_name IN ('Handler_read_rnd_next','Handler_read_next')",
      );
      return Object.fromEntries(rows.map((row) => [row.Variable_name, Number(row.Value)]));
    };
    for (const count of [500, 5000]) {
      await db.query('DELETE FROM note');
      const text = '<p>needle ' + '正文'.repeat(1000) + '</p>';
      for (let start = 0; start < count; start += 50) {
        await db.query('INSERT INTO note (id,create_by,title,content,sort) VALUES ?', [
          Array.from({ length: Math.min(50, count - start) }, (_, i) => [
            `scale-${String(start + i).padStart(6, '0')}`,
            'owner',
            'Other',
            text + (start + i === count - 1 ? ' unique-last-marker' : ''),
            start + i,
          ]),
        ]);
      }
      for (const keyword of ['needle', 'unique-last-marker', 'absent-marker']) {
        pool.query.mockClear();
        const before = await status(),
          started = performance.now();
        const page = await request({ types: ['bookmark', 'note'], keyword });
        const elapsedMs = performance.now() - started,
          after = await status();
        expect(page.status).toBe(200);
        expect(page.data.items).toHaveLength(keyword === 'needle' ? 40 : keyword === 'unique-last-marker' ? 1 : 0);
        if (keyword === 'unique-last-marker')
          expect(page.data.items[0].id).toBe(`scale-${String(count - 1).padStart(6, '0')}`);
        const bodyBytes = page.data.items.reduce((sum, item) => sum + Buffer.byteLength(item.raw.content), 0);
        expect(bodyBytes).toBeLessThan(250000);
        results.push({
          rows: count,
          keyword,
          elapsedMs,
          bodyBytes,
          returned: page.data.items.length,
          handlerReads:
            after.Handler_read_next -
            before.Handler_read_next +
            (after.Handler_read_rnd_next - before.Handler_read_rnd_next),
        });
      }
    }
    console.log('[search-body-scan-scale]', JSON.stringify(results));
  });
  it('keeps tag navigation separate and preserves first-page totals', async () => {
    await insert('bookmark', { id: 'b1', user_id: 'owner', name: 'needle' });
    await insert('todo_items', { id: 't1', user_id: 'owner', title: 'needle' });
    await insert('tag', { id: 'tag1', user_id: 'owner', name: 'needle', icon_url: 'fixture-icon' });
    await insert('resource_tag_relations', {
      tag_id: 'tag1',
      user_id: 'owner',
      resource_type: 'bookmark',
      resource_id: 'b1',
    });
    const first = await request({ separateTagMatches: true, includeMetadata: true, pageSize: 1 });
    expect(first.status).toBe(200);
    expect(first.data.items.map((item) => item.id)).toEqual(['t1']);
    expect(first.data.typeTotals).toEqual({ bookmark: 1, note: 0, file: 0, todo: 1, tag: 0 });
    expect(first.data.total).toBe(2);
    expect(first.data.tagMatches).toEqual([
      expect.objectContaining({
        id: 'tag1',
        iconUrl: 'fixture-icon',
        counts: { bookmark: 1, note: 0, file: 0, total: 1 },
      }),
    ]);
    const next = await request({ separateTagMatches: true, pageSize: 1, cursor: first.data.nextCursor });
    expect(next.data.items.map((item) => item.id)).toEqual(['b1']);
    expect(next.data.nextCursor).toBeNull();
    expect(next.data).not.toHaveProperty('tagMatches');
  });
});

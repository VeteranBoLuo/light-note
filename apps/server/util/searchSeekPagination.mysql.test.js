import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { searchOrderKeys, buildSearchSeek, takeSearchSeekRows, searchSeekScope } from './searchSeekPagination.js';
const pool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: pool }));
vi.mock('./common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  formatDateTime: (date) => date.toISOString().slice(0, 19).replace('T', ' '),
}));
import { globalSearch } from '../router_handle/searchHandle.js';
const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;

describe.skipIf(!socket)('search seek ordering (isolated MySQL)', () => {
  let admin,
    db,
    created = false;
  const schema = `search_seek_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socket)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    const [[isolation]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(isolation.isolated) !== 1) throw new Error('Disposable MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = await mysql.createConnection({ socketPath: socket, user: 'root', database: schema });
    await db.query(`CREATE TABLE things (id BIGINT PRIMARY KEY, owner VARCHAR(36), title VARCHAR(255),
      is_top INT, sort INT, create_time DATETIME(6), update_time DATETIME(6), due_at DATETIME(6), status VARCHAR(20), del_flag INT DEFAULT 0,
      KEY owner (owner), KEY recent (create_time, del_flag, owner))`);
    for (let i = 0; i < 27; i += 1)
      await db.query(
        'INSERT INTO things (id,owner,title,is_top,sort,create_time,update_time,due_at,status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          String(9007199254740993n + BigInt(i)),
          'owner',
          [null, '', 'Alpha', 'álpha', '中文', 'prefix alpha'][i % 6],
          i % 3 ? i % 2 : null,
          i % 4 ? i % 3 : null,
          i % 5 ? `2026-09-01 01:00:00.${String(i % 4).padStart(6, '0')}` : null,
          i % 3 ? '2026-09-02 00:00:00.000001' : null,
          i % 4 ? '2026-09-03 00:00:00.000002' : null,
          i % 2 ? 'pending' : 'completed',
        ],
      );
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });

  it('matches complete ordering for all five resource patterns, relevance tiers, nulls and microseconds', async () => {
    const definitions = [
      { updatedColumn: 't.create_time', fallbackOrder: 't.is_top DESC, t.sort, t.create_time DESC' },
      {
        updatedColumn: 'COALESCE(t.update_time, t.create_time)',
        fallbackOrder: 't.is_top DESC, t.sort, COALESCE(t.update_time, t.create_time) DESC',
      },
      { updatedColumn: 't.create_time', fallbackOrder: 't.create_time DESC' },
      { updatedColumn: 't.create_time', fallbackOrder: 't.sort, t.create_time DESC' },
      {
        updatedColumn: 't.update_time',
        fallbackOrder: "(t.status = 'pending') DESC, t.due_at IS NULL ASC, t.due_at ASC, t.update_time DESC",
      },
    ];
    for (const definition of definitions)
      for (const sort of ['updated', 'name', 'relevance'])
        for (const keyword of ['', 'alpha', '中文']) {
          const keys = searchOrderKeys({ ...definition, sort, keyword, titleColumn: 't.title', idColumn: 't.id' });
          const order = keys.map((key) => `${key.sql} ${key.direction}`).join(', ');
          const orderParams = keys.flatMap((key) => key.params || []);
          // Independent pre-seek order contract, so key generation cannot silently alter ordering.
          const originalOrder =
            sort === 'updated'
              ? `${definition.updatedColumn} DESC, t.id DESC`
              : sort === 'name'
                ? "LOWER(COALESCE(t.title, '')) ASC, t.id DESC"
                : `${keyword ? "CASE WHEN LOWER(COALESCE(t.title, '')) = LOWER(?) THEN 3 WHEN LOWER(COALESCE(t.title, '')) LIKE LOWER(?) THEN 2 WHEN LOWER(COALESCE(t.title, '')) LIKE LOWER(?) THEN 1 ELSE 0 END DESC, " : ''}${definition.fallbackOrder}, t.id DESC`;
          const [baseline] = await db.query(
            `SELECT CAST(t.id AS CHAR) AS id FROM things t WHERE owner=? ORDER BY ${originalOrder}`,
            ['owner', ...(sort === 'relevance' && keyword ? [keyword, `${keyword}%`, `%${keyword}%`] : [])],
          );
          const actual = [];
          let cursorSeek;
          for (let page = 0; page < 10; page += 1) {
            const seek = buildSearchSeek(keys, { orderedSeekScope: 'scope', cursorSeek, pageSize: 4, offset: 0 });
            const [rows] = await db.query(
              `SELECT ${seek.projection} CAST(t.id AS CHAR) AS id FROM things t
          WHERE owner=? ${seek.where} ORDER BY ${order} ${seek.limitSql}`,
              [...seek.selectParams, 'owner', ...seek.whereParams, ...orderParams, ...seek.limitParams],
            );
            const anchors = takeSearchSeekRows(rows);
            actual.push(...rows.map((row) => row.id));
            if (!rows.length) break;
            cursorSeek = { v: 1, scope: 'scope', values: anchors.at(-1) };
          }
          expect(actual, JSON.stringify({ definition, sort, keyword })).toEqual(baseline.map((row) => row.id));
        }
  });

  it('binds seek cursors to owner and filters and rejects malformed values', () => {
    const options = { sort: 'updated', keyword: 'alpha' };
    const scope = searchSeekScope('owner', options, ['note']);
    expect(searchSeekScope('other', options, ['note'])).not.toBe(scope);
    expect(searchSeekScope('owner', { ...options, keyword: 'beta' }, ['note'])).not.toBe(scope);
    const keys = searchOrderKeys({ sort: 'updated', updatedColumn: 't.create_time', idColumn: 't.id' });
    for (const cursorSeek of [{ v: 2 }, { v: 1, scope: 'wrong', values: [null, '1'] }, { v: 1, scope, values: [] }]) {
      expect(() => buildSearchSeek(keys, { orderedSeekScope: scope, cursorSeek })).toThrow('Invalid search cursor');
    }
  });

  it('migrates real bookmark/file layouts idempotently and bounds deep-page index reads', async () => {
    const indexSchema = `search_index_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${indexSchema}`);
    let indexDb;
    try {
      indexDb = await mysql.createConnection({ socketPath: socket, user: 'root', database: indexSchema });
      await indexDb.query('CREATE TABLE user (id VARCHAR(255) PRIMARY KEY) DEFAULT CHARSET=utf8');
      await indexDb.query('CREATE TABLE folders (id INT PRIMARY KEY)');
      const baseline = await readFile(new URL('../tag_db.sql', import.meta.url), 'utf8');
      for (const table of ['bookmark', 'files']) {
        const start = baseline.indexOf(`CREATE TABLE \`${table}\``);
        const ddl = baseline
          .slice(start, baseline.indexOf(';', start) + 1)
          .split('\n')
          .filter((line) => !line.includes(`idx_${table}_search_time`))
          .join('\n');
        await indexDb.query(ddl);
      }
      await indexDb.query("INSERT INTO user VALUES ('scale'), ('other')");
      const statements = (source) =>
        source
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n')
          .split(';')
          .map((sql) => sql.trim())
          .filter(Boolean);
      const migration = statements(
        await readFile(new URL('../migrations/20260925_search_seek_indexes.sql', import.meta.url), 'utf8'),
      );
      const assertion = statements(
        await readFile(new URL('../migrations/schema-assertions.sql', import.meta.url), 'utf8'),
      ).find((sql) => sql.includes("'search_seek_index_contract'"));
      expect((await indexDb.query(assertion))[0]).toHaveLength(2);
      const configs = [
        { table: 'bookmark', owner: 'user_id', insert: 'id,user_id,name,create_time,del_flag' },
        {
          table: 'files',
          owner: 'create_by',
          insert: 'id,create_by,file_name,create_time,del_flag,file_type,file_size,directory',
        },
      ];
      for (const config of configs) {
        for (let start = 0; start < 30000; start += 1000) {
          const values = Array.from({ length: 1000 }, (_, i) => {
            const n = start + i + 1;
            const id = config.table === 'bookmark' ? `00000000-0000-0000-0000-${String(n).padStart(12, '0')}` : n;
            const date = new Date(Date.UTC(2026, 0, 1) + n * 60000).toISOString().slice(0, 19).replace('T', ' ');
            const row = [id, 'scale', 'fixture', date, 0];
            return config.table === 'files' ? [...row, 'text/plain', 1, '/fixture'] : row;
          });
          await indexDb.query(`INSERT INTO ${config.table} (${config.insert}) VALUES ?`, [values]);
        }
      }
      // Another owner's records cluster between the anchor and the next target row.
      // An owner-leading range must avoid scanning that unrelated account's entire cluster.
      for (const config of configs) {
        for (let start = 0; start < 30000; start += 1000) {
          const values = Array.from({ length: 1000 }, (_, i) => {
            const n = start + i + 30001;
            const id = config.table === 'bookmark' ? `00000000-0000-0000-0000-${String(n).padStart(12, '0')}` : n;
            const date = new Date(Date.UTC(2026, 0, 1) + 5001 * 60000 - 30000)
              .toISOString()
              .slice(0, 19)
              .replace('T', ' ');
            const row = [id, 'other', 'fixture', date, 0];
            return config.table === 'files' ? [...row, 'text/plain', 1, '/fixture'] : row;
          });
          await indexDb.query(`INSERT INTO ${config.table} (${config.insert}) VALUES ?`, [values]);
        }
      }
      const readCount = async () => {
        const [rows] = await indexDb.query(
          "SHOW SESSION STATUS WHERE Variable_name IN ('Handler_read_key','Handler_read_next','Handler_read_prev','Handler_read_rnd','Handler_read_rnd_next')",
        );
        return rows.reduce((sum, row) => sum + Number(row.Value), 0);
      };
      const measure = async (sql, params) => {
        const before = await readCount();
        const start = performance.now();
        const [rows] = await indexDb.query(sql, params);
        const ms = performance.now() - start;
        return { rows, ms, reads: (await readCount()) - before };
      };
      const [beforeChecksum] = await indexDb.query('CHECKSUM TABLE bookmark, files');
      const queries = [];
      for (const config of configs) {
        const from = `FROM ${config.table} t WHERE t.${config.owner}=? AND t.del_flag=0`;
        const [[anchor]] = await indexDb.query(
          `SELECT CAST(t.id AS CHAR) id, DATE_FORMAT(t.create_time, '%Y-%m-%d %H:%i:%s.%f') time
          ${from} ORDER BY t.create_time DESC,t.id DESC LIMIT 1 OFFSET 24999`,
          ['scale'],
        );
        const keys = searchOrderKeys({ sort: 'updated', updatedColumn: 't.create_time', idColumn: 't.id' });
        const seek = buildSearchSeek(keys, {
          orderedSeekScope: 'scale',
          cursorSeek: { v: 1, scope: 'scale', values: [anchor.time, anchor.id] },
          pageSize: 40,
        });
        const offsetSql = `SELECT CAST(t.id AS CHAR) id ${from} ORDER BY t.create_time DESC,t.id DESC LIMIT 40 OFFSET 25000`;
        const seekSql = `SELECT CAST(t.id AS CHAR) id ${from} ${seek.where} ORDER BY t.create_time DESC,t.id DESC ${seek.limitSql}`;
        const params = ['scale', ...seek.whereParams, ...seek.limitParams];
        await indexDb.query(`ANALYZE TABLE ${config.table}`);
        const legacy = await measure(seekSql, params);
        const [legacyPlan] = await indexDb.query(`EXPLAIN ${seekSql}`, params);
        queries.push({ config, offsetSql, seekSql, params, legacyPlan, legacy });
      }
      // Execute the repository migration twice, preserving data and all pre-existing indexes.
      for (let run = 0; run < 2; run += 1) for (const sql of migration) await indexDb.query(sql);
      expect((await indexDb.query(assertion))[0]).toEqual([]);
      expect((await indexDb.query('CHECKSUM TABLE bookmark, files'))[0]).toEqual(beforeChecksum);
      for (const { config, offsetSql, seekSql, params, legacyPlan, legacy } of queries) {
        await indexDb.query(`ANALYZE TABLE ${config.table}`);
        await indexDb.query(offsetSql, ['scale']);
        await indexDb.query(seekSql, params);
        const offsets = [],
          seeks = [];
        for (let run = 0; run < 3; run += 1) {
          if (run % 2) {
            seeks.push(await measure(seekSql, params));
            offsets.push(await measure(offsetSql, ['scale']));
          } else {
            offsets.push(await measure(offsetSql, ['scale']));
            seeks.push(await measure(seekSql, params));
          }
          expect(seeks[run].rows).toEqual(offsets[run].rows);
          expect(seeks[run].rows).toHaveLength(40);
          expect(seeks[run].reads).toBeLessThan(offsets[run].reads / 10);
          expect(seeks[run].rows).toEqual(legacy.rows);
          expect(seeks[run].reads).toBeLessThan(legacy.reads / 10);
        }
        const [plan] = await indexDb.query(`EXPLAIN ${seekSql}`, params);
        expect(plan[0].type).toBe('range');
        expect(plan[0].key).toBe(`idx_${config.table}_search_time`);
        expect(plan[0].Extra).not.toContain('filesort');
        const median = (samples, field) => samples.map((sample) => sample[field]).sort((a, b) => a - b)[1];
        console.log(
          '[search-seek-benchmark]',
          JSON.stringify({
            table: config.table,
            rows: 30000,
            depth: 25000,
            legacyAccess: legacyPlan[0].type,
            legacyKey: legacyPlan[0].key,
            legacySeekReads: legacy.reads,
            offsetMs: median(offsets, 'ms'),
            seekMs: median(seeks, 'ms'),
            offsetReads: median(offsets, 'reads'),
            seekReads: median(seeks, 'reads'),
            access: plan[0].type,
          }),
        );
      }
      // A same-name prefix index must fail the release assertion; index names alone are insufficient.
      await indexDb.query(
        'ALTER TABLE files DROP INDEX idx_files_search_time, ADD KEY idx_files_search_time (create_by(64),del_flag,create_time,id)',
      );
      expect((await indexDb.query(assertion))[0]).toHaveLength(1);
    } finally {
      await indexDb?.end();
      await admin.query(`DROP DATABASE ${indexSchema}`);
    }
  });
  it('round-trips handler cursors, preserves legacy offsets and excludes internal keys from results', async () => {
    await db.query(`CREATE TABLE bookmark (id BIGINT PRIMARY KEY, user_id VARCHAR(36), del_flag INT,
      name VARCHAR(255), description TEXT, url VARCHAR(255), create_time DATETIME(6), is_top INT, sort INT)`);
    await db.query(`CREATE TABLE tag (id VARCHAR(36), user_id VARCHAR(36), name VARCHAR(255), del_flag INT)`);
    await db.query(
      `CREATE TABLE resource_tag_relations (tag_id VARCHAR(36), user_id VARCHAR(36), resource_id VARCHAR(36), resource_type VARCHAR(20))`,
    );
    for (let i = 1; i <= 7; i += 1)
      await db.query('INSERT INTO bookmark VALUES (?,?,?,?,?,?,?,?,?)', [
        i,
        i === 7 ? 'other' : 'owner',
        0,
        ['Alpha', 'prefix alpha', '中文'][i % 3],
        'alpha evidence',
        '',
        i % 2 ? '2026-09-01 00:00:00.000001' : null,
        i % 2,
        i % 3,
      ]);
    pool.query.mockImplementation((sql, params) => db.query(sql, params));
    async function request(body, user = 'owner') {
      const response = { send: vi.fn() };
      await globalSearch(
        {
          user: { id: user },
          headers: {},
          body: {
            paginationMode: 'ordered',
            types: ['bookmark'],
            pageSize: 2,
            includeMetadata: false,
            ...body,
          },
        },
        response,
      );
      return response.send.mock.calls.at(-1)[0];
    }
    for (const sort of ['updated', 'name', 'relevance']) {
      const keys = searchOrderKeys({
        sort,
        keyword: 'alpha',
        titleColumn: 'b.name',
        updatedColumn: 'b.create_time',
        fallbackOrder: 'b.is_top DESC, b.sort, b.create_time DESC',
        idColumn: 'b.id',
      });
      const [expected] = await db.query(
        `SELECT b.id FROM bookmark b WHERE b.user_id='owner' ORDER BY ${keys.map((key) => `${key.sql} ${key.direction}`).join(',')}`,
        keys.flatMap((key) => key.params || []),
      );
      const first = await request({ sort, keyword: 'alpha' });
      expect(first.status).toBe(200);
      expect(first.data.nextCursor.seek.v).toBe(1);
      expect(Object.keys(first.data.items[0].raw).some((key) => key.startsWith('_searchSeek'))).toBe(false);
      const collected = [...first.data.items];
      let cursor = first.data.nextCursor;
      for (let page = 0; cursor && page < 5; page += 1) {
        pool.query.mockClear();
        const next = await request({ sort, keyword: 'alpha', cursor });
        expect(next.status).toBe(200);
        expect(pool.query.mock.calls.some(([sql]) => sql.includes('OFFSET'))).toBe(false);
        collected.push(...next.data.items);
        cursor = next.data.nextCursor;
      }
      expect(collected.map((item) => item.id)).toEqual(expected.map((row) => String(row.id)));
      const legacy = await request({ sort, keyword: 'alpha', cursor: { type: 'bookmark', offset: 2 } });
      expect(legacy.data.items.map((item) => item.id)).toEqual(expected.slice(2, 4).map((row) => String(row.id)));
      expect(legacy.data.nextCursor.seek.v).toBe(1);
      expect((await request({ sort, keyword: 'alpha', cursor: first.data.nextCursor }, 'other')).status).toBe(400);
    }
  });
});

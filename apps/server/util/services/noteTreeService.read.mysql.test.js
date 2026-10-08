import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/index.js', () => ({ default: {} }));
const {
  queryOwnedNoteTree,
  resolveOwnedNoteSearchMetadata,
  getNoteTreeChildren,
  resolveNoteDescendantIdsFromSnapshot,
  assertOwnedNoteParent,
  resolveOwnedNoteListPaths,
  loadOwnedNoteTree,
  resolveNoteBreadcrumbFromSnapshot,
} = await import('./noteTreeService.js');
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;

describe.skipIf(!socketPath)('笔记目录定向读取（隔离 MySQL）', () => {
  const schema = `note_read_${randomUUID().replaceAll('-', '')}`;
  let admin,
    database,
    created = false;
  const calls = [];
  const db = {
    async query(sql, params) {
      const started = performance.now();
      const result = await database.query(sql, params);
      const ms = performance.now() - started;
      calls.push({ sql, params, ms, rows: result[0].length, bytes: Buffer.byteLength(JSON.stringify(result[0])) });
      return result;
    },
  };
  beforeAll(async () => {
    if (!socketPath.startsWith('/tmp/') && !socketPath.startsWith('/private/tmp/'))
      throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[isolation]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(isolation.isolated) !== 1) throw new Error('Disposable MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    database = await mysql.createConnection({ socketPath, user: 'root', database: schema });
    const baseline = await readFile(new URL('../../tag_db.sql', import.meta.url), 'utf8');
    const tableStart = baseline.indexOf('CREATE TABLE `note`');
    await database.query(baseline.slice(tableStart, baseline.indexOf(';', tableStart) + 1));
    await database.query(`INSERT INTO note (id, create_by, parent_id, title, is_top, del_flag) VALUES ?`, [
      [
        ['root', 'owner', null, '根', 0, 0],
        ['a', 'owner', 'root', '普通', 0, 0],
        ['b', 'owner', 'root', '置顶', 1, 0],
        ['grandchild', 'owner', 'a', '孙', 0, 0],
        ['foreign', 'other', 'root', '其他账号', 0, 0],
        ['deleted', 'owner', 'root', '已删除', 0, 1],
        ['orphan', 'owner', 'missing', '孤儿', 0, 0],
        ['orphan-child', 'owner', 'orphan', '子', 0, 0],
        ['cycle-a', 'owner', 'cycle-b', '环 A', 0, 0],
        ['cycle-b', 'owner', 'cycle-a', '环 B', 0, 0],
        ['cycle-child', 'owner', 'cycle-a', '环下子级', 0, 0],
      ],
    ]);
  });
  afterAll(async () => {
    await database?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });

  it.each(['root', 'a', 'b', 'orphan', 'cycle-a'])('父级 %s 的结果与完整树读取一致', async (parentId) => {
    const full = await queryOwnedNoteTree({ userId: 'owner', parentId, depth: 2, db });
    const direct = await queryOwnedNoteTree({ userId: 'owner', parentId, depth: 1, db });
    expect(direct.items).toEqual(full.items.map(({ children, ...item }) => item));
  });

  it('定向父级校验拒绝跨账号和删除记录', async () => {
    for (const parentId of ['foreign', 'deleted', 'missing']) {
      await expect(assertOwnedNoteParent({ userId: 'owner', parentId, db })).rejects.toMatchObject({ status: 404 });
      await expect(queryOwnedNoteTree({ userId: 'owner', parentId, db })).rejects.toMatchObject({ status: 404 });
    }
  });

  it('账号增加一万篇无关笔记后，展开目标仍只传回一条父链与两条子级', async () => {
    const before = await queryOwnedNoteTree({ userId: 'owner', parentId: 'root', db });
    for (let offset = 0; offset < 10000; offset += 500) {
      await database.query('INSERT INTO note (id,create_by,parent_id,title) VALUES ?', [
        Array.from({ length: 500 }, (_, i) => [`noise-${offset + i}`, 'owner', null, '无关']),
      ]);
    }
    calls.length = 0;
    const after = await queryOwnedNoteTree({ userId: 'owner', parentId: 'root', db });
    expect(after).toEqual(before);
    expect(calls.map((call) => call.rows)).toEqual([1, 2]);
  });

  it('当前页批量路径与完整快照相同，包括孤儿与环，且不读取页外笔记', async () => {
    const ids = ['root', 'a', 'b', 'grandchild', 'orphan', 'orphan-child', 'cycle-a', 'cycle-b', 'cycle-child'];
    const snapshot = await loadOwnedNoteTree('owner', { db });
    calls.length = 0;
    const paths = await resolveOwnedNoteListPaths({ userId: 'owner', noteIds: ids, db });
    expect(paths).toEqual(new Map(ids.map((id) => [id, resolveNoteBreadcrumbFromSnapshot(snapshot, id)])));
    expect(calls.map((call) => call.rows)).toEqual([ids.length]);
    calls.length = 0;
    expect(await resolveOwnedNoteListPaths({ userId: 'owner', noteIds: [], db })).toEqual(new Map());
    expect(calls).toEqual([]);
  });

  it('历史超深路径回退完整快照，保留全部祖先', async () => {
    await database.query('INSERT INTO note (id,create_by,parent_id,title) VALUES ?', [
      Array.from({ length: 12 }, (_, i) => [`deep-${i}`, 'owner', i ? `deep-${i - 1}` : null, `层 ${i}`]),
    ]);
    const paths = await resolveOwnedNoteListPaths({ userId: 'owner', noteIds: ['deep-11', 'a'], db });
    expect(paths.get('deep-11').map((node) => node.id)).toEqual(Array.from({ length: 12 }, (_, i) => `deep-${i}`));
    expect(paths.get('a').map((node) => node.id)).toEqual(['root', 'a']);
  });
  it('搜索元数据与完整恢复树等价，重叠子树、孤儿、自指与环均不重复计数', async () => {
    await database.query('INSERT INTO note (id,create_by,parent_id,title) VALUES ?', [
      [
        ['self', 'owner', 'self', '自指'],
        ['self-child', 'owner', 'self', '自指下的子项'],
      ],
    ]);
    const ids = [
      'root',
      'a',
      'b',
      'grandchild',
      'orphan',
      'orphan-child',
      'cycle-a',
      'cycle-b',
      'cycle-child',
      'self',
      'self-child',
    ];
    const snapshot = await loadOwnedNoteTree('owner', { db });
    calls.length = 0;
    const actual = await resolveOwnedNoteSearchMetadata({ userId: 'owner', noteIds: ids, db });
    const expected = new Map(
      ids.map((id) => [
        id,
        {
          items: resolveNoteBreadcrumbFromSnapshot(snapshot, id),
          childCount: getNoteTreeChildren(snapshot, id).length,
          descendantCount: resolveNoteDescendantIdsFromSnapshot(snapshot, id).length,
        },
      ]),
    );
    expect(actual).toEqual(expected);
    expect(calls.every((call) => !call.sql.includes('tree_delete_batch_id'))).toBe(true);
    expect(calls.reduce((n, call) => n + call.rows, 0)).toBeLessThan(40);
  });

  it('上万篇无关笔记不进入搜索页路径与统计查询，空页也不查树', async () => {
    calls.length = 0;
    const result = await resolveOwnedNoteSearchMetadata({ userId: 'owner', noteIds: ['b', 'grandchild'], db });
    expect(result.get('b')).toMatchObject({ childCount: 0, descendantCount: 0 });
    expect(result.get('grandchild')).toMatchObject({ childCount: 0, descendantCount: 0 });
    expect(calls.map((call) => call.rows)).toEqual([2, 0]);
    calls.length = 0;
    expect(await resolveOwnedNoteSearchMetadata({ userId: 'owner', noteIds: [], db })).toEqual(new Map());
    expect(calls).toEqual([]);
    calls.length = 0;
    expect(
      await resolveOwnedNoteSearchMetadata({ userId: 'owner', noteIds: ['foreign', 'deleted', 'missing'], db }),
    ).toEqual(new Map());
    expect(calls).toHaveLength(1);
  });

  it('超深子树与长环回退一次完整快照，不截断真实数量', async () => {
    await database.query('INSERT INTO note (id,create_by,parent_id,title) VALUES ?', [
      Array.from({ length: 12 }, (_, i) => [`long-cycle-${i}`, 'owner', `long-cycle-${(i + 1) % 12}`, '长环']),
    ]);
    const snapshot = await loadOwnedNoteTree('owner', { db });
    for (const id of ['deep-0', 'deep-11', 'long-cycle-0']) {
      calls.length = 0;
      const metadata = await resolveOwnedNoteSearchMetadata({ userId: 'owner', noteIds: [id], db });
      expect(metadata.get(id)).toEqual({
        items: resolveNoteBreadcrumbFromSnapshot(snapshot, id),
        childCount: getNoteTreeChildren(snapshot, id).length,
        descendantCount: resolveNoteDescendantIdsFromSnapshot(snapshot, id).length,
      });
      expect(calls.filter((call) => call.sql.includes('tree_delete_batch_id'))).toHaveLength(1);
      expect(calls.length).toBeLessThanOrEqual(10);
    }
  });
  it('根层按完整拓扑恢复孤儿和任意长度的环，但不回填普通后代展示字段', async () => {
    const full = await queryOwnedNoteTree({ userId: 'owner', depth: 2, db });
    calls.length = 0;
    const roots = await queryOwnedNoteTree({ userId: 'owner', depth: 1, db });
    expect(roots.items).toEqual(full.items.map(({ children, ...item }) => item));
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain('root_metadata');
    expect(calls[0].sql).not.toContain('ORDER BY');
    expect(calls[1].rows).toBeLessThan(30);
  });

  it('大目录的根读取省去子级标题，搜索统计只遍历相关边且不逐叶查询', async () => {
    await database.query(
      "INSERT INTO note (id,create_by,parent_id,title) VALUES ('scale-root','scale-owner',NULL,'根')",
    );
    for (let start = 0; start < 2000; start += 500)
      await database.query('INSERT INTO note (id,create_by,parent_id,title) VALUES ?', [
        Array.from({ length: 500 }, (_, i) => [
          `scale-leaf-${start + i}`,
          'scale-owner',
          'scale-root',
          '很长的笔记标题'.repeat(30),
        ]),
      ]);
    calls.length = 0;
    const full = await loadOwnedNoteTree('scale-owner', { db });
    const fullBytes = calls[0].bytes;
    calls.length = 0;
    const roots = await queryOwnedNoteTree({ userId: 'scale-owner', db });
    expect(roots.items).toHaveLength(1);
    expect(roots.items[0]).toMatchObject({ id: 'scale-root', title: '根', childCount: 2000, hasChildren: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].bytes).toBeLessThan(fullBytes / 2);
    const rootBytes = calls[0].bytes;
    calls.length = 0;
    const readCount = async () => {
      const [rows] = await database.query(
        "SHOW SESSION STATUS WHERE Variable_name IN ('Handler_read_key','Handler_read_next','Handler_read_prev','Handler_read_rnd','Handler_read_rnd_next')",
      );
      return rows.reduce((total, row) => total + Number(row.Value), 0);
    };
    const beforeReads = await readCount();
    const metadata = await resolveOwnedNoteSearchMetadata({
      userId: 'scale-owner',
      noteIds: ['scale-root', 'scale-leaf-1'],
      db,
    });
    const indexReads = (await readCount()) - beforeReads;
    expect(indexReads).toBeLessThan(20000);
    const subtreeCall = calls.find((call) => call.sql.includes('FROM note child'));
    const [subtreePlan] = await database.query(`EXPLAIN ${subtreeCall.sql}`, subtreeCall.params);
    for (const alias of ['child', 'grandchild'])
      expect(subtreePlan.find((row) => row.table === alias).key).toBe('idx_note_parent');
    expect(metadata.get('scale-root')).toMatchObject({ childCount: 2000, descendantCount: 2000 });
    expect(metadata.get('scale-leaf-1').items).toEqual(resolveNoteBreadcrumbFromSnapshot(full, 'scale-leaf-1'));
    expect(metadata.get('scale-leaf-1').descendantCount).toBe(0);
    expect(calls.map((call) => call.rows)).toEqual([2, 2000]);
    console.log(
      '[note-tree-read-benchmark]',
      JSON.stringify({
        nodes: 2001,
        fullMetadataJsonBytes: fullBytes,
        rootMetadataJsonBytes: rootBytes,
        searchReadRows: calls.map((call) => call.rows),
        searchIndexReads: indexReads,
        searchSqlMs: calls.reduce((sum, call) => sum + call.ms, 0),
        searchMetadataJsonBytes: calls.reduce((n, call) => n + call.bytes, 0),
      }),
    );
  });

  it('恢复根在两次读取之间被删除时重新构建快照，不隐藏新孤儿', async () => {
    await database.query('INSERT INTO note (id,create_by,parent_id,title) VALUES ?', [
      [
        ['race-root', 'race-owner', 'missing', '旧孤儿'],
        ['race-child', 'race-owner', 'race-root', '新孤儿'],
      ],
    ]);
    let removed = false;
    const racingDb = {
      query: async (sql, params) => {
        if (!removed && sql.includes('AND id IN')) {
          removed = true;
          await database.query("UPDATE note SET del_flag=1 WHERE id='race-root'");
        }
        return db.query(sql, params);
      },
    };
    calls.length = 0;
    const result = await queryOwnedNoteTree({ userId: 'race-owner', db: racingDb });
    expect(result.items).toEqual([expect.objectContaining({ id: 'race-child', title: '新孤儿', invalidParent: true })]);
    expect(calls.filter((call) => call.sql.includes('tree_delete_batch_id'))).toHaveLength(1);
  });

  it('大量坏根只回退一次，不放大成逐根元数据请求', async () => {
    await database.query('INSERT INTO note (id,create_by,parent_id,title) VALUES ?', [
      Array.from({ length: 120 }, (_, i) => [`broken-${i}`, 'broken-owner', `broken-${i}`, '自指']),
    ]);
    calls.length = 0;
    const result = await queryOwnedNoteTree({ userId: 'broken-owner', db });
    expect(result.items).toHaveLength(120);
    expect(result.items.every((item) => item.invalidParent && item.childCount === 0)).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].sql).toContain('tree_delete_batch_id');
  });
});
